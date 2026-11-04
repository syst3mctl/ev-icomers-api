import { randomUUID } from 'node:crypto';

/**
 * `admin_users` / `admin_refresh_tokens`-ის in-memory ვერსია ტესტებისთვის.
 * მხარს უჭერს მხოლოდ იმ Prisma-ს ოპერაციებს, რასაც auth მოდული იყენებს.
 */
export interface FakeUser {
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
  created_by: string | null;
  created_at: Date;
  updated_at: Date;
}

export interface FakeRefreshToken {
  id: string;
  user_id: string;
  family_id: string;
  token_hash: string;
  expires_at: Date;
  revoked_at: Date | null;
  user_agent: string | null;
  ip: string | null;
  created_at: Date;
}

type Where = Record<string, unknown>;

function matches(
  row: Record<string, unknown>,
  where: Where | undefined,
): boolean {
  if (!where) return true;
  return Object.entries(where).every(([key, cond]) => {
    const value = row[key];
    if (cond && typeof cond === 'object' && !(cond instanceof Date)) {
      const c = cond as Record<string, unknown>;
      if ('not' in c) return value !== c.not;
      if ('has' in c) return Array.isArray(value) && value.includes(c.has);
    }
    return value === cond;
  });
}

function pick<T extends object>(
  row: T,
  select?: Record<string, boolean>,
): Partial<T> | T {
  if (!select) return { ...row };
  return Object.fromEntries(
    Object.keys(select).map((k) => [k, (row as Record<string, unknown>)[k]]),
  ) as Partial<T>;
}

class UniqueViolation extends Error {
  code = 'P2002';
  constructor() {
    super('Unique constraint failed');
    this.name = 'PrismaClientKnownRequestError';
  }
}

export function createFakeAuthPrisma() {
  const users: FakeUser[] = [];
  const tokens: FakeRefreshToken[] = [];

  const adminUser = {
    findUnique: async ({
      where,
      select,
    }: {
      where: Where;
      select?: Record<string, boolean>;
    }) => {
      const row = users.find((u) =>
        matches(u as unknown as Record<string, unknown>, where),
      );
      return row ? pick(row, select) : null;
    },
    findMany: async ({
      skip = 0,
      take = 100,
    }: { skip?: number; take?: number } = {}) =>
      [...users]
        .sort((a, b) => a.created_at.getTime() - b.created_at.getTime())
        .slice(skip, skip + take)
        .map((u) => ({ ...u })),
    count: async ({ where }: { where?: Where } = {}) =>
      users.filter((u) =>
        matches(u as unknown as Record<string, unknown>, where),
      ).length,
    create: async ({ data }: { data: Partial<FakeUser> }) => {
      if (users.some((u) => u.email === data.email))
        throw new UniqueViolation();
      const now = new Date();
      const row: FakeUser = {
        id: randomUUID(),
        display_name: null,
        roles: [],
        is_active: true,
        failed_login_count: 0,
        locked_until: null,
        last_login_at: null,
        password_changed_at: now,
        created_by: null,
        created_at: now,
        updated_at: now,
        email: '',
        password_hash: '',
        ...data,
      } as FakeUser;
      users.push(row);
      return { ...row };
    },
    update: async ({
      where,
      data,
      select,
    }: {
      where: Where;
      data: Record<string, unknown>;
      select?: Record<string, boolean>;
    }) => {
      const row = users.find((u) =>
        matches(u as unknown as Record<string, unknown>, where),
      );
      if (!row) throw new Error('Record not found');
      // Prisma-ს `{ increment: n }` — წაკითხვა და ჩაწერა ერთ ნაბიჯში, როგორც SQL-ში
      const resolved: Record<string, unknown> = {};
      for (const [key, value] of Object.entries(data)) {
        const inc =
          value && typeof value === 'object' && 'increment' in value
            ? (value as { increment: number }).increment
            : undefined;
        resolved[key] =
          inc === undefined
            ? value
            : ((row as unknown as Record<string, number>)[key] ?? 0) + inc;
      }
      Object.assign(row, resolved, { updated_at: new Date() });
      return pick(row, select) as FakeUser;
    },
  };

  const adminRefreshToken = {
    findUnique: async ({
      where,
      include,
      select,
    }: {
      where: Where;
      include?: { user?: boolean };
      select?: Record<string, boolean>;
    }) => {
      const row = tokens.find((t) =>
        matches(t as unknown as Record<string, unknown>, where),
      );
      if (!row) return null;
      if (include?.user) {
        return {
          ...row,
          user: { ...users.find((u) => u.id === row.user_id)! },
        };
      }
      return pick(row, select);
    },
    create: async ({ data }: { data: Partial<FakeRefreshToken> }) => {
      const row: FakeRefreshToken = {
        id: randomUUID(),
        revoked_at: null,
        created_at: new Date(),
        user_agent: null,
        ip: null,
        ...data,
      } as FakeRefreshToken;
      tokens.push(row);
      return { ...row };
    },
    count: async ({ where }: { where?: Where } = {}) =>
      tokens.filter((t) =>
        matches(t as unknown as Record<string, unknown>, where),
      ).length,
    updateMany: async ({
      where,
      data,
    }: {
      where: Where;
      data: Partial<FakeRefreshToken>;
    }) => {
      const rows = tokens.filter((t) =>
        matches(t as unknown as Record<string, unknown>, where),
      );
      for (const row of rows) Object.assign(row, data);
      return { count: rows.length };
    },
  };

  const executedRaw: string[] = [];
  const base = {
    users,
    tokens,
    adminUser,
    adminRefreshToken,
    /** `$executeRaw`-ის გამოძახებები — ტესტი ამოწმებს, რომ advisory lock აიღეს */
    executedRaw,
    $executeRaw: async (strings: TemplateStringsArray): Promise<number> => {
      executedRaw.push(strings.join('?'));
      return 0;
    },
    $connect: async () => {},
    isHealthy: async () => true,
  };
  type Client = typeof base & {
    $transaction: <T>(fn: (tx: Client) => Promise<T>) => Promise<T>;
  };
  const client: Client = {
    ...base,
    $transaction: async (fn) => fn(client),
  };
  return client;
}

export type FakeAuthPrisma = ReturnType<typeof createFakeAuthPrisma>;
