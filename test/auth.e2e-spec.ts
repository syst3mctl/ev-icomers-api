import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module.js';
import { configureApp } from '../src/app.setup.js';
import { PrismaService } from '../src/infra/prisma/prisma.service.js';
import { hashPassword } from '../src/modules/auth/password.js';
import {
  createFakeAuthPrisma,
  type FakeAuthPrisma,
} from './support/fake-auth-prisma.js';

const EMAIL = 'superadmin@gmail.com';
const PASSWORD = '002201Password';

/** Set-Cookie → `name=value` წყვილები შემდეგი მოთხოვნისთვის */
function cookiesFrom(res: request.Response): Record<string, string> {
  const raw = res.headers['set-cookie'] as unknown as string[] | undefined;
  const out: Record<string, string> = {};
  for (const line of raw ?? []) {
    const [pair] = line.split(';');
    const [name, ...rest] = pair!.split('=');
    out[name!.trim()] = rest.join('=');
  }
  return out;
}

function cookieHeader(cookies: Record<string, string>): string {
  return Object.entries(cookies)
    .map(([k, v]) => `${k}=${v}`)
    .join('; ');
}

describe('Auth (e2e)', () => {
  let app: INestApplication;
  let prisma: FakeAuthPrisma;
  const http = () => request(app.getHttpServer());

  beforeAll(async () => {
    prisma = createFakeAuthPrisma();
    await prisma.adminUser.create({
      data: {
        email: EMAIL,
        password_hash: await hashPassword(PASSWORD),
        roles: ['superadmin'],
      },
    });

    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(PrismaService)
      .useValue({
        ...prisma,
        category: { findMany: async () => [], count: async () => 0 },
      })
      .compile();
    app = moduleRef.createNestApplication();
    configureApp(app);
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  async function login(email = EMAIL, password = PASSWORD) {
    return http().post('/v1/auth/login').send({ email, password });
  }

  describe('ბრაუზერის ნაკადი (cookie)', () => {
    it('login → httpOnly, SameSite=Strict cookie-ები; პასუხში ტოკენი არ არის', async () => {
      const res = await login();
      expect(res.status).toBe(200);
      expect(res.body.user).toMatchObject({
        email: EMAIL,
        roles: ['superadmin'],
      });
      expect(JSON.stringify(res.body)).not.toMatch(/eyJ/); // JWT პასუხის body-ში არ ჩანს
      expect(res.headers['cache-control']).toBe('no-store');

      const raw = (res.headers['set-cookie'] as unknown as string[]).join('\n');
      expect(raw).toMatch(/icomers_admin_at=[^;]+;.*HttpOnly/);
      expect(raw).toMatch(/icomers_admin_rt=[^;]+;.*HttpOnly/);
      expect(raw).toMatch(/SameSite=Strict/);
      expect(raw).toMatch(/Secure/); // NODE_ENV=test → Secure
    });

    it('არასწორი პაროლი → 401 problem+json', async () => {
      const res = await login(EMAIL, 'wrong');
      expect(res.status).toBe(401);
      expect(res.headers['content-type']).toContain('application/problem+json');
      expect(res.body.code).toBe('INVALID_CREDENTIALS');
    });

    it('არასწორი ელ. ფოსტის ფორმატი → 400', async () => {
      const res = await login('not-an-email', PASSWORD);
      expect(res.status).toBe(400);
    });

    it('me cookie-თი; cookie-ს გარეშე 401', async () => {
      const cookies = cookiesFrom(await login());
      const me = await http()
        .get('/v1/auth/me')
        .set('Cookie', cookieHeader(cookies));
      expect(me.status).toBe(200);
      expect(me.body.email).toBe(EMAIL);

      const anon = await http().get('/v1/auth/me');
      expect(anon.status).toBe(401);
      expect(anon.body.code).toBe('UNAUTHORIZED');
    });

    it('refresh ცვლის cookie-ებს; ძველი refresh აღარ მუშაობს', async () => {
      const first = cookiesFrom(await login());
      const refreshed = await http()
        .post('/v1/auth/refresh')
        .set('Cookie', cookieHeader(first));
      expect(refreshed.status).toBe(200);
      const second = cookiesFrom(refreshed);
      expect(second.icomers_admin_rt).toBeDefined();
      expect(second.icomers_admin_rt).not.toBe(first.icomers_admin_rt);

      // მეორე ჩანართი ძველი cookie-თ (ერთდროული refresh): 409, cookie-ები არ იშლება —
      // თორემ მომგებიანი ჩანართის ახალ cookie-ებს წაშლიდა
      const again = await http()
        .post('/v1/auth/refresh')
        .set('Cookie', cookieHeader(first));
      expect(again.status).toBe(409);
      expect(again.body.code).toBe('REFRESH_RACE');
      expect(again.headers['set-cookie']).toBeUndefined();

      // უცნობი refresh token → 401 და მკვდარი cookie-ები იშლება
      const dead = await http()
        .post('/v1/auth/refresh')
        .set('Cookie', 'icomers_admin_rt=nope');
      expect(dead.status).toBe(401);
      expect(
        (dead.headers['set-cookie'] as unknown as string[]).join('\n'),
      ).toMatch(/icomers_admin_rt=;/);
    });

    it('logout → 204, cookie-ები იშლება, refresh აღარ მუშაობს', async () => {
      const cookies = cookiesFrom(await login());
      const out = await http()
        .post('/v1/auth/logout')
        .set('Cookie', cookieHeader(cookies));
      expect(out.status).toBe(204);
      expect(
        (out.headers['set-cookie'] as unknown as string[]).join('\n'),
      ).toMatch(/icomers_admin_at=;/);

      const refresh = await http()
        .post('/v1/auth/refresh')
        .set('Cookie', cookieHeader(cookies));
      expect(refresh.status).toBe(401);
    });
  });

  describe('CSRF', () => {
    it('login HTML ფორმით (form-urlencoded) → 403', async () => {
      const res = await http()
        .post('/v1/auth/login')
        .type('form')
        .send({ email: EMAIL, password: PASSWORD });
      expect(res.status).toBe(403);
      expect(res.body.code).toBe('CSRF_REJECTED');
      expect(res.headers['set-cookie']).toBeUndefined();
    });

    it('login სხვა საიტიდან (Sec-Fetch-Site: cross-site) → 403', async () => {
      const res = await http()
        .post('/v1/auth/login')
        .set('Sec-Fetch-Site', 'cross-site')
        .send({ email: EMAIL, password: PASSWORD });
      expect(res.status).toBe(403);
    });

    it('cookie-ით ცვლილება იმავე საიტის სხვა subdomain-იდან → 403; same-origin → გადის', async () => {
      const cookies = cookieHeader(cookiesFrom(await login()));
      const body = {
        email: 'csrf@shop.ge',
        password: 'csrf-pass-12',
        roles: ['warehouse'],
      };
      const sameSite = await http()
        .post('/v1/admin/users')
        .set('Cookie', cookies)
        .set('Sec-Fetch-Site', 'same-site')
        .send(body);
      expect(sameSite.status).toBe(403);

      const ok = await http()
        .post('/v1/admin/users')
        .set('Cookie', cookies)
        .set('Sec-Fetch-Site', 'same-origin')
        .send(body);
      expect(ok.status).toBe(201);
    });

    it('ფაილის ატვირთვა (multipart) cookie-ით: X-Requested-With-ის გარეშე → 403, მისით — CSRF გადის', async () => {
      const cookies = cookieHeader(cookiesFrom(await login()));
      const url = '/v1/admin/users';
      const withoutHeader = await http()
        .post(url)
        .set('Cookie', cookies)
        .field('email', 'form@shop.ge');
      expect(withoutHeader.status).toBe(403);
      expect(withoutHeader.body.code).toBe('CSRF_REJECTED');

      const withHeader = await http()
        .post(url)
        .set('Cookie', cookies)
        .set('X-Requested-With', 'fetch')
        .field('email', 'form@shop.ge');
      // CSRF გაიარა; შემდეგ ვალიდაცია უარყოფს (ეს endpoint ფაილს არ ელოდება)
      expect(withHeader.status).not.toBe(403);
    });

    it('logout სხვა საიტიდან → 403 (იძულებითი გასვლა არ ხდება)', async () => {
      const cookies = cookieHeader(cookiesFrom(await login()));
      const res = await http()
        .post('/v1/auth/logout')
        .set('Cookie', cookies)
        .set('Sec-Fetch-Site', 'cross-site');
      expect(res.status).toBe(403);
    });

    it('OAuth token endpoint (cookie-ს გარეშე) form-urlencoded-ს იღებს', async () => {
      const res = await http()
        .post('/v1/auth/token')
        .type('form')
        .send({ grant_type: 'password', username: EMAIL, password: PASSWORD });
      expect(res.status).toBe(200);
    });
  });

  describe('OAuth 2.0 token endpoint', () => {
    it('grant_type=password (form-urlencoded) → RFC 6749 პასუხი', async () => {
      const res = await http()
        .post('/v1/auth/token')
        .type('form')
        .send({ grant_type: 'password', username: EMAIL, password: PASSWORD });
      expect(res.status).toBe(200);
      expect(res.headers['cache-control']).toBe('no-store');
      expect(res.body).toMatchObject({ token_type: 'Bearer', expires_in: 900 });
      expect(res.body.access_token).toMatch(/^eyJ/);
      expect(typeof res.body.refresh_token).toBe('string');

      const me = await http()
        .get('/v1/auth/me')
        .set('Authorization', `Bearer ${res.body.access_token}`);
      expect(me.status).toBe(200);
    });

    it('grant_type=refresh_token (JSON)', async () => {
      const first = await http()
        .post('/v1/auth/token')
        .send({ grant_type: 'password', username: EMAIL, password: PASSWORD });
      const res = await http().post('/v1/auth/token').send({
        grant_type: 'refresh_token',
        refresh_token: first.body.refresh_token,
      });
      expect(res.status).toBe(200);
      expect(res.body.refresh_token).not.toBe(first.body.refresh_token);
    });

    it.each([
      [
        { grant_type: 'password', username: EMAIL, password: 'wrong' },
        'invalid_grant',
      ],
      [{ grant_type: 'password', username: EMAIL }, 'invalid_request'],
      [{ grant_type: 'client_credentials' }, 'unsupported_grant_type'],
      [{}, 'invalid_request'],
      [{ grant_type: 'refresh_token', refresh_token: 'nope' }, 'invalid_grant'],
    ])('%o → 400 %s', async (body, error) => {
      const res = await http().post('/v1/auth/token').send(body);
      expect(res.status).toBe(400);
      expect(res.body.error).toBe(error);
    });
  });

  it('JWKS: საჯარო გასაღები, private ნაწილის გარეშე', async () => {
    const res = await http().get('/.well-known/jwks.json');
    expect(res.status).toBe(200);
    expect(res.body.keys[0]).toMatchObject({
      kty: 'EC',
      alg: 'ES256',
      use: 'sig',
    });
    expect(res.body.keys[0]).not.toHaveProperty('d');
  });

  describe('მომხმარებლების რეგისტრაცია (superadmin)', () => {
    async function bearer(email: string, password: string) {
      const res = await http()
        .post('/v1/auth/token')
        .send({ grant_type: 'password', username: email, password });
      return `Bearer ${res.body.access_token}`;
    }

    it('superadmin ქმნის მომხმარებელს; ის შედის და მხოლოდ თავის როლს ხედავს', async () => {
      const root = await bearer(EMAIL, PASSWORD);
      const created = await http()
        .post('/v1/admin/users')
        .set('Authorization', root)
        .send({
          email: 'editor@shop.ge',
          password: 'editor-pass-1',
          roles: ['content_editor'],
        });
      expect(created.status).toBe(201);
      expect(created.body).toMatchObject({
        email: 'editor@shop.ge',
        roles: ['content_editor'],
      });
      expect(created.body).not.toHaveProperty('password_hash');

      const editor = await bearer('editor@shop.ge', 'editor-pass-1');
      // კატალოგი — editor+ → შეიძლება
      const categories = await http()
        .get('/v1/admin/categories')
        .set('Authorization', editor);
      expect(categories.status).toBe(200);
      // მომხმარებლების მართვა — მხოლოდ superadmin
      const users = await http()
        .get('/v1/admin/users')
        .set('Authorization', editor);
      expect(users.status).toBe(403);

      const list = await http()
        .get('/v1/admin/users')
        .set('Authorization', root);
      expect(list.status).toBe(200);
      expect(list.body.items.map((u: { email: string }) => u.email)).toEqual(
        expect.arrayContaining([EMAIL, 'editor@shop.ge']),
      );
    });

    it('სუსტი პაროლი და უცნობი როლი → 400', async () => {
      const root = await bearer(EMAIL, PASSWORD);
      const weak = await http()
        .post('/v1/admin/users')
        .set('Authorization', root)
        .send({ email: 'x@shop.ge', password: 'short', roles: ['admin'] });
      expect(weak.status).toBe(400);
      const badRole = await http()
        .post('/v1/admin/users')
        .set('Authorization', root)
        .send({
          email: 'x@shop.ge',
          password: 'long-enough-1',
          roles: ['god'],
        });
      expect(badRole.status).toBe(400);
    });

    it('გათიშვა მომხმარებლის მიმდინარე ტოკენსაც მაშინვე აუქმებს', async () => {
      const root = await bearer(EMAIL, PASSWORD);
      const created = await http()
        .post('/v1/admin/users')
        .set('Authorization', root)
        .send({
          email: 'temp@shop.ge',
          password: 'temporary-1',
          roles: ['warehouse'],
        });
      const temp = await bearer('temp@shop.ge', 'temporary-1');
      expect(
        (await http().get('/v1/auth/me').set('Authorization', temp)).status,
      ).toBe(200);

      const patch = await http()
        .patch(`/v1/admin/users/${created.body.id}`)
        .set('Authorization', root)
        .send({ is_active: false });
      expect(patch.status).toBe(200);
      expect(
        (await http().get('/v1/auth/me').set('Authorization', temp)).status,
      ).toBe(401);
    });
  });
});
