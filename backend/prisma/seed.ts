import { PrismaClient, Role, ScopeType } from '@prisma/client';
import * as bcrypt from 'bcrypt';

const prisma = new PrismaClient();

// ─────────────── Password helper ───────────────
const BCRYPT_ROUNDS = 12;
const hashPw = (pw: string) => bcrypt.hashSync(pw, BCRYPT_ROUNDS);

// ─────────────── Country & City data with real coordinates ───────────────
interface CityData { name: string; slug: string; lat: number; lng: number; }
interface CountryData { name: string; code: string; lat: number; lng: number; cities: CityData[]; }

const COUNTRIES: CountryData[] = [
  {
    name: 'Luxembourg', code: 'lu', lat: 49.6117, lng: 6.1300,
    cities: [
      { name: 'Luxembourg', slug: 'luxembourg', lat: 49.6117, lng: 6.1300 },
    ],
  },
  {
    name: 'Austria', code: 'at', lat: 48.2082, lng: 16.3738,
    cities: [
      { name: 'Vienna', slug: 'vienna', lat: 48.2082, lng: 16.3738 },
      { name: 'Innsbruck', slug: 'innsbruck', lat: 47.2692, lng: 11.4041 },
    ],
  },
  {
    name: 'Slovakia', code: 'sk', lat: 48.1486, lng: 17.1077,
    cities: [
      { name: 'Bratislava', slug: 'bratislava', lat: 48.1486, lng: 17.1077 },
    ],
  },
  {
    name: 'Lithuania', code: 'lt', lat: 54.6872, lng: 25.2797,
    cities: [
      { name: 'Vilnius', slug: 'vilnius', lat: 54.6872, lng: 25.2797 },
      { name: 'Kaunas', slug: 'kaunas', lat: 54.8985, lng: 23.9036 },
    ],
  },
  {
    name: 'Latvia', code: 'lv', lat: 56.9496, lng: 24.1052,
    cities: [
      { name: 'Riga', slug: 'riga', lat: 56.9496, lng: 24.1052 },
    ],
  },
  {
    name: 'Estonia', code: 'ee', lat: 59.4370, lng: 24.7536,
    cities: [
      { name: 'Tallinn', slug: 'tallinn', lat: 59.4370, lng: 24.7536 },
    ],
  },
  {
    name: 'France', code: 'fr', lat: 48.8566, lng: 2.3522,
    cities: [
      { name: 'Paris', slug: 'paris', lat: 48.8566, lng: 2.3522 },
      { name: 'Lyon', slug: 'lyon', lat: 45.7640, lng: 4.8357 },
      { name: 'Marseille', slug: 'marseille', lat: 43.2965, lng: 5.3698 },
      { name: 'Strasbourg', slug: 'strasbourg', lat: 48.5734, lng: 7.7521 },
    ],
  },
  {
    name: 'USA', code: 'us', lat: 40.7128, lng: -74.0060,
    cities: [
      { name: 'New York', slug: 'new-york', lat: 40.7128, lng: -74.0060 },
      { name: 'Miami', slug: 'miami', lat: 25.7617, lng: -80.1918 },
      { name: 'Los Angeles', slug: 'los-angeles', lat: 34.0522, lng: -118.2437 },
      { name: 'Chicago', slug: 'chicago', lat: 41.8781, lng: -87.6298 },
    ],
  },
  {
    name: 'Portugal', code: 'pt', lat: 38.7223, lng: -9.1393,
    cities: [
      { name: 'Lisbon', slug: 'lisbon', lat: 38.7223, lng: -9.1393 },
      { name: 'Porto', slug: 'porto', lat: 41.1579, lng: -8.6291 },
    ],
  },
  {
    name: 'United Kingdom', code: 'gb', lat: 51.5074, lng: -0.1278,
    cities: [
      { name: 'London', slug: 'london', lat: 51.5074, lng: -0.1278 },
      { name: 'Manchester', slug: 'manchester', lat: 53.4808, lng: -2.2426 },
      { name: 'Birmingham', slug: 'birmingham', lat: 52.4862, lng: -1.8904 },
    ],
  },
  {
    name: 'Poland', code: 'pl', lat: 52.2297, lng: 21.0122,
    cities: [
      { name: 'Warsaw', slug: 'warsaw', lat: 52.2297, lng: 21.0122 },
      { name: 'Krakow', slug: 'krakow', lat: 50.0647, lng: 19.9450 },
      { name: 'Wroclaw', slug: 'wroclaw', lat: 51.1079, lng: 17.0385 },
      { name: 'Gdansk', slug: 'gdansk', lat: 54.3520, lng: 18.6466 },
      { name: 'Lublin', slug: 'lublin', lat: 51.2465, lng: 22.5684 },
      { name: 'Katowice', slug: 'katowice', lat: 50.2649, lng: 19.0238 },
      { name: 'Czestochowa', slug: 'czestochowa', lat: 50.8118, lng: 19.1203 },
      { name: 'Bydgoszcz', slug: 'bydgoszcz', lat: 53.1235, lng: 18.0084 },
      { name: 'Legnica', slug: 'legnica', lat: 51.2070, lng: 16.1619 },
      { name: 'Bialystok', slug: 'bialystok', lat: 53.1325, lng: 23.1688 },
    ],
  },
  {
    name: 'Germany', code: 'de', lat: 52.5200, lng: 13.4050,
    cities: [
      { name: 'Berlin', slug: 'berlin', lat: 52.5200, lng: 13.4050 },
      { name: 'Munich', slug: 'munich', lat: 48.1351, lng: 11.5820 },
      { name: 'Frankfurt', slug: 'frankfurt', lat: 50.1109, lng: 8.6821 },
      { name: 'Essen', slug: 'essen', lat: 51.4556, lng: 7.0116 },
      { name: 'Wiesbaden', slug: 'wiesbaden', lat: 50.0782, lng: 8.2398 },
      { name: 'Karlsruhe', slug: 'karlsruhe', lat: 49.0069, lng: 8.4037 },
      { name: 'Leipzig', slug: 'leipzig', lat: 51.3397, lng: 12.3731 },
      { name: 'Stuttgart', slug: 'stuttgart', lat: 48.7758, lng: 9.1829 },
      { name: 'Freiburg', slug: 'freiburg', lat: 47.9990, lng: 7.8421 },
      { name: 'Hannover', slug: 'hannover', lat: 52.3759, lng: 9.7320 },
      { name: 'Dusseldorf', slug: 'dusseldorf', lat: 51.2277, lng: 6.7735 },
      { name: 'Koblenz', slug: 'koblenz', lat: 50.3569, lng: 7.5890 },
      { name: 'Dresden', slug: 'dresden', lat: 51.0504, lng: 13.7373 },
      { name: 'Cologne', slug: 'cologne', lat: 50.9375, lng: 6.9603 },
      { name: 'Hameln', slug: 'hameln', lat: 52.1037, lng: 9.3568 },
      { name: 'Mainz', slug: 'mainz', lat: 49.9929, lng: 8.2473 },
      { name: 'Aachen', slug: 'aachen', lat: 50.7753, lng: 6.0839 },
    ],
  },
  {
    name: 'Netherlands', code: 'nl', lat: 52.3676, lng: 4.9041,
    cities: [
      { name: 'Amsterdam', slug: 'amsterdam', lat: 52.3676, lng: 4.9041 },
      { name: 'Rotterdam', slug: 'rotterdam', lat: 51.9244, lng: 4.4777 },
      { name: 'Leiden', slug: 'leiden', lat: 52.1601, lng: 4.4970 },
      { name: 'Breda', slug: 'breda', lat: 51.5719, lng: 4.7683 },
      { name: 'Den Haag', slug: 'den-haag', lat: 52.0705, lng: 4.3007 },
      { name: 'Maastricht', slug: 'maastricht', lat: 50.8514, lng: 5.6910 },
      { name: 'Tilburg', slug: 'tilburg', lat: 51.5555, lng: 5.0913 },
      { name: 'Eindhoven', slug: 'eindhoven', lat: 51.4416, lng: 5.4697 },
      { name: 'Groningen', slug: 'groningen', lat: 53.2194, lng: 6.5665 },
      { name: 'Hertogenbosch', slug: 'hertogenbosch', lat: 51.6978, lng: 5.3037 },
    ],
  },
  {
    name: 'Bulgaria', code: 'bg', lat: 42.6977, lng: 23.3219,
    cities: [
      { name: 'Sofia', slug: 'sofia', lat: 42.6977, lng: 23.3219 },
      { name: 'Varna', slug: 'varna', lat: 43.2141, lng: 27.9147 },
      { name: 'Nesebar', slug: 'nesebar', lat: 42.6592, lng: 27.7356 },
      { name: 'Plovdiv', slug: 'plovdiv', lat: 42.1354, lng: 24.7453 },
      { name: 'Burgas', slug: 'burgas', lat: 42.5048, lng: 27.4626 },
    ],
  },
  {
    name: 'Czech Republic', code: 'cz', lat: 50.0755, lng: 14.4378,
    cities: [
      { name: 'Prague', slug: 'prague', lat: 50.0755, lng: 14.4378 },
      { name: 'Brno', slug: 'brno', lat: 49.1951, lng: 16.6068 },
      { name: 'Ostrava', slug: 'ostrava', lat: 49.8209, lng: 18.2625 },
    ],
  },
  {
    name: 'Spain', code: 'es', lat: 40.4168, lng: -3.7038,
    cities: [
      { name: 'Madrid', slug: 'madrid', lat: 40.4168, lng: -3.7038 },
      { name: 'Barcelona', slug: 'barcelona', lat: 41.3874, lng: 2.1686 },
      { name: 'Valencia', slug: 'valencia', lat: 39.4699, lng: -0.3763 },
      { name: 'Malaga', slug: 'malaga', lat: 36.7213, lng: -4.4214 },
    ],
  },
  {
    name: 'South Korea', code: 'kr', lat: 37.5665, lng: 126.9780,
    cities: [
      { name: 'Seoul', slug: 'seoul', lat: 37.5665, lng: 126.9780 },
      { name: 'Incheon', slug: 'incheon', lat: 37.4563, lng: 126.7052 },
    ],
  },
];

