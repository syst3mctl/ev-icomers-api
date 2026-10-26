import type { INestApplication } from '@nestjs/common';
import {
  DocumentBuilder,
  SwaggerModule,
  type OpenAPIObject,
} from '@nestjs/swagger';

/**
 * API-ს აღწერა (OpenAPI). ფრონტები მისგან აგენერირებენ ტიპებს:
 * `pnpm api:generate` (docs/05-api.md §5).
 */
export function buildOpenApi(app: INestApplication): OpenAPIObject {
  const config = new DocumentBuilder()
    .setTitle('icomers API')
    .setDescription('icomers ონლაინ მაღაზიის REST API')
    .setVersion('1')
    .addBearerAuth()
    .build();
  return SwaggerModule.createDocument(app, config);
}

export function setupSwagger(app: INestApplication): void {
  SwaggerModule.setup('docs', app, () => buildOpenApi(app), {
    jsonDocumentUrl: 'docs-json',
  });
}
