import { createFakeAuthPrisma } from '../../../test/support/fake-auth-prisma.js';
import { AppError } from '../../common/filters/problem-details.filter.js';
import type { PrismaService } from '../../infra/prisma/prisma.service.js';
import { AdminUsersService } from './admin-users.service.js';
import { AuthService, type AdminPrincipal } from './auth.service.js';
import { verifyPassword } from './password.js';
import type { TokenService } from './token.service.js';

async function expectCode(
  promise: Promise<unknown>,
  status: number,
  code: string,
) {
  await promise.then(
    () => {
      throw new Error('მოსალოდნელი იყო AppError');
    },
    (e: AppError) => {
      expect(e).toBeInstanceOf(AppError);
      expect(e.getStatus()).toBe(status);
      expect(e.code).toBe(code);
    },
  );
}

describe('AdminUsersService', () => {
  let prisma: ReturnType<typeof createFakeAuthPrisma>;
  let svc: AdminUsersService;
  let root: AdminPrincipal;

  beforeEach(async () => {
    prisma = createFakeAuthPrisma();
    const auth = new AuthService(
      prisma as unknown as PrismaService,
      {} as TokenService,
    );
    svc = new AdminUsersService(prisma as unknown as PrismaService, auth);
    const row = await prisma.adminUser.create({
      data: {
        email: 'superadmin@gmail.com',
        password_hash: 'x',
        roles: ['superadmin'],
      },
    });
    root = { id: row.id, email: row.email, roles: ['superadmin'] };
  });

  it('რეგისტრაცია: ელ. ფოსტა პატარა ასოებით, პაროლი ჰეშით, created_by', async () => {
    const user = await svc.create(
      {
        email: 'Editor@Shop.ge',
        password: 'editor-pass-1',
        roles: ['content_editor'],
        display_name: ' ნინო ',
      },
      root,
    );
    expect(user).toMatchObject({
      email: 'editor@shop.ge',
      roles: ['content_editor'],
      display_name: 'ნინო',
      is_active: true,
    });
    expect(user).not.toHaveProperty('password_hash');
    const stored = prisma.users.find((u) => u.id === user.id)!;
    expect(stored.created_by).toBe(root.id);
    expect(await verifyPassword('editor-pass-1', stored.password_hash)).toBe(
      true,
    );
  });

  it('დაკავებული ელ. ფოსტა → 409 EMAIL_TAKEN', async () => {
    await expectCode(
      svc.create(
        {
          email: 'SUPERADMIN@gmail.com',
          password: 'whatever-123',
          roles: ['admin'],
        },
        root,
      ),
      409,
      'EMAIL_TAKEN',
    );
  });

  it('საკუთარ თავს superadmin-ს ვერ მოხსნის და ვერ გათიშავს', async () => {
    await expectCode(
      svc.update(root.id, { roles: ['admin'] }, root),
      409,
      'CANNOT_DEMOTE_SELF',
    );
    await expectCode(
      svc.update(root.id, { is_active: false }, root),
      409,
      'CANNOT_DEMOTE_SELF',
    );
  });

  it('ბოლო superadmin-ს ვერავინ მოხსნის; მეორის არსებობისას — შეიძლება', async () => {
    const second = await svc.create(
      { email: 'b@b.ge', password: 'second-pass-1', roles: ['superadmin'] },
      root,
    );
    const secondPrincipal: AdminPrincipal = {
      id: second.id,
      email: second.email,
      roles: ['superadmin'],
    };
    await svc.update(root.id, { roles: ['admin'] }, secondPrincipal);
    // შემოწმება და ჩაწერა advisory lock-ის ქვეშ (ორი superadmin ერთმანეთს ერთდროულად ვერ მოხსნის)
    expect(
      prisma.executedRaw.some((sql) => sql.includes('pg_advisory_xact_lock')),
    ).toBe(true);
    await expectCode(
      svc.update(
        second.id,
        { roles: ['admin'] },
        { ...root, id: 'someone-else' },
      ),
      409,
      'LAST_SUPERADMIN',
    );
  });

  it('პაროლის დაყენება და გათიშვა სესიებს აუქმებს', async () => {
    const user = await svc.create(
      { email: 'w@w.ge', password: 'warehouse-1', roles: ['warehouse'] },
      root,
    );
    prisma.tokens.push({
      id: 't1',
      user_id: user.id,
      family_id: 'f1',
      token_hash: 'h1',
      expires_at: new Date(Date.now() + 1e6),
      revoked_at: null,
      user_agent: null,
      ip: null,
      created_at: new Date(),
    });
    await svc.update(user.id, { password: 'brand-new-pass' }, root);
    expect(prisma.tokens[0]!.revoked_at).toBeInstanceOf(Date);
    const stored = prisma.users.find((u) => u.id === user.id)!;
    expect(await verifyPassword('brand-new-pass', stored.password_hash)).toBe(
      true,
    );
  });

  it('უცნობი id → 404', async () => {
    await expectCode(
      svc.getById('00000000-0000-4000-8000-000000000000'),
      404,
      'USER_NOT_FOUND',
    );
  });

  it('სია', async () => {
    const res = await svc.list({ page: 1, page_size: 24 });
    expect(res).toMatchObject({ total: 1, page: 1 });
    expect(res.items[0]!.email).toBe('superadmin@gmail.com');
  });
});
