import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../generated/prisma/client.js';
import { bootstrapSuperadmin } from '../modules/auth/bootstrap-superadmin.js';

/**
 * პირველი superadmin production-ში (სატესტო მონაცემების და tsx-ის გარეშე):
 *
 *   SEED_SUPERADMIN_EMAIL=... SEED_SUPERADMIN_PASSWORD=... node dist/scripts/create-superadmin.js
 *
 * `DATABASE_URL` env-იდან. განმეორებით გაშვება უსაფრთხოა — არსებულის პაროლს არ ცვლის.
 */
const url = process.env.DATABASE_URL;
if (!url) {
  console.error('DATABASE_URL არ არის');
  process.exit(1);
}

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: url }),
});
try {
  const result = await bootstrapSuperadmin(prisma);
  if (result === 'skipped') process.exitCode = 1;
} finally {
  await prisma.$disconnect();
}
