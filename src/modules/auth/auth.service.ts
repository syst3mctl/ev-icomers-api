import { Injectable, Logger } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { AppError } from '../../common/filters/problem-details.filter.js';
import { PrismaService } from '../../infra/prisma/prisma.service.js';
import { burnPasswordCheck, hashPassword, verifyPassword } from './password.js';
import { isRole, type Role } from './roles.js';
import { TokenService } from './token.service.js';

/** ზედიზედ ამდენი წარუმატებელი ცდის შემდეგ ანგარიში იკეტება */
export const MAX_FAILED_LOGINS = 5;
export const LOCK_DURATION_MS = 15 * 60 * 1000;
/**
 * უკვე შეცვლილი refresh token-ის ხელახლა წარდგენა ამ ფანჯარაში ჩვეულებრივია
 * (ორმა ჩანართმა ერთდროულად სცადა განახლება) და family არ უქმდება.
 */
const REFRESH_REUSE_GRACE_MS = 30 * 1000;

export interface AdminPrincipal {
  /** `admin_users.id` */
  id: string;
  email: string;
  roles: Role[];
}

export interface AdminUserView {
  id: string;
  email: string;
  display_name: string | null;
  roles: Role[];
  is_active: boolean;
  last_login_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface IssuedTokens {
  access_token: string;
  /** წამებში */
  expires_in: number;
  refresh_token: string;
  refresh_expires_at: Date;
  user: AdminUserView;
}

export interface ClientInfo {
  userAgent?: string | undefined;
  ip?: string | undefined;
}

type UserRow = {
  id: string;
  email: string;
  password_hash: string;
  display_name: string | null;
  roles: string[];
  is_active: boolean;
  failed_login_count: number;
  locked_until: Date | null;
  last_login_at: Date | null;
  password_changed_at: Date;
  created_at: Date;
  updated_at: Date;
};

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export function toRoles(raw: string[]): Role[] {
  return raw.filter(isRole);
}

export function toUserView(
  row: Omit<
    UserRow,
    | 'password_hash'
    | 'failed_login_count'
    | 'locked_until'
    | 'password_changed_at'
  >,
): AdminUserView {
  return {
    id: row.id,
    email: row.email,
    display_name: row.display_name,
    roles: toRoles(row.roles),
    is_active: row.is_active,
    last_login_at: row.last_login_at?.toISOString() ?? null,
    created_at: row.created_at.toISOString(),
    updated_at: row.updated_at.toISOString(),
  };
}

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly tokens: TokenService,
  ) {}

  /** ელ. ფოსტა + პაროლი → ახალი სესია (ახალი refresh token family) */
  async login(
    emailInput: string,
    password: string,
    client: ClientInfo,
  ): Promise<IssuedTokens> {
    const email = normalizeEmail(emailInput);
    const user = (await this.prisma.adminUser.findUnique({
      where: { email },
    })) as UserRow | null;

    if (!user) {
      await burnPasswordCheck(password);
      throw invalidCredentials();
    }

    const now = Date.now();
    const passwordOk = await verifyPassword(password, user.password_hash);
    const lockedUntil = user.locked_until?.getTime() ?? 0;

    if (lockedUntil > now) {
      // ჩაკეტვის შესახებ მხოლოდ სწორი პაროლის მფლობელი იგებს. დანარჩენი ხედავს
      // ჩვეულებრივ 401-ს — ასე 429-ით ვერ გაიგებენ, რომელი ელ. ფოსტა არსებობს
      // (უცნობი მისამართი არასდროს იკეტება). scrypt ორივე შემთხვევაში ითვლება.
      if (passwordOk) throw lockedError(lockedUntil - now);
      throw invalidCredentials();
    }

    if (!passwordOk) {
      // ატომური increment: პარალელური ცდები ერთმანეთის ჩანაწერს ვერ გადაფარავს
      const { failed_login_count: failed } = await this.prisma.adminUser.update(
        {
          where: { id: user.id },
          data: { failed_login_count: { increment: 1 } },
          select: { failed_login_count: true },
        },
      );
      if (failed >= MAX_FAILED_LOGINS) {
        await this.prisma.adminUser.update({
          where: { id: user.id },
          data: {
            failed_login_count: 0,
            locked_until: new Date(now + LOCK_DURATION_MS),
          },
        });
        this.logger.warn(
          `admin user ${user.id} locked after ${MAX_FAILED_LOGINS} failed logins`,
        );
      }
      throw invalidCredentials();
    }

    // პაროლი სწორია — გათიშული ანგარიშის შესახებ თქმა უსაფრთხოა
    if (!user.is_active) {
      throw new AppError(
        403,
        'ACCOUNT_DISABLED',
        'ანგარიში გათიშულია. მიმართე ადმინისტრატორს',
      );
    }

    const updated = (await this.prisma.adminUser.update({
      where: { id: user.id },
      data: {
        failed_login_count: 0,
        locked_until: null,
        last_login_at: new Date(now),
      },
    })) as UserRow;

    return this.issue(updated, randomUUID(), client);
  }

  /** refresh token rotation: ძველი უქმდება, იმავე family-ში ახალი გაიცემა */
  async refresh(
    refreshToken: string,
    client: ClientInfo,
  ): Promise<IssuedTokens> {
    const hash = TokenService.hashRefreshToken(refreshToken);
    const stored = await this.prisma.adminRefreshToken.findUnique({
      where: { token_hash: hash },
      include: { user: true },
    });

    if (!stored) throw invalidRefresh();

    const now = Date.now();
    if (stored.revoked_at) {
      if (now - stored.revoked_at.getTime() > REFRESH_REUSE_GRACE_MS) {
        // შეცვლილი ტოკენი ისევ მოვიდა — დიდი ალბათობით მოპარულია. მთელ ჯაჭვს ვაუქმებთ.
        await this.revokeFamily(stored.family_id);
        this.logger.warn(
          `refresh token reuse detected, family ${stored.family_id} revoked`,
        );
        throw invalidRefresh();
      }
      // ახლახან შეცვლილი. თუ ამ სესიას აქტიური მემკვიდრე ჰყავს — სხვა ჩანართმა/მოთხოვნამ
      // უკვე განაახლა, cookie-ში ახალი წყვილია და კლიენტმა მოთხოვნა უნდა გაიმეოროს.
      // თუ არა (logout, პაროლის შეცვლა) — სესია დასრულებულია.
      if (await this.hasActiveToken(stored.family_id)) throw refreshRace();
      throw invalidRefresh();
    }
    if (stored.expires_at.getTime() <= now) throw invalidRefresh();

    const user = stored.user as UserRow;
    if (!user.is_active) {
      await this.revokeFamily(stored.family_id);
      throw invalidRefresh();
    }

    // ერთდროულ refresh-ს მხოლოდ ერთი იგებს: update-ი პირობით `revoked_at IS NULL`
    const { count } = await this.prisma.adminRefreshToken.updateMany({
      where: { id: stored.id, revoked_at: null },
      data: { revoked_at: new Date(now) },
    });
    if (count === 0) throw refreshRace();

    return this.issue(user, stored.family_id, client);
  }

  /** გასვლა: ამ სესიის (family) ყველა refresh token უქმდება. უცნობ ტოკენზე — არაფერი */
  async logout(refreshToken: string | undefined): Promise<void> {
    if (!refreshToken) return;
    const stored = await this.prisma.adminRefreshToken.findUnique({
      where: { token_hash: TokenService.hashRefreshToken(refreshToken) },
      select: { family_id: true },
    });
    if (stored) await this.revokeFamily(stored.family_id);
  }

  /**
   * საკუთარი პაროლის შეცვლა. ყველა სხვა სესია უქმდება, ამ მოწყობილობას
   * ახალი ტოკენები ეძლევა.
   */
  async changePassword(
    userId: string,
    currentPassword: string,
    newPassword: string,
    client: ClientInfo,
  ): Promise<IssuedTokens> {
    const user = (await this.prisma.adminUser.findUnique({
      where: { id: userId },
    })) as UserRow | null;
    if (!user || !user.is_active)
      throw new AppError(401, 'UNAUTHORIZED', 'საჭიროა ავტორიზაცია');

    if (!(await verifyPassword(currentPassword, user.password_hash))) {
      throw new AppError(
        422,
        'INVALID_CURRENT_PASSWORD',
        'მიმდინარე პაროლი არასწორია',
      );
    }
    if (currentPassword === newPassword) {
      throw new AppError(
        422,
        'PASSWORD_UNCHANGED',
        'ახალი პაროლი ძველს არ უნდა ემთხვეოდეს',
      );
    }

    const updated = (await this.prisma.adminUser.update({
      where: { id: userId },
      data: {
        password_hash: await hashPassword(newPassword),
        password_changed_at: new Date(),
      },
    })) as UserRow;
    await this.revokeAllForUser(userId);

    return this.issue(updated, randomUUID(), client);
  }

  /**
   * guard-ისთვის: ტოკენის მფლობელი ჯერ კიდევ აქტიურია? როლები ბაზიდან იკითხება,
   * ამიტომ როლის მოხსნა ან ანგარიშის გათიშვა მაშინვე მოქმედებს და არა ტოკენის ვადის ბოლოს.
   */
  async principalFor(
    userId: string,
    issuedAtSeconds: number,
  ): Promise<AdminPrincipal | null> {
    const user = await this.prisma.adminUser.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        roles: true,
        is_active: true,
        password_changed_at: true,
      },
    });
    if (!user || !user.is_active) return null;
    // `iat` წამებშია: ვადარებთ წამის სიზუსტით, რომ შეცვლის წამში გაცემული ტოკენი არ უარვყოთ
    if (issuedAtSeconds < Math.floor(user.password_changed_at.getTime() / 1000))
      return null;
    return { id: user.id, email: user.email, roles: toRoles(user.roles) };
  }

  async me(userId: string): Promise<AdminUserView> {
    const user = await this.prisma.adminUser.findUnique({
      where: { id: userId },
    });
    if (!user) throw new AppError(401, 'UNAUTHORIZED', 'საჭიროა ავტორიზაცია');
    return toUserView(user);
  }

  async revokeAllForUser(userId: string): Promise<void> {
    await this.prisma.adminRefreshToken.updateMany({
      where: { user_id: userId, revoked_at: null },
      data: { revoked_at: new Date() },
    });
  }

  private async hasActiveToken(familyId: string): Promise<boolean> {
    const active = await this.prisma.adminRefreshToken.count({
      where: { family_id: familyId, revoked_at: null },
    });
    return active > 0;
  }

  private async revokeFamily(familyId: string): Promise<void> {
    await this.prisma.adminRefreshToken.updateMany({
      where: { family_id: familyId, revoked_at: null },
      data: { revoked_at: new Date() },
    });
  }

  private async issue(
    user: UserRow,
    familyId: string,
    client: ClientInfo,
  ): Promise<IssuedTokens> {
    const roles = toRoles(user.roles);
    const accessToken = await this.tokens.signAccessToken({
      id: user.id,
      email: user.email,
      roles,
    });
    const refresh = this.tokens.newRefreshToken();
    const refreshExpiresAt = new Date(
      Date.now() + this.tokens.refreshTokenTtlMs,
    );

    await this.prisma.adminRefreshToken.create({
      data: {
        user_id: user.id,
        family_id: familyId,
        token_hash: refresh.hash,
        expires_at: refreshExpiresAt,
        user_agent: client.userAgent?.slice(0, 500) ?? null,
        ip: client.ip ?? null,
      },
    });

    return {
      access_token: accessToken,
      expires_in: this.tokens.accessTokenTtlSeconds,
      refresh_token: refresh.token,
      refresh_expires_at: refreshExpiresAt,
      user: toUserView(user),
    };
  }
}

function invalidCredentials(): AppError {
  return new AppError(
    401,
    'INVALID_CREDENTIALS',
    'ელ. ფოსტა ან პაროლი არასწორია',
  );
}

function invalidRefresh(): AppError {
  return new AppError(
    401,
    'INVALID_REFRESH_TOKEN',
    'სესია ამოიწურა. შედი თავიდან',
  );
}

function refreshRace(): AppError {
  return new AppError(
    409,
    'REFRESH_RACE',
    'სესია პარალელურად უკვე განახლდა — გაიმეორე მოთხოვნა',
  );
}

function lockedError(remainingMs: number): AppError {
  const minutes = Math.ceil(remainingMs / 60000);
  return new AppError(
    429,
    'ACCOUNT_LOCKED',
    `ბევრი წარუმატებელი ცდა. სცადე ${minutes} წუთში`,
    [{ retry_after_seconds: Math.ceil(remainingMs / 1000) }],
  );
}
