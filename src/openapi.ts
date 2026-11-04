import type { INestApplication } from '@nestjs/common';
import {
  DocumentBuilder,
  SwaggerModule,
  type OpenAPIObject,
} from '@nestjs/swagger';
import { TAG_DESCRIPTIONS, TAGS } from './openapi-tags.js';

/**
 * API-ს აღწერა (OpenAPI). ფრონტები მისგან აგენერირებენ ტიპებს:
 * `pnpm api:generate` (docs/05-api.md §5).
 */
export function buildOpenApi(app: INestApplication): OpenAPIObject {
  const builder = new DocumentBuilder()
    .setTitle('icomers API')
    .setDescription(
      'icomers ონლაინ მაღაზიის REST API.\n\n' +
        '- **public · …** — საიტისთვის, ავტორიზაციის გარეშე\n' +
        '- **admin · …** — ადმინკისთვის: ზემოთ **Authorize** → `POST /v1/auth/token`-ის `access_token`\n\n' +
        'ძებნა (ზედა ველი): ჯგუფის სახელი, მისამართი (`/catalog/products`), მეთოდი ან აღწერა.',
    )
    .setVersion('1')
    .addBearerAuth()
    .addCookieAuth('icomers_admin_at');
  for (const tag of Object.values(TAGS)) {
    builder.addTag(tag, TAG_DESCRIPTIONS[tag]);
  }
  return SwaggerModule.createDocument(app, builder.build());
}

/**
 * Swagger UI-ის ძებნა: ნაგულისხმევად მხოლოდ ჯგუფის სახელით ეძებს. ეს plugin-ი
 * ეძებს ჯგუფში, მისამართში, მეთოდში, summary-სა და აღწერაში.
 * ⚠️ ფუნქცია ბრაუზერში გადაეცემა ტექსტად (`toString()`) — გარე ცვლადებს ვერ იყენებს.
 */
function searchPlugin() {
  type Imm = {
    get(key: string): unknown;
    set(key: string, value: unknown): Imm;
    filter(fn: (value: Imm) => boolean): Imm;
    map(fn: (value: Imm, key: string) => Imm): Imm;
    size: number;
  };
  return {
    fn: {
      opsFilter: (taggedOps: Imm, phrase: string) => {
        const words = String(phrase || '')
          .toLowerCase()
          .split(/\s+/)
          .filter(Boolean);
        if (words.length === 0) return taggedOps;
        return taggedOps
          .map((tagObj, tag) => {
            const ops = (tagObj.get('operations') as Imm).filter((op) => {
              const operation = op.get('operation') as Imm | undefined;
              const text = [
                tag,
                op.get('path'),
                op.get('method'),
                operation?.get('summary'),
                operation?.get('description'),
                operation?.get('operationId'),
              ]
                .join(' ')
                .toLowerCase();
              return words.every((w) => text.includes(w));
            });
            return tagObj.set('operations', ops);
          })
          .filter((tagObj) => (tagObj.get('operations') as Imm).size > 0);
      },
    },
  };
}

/** Swagger UI-ის მისამართი. `/docs` → აქ გადამისამართდება (ძველი ბმულები) */
export const SWAGGER_PATH = 'swagger';

export function setupSwagger(app: INestApplication): void {
  type Req = { path: string; originalUrl: string };
  type Res = {
    setHeader(name: string, value: string): void;
    redirect(status: number, url: string): void;
  };

  // Swagger-ის გვერდი API-სთან ერთად იცვლება — Cloudflare-მა და ბრაუზერმა არ უნდა დაიმახსოვრონ
  // (`swagger-ui-init.js`-ში აღწერა ჩაშენებულია და ქეშიდან ძველ ვერსიას აჩვენებდა).
  app.use((req: Req, res: Res, next: () => void) => {
    if (
      req.path === `/${SWAGGER_PATH}` ||
      req.path.startsWith(`/${SWAGGER_PATH}/`) ||
      req.path === '/docs-json'
    ) {
      res.setHeader('Cache-Control', 'no-store');
    }
    next();
  });
  // ძველი მისამართი. ფარდობითი გადამისამართება — ადმინკის nginx-ის `/api` პრეფიქსი შენარჩუნდება
  app.use('/docs', (req: Req, res: Res, next: () => void) => {
    if (req.path !== '/') return next();
    res.redirect(
      302,
      req.originalUrl.split('?')[0]!.endsWith('/')
        ? `../${SWAGGER_PATH}`
        : SWAGGER_PATH,
    );
  });

  SwaggerModule.setup(SWAGGER_PATH, app, () => buildOpenApi(app), {
    jsonDocumentUrl: 'docs-json',
    customSiteTitle: 'icomers API',
    swaggerOptions: {
      filter: true,
      plugins: [searchPlugin],
      docExpansion: 'list',
      persistAuthorization: true,
      displayRequestDuration: true,
      tryItOutEnabled: true,
      defaultModelsExpandDepth: 0,
    },
  });
}
