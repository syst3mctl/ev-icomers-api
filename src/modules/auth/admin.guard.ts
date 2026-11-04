import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import { AppError } from '../../common/filters/problem-details.filter.js';
import { readAccessToken } from './auth.cookies.js';
import { AuthService, type AdminPrincipal } from './auth.service.js';
import { hasAnyRole, ROLES_METADATA_KEY, type Role } from './roles.js';
import { TokenService } from './token.service.js';

export type { AdminPrincipal } from './auth.service.js';

export type RequestWithAdmin = Request & { admin?: AdminPrincipal };

/**
 * `/v1/admin/*`-ის დაცვა.
 *
 * 1. access token: `Authorization: Bearer ...` ან `icomers_admin_at` cookie;
 * 2. ხელმოწერა, ვადა, `iss`/`aud` (ES256, `TokenService`);
 * 3. მომხმარებელი ბაზაში ჯერ კიდევ აქტიურია და პაროლი ტოკენის გაცემის შემდეგ არ შეცვლილა;
 * 4. როლი — ბაზიდან (არა ტოკენიდან), რომ როლის მოხსნა მაშინვე მოქმედებდეს.
 *
 * `@Roles()`-ის გარეშე მხოლოდ `admin`-ს უშვებს. `superadmin` ყოველთვის გადის.
 */
@Injectable()
export class AdminGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly tokens: TokenService,
    private readonly auth: AuthService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<RequestWithAdmin>();

    const token = readAccessToken(req);
    if (!token) {
      throw new AppError(401, 'UNAUTHORIZED', 'საჭიროა ავტორიზაცია');
    }

    const claims = await this.tokens.verifyAccessToken(token);
    if (!claims) {
      throw new AppError(
        401,
        'TOKEN_INVALID',
        'ტოკენი არასწორია ან ვადა გაუვიდა',
      );
    }

    const admin = await this.auth.principalFor(claims.sub, claims.iat);
    if (!admin) {
      throw new AppError(
        401,
        'TOKEN_INVALID',
        'სესია აღარ მოქმედებს. შედი თავიდან',
      );
    }
    req.admin = admin;

    const required = this.reflector.getAllAndOverride<Role[]>(
      ROLES_METADATA_KEY,
      [context.getHandler(), context.getClass()],
    ) ?? ['admin'];

    if (!hasAnyRole(admin.roles, required)) {
      throw new AppError(
        403,
        'FORBIDDEN',
        `ამ ოპერაციისთვის საჭიროა როლი: ${required.join(' | ')}`,
      );
    }

    return true;
  }
}
