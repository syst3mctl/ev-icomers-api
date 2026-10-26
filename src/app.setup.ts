import {
  ValidationPipe,
  VersioningType,
  type INestApplication,
} from '@nestjs/common';

/**
 * საერთო პარამეტრები API-სთვის, ტესტებისთვის და openapi.json-ის ექსპორტისთვის,
 * რომ სამივე ერთნაირად მუშაობდეს.
 */
export function configureApp(app: INestApplication): void {
  // ყველა route: /v1/... ; health და docs — ვერსიის გარეშე
  app.enableVersioning({ type: VersioningType.URI, defaultVersion: '1' });
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
}
