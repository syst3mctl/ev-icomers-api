import type { ExecutionContext } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import type { Reflector } from '@nestjs/core';
import { createFakeAuthPrisma } from '../../../test/support/fake-auth-prisma.js';
import { AppError } from '../../common/filters/problem-details.filter.js';
import type { Env } from '../../config/env.js';
import type { PrismaService } from '../../infra/prisma/prisma.service.js';
import { AdminGuard } from './admin.guard.js';
import { AuthService } from './auth.service.js';
import type { Role } from './roles.js';
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

function makeContext(
  headers: Record<string, string> = {},
  cookies: Record<string, string> = {},
) {
  const req: {
    headers: Record<string, string>;
    cookies: Record<string, string>;
    admin?: unknown;
  } = {
    headers,
    cookies,
  };
  const context = {
    switchToHttp: () => ({ getRequest: () => req }),
    getHandler: () => () => undefined,
    getClass: () => class {},
  } as unknown as ExecutionContext;
  return { context, req };
}

function reflector(required: Role[] | undefined): Reflector {
  return { getAllAndOverride: () => required } as unknown as Reflector;
}

async function expectAppError(
  promise: Promise<unknown>,
  status: number,
  code: string,
) {
  try {
    await promise;
    throw new Error('მოსალოდნელი იყო AppError');
  } catch (error) {
    expect(error).toBeInstanceOf(AppError);
    expect((error as AppError).getStatus()).toBe(status);
    expect((error as AppError).code).toBe(code);
  }
}

describe('AdminGuard', () => {
  let prisma: ReturnType<typeof createFakeAuthPrisma>;
  let tokens: TokenService;
  let auth: AuthService;

  async function userWith(roles: Role[], extra: Record<string, unknown> = {}) {
    const user = await prisma.adminUser.create({
      data: {
        email: `${roles.join('-') || 'none'}@test.ge`,
        password_hash: 'x',
        roles,
        ...extra,
      },
    });
    const token = await tokens.signAccessToken({
      id: user.id,
      email: user.email,
      roles,
    });
    return { user, token };
  }

  const guard = (required: Role[] | undefined) =>
    new AdminGuard(reflector(required), tokens, auth);

  beforeEach(async () => {
    prisma = createFakeAuthPrisma();
    tokens = new TokenService(config);
    await tokens.onModuleInit();
    auth = new AuthService(prisma as unknown as PrismaService, tokens);
  });

  it('ტოკენის გარეშე → 401 UNAUTHORIZED', async () => {
    await expectAppError(
      guard(['admin']).canActivate(makeContext().context),
      401,
      'UNAUTHORIZED',
    );
  });

  it('ყალბი ტოკენი → 401 TOKEN_INVALID', async () => {
    const { context } = makeContext({ authorization: 'Bearer abc.def.ghi' });
    await expectAppError(
      guard(['admin']).canActivate(context),
      401,
      'TOKEN_INVALID',
    );
  });

  it('Bearer ტოკენით უშვებს და ავსებს req.admin-ს', async () => {
    const { user, token } = await userWith(['admin']);
    const { context, req } = makeContext({ authorization: `Bearer ${token}` });
    expect(await guard(['admin']).canActivate(context)).toBe(true);
    expect(req.admin).toEqual({
      id: user.id,
      email: user.email,
      roles: ['admin'],
    });
  });

  it('cookie-თაც მუშაობს', async () => {
    const { token } = await userWith(['warehouse']);
    const { context } = makeContext({}, { icomers_admin_at: token });
    expect(await guard(['warehouse']).canActivate(context)).toBe(true);
  });

  it('არასაკმარისი როლი → 403', async () => {
    const { token } = await userWith(['warehouse']);
    const { context } = makeContext({ authorization: `Bearer ${token}` });
    await expectAppError(
      guard(['admin']).canActivate(context),
      403,
      'FORBIDDEN',
    );
  });

  it('@Roles()-ის გარეშე მხოლოდ admin-ს უშვებს', async () => {
    const { token } = await userWith(['content_editor']);
    const { context } = makeContext({ authorization: `Bearer ${token}` });
    await expectAppError(
      guard(undefined).canActivate(context),
      403,
      'FORBIDDEN',
    );
  });

  it('superadmin ნებისმიერ როლს ფარავს', async () => {
    const { token } = await userWith(['superadmin']);
    const { context } = makeContext({ authorization: `Bearer ${token}` });
    expect(await guard(['warehouse']).canActivate(context)).toBe(true);
  });

  it('როლები ბაზიდან იკითხება: მოხსნილი როლი მაშინვე მოქმედებს', async () => {
    const { user, token } = await userWith(['admin']);
    await prisma.adminUser.update({
      where: { id: user.id },
      data: { roles: ['warehouse'] },
    });
    const { context } = makeContext({ authorization: `Bearer ${token}` });
    await expectAppError(
      guard(['admin']).canActivate(context),
      403,
      'FORBIDDEN',
    );
  });

  it('გათიშული მომხმარებელი → 401, ვალიდური ტოკენითაც', async () => {
    const { user, token } = await userWith(['admin']);
    await prisma.adminUser.update({
      where: { id: user.id },
      data: { is_active: false },
    });
    const { context } = makeContext({ authorization: `Bearer ${token}` });
    await expectAppError(
      guard(['admin']).canActivate(context),
      401,
      'TOKEN_INVALID',
    );
  });

  it('პაროლის შეცვლამდე გაცემული ტოკენი აღარ მოქმედებს', async () => {
    const { user, token } = await userWith(['admin']);
    await prisma.adminUser.update({
      where: { id: user.id },
      data: { password_changed_at: new Date(Date.now() + 2000) },
    });
    const { context } = makeContext({ authorization: `Bearer ${token}` });
    await expectAppError(
      guard(['admin']).canActivate(context),
      401,
      'TOKEN_INVALID',
    );
  });
});
