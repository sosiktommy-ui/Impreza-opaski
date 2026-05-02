import { NestFactory } from '@nestjs/core';
import { Logger, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import { AppModule } from './app.module';
import { HttpExceptionFilter } from './common/filters/http-exception.filter';
import { ResponseInterceptor } from './common/interceptors/response.interceptor';

async function bootstrap() {
  const logger = new Logger('Bootstrap');
  const app = await NestFactory.create(AppModule, {
    logger: ['error', 'warn', 'log', 'debug'],
  });

  const config = app.get(ConfigService);
  const port = config.get<number>('PORT', 3001);

  const hardcoded = [
    'https://zoological-vision-production.up.railway.app',
    'https://impreza-opaski-production.up.railway.app',
    'http://localhost:3000',
    'http://localhost:5173',
    'http://localhost:5174',
  ];
  const envOrigins = config
    .get<string>('FRONTEND_URL', '')
    .split(',')
    .map((o) => o.trim())
    .filter(Boolean);
  const allowed = [...new Set([...hardcoded, ...envOrigins])];

  app.enableCors({
    origin: (
      origin: string | undefined,
      cb: (err: Error | null, allow?: boolean) => void,
    ) => {
      if (!origin) return cb(null, true);
      if (allowed.includes(origin)) return cb(null, true);
      if (origin.endsWith('.railway.app')) return cb(null, true);
      return cb(null, true);
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
  });

  app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));
  app.use(cookieParser());
  app.setGlobalPrefix('api');

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: { enableImplicitConversion: true },
    }),
  );
  app.useGlobalFilters(new HttpExceptionFilter());
  app.useGlobalInterceptors(new ResponseInterceptor());

  await app.listen(port, '0.0.0.0');
  logger.log(`Impreza backend listening on :${port} (CORS allow: ${allowed.join(', ')})`);
}

bootstrap();
