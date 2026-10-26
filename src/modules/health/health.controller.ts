import {
  Controller,
  Get,
  ServiceUnavailableException,
  VERSION_NEUTRAL,
} from '@nestjs/common';
import { ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { PrismaService } from '../../infra/prisma/prisma.service.js';

class HealthResponse {
  status!: 'ok';
}

/**
 * Kubernetes / usectl health checks (docs/10-deployment.md §5).
 * კომპანიის მიკროსერვისები აქ არ მოწმდება: მათი დროებითი გათიშვისას კატალოგი მაინც უნდა მუშაობდეს.
 */
@ApiTags('health')
@Controller({ path: 'health', version: VERSION_NEUTRAL })
export class HealthController {
  constructor(private readonly prisma: PrismaService) {}

  /** პროცესი ცოცხალია */
  @Get('live')
  @ApiOkResponse({ type: HealthResponse })
  live(): HealthResponse {
    return { status: 'ok' };
  }

  /** მზადაა მოთხოვნების მისაღებად: ბაზა ხელმისაწვდომია (NATS დაემატება ეტაპ 2-ში) */
  @Get('ready')
  @ApiOkResponse({ type: HealthResponse })
  async ready(): Promise<HealthResponse> {
    if (!(await this.prisma.isHealthy())) {
      throw new ServiceUnavailableException('Database is not reachable');
    }
    return { status: 'ok' };
  }
}
