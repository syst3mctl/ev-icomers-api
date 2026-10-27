import type { ExecutionContext } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import type { Reflector } from '@nestjs/core';
import { AppError } from '../../common/filters/problem-details.filter.js';
import type { Env } from '../../config/env.js';
import { AdminGuard } from './admin.guard.js';
import type { Role } from './roles.js';

function makeConfig(
  nodeEnv: Env['NODE_ENV'],
  devRoles: string[],
): ConfigService<Env, true> {
  return {
    get: (key: string) =>
      key === 'NODE_ENV' ? nodeEnv : devRoles,
  } as unknown as ConfigService<Env, true>;
}

function makeContext(headers: Record<string, string> = {}): {
  context: ExecutionContext;
  req: { headers: Record<string, string>; admin?: unknown };
} {
  const req = { headers };
  const context = {
    switchToHttp: () => ({ getRequest: () => req }),
    getHandler: () => () => undefined,
    getClass: () => class {},
  } as unknown as ExecutionContext;
  return { context, req };
}

function makeReflector(required: Role[] | undefined): Reflector {
  return {
    getAllAndOverride: () => required,
  } as unknown as Reflector;
}

function expectAppError(fn: () => unknown, status: number, code: string): void {
  try {
    fn();
    throw new Error('მოსალოდნელი იყო AppError');
  } catch (error) {
    expect(error).toBeInstanceOf(AppError);
    const appError = error as AppError;
    expect(appError.getStatus()).toBe(status);
    expect(appError.code).toBe(code);
  }
}

describe('AdminGuard', () => {
  it('production-ში ყოველთვის იხურება: ტოკენის შემოწმება ჯერ არ არის', () => {
    const guard = new AdminGuard(
      makeReflector(['admin']),
      makeConfig('production', ['admin']),
    );
    const { context } = makeContext();
    expectAppError(
      () => guard.canActivate(context),
      503,
      'AUTH_NOT_CONFIGURED',
    );
  });

  it('test გარემოც დახურულია', () => {
    const guard = new AdminGuard(
      makeReflector(['admin']),
      makeConfig('test', ['admin']),
    );
    const { context } = makeContext();
    expectAppError(
      () => guard.canActivate(context),
      503,
      'AUTH_NOT_CONFIGURED',
    );
  });

  it('dev-ში როლების გარეშე → 401', () => {
    const guard = new AdminGuard(
      makeReflector(['admin']),
      makeConfig('development', []),
    );
    const { context } = makeContext();
    expectAppError(() => guard.canActivate(context), 401, 'UNAUTHORIZED');
  });

  it('dev-ში DEV_ADMIN_ROLES-ით უშვებს და ავსებს req.admin-ს', () => {
    const guard = new AdminGuard(
      makeReflector(['content_editor', 'admin']),
      makeConfig('development', ['admin']),
    );
    const { context, req } = makeContext();
    expect(guard.canActivate(context)).toBe(true);
    expect(req.admin).toEqual({ id: 'dev-admin', roles: ['admin'] });
  });

  it('X-Dev-Roles header-ი ჭრის env-ის მნიშვნელობას', () => {
    const guard = new AdminGuard(
      makeReflector(['warehouse']),
      makeConfig('development', ['admin']),
    );
    const { context } = makeContext({ 'x-dev-roles': 'warehouse' });
    expect(guard.canActivate(context)).toBe(true);
  });

  it('არასაკმარისი როლი → 403', () => {
    const guard = new AdminGuard(
      makeReflector(['admin']),
      makeConfig('development', ['warehouse']),
    );
    const { context } = makeContext();
    expectAppError(() => guard.canActivate(context), 403, 'FORBIDDEN');
  });

  it('@Roles()-ის გარეშე მხოლოდ admin-ს უშვებს', () => {
    const guard = new AdminGuard(
      makeReflector(undefined),
      makeConfig('development', ['content_editor']),
    );
    const { context } = makeContext();
    expectAppError(() => guard.canActivate(context), 403, 'FORBIDDEN');

    const adminGuard = new AdminGuard(
      makeReflector(undefined),
      makeConfig('development', ['admin']),
    );
    expect(adminGuard.canActivate(makeContext().context)).toBe(true);
  });
});
