import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { execSync } from 'child_process';
import { PrismaService } from '../prisma/prisma.service';
import * as bcrypt from 'bcrypt';

@Injectable()
export class SeedService implements OnApplicationBootstrap {
  private readonly logger = new Logger('SeedService');

  constructor(private readonly prisma: PrismaService) {}

  onApplicationBootstrap() {
    // Run seed in background so it does NOT block HTTP server startup / healthcheck
    setImmediate(() => this.runSeed());
  }

  private async runSeed() {
    try {
      // Apply schema changes (safe to run on already-up-to-date DB)
      this.logger.log('Running prisma db push…');
      execSync('npx prisma db push --skip-generate --accept-data-loss', {
        cwd: process.cwd(),
        stdio: 'inherit',
        timeout: 60_000,
      });
      this.logger.log('Schema up to date.');
    } catch (e) {
      this.logger.warn(`prisma db push failed (non-fatal): ${(e as Error)?.message ?? String(e)}`);
    }
    try {
      const count = await this.prisma.user.count();
      if (count > 0) {
        this.logger.log(`DB already seeded (${count} users), skipping.`);
        return;
      }
      this.logger.log('DB empty — running initial seed…');
      await this.seed();
      this.logger.log('Seed complete.');
    } catch (e) {
      this.logger.error(`Seed failed: ${(e as Error)?.message ?? String(e)}`);
    }
  }

  private async seed() {
    const rounds = 10;
    const adminHash = await bcrypt.hash('Impreza@Admin2026!', rounds);
    const officeHash = await bcrypt.hash('Office@2026!', rounds);
    const countryHash = await bcrypt.hash('Country@2026!', rounds);
    const managerHash = await bcrypt.hash('Manager@2026!', rounds);

    const de = await this.prisma.country.upsert({ where: { code: 'DE' }, update: {}, create: { code: 'DE', name: 'Германия' } });
    const pl = await this.prisma.country.upsert({ where: { code: 'PL' }, update: {}, create: { code: 'PL', name: 'Польша' } });
    const nl = await this.prisma.country.upsert({ where: { code: 'NL' }, update: {}, create: { code: 'NL', name: 'Нидерланды' } });
    const at = await this.prisma.country.upsert({ where: { code: 'AT' }, update: {}, create: { code: 'AT', name: 'Австрия' } });

    const berlin = await this.prisma.city.upsert({ where: { code: 'berlin' }, update: {}, create: { code: 'berlin', name: 'Berlin', countryId: de.id } });
    const warsaw = await this.prisma.city.upsert({ where: { code: 'warsaw' }, update: {}, create: { code: 'warsaw', name: 'Warsaw', countryId: pl.id } });
    const amsterdam = await this.prisma.city.upsert({ where: { code: 'amsterdam' }, update: {}, create: { code: 'amsterdam', name: 'Amsterdam', countryId: nl.id } });
    const vienna = await this.prisma.city.upsert({ where: { code: 'vienna' }, update: {}, create: { code: 'vienna', name: 'Vienna', countryId: at.id } });

    this.logger.log(`Countries: DE, PL, NL, AT | Cities: ${[berlin, warsaw, amsterdam, vienna].map(c => c.name).join(', ')}`);

    const dmitry = await this.prisma.user.upsert({
      where: { username: 'Dmitryganj' },
      update: { passwordHash: adminHash },
      create: { username: 'Dmitryganj', displayName: 'Dmitryganj', passwordHash: adminHash, role: 'ADMIN', isActive: true },
    });
    const admin = await this.prisma.user.upsert({
      where: { username: 'admin' },
      update: { passwordHash: adminHash },
      create: { username: 'admin', displayName: 'Admin', passwordHash: adminHash, role: 'ADMIN', isActive: true },
    });
    const office1 = await this.prisma.user.upsert({
      where: { username: 'office1' },
      update: { passwordHash: officeHash },
      create: { username: 'office1', displayName: 'Офис · 1', passwordHash: officeHash, role: 'OFFICE', isActive: true },
    });
    const countryDe = await this.prisma.user.upsert({
      where: { username: 'country-de' },
      update: { passwordHash: countryHash },
      create: { username: 'country-de', displayName: 'Страна · Германия', passwordHash: countryHash, role: 'COUNTRY', isActive: true },
    });
    const managerBerlin = await this.prisma.user.upsert({
      where: { username: 'manager-berlin' },
      update: { passwordHash: managerHash },
      create: { username: 'manager-berlin', displayName: 'Менеджер · Berlin', passwordHash: managerHash, role: 'MANAGER', isActive: true },
    });

    for (const u of [dmitry, admin, office1, countryDe, managerBerlin]) {
      await this.prisma.userAccess.deleteMany({ where: { userId: u.id } });
    }
    await this.prisma.userAccess.createMany({
      data: [
        { userId: dmitry.id, scope: 'GLOBAL' },
        { userId: admin.id, scope: 'GLOBAL' },
        { userId: office1.id, scope: 'GLOBAL' },
        { userId: countryDe.id, scope: 'COUNTRY', countryId: de.id },
        { userId: managerBerlin.id, scope: 'CITY', cityId: berlin.id },
      ],
      skipDuplicates: true,
    });
    this.logger.log('Users & accesses created: Dmitryganj, admin, office1, country-de, manager-berlin');
  }
}