// ─────────────── Main seed ───────────────
async function main() {
  console.log('\uD83C\uDF31 Seeding IMPREZA database (USER-centric)...\n');

  // ───── 1. Clean all tables ─────
  console.log('\uD83D\uDDD1\uFE0F  Cleaning existing data...');
  const tableOrder = [
    'domain_events', 'audit_logs', 'notifications',
    'company_losses', 'shortages', 'adjustments', 'expenses',
    'acceptance_records', 'transfer_rejections', 'transfer_items', 'transfers',
    'warehouse_creations', 'refresh_tokens', 'user_access', 'users',
    'cities', 'countries', 'offices',
  ];
  const existing = await prisma.$queryRawUnsafe<Array<{ tablename: string }>>(
    `SELECT tablename FROM pg_tables WHERE schemaname = 'public'`,
  );
  const existingSet = new Set(existing.map((r: any) => r.tablename));
  const existingTargets = tableOrder.filter((t) => existingSet.has(t));
  if (existingTargets.length > 0) {
    await prisma.$executeRawUnsafe(
      `TRUNCATE TABLE ${existingTargets.map((t) => `"${t}"`).join(', ')} CASCADE`,
    );
  }
  console.log('   \u2705 Done\n');

  // ───── 2. Office ─────
  console.log('\uD83C\uDFE2 Creating office...');
  const office = await prisma.office.create({ data: { name: '\u041E\u0444\u0438\u0441 \u0415\u0432\u0440\u043E\u043F\u0430', code: 'eu' } });
  console.log('   \u2705 \u041E\u0444\u0438\u0441 \u0415\u0432\u0440\u043E\u043F\u0430\n');

  // ───── 3. Countries + Cities ─────
  console.log('\uD83C\uDF0D Creating countries and cities...');
  const countryMap: Record<string, string> = {};
  const cityMap: Record<string, string> = {};

  for (const c of COUNTRIES) {
    const country = await prisma.country.create({
      data: { name: c.name, code: c.code, latitude: c.lat, longitude: c.lng, officeId: office.id },
    });
    countryMap[c.code] = country.id;
    for (const city of c.cities) {
      const created = await prisma.city.create({
        data: { name: city.name, slug: city.slug, latitude: city.lat, longitude: city.lng, countryId: country.id },
      });
      cityMap[city.slug] = created.id;
    }
    console.log(`   \u2705 ${c.name}: ${c.cities.length} cities`);
  }
  console.log(`   Total cities: ${Object.keys(cityMap).length}\n`);

  // ───── 4. Admin accounts ─────
  console.log('\uD83D\uDC64 Creating admin accounts...');
  const adminDmitry = await prisma.user.create({
    data: {
      email: 'dmitryganj@impreza.io',
      username: 'dmitryganj',
      passwordHash: hashPw('Impreza@Admin2026!'),
      passwordVisible: 'Impreza@Admin2026!',
      role: Role.ADMIN,
      displayName: 'Dmitry Ganj',
    },
  });
  await prisma.userAccess.create({
    data: { userId: adminDmitry.id, scopeType: ScopeType.GLOBAL, grantedById: adminDmitry.id, notes: 'seed' },
  });

  const adminSerdar = await prisma.user.create({
    data: {
      email: 'serdar@impreza.io',
      username: 'serdar',
      passwordHash: hashPw('Impreza@Serdar2026!'),
      passwordVisible: 'Impreza@Serdar2026!',
      role: Role.ADMIN,
      displayName: 'Serdar',
    },
  });
  await prisma.userAccess.create({
    data: { userId: adminSerdar.id, scopeType: ScopeType.GLOBAL, grantedById: adminDmitry.id, notes: 'seed' },
  });
  console.log('   \u2705 dmitryganj (ADMIN)');
  console.log('   \u2705 serdar (ADMIN)\n');

  // ───── 5. Office account ─────
  console.log('\uD83C\uDFE2 Creating office account...');
  const officeUser = await prisma.user.create({
    data: {
      email: 'office_mariana@impreza.io',
      username: 'office_mariana',
      passwordHash: hashPw('OfficeMariana@2026!'),
      passwordVisible: 'OfficeMariana@2026!',
      role: Role.OFFICE,
      displayName: 'Office Mariana',
      officeId: office.id,
    },
  });
  await prisma.userAccess.create({
    data: { userId: officeUser.id, scopeType: ScopeType.OFFICE, scopeId: office.id, grantedById: adminDmitry.id, notes: 'seed' },
  });
  console.log('   \u2705 office_mariana (OFFICE)\n');

  // ───── 6. Regular USER accounts with personal balances ─────
  console.log('\uD83D\uDC65 Creating USER accounts...');
  const regularUsers = [
    { username: 'polzovatel1', displayName: '\u041F\u043E\u043B\u044C\u0437\u043E\u0432\u0430\u0442\u0435\u043B\u044C \u041E\u0434\u0438\u043D', citySlug: 'berlin',    password: 'UserOne@2026!' },
    { username: 'polzovatel2', displayName: '\u041F\u043E\u043B\u044C\u0437\u043E\u0432\u0430\u0442\u0435\u043B\u044C \u0414\u0432\u0430',   citySlug: 'warsaw',    password: 'UserTwo@2026!' },
    { username: 'polzovatel3', displayName: '\u041F\u043E\u043B\u044C\u0437\u043E\u0432\u0430\u0442\u0435\u043B\u044C \u0422\u0440\u0438',   citySlug: 'amsterdam', password: 'UserThree@2026!' },
    { username: 'polzovatel4', displayName: '\u041F\u043E\u043B\u044C\u0437\u043E\u0432\u0430\u0442\u0435\u043B\u044C \u0427\u0435\u0442\u044B\u0440\u0435', citySlug: 'vienna',    password: 'UserFour@2026!' },
    { username: 'polzovatel5', displayName: '\u041F\u043E\u043B\u044C\u0437\u043E\u0432\u0430\u0442\u0435\u043B\u044C \u041F\u044F\u0442\u044C',  citySlug: 'paris',     password: 'UserFive@2026!' },
  ];

  for (const ru of regularUsers) {
    const cityId = cityMap[ru.citySlug];
    if (!cityId) throw new Error(`City not found: ${ru.citySlug}`);

    const user = await prisma.user.create({
      data: {
        email: `${ru.username}@impreza.io`,
        username: ru.username,
        passwordHash: hashPw(ru.password),
        passwordVisible: ru.password,
        role: Role.USER,
        displayName: ru.displayName,
        primaryCityId: cityId,
      },
    });
    await prisma.userAccess.create({
      data: {
        userId: user.id,
        scopeType: ScopeType.CITY,
        scopeId: cityId,
        grantedById: adminDmitry.id,
        notes: `seed: ${ru.citySlug}`,
      },
    });
    console.log(`   \u2705 ${ru.username} (USER) \u2192 ${ru.citySlug}`);
  }

  // ───── 7. Summary ─────
  const [userCount, countryCount, cityCount, officeCount] = await Promise.all([
    prisma.user.count(), prisma.country.count(), prisma.city.count(), prisma.office.count(),
  ]);

  console.log('\n' + '\u2550'.repeat(60));
  console.log('\uD83C\uDF89 Seed complete!');
  console.log('\u2550'.repeat(60));
  console.log(`   Users:     ${userCount} (2 admin + 1 office + 5 users)`);
  console.log(`   Offices:   ${officeCount}`);
  console.log(`   Countries: ${countryCount}`);
  console.log(`   Cities:    ${cityCount}`);
  console.log('\n   \uD83D\uDD10 dmitryganj / Impreza@Admin2026! (ADMIN)');
  console.log('   \uD83D\uDD10 serdar / Impreza@Serdar2026! (ADMIN)');
  console.log('   \uD83D\uDD10 office_mariana / OfficeMariana@2026! (OFFICE)');
  console.log('   \uD83D\uDD10 polzovatel1 / UserOne@2026! (USER - Berlin)');
  console.log('   \uD83D\uDD10 polzovatel2 / UserTwo@2026! (USER - Warsaw)');
  console.log('   \uD83D\uDD10 polzovatel3 / UserThree@2026! (USER - Amsterdam)');
  console.log('   \uD83D\uDD10 polzovatel4 / UserFour@2026! (USER - Vienna)');
  console.log('   \uD83D\uDD10 polzovatel5 / UserFive@2026! (USER - Paris)');
  console.log('\u2550'.repeat(60));
}

main()
  .then(async () => { await prisma.$disconnect(); })
  .catch(async (e) => {
    console.error('\u274C Seed failed:', e);
    await prisma.$disconnect();
    process.exit(1);
  });
