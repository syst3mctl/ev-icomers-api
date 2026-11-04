import type { ConfigService } from '@nestjs/config';
import { createFakeAuthPrisma } from '../../../test/support/fake-auth-prisma.js';
import { AppError } from '../../common/filters/problem-details.filter.js';
import type { Env } from '../../config/env.js';
import type { PrismaService } from '../../infra/prisma/prisma.service.js';
import { AuthService, MAX_FAILED_LOGINS } from './auth.service.js';
import { hashPassword } from './password.js';
import { TokenService } from './token.service.js';

const config = {
  get: (key: string) =>
    ({
      JWT_KEY_ID: 'k1',
      JWT_ISSUER: 'http://api.test',
      JWT_AUDIENCE: 'icomers-admin',
      ACCESS_TOKEN_TTL_SECONDS: 900,
      REFRESH_TOKEN_TTL_DAYS: 14,
    })[key],
} as unknown as ConfigService<Env, true>;

const PASSWORD = '002201Password';
const client = { userAgent: 'vitest', ip: '127.0.0.1' };

async function expectCode(
  promise: Promise<unknown>,
  status: number,
  code: string,
) {
  await expect(promise).rejects.toBeInstanceOf(AppError);
  await promise.catch((e: AppError) => {
    expect(e.getStatus()).toBe(status);
    expect(e.code).toBe(code);
  });
}

