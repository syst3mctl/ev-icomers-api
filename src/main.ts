import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { Logger } from 'nestjs-pino';
import { AppModule } from './app.module.js';
import { configureApp } from './app.setup.js';
import type { Env } from './config/env.js';
import { setupSwagger } from './openapi.js';

/** HTTP API: REST + SSE. ფონური სამუშაო ცალკე პროცესშია: src/worker.ts */
async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule, { bufferLogs: true });
  app.useLogger(app.get(Logger));

  const config = app.get<ConfigService<Env, true>>(ConfigService);

  configureApp(app);

  const origins = config.get('CORS_ORIGINS', { infer: true });
  app.enableCors({
    origin: origins.length ? origins : false,
    credentials: true,
  });

  if (config.get('SWAGGER_ENABLED', { infer: true })) {
    setupSwagger(app);
  }

  // SIGTERM-ზე აპი ახალ მოთხოვნებს აღარ იღებს და ასრულებს მიმდინარეს
  app.enableShutdownHooks();

  await app.listen(config.get('PORT', { infer: true }));
}

await bootstrap();
