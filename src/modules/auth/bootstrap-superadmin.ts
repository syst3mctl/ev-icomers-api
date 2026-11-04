import type { PrismaClient } from '../../generated/prisma/client.js';
import { hashPassword, PASSWORD_MIN_LENGTH } from './password.js';

/**
 * პირველი superadmin env-იდან (`SEED_SUPERADMIN_EMAIL` / `SEED_SUPERADMIN_PASSWORD`).
 * იყენებს `pnpm db:seed` (ლოკალურად) და `node dist/scripts/create-superadmin.js` (production).
 *
 * თუ მომხმარებელი უკვე არსებობს, პაროლი **არ იცვლება** (შეიძლება უკვე შეცვალა) —
 * მხოლოდ superadmin როლი და აქტიურობა ბრუნდება. ამიტომ განმეორებით გაშვება უსაფრთხოა.
 */
export async function bootstrapSuperadmin(
  prisma: Pick<PrismaClient, 'adminUser'>,
  env: NodeJS.ProcessEnv = process.env,
): Promise<'created' | 'exists' | 'skipped'> {
  const email = env.SEED_SUPERADMIN_EMAIL?.trim().toLowerCase();
  const password = env.SEED_SUPERADMIN_PASSWORD;
  if (!email || !password) {
    console.log(
      'SEED_SUPERADMIN_EMAIL / SEED_SUPERADMIN_PASSWORD არ არის — superadmin არ შეიქმნა',
    );
    return 'skipped';
  }
  if (password.length < PASSWORD_MIN_LENGTH) {
    throw new Error(
      `SEED_SUPERADMIN_PASSWORD: მინიმუმ ${PASSWORD_MIN_LENGTH} სიმბოლო`,
    );
  }

  const existing = await prisma.adminUser.findUnique({ where: { email } });
  if (existing) {
    const roles = existing.roles.includes('superadmin')
      ? existing.roles
      : ['superadmin', ...existing.roles];
    await prisma.adminUser.update({
      where: { email },
      data: { roles, is_active: true },
    });
    console.log(`superadmin ${email} უკვე არსებობს (პაროლი არ შეცვლილა)`);
    return 'exists';
  }

  await prisma.adminUser.create({
    data: {
      email,
      password_hash: await hashPassword(password),
      display_name: 'Super Admin',
      roles: ['superadmin'],
    },
  });
  console.log(`superadmin ${email} შეიქმნა`);
  return 'created';
}
