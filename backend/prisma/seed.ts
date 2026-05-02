import { PrismaClient, Role, AccessScope } from '@prisma/client';
import * as bcrypt from 'bcrypt';

const prisma = new PrismaClient();

async function main() {
  console.log('▶ Seeding Impreza v2…');

  // Countries
  const de = await prisma.country.upsert({
    where: { code: 'DE' },
    update: {},
    create: { code: 'DE', name: 'Германия' },
  });
  const pl = await prisma.country.upsert({
    where: { code: 'PL' },
    update: {},
    create: { code: 'PL', name: 'Польша' },
  });
  const nl = await prisma.country.upsert({
    where: { code: 'NL' },
    update: {},
    create: { code: 'NL', name: 'Нидерланды' },
  });
  const at = await prisma.country.upsert({
    where: { code: 'AT' },
    update: {},
    create: { code: 'AT', name: 'Австрия' },
  });
  console.log('  countries:', [de.code, pl.code, nl.code, at.code].join(', '));

  // Cities
  const berlin = await prisma.city.upsert({
    where: { code: 'berlin' },
    update: {},
    create: { code: 'berlin', name: 'Berlin', countryId: de.id },
  });
  const warsaw = await prisma.city.upsert({
    where: { code: 'warsaw' },
    update: {},
    create: { code: 'warsaw', name: 'Warsaw', countryId: pl.id },
  });
  const amsterdam = await prisma.city.upsert({
    where: { code: 'amsterdam' },
    update: {},
    create: { code: 'amsterdam', name: 'Amsterdam', countryId: nl.id },
  });
  const vienna = await prisma.city.upsert({
    where: { code: 'vienna' },
    update: {},
    create: { code: 'vienna', name: 'Vienna', countryId: at.id },
  });
  console.log('  cities:', [berlin, warsaw, amsterdam, vienna].map((c) => c.name).join(', '));

  // Users
  const adminHash = await bcrypt.hash('Impreza@Admin2026!', 10);
  const officeHash = await bcrypt.hash('Office@2026!', 10);
  const countryHash = await bcrypt.hash('Country@2026!', 10);
  const managerHash = await bcrypt.hash('Manager@2026!', 10);

  const dmitry = await prisma.user.upsert({
    where: { username: 'Dmitryganj' },
    update: { passwordHash: adminHash, role: Role.ADMIN, isActive: true },
    create: {
      username: 'Dmitryganj',
      displayName: 'Dmitryganj',
      passwordHash: adminHash,
      role: Role.ADMIN,
      isActive: true,
    },
  });
  const admin = await prisma.user.upsert({
    where: { username: 'admin' },
    update: { passwordHash: adminHash, role: Role.ADMIN, isActive: true },
    create: {
      username: 'admin',
      displayName: 'Admin',
      passwordHash: adminHash,
      role: Role.ADMIN,
      isActive: true,
    },
  });
  const office1 = await prisma.user.upsert({
    where: { username: 'office1' },
    update: { passwordHash: officeHash, role: Role.OFFICE, isActive: true },
    create: {
      username: 'office1',
      displayName: 'Офис · 1',
      passwordHash: officeHash,
      role: Role.OFFICE,
      isActive: true,
    },
  });
  const countryDe = await prisma.user.upsert({
    where: { username: 'country-de' },
    update: { passwordHash: countryHash, role: Role.COUNTRY, isActive: true },
    create: {
      username: 'country-de',
      displayName: 'Страна · Германия',
      passwordHash: countryHash,
      role: Role.COUNTRY,
      isActive: true,
    },
  });
  const managerBerlin = await prisma.user.upsert({
    where: { username: 'manager-berlin' },
    update: { passwordHash: managerHash, role: Role.MANAGER, isActive: true },
    create: {
      username: 'manager-berlin',
      displayName: 'Менеджер · Berlin',
      passwordHash: managerHash,
      role: Role.MANAGER,
      isActive: true,
    },
  });

  // Wipe existing accesses for these users to keep idempotent
  for (const u of [dmitry, admin, office1, countryDe, managerBerlin]) {
    await prisma.userAccess.deleteMany({ where: { userId: u.id } });
  }

  await prisma.userAccess.createMany({
    data: [
      { userId: dmitry.id, scope: AccessScope.GLOBAL },
      { userId: admin.id, scope: AccessScope.GLOBAL },
      { userId: office1.id, scope: AccessScope.GLOBAL },
      { userId: countryDe.id, scope: AccessScope.COUNTRY, countryId: de.id },
      { userId: managerBerlin.id, scope: AccessScope.CITY, cityId: berlin.id },
    ],
    skipDuplicates: true,
  });

  console.log('  users: Dmitryganj, admin, office1, country-de, manager-berlin');
  console.log('✔ Seed done.');
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
