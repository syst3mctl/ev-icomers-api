import {
  CanActivate,
  ExecutionContext,
  Injectable,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import { AppError } from '../../common/filters/problem-details.filter.js';
import type { Env } from '../../config/env.js';
import { ROLES_METADATA_KEY, type Role } from './roles.js';

/** მოთხოვნას დართული ადმინი (ტოკენიდან ან dev-რეჟიმში env-იდან) */
export interface AdminPrincipal {
  /** Identity-ის `sub` */
  id: string;
  roles: Role[];
}

export type RequestWithAdmin = Request & { admin?: AdminPrincipal };

/**
 * `/v1/admin/*`-ის დაცვა.
 *
 * ⚠️ **დროებითი იმპლემენტაცია.** JWT-ის შემოწმება JWKS-ით ჯერ არ არის დაწერილი:
 * Identity-ის issuer და client-ები ჯერ არ გვაქვს (`PROJECT.md` §3 → `identity-oidc`).
 *
 * სანამ ის არ გაკეთდება, guard **დახურულია**:
 * - `NODE_ENV !== 'development'` → ყოველთვის `503 AUTH_NOT_CONFIGURED`;
 *   ანუ staging/production-ზე ადმინის endpoint-ები შემთხვევით ღია ვერ დარჩება.
 * - `development`-ში როლები მოდის `DEV_ADMIN_ROLES` env ცვლადიდან, ან კონკრეტულ
 *   მოთხოვნაზე `X-Dev-Roles` header-იდან (ტესტებისთვის და ადმინკის ლოკალური გაშვებისთვის).
 *
 * როცა Identity გაიხსნება: აქ ჩაემატება ტოკენის ვერიფიკაცია (`jose` + JWKS) და
 * `roles` claim-ის წაკითხვა; `@Roles()`-ის ლოგიკა უცვლელი რჩება.
 */
@Injectable()
export class AdminGuard implements CanActivate {
  private readonly logger = new Logger(AdminGuard.name);
  private warned = false;

  constructor(
    private readonly reflector: Reflector,
    private readonly config: ConfigService<Env, true>,
  ) {}

  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest<RequestWithAdmin>();
    const admin = this.resolveAdmin(req);
    req.admin = admin;

    const required = this.reflector.getAllAndOverride<Role[]>(
      ROLES_METADATA_KEY,
      [context.getHandler(), context.getClass()],
    ) ?? ['admin'];

    if (!required.some((role) => admin.roles.includes(role))) {
      throw new AppError(
        403,
        'FORBIDDEN',
        `ამ ოპერაციისთვის საჭიროა როლი: ${required.join(' | ')}`,
      );
    }

    return true;
  }

  private resolveAdmin(req: RequestWithAdmin): AdminPrincipal {
    if (this.config.get('NODE_ENV', { infer: true }) !== 'development') {
      throw new AppError(
        503,
        'AUTH_NOT_CONFIGURED',
        'ადმინის ავტორიზაცია ჯერ არ არის გამართული (Identity / JWKS)',
      );
    }

    if (!this.warned) {
      this.warned = true;
      this.logger.warn(
        'ადმინის endpoint-ები dev-რეჟიმშია: როლები მოდის DEV_ADMIN_ROLES / X-Dev-Roles-იდან, ტოკენი არ მოწმდება',
      );
    }

    const header = req.headers['x-dev-roles'];
    const raw =
      (typeof header === 'string' ? header : undefined) ??
      this.config.get('DEV_ADMIN_ROLES', { infer: true }).join(',');

    const roles = raw
      .split(',')
      .map((r) => r.trim())
      .filter(Boolean) as Role[];

    if (roles.length === 0) {
      throw new AppError(
        401,
        'UNAUTHORIZED',
        'როლები არ არის: მიუთითე DEV_ADMIN_ROLES .env-ში ან X-Dev-Roles header-ში',
      );
    }

    return { id: 'dev-admin', roles };
  }
}
