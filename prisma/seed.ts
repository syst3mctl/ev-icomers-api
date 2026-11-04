import 'dotenv/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../src/generated/prisma/client.js';
import { bootstrapSuperadmin } from '../src/modules/auth/bootstrap-superadmin.js';
import { seedDemoData } from '../src/scripts/demo-data.js';

/**
 * სატესტო მონაცემები ლოკალური დეველოპმენტისთვის: `pnpm db:seed`.
 * განმეორებით გაშვება უსაფრთხოა (upsert).
 */
const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }),
});

async function main(): Promise<void> {
  await seedDemoData(prisma);

  await bootstrapSuperadmin(prisma);

  console.log('Seed completed');
}

try {
  await main();
} finally {
  await prisma.$disconnect();
}
