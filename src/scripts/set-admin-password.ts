import 'dotenv/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { createInterface } from 'node:readline';
import { PrismaClient } from '../generated/prisma/client.js';
import {
  hashPassword,
  PASSWORD_MAX_LENGTH,
  PASSWORD_MIN_LENGTH,
} from '../modules/auth/password.js';

/**
 * ადმინის პაროლის შეცვლა პირდაპირ ბაზაში — მაშინ, როცა ადმინკაში ვეღარ შედიხარ
 * (დავიწყებული პაროლი, ერთადერთი superadmin).
 *
 *   ლოკალურად:  pnpm admin:password superadmin@gmail.com
 *   usectl-ზე:  node dist/scripts/set-admin-password.js superadmin@gmail.com   (pod-ის Terminal-იდან)
 *
 * პაროლს გკითხავს (აკრეფისას არ ჩანს) ან იღებს ADMIN_NEW_PASSWORD env-იდან.
 * ასევე: ხსნის ჩაკეტვას, აუქმებს ამ მომხმარებლის ყველა სესიას, ძველ ტოკენებს აუქმებს.
 */
function askHidden(question: string): Promise<string> {
  return new Promise((resolve) => {
    const rl = createInterface({
      input: process.stdin,
      output: process.stdout,
      terminal: true,
    });
    const mutable = rl as unknown as { _writeToOutput: (s: string) => void };
    let asked = false;
    mutable._writeToOutput = (s: string) => {
      if (!asked) {
        process.stdout.write(s);
        asked = true;
      }
    };
    rl.question(question, (answer) => {
      rl.close();
      process.stdout.write('\n');
      resolve(answer);
    });
  });
}

const email = process.argv[2]?.trim().toLowerCase();
const url = process.env.DATABASE_URL;
if (!email || !url) {
  console.error(
    'გამოყენება: set-admin-password <email>   (DATABASE_URL env-ში)',
  );
  process.exit(1);
}

const password =
  process.env.ADMIN_NEW_PASSWORD ??
  (await askHidden(`ახალი პაროლი (${email}): `));
if (
  password.length < PASSWORD_MIN_LENGTH ||
  password.length > PASSWORD_MAX_LENGTH
) {
  console.error(
    `პაროლი: ${PASSWORD_MIN_LENGTH}–${PASSWORD_MAX_LENGTH} სიმბოლო`,
  );
  process.exit(1);
}

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: url }),
});
try {
  const user = await prisma.adminUser.findUnique({ where: { email } });
  if (!user) {
    console.error(`${email} ვერ მოიძებნა`);
    process.exitCode = 1;
  } else {
    await prisma.adminUser.update({
      where: { id: user.id },
      data: {
        password_hash: await hashPassword(password),
        password_changed_at: new Date(),
        failed_login_count: 0,
        locked_until: null,
      },
    });
    const { count } = await prisma.adminRefreshToken.updateMany({
      where: { user_id: user.id, revoked_at: null },
      data: { revoked_at: new Date() },
    });
    console.log(
      `✓ ${email}: პაროლი შეიცვალა, ჩაკეტვა მოიხსნა, დაიხურა ${count} სესია`,
    );
  }
} finally {
  await prisma.$disconnect();
}
