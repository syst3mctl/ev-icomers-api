import type { NextFunction, Request, Response } from 'express';
import { ACCESS_COOKIE, REFRESH_COOKIE } from './auth.cookies.js';

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);
/** cookie-ზე დაფუძნებული auth endpoint-ები (`/v1/auth/token` cookie-ს არ კითხულობს — თავისუფალია) */
const COOKIE_AUTH_PATHS = [
  '/v1/auth/login',
  '/v1/auth/refresh',
  '/v1/auth/logout',
  '/v1/auth/password',
];

function reject(res: Response, detail: string): void {
  res.status(403).type('application/problem+json').json({
    type: 'about:blank#csrf_rejected',
    title: 'CSRF_REJECTED',
    status: 403,
    code: 'CSRF_REJECTED',
    detail,
  });
}

/**
 * CSRF-ის დაცვა cookie-ით ავტორიზებული მოთხოვნებისთვის (`SameSite=Strict`-ის დამატებით —
 * ის არ იცავს იმავე საიტის სხვა subdomain-იდან და login-CSRF-ისგან):
 *
 * 1. ცვლილების მოთხოვნა (POST/PUT/PATCH/DELETE), რომელსაც auth cookie ახლავს ან
 *    cookie-auth endpoint-ზე მიდის, უარყოფილია, თუ ბრაუზერი ამბობს, რომ სხვა origin-იდანაა
 *    (`Sec-Fetch-Site: cross-site | same-site`).
 * 2. body-იან მოთხოვნას ამ შემთხვევაში `Content-Type: application/json` სჭირდება —
 *    HTML ფორმა JSON-ს ვერ აგზავნის, სხვა origin-იდან `fetch` კი preflight-ს და CORS-ს გადის.
 *    გამონაკლისი — ფაილის ატვირთვა (`multipart/form-data`): HTML ფორმასაც შეუძლია მისი
 *    გაგზავნა, ამიტომ დამატებით სავალდებულოა `X-Requested-With` header. ფორმა header-ს ვერ
 *    ამატებს, სხვა origin-ის `fetch`-ს კი ის preflight-ს აიძულებს (CORS უარყოფს).
 *
 * `Authorization: Bearer`-ით მოსული მოთხოვნა (cookie-ს გარეშე) ამას არ ეხება: ბრაუზერი
 * ბეარერ ტოკენს თავად არ ამატებს.
 */
export function csrfProtection(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  if (SAFE_METHODS.has(req.method)) return next();

  const cookieHeader = req.headers.cookie ?? '';
  const hasAuthCookie =
    cookieHeader.includes(`${ACCESS_COOKIE}=`) ||
    cookieHeader.includes(`${REFRESH_COOKIE}=`);
  const path = req.path.replace(/\/+$/, '');
  const isCookieAuthEndpoint = COOKIE_AUTH_PATHS.includes(path);

  if (!hasAuthCookie && !isCookieAuthEndpoint) return next();

  const site = req.headers['sec-fetch-site'];
  if (site === 'cross-site' || site === 'same-site') {
    return reject(res, 'მოთხოვნა სხვა origin-იდან უარყოფილია');
  }

  const hasBody =
    Number(req.headers['content-length'] ?? 0) > 0 ||
    req.headers['transfer-encoding'] !== undefined;
  if (hasBody && !req.is('application/json')) {
    const isUpload =
      req.is('multipart/form-data') &&
      req.headers['x-requested-with'] !== undefined;
    if (!isUpload) {
      return reject(
        res,
        req.is('multipart/form-data')
          ? 'ფაილის ატვირთვას სჭირდება X-Requested-With header'
          : 'საჭიროა Content-Type: application/json',
      );
    }
  }

  next();
}
