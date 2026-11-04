import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../generated/prisma/client.js';
import { seedDemoData } from './demo-data.js';

/**
 * სატესტო მონაცემები staging-ზე (Docker-ში tsx არ არის, ამიტომ build-ში შედის):
 *
 *   node dist/scripts/seed-demo.js --yes
 *
 * `DATABASE_URL` env-იდან. superadmin-ს არ ქმნის (ამას start.sh აკეთებს).
 * განმეორებით გაშვება უსაფრთხოა. ⚠️ ნამდვილ production-ზე არ გაუშვა — ამიტომაა `--yes` სავალდებულო.
 */
if (!process.argv.includes('--yes')) {
  console.error(
    'ეს სკრიპტი ბაზაში სატესტო კატეგორიებს, დამტენებს და პროდუქტებს წერს.\n' +
      'თუ დარწმუნებული ხარ: node dist/scripts/seed-demo.js --yes',
  );
  process.exit(1);
}

const url = process.env.DATABASE_URL;
if (!url) {
  console.error('DATABASE_URL არ არის');
  process.exit(1);
}

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: url }),
});
try {
  await seedDemoData(prisma);
  console.log('Demo data: მზადაა');
} finally {
  await prisma.$disconnect();
}
