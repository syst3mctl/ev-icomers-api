import { createParamDecorator, type ExecutionContext } from '@nestjs/common';
import { AppError } from '../../common/filters/problem-details.filter.js';
import type { AdminPrincipal, RequestWithAdmin } from './admin.guard.js';

/**
 * მოთხოვნის ადმინი, რომელიც `AdminGuard`-მა დაურთო.
 * გამოიყენება მაშინ, როცა მოქმედების ავტორი უნდა ჩაიწეროს (მაგ. `stock_movements.actor_id`).
 *
 * ⚠️ მუშაობს მხოლოდ `@UseGuards(AdminGuard)`-თან ერთად: guard-ის გარეშე `req.admin` ცარიელია.
 */
export const CurrentAdmin = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): AdminPrincipal => {
    const req = ctx.switchToHttp().getRequest<RequestWithAdmin>();
    if (!req.admin) {
      throw new AppError(
        401,
        'UNAUTHORIZED',
        'მოთხოვნას ადმინი არ აქვს დართული (AdminGuard არ არის ჩართული)',
      );
    }
    return req.admin;
  },
);
