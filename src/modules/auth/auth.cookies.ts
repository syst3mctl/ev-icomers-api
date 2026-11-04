import type { CookieOptions, Request, Response } from 'express';
import type { IssuedTokens } from './auth.service.js';

/**
 * ბრაუზერისთვის ტოკენები httpOnly cookie-შია (SYSTEM.md §2): JavaScript მათ ვერ
 * კითხულობს, ამიტომ XSS-ით ტოკენის მოპარვა შეუძლებელია. `SameSite=Strict` —
 * სხვა საიტიდან გაგზავნილ მოთხოვნას cookie არ მიჰყვება (CSRF).
 */
export const ACCESS_COOKIE = 'icomers_admin_at';
export const REFRESH_COOKIE = 'icomers_admin_rt';

function baseOptions(secure: boolean): CookieOptions {
  return { httpOnly: true, secure, sameSite: 'strict', path: '/' };
}

export function setAuthCookies(
  res: Response,
  tokens: IssuedTokens,
  secure: boolean,
): void {
  res.cookie(ACCESS_COOKIE, tokens.access_token, {
    ...baseOptions(secure),
    maxAge: tokens.expires_in * 1000,
  });
  res.cookie(REFRESH_COOKIE, tokens.refresh_token, {
    ...baseOptions(secure),
    expires: tokens.refresh_expires_at,
  });
}

export function clearAuthCookies(res: Response, secure: boolean): void {
  res.clearCookie(ACCESS_COOKIE, baseOptions(secure));
  res.clearCookie(REFRESH_COOKIE, baseOptions(secure));
}

export function readCookie(req: Request, name: string): string | undefined {
  const cookies = (req as Request & { cookies?: Record<string, unknown> })
    .cookies;
  const value = cookies?.[name];
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

/** `Authorization: Bearer <token>` (API კლიენტები, Swagger) ან access cookie (ადმინკა) */
export function readAccessToken(req: Request): string | undefined {
  const header = req.headers.authorization;
  if (typeof header === 'string') {
    const match = /^Bearer\s+(.+)$/i.exec(header.trim());
    if (match?.[1]) return match[1];
  }
  return readCookie(req, ACCESS_COOKIE);
}
