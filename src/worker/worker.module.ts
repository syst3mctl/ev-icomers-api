import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { LoggerModule } from 'nestjs-pino';
import { validateEnv, type Env } from '../config/env.js';
import { PrismaModule } from '../infra/prisma/prisma.module.js';

/**
 * Worker-ის მოდულები. იგივე კოდბაზა, რაც API-ს, ოღონდ HTTP controller-ების გარეშე.
 * ეტაპ 2-ში დაემატება: OutboxModule, NatsModule, ReservationsCronModule.
 */
@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, validate: validateEnv }),
    LoggerModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService<Env, true>) => ({
        pinoHttp: {
          level: config.get('LOG_LEVEL', { infer: true }),
          transport:
            config.get('NODE_ENV', { infer: true }) === 'development'
              ? { target: 'pino-pretty', options: { singleLine: true } }
              : undefined,
        },
      }),
    }),
    PrismaModule,
  ],
})
export class WorkerModule {}
