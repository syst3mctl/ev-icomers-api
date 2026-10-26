import { NestFactory } from '@nestjs/core';
import { writeFileSync } from 'node:fs';

/**
 * openapi.json-ის ექსპორტი ფაილში, სერვერის გაშვებისა და ბაზის გარეშე.
 * `pnpm openapi:export` → ./openapi.json. ფრონტები მისგან აგენერირებენ ტიპებს.
 */
// env უნდა დაყენდეს AppModule-ის ჩატვირთვამდე (config მოწმდება import-ისას)
process.env.DATABASE_URL ??=
  'postgresql://openapi:openapi@localhost:5432/openapi';
process.env.LOG_LEVEL ??= 'warn';

const { AppModule } = await import('../app.module.js');
const { configureApp } = await import('../app.setup.js');
const { buildOpenApi } = await import('../openapi.js');

const app = await NestFactory.create(AppModule, { logger: ['error'] });
configureApp(app);
const document = buildOpenApi(app);
writeFileSync('openapi.json', JSON.stringify(document, null, 2) + '\n');
await app.close();
console.log('openapi.json written');
