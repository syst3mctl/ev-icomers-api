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

export function setupSwagger(app: INestApplication): void {
  SwaggerModule.setup('docs', app, () => buildOpenApi(app), {
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
