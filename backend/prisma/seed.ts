import { PrismaClient, Role, ItemType, EntityType, TransferStatus } from '@prisma/client';
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
    name: 'Spain', code: 'es', lat: 41.3874, lng: 2.1686,
    cities: [
      { name: 'Barcelona', slug: 'barcelona', lat: 41.3874, lng: 2.1686 },
      { name: 'Valencia', slug: 'valencia', lat: 39.4699, lng: -0.3763 },
    ],
  },
];

// ─────────────── Main seed ───────────────
async function main() {
  console.log('🌱 Seeding IMPREZA v2 database...\n');

  // ───── 1. Clean all tables ─────
  console.log('🗑️  Cleaning existing data...');
  await prisma.$executeRawUnsafe(`
    TRUNCATE TABLE
      domain_events, audit_logs, notifications, adjustments, expenses,
      transfer_rejections, transfer_items, transfers,
      acceptance_records, inventory, refresh_tokens, users, cities, countries
    CASCADE;
  `);

  // ───── 2. Create countries ─────
  console.log('🌍 Creating countries...');
  const countryMap: Record<string, string> = {}; // code → id

  for (const c of COUNTRIES) {
    const country = await prisma.country.create({
      data: {
        name: c.name,
        code: c.code,
        latitude: c.lat,
        longitude: c.lng,
      },
    });
    countryMap[c.code] = country.id;
    console.log(`   ✅ ${c.name} (${c.code})`);
  }

  // ───── 3. Create cities ─────
  console.log('\n🏙️  Creating cities...');
  const cityMap: Record<string, string> = {}; // slug → id

  for (const c of COUNTRIES) {
    for (const city of c.cities) {
      const created = await prisma.city.create({
        data: {
          name: city.name,
          slug: city.slug,
          latitude: city.lat,
          longitude: city.lng,
          countryId: countryMap[c.code],
        },
      });
      cityMap[city.slug] = created.id;
    }
    console.log(`   ✅ ${c.name}: ${c.cities.length} cities`);
  }

  const totalCities = Object.keys(cityMap).length;
  console.log(`   Total: ${totalCities} cities\n`);

  // ───── 4. Create Admin account ─────
  console.log('👤 Creating admin account...');
  const admin = await prisma.user.create({
    data: {
      email: 'admin@impreza.io',
      username: 'admin',
      passwordHash: hashPw('admin_2025!Imp'),
      role: Role.ADMIN,
      displayName: 'Администратор',
    },
  });
  console.log(`   ✅ admin / admin_2025!Imp (ADMIN)\n`);

  // ───── 5. Create Country accounts ─────
  console.log('🏳️  Creating country accounts...');
  const countryUserMap: Record<string, string> = {}; // code → userId

  for (const c of COUNTRIES) {
    const password = `${c.code}_2025!Imp`;
    const user = await prisma.user.create({
      data: {
        email: `${c.code}@impreza.io`,
        username: c.code,
        passwordHash: hashPw(password),
        role: Role.COUNTRY,
        displayName: c.name,
        countryId: countryMap[c.code],
      },
    });
    countryUserMap[c.code] = user.id;
    console.log(`   ✅ ${c.code} / ${password} → ${c.name}`);
  }

  // ───── 6. Create City accounts ─────
  console.log('\n🏙️  Creating city accounts...');
  const cityUserMap: Record<string, string> = {}; // slug → userId

  for (const c of COUNTRIES) {
    for (const city of c.cities) {
      const password = `${city.slug}_2025!Imp`;
      const user = await prisma.user.create({
        data: {
          email: `${city.slug}@impreza.io`,
          username: city.slug,
          passwordHash: hashPw(password),
          role: Role.CITY,
          displayName: city.name,
          countryId: countryMap[c.code],
          cityId: cityMap[city.slug],
        },
      });
      cityUserMap[city.slug] = user.id;
    }
    console.log(`   ✅ ${c.name}: ${c.cities.length} city accounts`);
  }

  // ───── 7. Initialize empty inventory for countries and cities ─────
  console.log('\n📋 Initializing country/city inventories (all at 0)...');
  const itemTypes: ItemType[] = [ItemType.BLACK, ItemType.WHITE, ItemType.RED, ItemType.BLUE];

  for (const c of COUNTRIES) {
    // Country inventory
    for (const it of itemTypes) {
      await prisma.inventory.create({
        data: {
          entityType: EntityType.COUNTRY,
          countryId: countryMap[c.code],
          itemType: it,
          quantity: 0,
        },
      });
    }
    // City inventories
    for (const city of c.cities) {
      for (const it of itemTypes) {
        await prisma.inventory.create({
          data: {
            entityType: EntityType.CITY,
            cityId: cityMap[city.slug],
            itemType: it,
            quantity: 0,
          },
        });
      }
    }
  }
  console.log(`   ✅ All ${COUNTRIES.length} countries + ${totalCities} cities initialized at 0`);

  // ───── 8. Summary ─────
  const userCount = await prisma.user.count();
  const countryCount = await prisma.country.count();
  const cityCount = await prisma.city.count();

  console.log('\n' + '═'.repeat(60));
  console.log('🎉 Seed complete!');
  console.log('═'.repeat(60));
  console.log(`   Users:      ${userCount} (1 admin + ${countryCount} countries + ${cityCount} cities)`);
  console.log(`   Countries:  ${countryCount}`);
  console.log(`   Cities:     ${cityCount}`);
  console.log(`\n   🔐 Admin login: admin / admin_2025!Imp`);
  console.log(`   🔐 Country login: {code} / {code}_2025!Imp (e.g. de / de_2025!Imp)`);
  console.log(`   🔐 City login: {slug} / {slug}_2025!Imp (e.g. berlin / berlin_2025!Imp)`);
  console.log('═'.repeat(60));
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (e) => {
    console.error('❌ Seed failed:', e);
    await prisma.$disconnect();
    process.exit(1);
  });
