import {
  ApiProperty,
  ApiPropertyOptional,
  PartialType,
} from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { LOCALES, type Locale } from '../../../common/locales.js';
import { ProductStatus } from '../../../generated/prisma/enums.js';
import { SLUG_PATTERN } from './category.dto.js';

/** `sku`: დიდი ასოები, ციფრები, დეფისები — `CBL-T2-32-5` */
export const SKU_PATTERN = /^[A-Z0-9]+(?:-[A-Z0-9]+)*$/;

export const PRODUCT_STATUSES = Object.values(ProductStatus);

export class ProductTranslationDto {
  @ApiProperty({ enum: LOCALES })
  @IsIn(LOCALES)
  locale!: Locale;

  @ApiProperty({ maxLength: 300, example: 'Type 2 კაბელი 32A, 5მ' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(300)
  name!: string;

  @ApiPropertyOptional({ nullable: true, maxLength: 500 })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  short_description?: string | null;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @IsString()
  description?: string | null;

  @ApiPropertyOptional({ nullable: true, maxLength: 200 })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  seo_title?: string | null;

  @ApiPropertyOptional({ nullable: true, maxLength: 500 })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  seo_description?: string | null;
}

export class CreateProductDto {
  @ApiProperty({ pattern: SKU_PATTERN.source, example: 'CBL-T2-32-5' })
  @IsString()
  @Matches(SKU_PATTERN, {
    message: 'sku: მხოლოდ დიდი ასოები, ციფრები და დეფისები',
  })
  @MaxLength(64)
  sku!: string;

  @ApiProperty({
    pattern: SLUG_PATTERN.source,
    example: 'type2-cable-32a-5m',
  })
  @IsString()
  @Matches(SLUG_PATTERN, {
    message: 'slug: მხოლოდ პატარა ასოები, ციფრები და დეფისები',
  })
  @MaxLength(160)
  slug!: string;

  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  category_id!: string;

  @ApiPropertyOptional({
    enum: PRODUCT_STATUSES,
    default: ProductStatus.DRAFT,
  })
  @IsOptional()
  @IsIn(PRODUCT_STATUSES)
  status?: ProductStatus;

  @ApiProperty({
    minimum: 0,
    description: 'ფასი თეთრებში, დღგ-ის ჩათვლით',
    example: 32900,
  })
  @IsInt()
  @Min(0)
  price_minor!: number;

  @ApiPropertyOptional({
    nullable: true,
    minimum: 0,
    description: 'გადახაზული „ძველი ფასი“ თეთრებში',
  })
  @IsOptional()
  @IsInt()
  @Min(0)
  compare_at_price_minor?: number | null;

  @ApiPropertyOptional({
    default: 1800,
    minimum: 0,
    description: 'დღგ basis points-ში: 1800 = 18.00%',
  })
  @IsOptional()
  @IsInt()
  @Min(0)
  vat_rate_bp?: number;

  @ApiPropertyOptional({
    type: [String],
    default: [],
    description: 'ქარხნული (OEM) ნომრები — ძებნაში მონაწილეობენ',
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  oem_part_numbers?: string[];

  @ApiPropertyOptional({
    type: 'object',
    additionalProperties: true,
    default: {},
    description: 'ტექნიკური მახასიათებლები: `{ "connector": "Type 2" }`',
  })
  @IsOptional()
  @IsObject()
  attributes?: Record<string, unknown>;

  @ApiPropertyOptional({
    default: false,
    description: 'ერგება ყველა დამტენის მოდელს',
  })
  @IsOptional()
  @IsBoolean()
  is_universal?: boolean;

  @ApiPropertyOptional({ default: false })
  @IsOptional()
  @IsBoolean()
  is_featured?: boolean;

  @ApiPropertyOptional({ nullable: true, minimum: 0 })
  @IsOptional()
  @IsInt()
  @Min(0)
  weight_g?: number | null;

  @ApiProperty({
    type: [ProductTranslationDto],
    description: '`ka` სავალდებულოა',
  })
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => ProductTranslationDto)
  translations!: ProductTranslationDto[];
}

/**
 * ყველა ველი არასავალდებულოა. `translations`-ის გადმოცემისას მითითებული
 * ენები განახლდება (upsert), დანარჩენი ხელუხლებელი რჩება.
 */
export class UpdateProductDto extends PartialType(CreateProductDto) {}

export class ProductTranslationResponse {
  @ApiProperty({ enum: LOCALES }) locale!: Locale;
  @ApiProperty() name!: string;
  @ApiProperty({ nullable: true, type: String })
  short_description!: string | null;
  @ApiProperty({ nullable: true, type: String }) description!: string | null;
  @ApiProperty({ nullable: true, type: String }) seo_title!: string | null;
  @ApiProperty({ nullable: true, type: String })
  seo_description!: string | null;
}

export class ProductImageResponse {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty() storage_key!: string;
  @ApiProperty({
    type: 'object',
    additionalProperties: true,
    description: 'alt ტექსტი ენებად: `{ "ka": "...", "en": "..." }`',
  })
  alt!: Record<string, unknown>;
  @ApiProperty() sort_order!: number;
  @ApiProperty({ nullable: true, type: Number }) width!: number | null;
  @ApiProperty({ nullable: true, type: Number }) height!: number | null;
}

/** სიის ჩანაწერი — ცხრილისთვის საკმარისი ველები */
export class ProductListItemResponse {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty() sku!: string;
  @ApiProperty() slug!: string;
  @ApiProperty({ enum: PRODUCT_STATUSES }) status!: ProductStatus;
  @ApiProperty({ format: 'uuid' }) category_id!: string;
  @ApiProperty() category_slug!: string;
  @ApiProperty({ description: 'სახელი `ka`-ზე (ან პირველი არსებული)' })
  name!: string;
  @ApiProperty() price_minor!: number;
  @ApiProperty({ nullable: true, type: Number })
  compare_at_price_minor!: number | null;
  @ApiProperty() is_universal!: boolean;
  @ApiProperty() is_featured!: boolean;
  @ApiProperty({ format: 'date-time' }) created_at!: string;
  @ApiProperty({ format: 'date-time' }) updated_at!: string;
}

export class ProductResponse extends ProductListItemResponse {
  @ApiProperty() vat_rate_bp!: number;
  @ApiProperty({ type: [String] }) oem_part_numbers!: string[];
  @ApiProperty({ type: 'object', additionalProperties: true })
  attributes!: Record<string, unknown>;
  @ApiProperty({ nullable: true, type: Number }) weight_g!: number | null;
  @ApiProperty({ type: [ProductTranslationResponse] })
  translations!: ProductTranslationResponse[];
  @ApiProperty({ type: [ProductImageResponse] })
  images!: ProductImageResponse[];
}

export class ProductListResponse {
  @ApiProperty({ type: [ProductListItemResponse] })
  items!: ProductListItemResponse[];
  @ApiProperty() page!: number;
  @ApiProperty() page_size!: number;
  @ApiProperty() total!: number;
}
