import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { APP_FILTER } from '@nestjs/core';
import { LoggerModule } from 'nestjs-pino';
import { randomUUID } from 'node:crypto';
import { validateEnv, type Env } from './config/env.js';
import { ProblemDetailsFilter } from './common/filters/problem-details.filter.js';
import { PrismaModule } from './infra/prisma/prisma.module.js';
import { AuthModule } from './modules/auth/auth.module.js';
import { CatalogModule } from './modules/catalog/catalog.module.js';
import { HealthModule } from './modules/health/health.module.js';

/**
 * მოდულები (docs/02-architecture.md §3). ახალი მოდული ემატება `modules/`-ში და აქ imports-ში:
 * catalog, compatibility, inventory, customers, cart, orders, checkout, payments, fiscal, admin-events, audit.
 */
@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, validate: validateEnv }),
    LoggerModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService<Env, true>) => ({
        pinoHttp: {
          level: config.get('LOG_LEVEL', { infer: true }),
          genReqId: (req) =>
            (req.headers['x-request-id'] as string | undefined) ?? randomUUID(),
          // პერსონალური მონაცემები ლოგში არ იწერება (docs/11-security.md)
          redact: [
            'req.headers.authorization',
            'req.headers.cookie',
            'res.headers["set-cookie"]',
          ],
          autoLogging: {
            ignore: (req) => req.url?.startsWith('/health') ?? false,
          },
          transport:
            config.get('NODE_ENV', { infer: true }) === 'development'
              ? { target: 'pino-pretty', options: { singleLine: true } }
              : undefined,
        },
      }),
    }),
    PrismaModule,
    AuthModule,
    HealthModule,
    CatalogModule,
  ],
  providers: [{ provide: APP_FILTER, useClass: ProblemDetailsFilter }],
})
export class AppModule {}
