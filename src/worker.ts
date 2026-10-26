import { Logger as NestLogger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { Logger } from 'nestjs-pino';
import { WorkerModule } from './worker/worker.module.js';

/**
 * Worker: ფონური სამუშაო HTTP-ის გარეშე (docs/02-architecture.md §2).
 * აქ დაემატება: outbox relay, NATS consumer-ები, ვადაგასული რეზერვაციები, ფისკალური ჩეკები.
 * ეშვება ცალკე: `pnpm start:worker` (production: `node dist/worker.js`).
 */
async function bootstrap(): Promise<void> {
  const app = await NestFactory.createApplicationContext(WorkerModule, {
    bufferLogs: true,
  });
  app.useLogger(app.get(Logger));
  app.enableShutdownHooks();
  new NestLogger('Worker').log('Worker started');
}

await bootstrap();
