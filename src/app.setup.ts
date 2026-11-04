import {
  ValidationPipe,
  VersioningType,
  type INestApplication,
} from '@nestjs/common';
import cookieParser from 'cookie-parser';
import { csrfProtection } from './modules/auth/csrf.middleware.js';

/**
 * საერთო პარამეტრები API-სთვის, ტესტებისთვის და openapi.json-ის ექსპორტისთვის,
 * რომ სამივე ერთნაირად მუშაობდეს.
 */
export function configureApp(app: INestApplication): void {
  // ყველა route: /v1/... ; health და docs — ვერსიის გარეშე
  app.enableVersioning({ type: VersioningType.URI, defaultVersion: '1' });
  // httpOnly auth cookie-ები (src/modules/auth/auth.cookies.ts)
  app.use(cookieParser());
  app.use(csrfProtection);
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
}