describe('AuthService', () => {
  let prisma: ReturnType<typeof createFakeAuthPrisma>;
  let tokens: TokenService;
  let auth: AuthService;
  let userId: string;

  beforeAll(async () => {
    // scrypt ნელია (განზრახ) — ჰეში ერთხელ ვითვლით
    (globalThis as { __hash?: string }).__hash = await hashPassword(PASSWORD);
  });

  beforeEach(async () => {
    prisma = createFakeAuthPrisma();
    tokens = new TokenService(config);
    auth = new AuthService(prisma as unknown as PrismaService, tokens);
    const user = await prisma.adminUser.create({
      data: {
        email: 'superadmin@gmail.com',
        password_hash: (globalThis as { __hash?: string }).__hash!,
        roles: ['superadmin'],
      },
    });
    userId = user.id;
  });

  describe('login', () => {
    it('სწორი პაროლი → access + refresh, ელ. ფოსტა რეგისტრის მიუხედავად', async () => {
      const res = await auth.login('  SuperAdmin@Gmail.com ', PASSWORD, client);
      expect(res.user).toMatchObject({
        email: 'superadmin@gmail.com',
        roles: ['superadmin'],
      });
      expect(res.expires_in).toBe(900);
      expect(await tokens.verifyAccessToken(res.access_token)).toMatchObject({
        sub: userId,
      });
      expect(prisma.tokens).toHaveLength(1);
      expect(prisma.tokens[0]!.token_hash).toBe(
        TokenService.hashRefreshToken(res.refresh_token),
      );
      expect(prisma.tokens[0]!.token_hash).not.toBe(res.refresh_token);
      expect(prisma.users[0]!.last_login_at).toBeInstanceOf(Date);
    });

    it('არასწორი პაროლი და უცნობი ელ. ფოსტა ერთნაირ შეცდომას აბრუნებს', async () => {
      await expectCode(
        auth.login('superadmin@gmail.com', 'wrong', client),
        401,
        'INVALID_CREDENTIALS',
      );
      await expectCode(
        auth.login('nobody@gmail.com', PASSWORD, client),
        401,
        'INVALID_CREDENTIALS',
      );
    });

    it(`${MAX_FAILED_LOGINS} ცდის შემდეგ იკეტება; ჩაკეტვას მხოლოდ სწორი პაროლის მფლობელი ხედავს`, async () => {
      for (let i = 0; i < MAX_FAILED_LOGINS; i++) {
        await expectCode(
          auth.login('superadmin@gmail.com', 'wrong', client),
          401,
          'INVALID_CREDENTIALS',
        );
      }
      expect(prisma.users[0]!.locked_until!.getTime()).toBeGreaterThan(
        Date.now(),
      );
      // პაროლის გარეშე ჩაკეტვა არ ჩანს — უცნობი ელ. ფოსტისგან ვერ გაარჩევ
      await expectCode(
        auth.login('superadmin@gmail.com', 'wrong', client),
        401,
        'INVALID_CREDENTIALS',
      );
      await expectCode(
        auth.login('superadmin@gmail.com', PASSWORD, client),
        429,
        'ACCOUNT_LOCKED',
      );
    });

    it('პარალელური ცდები მთვლელს ვერ აცდება (ატომური increment)', async () => {
      await Promise.all(
        Array.from({ length: MAX_FAILED_LOGINS }, () =>
          auth.login('superadmin@gmail.com', 'wrong', client).catch(() => {}),
        ),
      );
      expect(prisma.users[0]!.locked_until).not.toBeNull();
    });

    it('წარმატებული ლოგინი მთვლელს ანულებს', async () => {
      await auth.login('superadmin@gmail.com', 'wrong', client).catch(() => {});
      expect(prisma.users[0]!.failed_login_count).toBe(1);
      await auth.login('superadmin@gmail.com', PASSWORD, client);
      expect(prisma.users[0]!.failed_login_count).toBe(0);
    });

    it('გათიშული ანგარიში → 403 ACCOUNT_DISABLED (მხოლოდ სწორი პაროლით)', async () => {
      prisma.users[0]!.is_active = false;
      await expectCode(
        auth.login('superadmin@gmail.com', 'wrong', client),
        401,
        'INVALID_CREDENTIALS',
      );
      await expectCode(
        auth.login('superadmin@gmail.com', PASSWORD, client),
        403,
        'ACCOUNT_DISABLED',
      );
    });
  });

  describe('refresh', () => {
    it('rotation: ახალი წყვილი, ძველი უქმდება, family იგივეა', async () => {
      const first = await auth.login('superadmin@gmail.com', PASSWORD, client);
      const second = await auth.refresh(first.refresh_token, client);
      expect(second.refresh_token).not.toBe(first.refresh_token);
      expect(prisma.tokens).toHaveLength(2);
      expect(prisma.tokens[0]!.revoked_at).toBeInstanceOf(Date);
      expect(prisma.tokens[1]!.revoked_at).toBeNull();
      expect(prisma.tokens[1]!.family_id).toBe(prisma.tokens[0]!.family_id);
    });

    it('შეცვლილი ტოკენის განმეორება grace-ის შემდეგ → მთელი family უქმდება', async () => {
      const first = await auth.login('superadmin@gmail.com', PASSWORD, client);
      const second = await auth.refresh(first.refresh_token, client);
      prisma.tokens[0]!.revoked_at = new Date(Date.now() - 60_000);

      await expectCode(
        auth.refresh(first.refresh_token, client),
        401,
        'INVALID_REFRESH_TOKEN',
      );
      // მოპარვის ეჭვი: ახალი (ლეგიტიმური) ტოკენიც აღარ მუშაობს
      await expectCode(
        auth.refresh(second.refresh_token, client),
        401,
        'INVALID_REFRESH_TOKEN',
      );
    });

    it('ერთდროული refresh grace-ში → 409 REFRESH_RACE, family არ უქმდება', async () => {
      const first = await auth.login('superadmin@gmail.com', PASSWORD, client);
      const second = await auth.refresh(first.refresh_token, client);
      await expectCode(
        auth.refresh(first.refresh_token, client),
        409,
        'REFRESH_RACE',
      );
      await expect(
        auth.refresh(second.refresh_token, client),
      ).resolves.toBeDefined();
    });

    it('უცნობი და ვადაგასული ტოკენი → 401', async () => {
      await expectCode(
        auth.refresh('nope', client),
        401,
        'INVALID_REFRESH_TOKEN',
      );
      const first = await auth.login('superadmin@gmail.com', PASSWORD, client);
      prisma.tokens[0]!.expires_at = new Date(Date.now() - 1);
      await expectCode(
        auth.refresh(first.refresh_token, client),
        401,
        'INVALID_REFRESH_TOKEN',
      );
    });

    it('გათიშულ მომხმარებელს refresh არ ეძლევა', async () => {
      const first = await auth.login('superadmin@gmail.com', PASSWORD, client);
      prisma.users[0]!.is_active = false;
      await expectCode(
        auth.refresh(first.refresh_token, client),
        401,
        'INVALID_REFRESH_TOKEN',
      );
    });
  });

  it('logout family-ს აუქმებს, სხვა სესია რჩება', async () => {
    const laptop = await auth.login('superadmin@gmail.com', PASSWORD, client);
    const phone = await auth.login('superadmin@gmail.com', PASSWORD, client);
    await auth.logout(laptop.refresh_token);
    await expectCode(
      auth.refresh(laptop.refresh_token, client),
      401,
      'INVALID_REFRESH_TOKEN',
    );
    await expect(
      auth.refresh(phone.refresh_token, client),
    ).resolves.toBeDefined();
    await expect(auth.logout(undefined)).resolves.toBeUndefined();
  });

  describe('changePassword', () => {
    it('ცვლის პაროლს და აუქმებს ყველა სხვა სესიას', async () => {
      const other = await auth.login('superadmin@gmail.com', PASSWORD, client);
      const res = await auth.changePassword(
        userId,
        PASSWORD,
        'new-password-123',
        client,
      );

      await expectCode(
        auth.refresh(other.refresh_token, client),
        401,
        'INVALID_REFRESH_TOKEN',
      );
      await expect(
        auth.refresh(res.refresh_token, client),
      ).resolves.toBeDefined();
      await expect(
        auth.login('superadmin@gmail.com', 'new-password-123', client),
      ).resolves.toBeDefined();
      // ახალი access token იმავე წამში გაიცა — ვალიდური უნდა იყოს
      const claims = await tokens.verifyAccessToken(res.access_token);
      expect(await auth.principalFor(userId, claims!.iat)).not.toBeNull();
    });

    it('არასწორი მიმდინარე პაროლი → 422', async () => {
      await expectCode(
        auth.changePassword(userId, 'wrong', 'new-password-123', client),
        422,
        'INVALID_CURRENT_PASSWORD',
      );
    });

    it('იგივე პაროლი → 422 PASSWORD_UNCHANGED', async () => {
      await expectCode(
        auth.changePassword(userId, PASSWORD, PASSWORD, client),
        422,
        'PASSWORD_UNCHANGED',
      );
    });
  });
});
