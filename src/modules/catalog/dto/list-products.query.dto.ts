import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';
import { PageQueryDto } from '../../../common/dto/page-query.dto.js';
import { ProductStatus } from '../../../generated/prisma/enums.js';
import { PRODUCT_STATUSES } from './product.dto.js';

export const PRODUCT_SORTS = [
  'newest',
  'oldest',
  'price_asc',
  'price_desc',
  'sku_asc',
] as const;

export type ProductSort = (typeof PRODUCT_SORTS)[number];

export class ListProductsQueryDto extends PageQueryDto {
  @ApiPropertyOptional({
    enum: PRODUCT_STATUSES,
    description: 'ფილტრი სტატუსით; მითითების გარეშე ბრუნდება ყველა',
  })
  @IsOptional()
  @IsIn(PRODUCT_STATUSES)
  status?: ProductStatus;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  category_id?: string;

  @ApiPropertyOptional({
    description: 'ძებნა: SKU, slug, OEM ნომერი, დასახელება',
  })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  q?: string;

  @ApiPropertyOptional({ enum: PRODUCT_SORTS, default: 'newest' })
  @IsOptional()
  @IsIn(PRODUCT_SORTS)
  sort: ProductSort = 'newest';
}
