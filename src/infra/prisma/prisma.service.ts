import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../../generated/prisma/client.js';
import type { Env } from '../../config/env.js';

@Injectable()
export class PrismaService
  extends PrismaClient
  implements OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger(PrismaService.name);

  constructor(config: ConfigService<Env, true>) {
    const logSql =
      config.get('LOG_SQL', { infer: true }) &&
      config.get('NODE_ENV', { infer: true }) === 'development';

    super({
      adapter: new PrismaPg({
        connectionString: config.get('DATABASE_URL', { infer: true }),
      }),
      // `LOG_SQL=true` → ყველა query ტერმინალში: SQL, პარამეტრები, ხანგრძლივობა.
      // გამოსადეგია იმის გასარკვევად, რა SQL-ს აწარმოებს Prisma-ს კოდი.
      // პირდაპირ stdout-ში იწერება (არა pino-ში): ეს მხოლოდ ლოკალური
      // გასარკვევი რეჟიმია და query-ს მოთხოვნის `reqId` მაინც არ აქვს.
      ...(logSql ? { log: ['query' as const] } : {}),
    });

    if (logSql) {
      this.logger.warn('LOG_SQL=true — ყველა SQL query ტერმინალში დაიწერება');
    }
  }

  async onModuleInit(): Promise<void> {
    await this.$connect();
    this.logger.log('Connected to PostgreSQL');
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
  }

  /** `/health/ready`-სთვის: ბაზა პასუხობს თუ არა */
  async isHealthy(): Promise<boolean> {
    try {
      await this.$queryRaw`SELECT 1`;
      return true;
    } catch {
      return false;
    }
  }
}
