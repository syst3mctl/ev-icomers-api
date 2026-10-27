import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsOptional,
  IsUUID,
} from 'class-validator';
import { ProductSummaryResponse } from '../../catalog/dto/product.dto.js';

/** ერთ მოთხოვნაში მიბმული მოდელების/პროდუქტების ზედა ზღვარი */
export const MAX_LINKS_PER_REQUEST = 500;

/**
 * `PUT /admin/products/{id}/compatibility` — docs/05-api.md §4.
 * სია **მთლიანად ჩაენაცვლება**: რაც აქ არ არის, წაიშლება.
 */
export class SetProductCompatibilityDto {
  @ApiProperty({
    type: [String],
    format: 'uuid',
    description: 'დამტენის მოდელების სრული სია; `[]` — ყველა კავშირი იშლება',
  })
  @IsArray()
  @ArrayMaxSize(MAX_LINKS_PER_REQUEST)
  @IsUUID(undefined, { each: true })
  model_ids!: string[];

  @ApiPropertyOptional({
    description:
      'ერგება ყველა მოდელს. `true`-ზე `model_ids` აზრს კარგავს, მაგრამ ინახება.',
  })
  @IsOptional()
  @IsBoolean()
  is_universal?: boolean;
}

/** `POST /admin/charger-models/{id}/products` — ერთ მოდელზე ბევრი პროდუქტის მიბმა */
export class AttachProductsDto {
  @ApiProperty({ type: [String], format: 'uuid' })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(MAX_LINKS_PER_REQUEST)
  @IsUUID(undefined, { each: true })
  product_ids!: string[];
}

export class CompatibleModelResponse {
  @ApiProperty({ format: 'uuid' }) charger_model_id!: string;
  @ApiProperty({ format: 'uuid' }) brand_id!: string;
  @ApiProperty() brand_slug!: string;
  @ApiProperty() brand_name!: string;
  @ApiProperty() model_slug!: string;
  @ApiProperty() model_name!: string;
  @ApiProperty({ nullable: true, type: String }) revision!: string | null;
  @ApiProperty({ nullable: true, type: Number }) power_kw!: number | null;
  @ApiProperty({
    nullable: true,
    type: String,
    description: 'შენიშვნა კავშირზე, მაგ. „მხოლოდ 2023 წლის შემდეგ“',
  })
  note!: string | null;
}

export class ProductCompatibilityResponse {
  @ApiProperty({ format: 'uuid' }) product_id!: string;
  @ApiProperty({ description: 'ერგება ყველა დამტენის მოდელს' })
  is_universal!: boolean;
  @ApiProperty({ type: [CompatibleModelResponse] })
  models!: CompatibleModelResponse[];
}

export class AttachProductsResponse {
  @ApiProperty({ format: 'uuid' }) charger_model_id!: string;
  @ApiProperty({ description: 'რამდენი ახალი კავშირი დაემატა' })
  added!: number;
  @ApiProperty({ description: 'რამდენი კავშირი უკვე არსებობდა' })
  skipped!: number;
  @ApiProperty({ description: 'კავშირების ჯამური რაოდენობა ამ მოდელზე' })
  total!: number;
  @ApiProperty({
    type: [ProductSummaryResponse],
    description: 'მოთხოვნაში გადმოცემული პროდუქტები',
  })
  products!: ProductSummaryResponse[];
}
