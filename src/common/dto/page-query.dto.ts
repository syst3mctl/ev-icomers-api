import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, Max, Min } from 'class-validator';

/** საერთო pagination პარამეტრები: `?page=1&page_size=24` (SYSTEM.md §4) */
export class PageQueryDto {
  @ApiPropertyOptional({ minimum: 1, default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page: number = 1;

  @ApiPropertyOptional({ minimum: 1, maximum: 100, default: 24 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  page_size: number = 24;
}

/** `skip` / `take` Prisma-სთვის */
export function toSkipTake(query: PageQueryDto): {
  skip: number;
  take: number;
} {
  return {
    skip: (query.page - 1) * query.page_size,
    take: query.page_size,
  };
}
