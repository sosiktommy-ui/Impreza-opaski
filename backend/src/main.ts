import { NestFactory } from '@nestjs/core';
import { ValidationPipe, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import { execSync } from 'child_process';
import { PrismaClient } from '@prisma/client';
import { AppModule } from './app.module';
import { HttpExceptionFilter } from './common/filters/http-exception.filter';
import { LoggingInterceptor } from './common/interceptors/logging.interceptor';
import { TransformInterceptor } from './common/interceptors/transform.interceptor';

/**
 * Runs before NestJS app starts.
 * Converts legacy CITY/COUNTRY role data so prisma migrate deploy can
 * safely rebuild the Role enum (ADMIN | OFFICE | USER).
 */
async function runBootstrapMigration(): Promise<void> {
  const logger = new Logger('Bootstrap:DB');
  const prisma = new PrismaClient();
  try {
    // 1. Add USER value to Role enum (cannot be inside a transaction)
    try {
      await prisma.$executeRawUnsafe(`ALTER TYPE "Role" ADD VALUE IF NOT EXISTS 'USER'`);
    } catch (e: any) {
      if (!String(e?.message).includes('already exists')) {
        logger.warn(`Role.USER add skipped: ${e?.message}`);
      }
    }

    // 2. Copy city_id → primary_city_id for CITY-role users (if old column still exists)
    const hasCityId = await prisma.$queryRawUnsafe<Array<{ exists: boolean }>>(`
      SELECT EXISTS(
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'users' AND column_name = 'city_id'
      ) AS exists
    `);
    if (hasCityId[0]?.exists) {
      await prisma.$executeRawUnsafe(`ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "primary_city_id" TEXT`);
      await prisma.$executeRawUnsafe(`
        UPDATE "users"
        SET "primary_city_id" = "city_id"
        WHERE "role"::text = 'CITY'
          AND "city_id" IS NOT NULL
          AND "primary_city_id" IS NULL
      `);
    }

    // 3. Convert CITY-role users → USER
    await prisma.$executeRawUnsafe(`UPDATE "users" SET "role" = 'USER' WHERE "role"::text = 'CITY'`);

    // 4. Delete COUNTRY-role users (cascade deletes their user_access rows)
    await prisma.$executeRawUnsafe(`DELETE FROM "users" WHERE "role"::text = 'COUNTRY'`);

    // 5. Convert any remaining COUNTRY scope_type → CITY in user_access
    const hasAccess = await prisma.$queryRawUnsafe<Array<{ exists: boolean }>>(`
      SELECT EXISTS(SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'user_access') AS exists
    `);
    if (hasAccess[0]?.exists) {
      await prisma.$executeRawUnsafe(`UPDATE "user_access" SET "scope_type" = 'CITY' WHERE "scope_type"::text = 'COUNTRY'`);
    }

    logger.log('Pre-migration data transform complete');
  } catch (err: any) {
    logger.error(`Pre-migration failed: ${err?.message}`);
    // Don't block startup — migration SQL has IF NOT EXISTS guards
  } finally {
    await prisma.$disconnect();
  }

  // Apply pending Prisma migrations
  logger.log('Running prisma migrate deploy...');
  try {
    execSync('npx prisma migrate deploy', {
      stdio: 'inherit',
      env: process.env,
    });
    logger.log('Migrations applied');
  } catch (err: any) {
    logger.error(`prisma migrate deploy failed: ${err?.message}`);
    // Don't throw — if migration was already applied this is fine
  }
}

async function bootstrap() {
  await runBootstrapMigration();
  const logger = new Logger('Bootstrap');
  const app = await NestFactory.create(AppModule, {
    logger: ['error', 'warn', 'log', 'debug', 'verbose'],
  });

  const configService = app.get(ConfigService);
  const rawPort = configService.get<string>('PORT');
  const port = Number(rawPort) || 3001;

  // CORS — MUST BE FIRST, before helmet and other middleware
  // Hardcoded Railway domains + env variable for flexibility
  const hardcodedOrigins = [
    'https://zoological-vision-production.up.railway.app',
    'https://impreza-opaski-production.up.railway.app',
    'http://localhost:3000',
    'http://localhost:5173',
    'http://localhost:5174',
  ];
  
  const envOrigins = configService
    .get<string>('FRONTEND_URL', '')
    .split(',')
    .map((o) => o.trim())
    .filter((o) => o.length > 0);

  const allowedOrigins = [...new Set([...hardcodedOrigins, ...envOrigins])];
  logger.log(`CORS allowed origins: ${allowedOrigins.join(', ')}`);

  app.enableCors({
    origin: (origin: string | undefined, callback: (err: Error | null, allow?: boolean) => void) => {
      // Allow requests with no origin (mobile apps, curl, Postman, etc.)
      if (!origin) {
        callback(null, true);
        return;
      }
      
      // Check if origin is in allowed list
      if (allowedOrigins.includes(origin)) {
        callback(null, true);
        return;
      }
      
      // Allow any *.railway.app subdomain
      if (origin.endsWith('.railway.app')) {
        logger.log(`CORS: allowing Railway subdomain ${origin}`);
        callback(null, true);
        return;
      }
      
      // In production, allow but log warning
      logger.warn(`CORS: unexpected origin ${origin} — allowing anyway`);
      callback(null, true);
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Correlation-Id', 'X-Requested-With'],
    exposedHeaders: ['X-Correlation-Id'],
    preflightContinue: false,
    optionsSuccessStatus: 204,
  });

  // Security — AFTER CORS
  app.use(helmet({
    crossOriginResourcePolicy: { policy: 'cross-origin' },
    crossOriginOpenerPolicy: { policy: 'same-origin-allow-popups' },
  }));
  app.use(cookieParser());

  // Global prefix
  app.setGlobalPrefix('api');

  // Global pipes
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: {
        enableImplicitConversion: true,
      },
    }),
  );

  // Global filters
  app.useGlobalFilters(new HttpExceptionFilter());

  // Global interceptors
  app.useGlobalInterceptors(
    new LoggingInterceptor(),
    new TransformInterceptor(),
  );

  await app.listen(port);
  logger.log(`IMPREZA Backend running on http://localhost:${port}`);
  logger.log(`API available at http://localhost:${port}/api`);
}

bootstrap();
