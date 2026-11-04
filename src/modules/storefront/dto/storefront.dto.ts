import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import { BooleanQuery } from '../../../common/dto/boolean-query.decorator.js';
import {
  DEFAULT_LOCALE,
  LOCALES,
  type Locale,
} from '../../../common/locales.js';
import { LocaleQueryDto } from '../../../common/dto/locale-query.dto.js';
import {
  PUBLIC_PRODUCT_SORTS,
  type PublicProductSort,
} from '../../catalog/catalog-public.service.js';

export const STOCK_STATUSES = [
  'IN_STOCK',
  'LOW_STOCK',
  'OUT_OF_STOCK',
] as const;
export type StockStatus = (typeof STOCK_STATUSES)[number];

// ---------------------------------------------------------------- query

export class PublicProductsQueryDto {
  @ApiPropertyOptional({ enum: LOCALES, default: DEFAULT_LOCALE })
  @IsOptional()
  @IsIn(LOCALES)
  locale: Locale = DEFAULT_LOCALE;

  @ApiPropertyOptional({
    description: 'კატეგორიის slug; ქვეკატეგორიების პროდუქტებიც შედის',
    example: 'cables',
  })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  category?: string;

  @ApiPropertyOptional({
    description: 'ძებნა: სახელი, SKU, OEM ნომერი',
    example: 'type 2',
  })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  q?: string;

  @ApiPropertyOptional({
    description: 'მინიმალური ფასი, თეთრებში',
    example: 10000,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  min_price?: number;

  @ApiPropertyOptional({
    description: 'მაქსიმალური ფასი, თეთრებში',
    example: 50000,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  max_price?: number;

  @ApiPropertyOptional({ description: '`true` — მხოლოდ მარაგში არსებული' })
  @IsOptional()
  @BooleanQuery()
  @IsBoolean()
  in_stock?: boolean;

  @ApiPropertyOptional({
    format: 'uuid',
    description:
      'დამტენის მოდელი: მხოლოდ მასთან თავსებადი **და** უნივერსალური პროდუქტები',
  })
  @IsOptional()
  @IsUUID()
  charger_model?: string;

  @ApiPropertyOptional({
    description:
      'დამტენის ბრენდის slug: ამ ბრენდის რომელიმე მოდელთან თავსებადი + უნივერსალური',
    example: 'wallbox',
  })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  charger_brand?: string;

  @ApiPropertyOptional({
    enum: PUBLIC_PRODUCT_SORTS,
    default: 'featured',
    description: '`featured` — ჯერ რჩეულები, მერე ახლები',
  })
  @IsOptional()
  @IsIn(PUBLIC_PRODUCT_SORTS)
  sort: PublicProductSort = 'featured';

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

export class SearchSuggestQueryDto extends LocaleQueryDto {
  @ApiProperty({ minLength: 2, maxLength: 100, example: 'type' })
  @IsString()
  @MinLength(2)
  @MaxLength(100)
  q!: string;
}

// ---------------------------------------------------------------- responses

export class PublicImage {
  @ApiProperty({
    description: 'API-ს ფესვიდან: `/v1/media/...`',
    example: '/v1/media/products/…/….webp',
  })
  url!: string;
  @ApiProperty({
    nullable: true,
    type: String,
    description: 'alt ტექსტი მოთხოვნილ ენაზე',
  })
  alt!: string | null;
  @ApiProperty({ nullable: true, type: Number }) width!: number | null;
  @ApiProperty({ nullable: true, type: Number }) height!: number | null;
}

export class PublicCategoryRef {
  @ApiProperty({ example: 'cables' }) slug!: string;
  @ApiProperty({ example: 'კაბელები' }) name!: string;
}

export class PublicProductCard {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty({ example: 'type2-cable-32a-5m' }) slug!: string;
  @ApiProperty({ example: 'CBL-T2-32-5' }) sku!: string;
  @ApiProperty({
    description: 'მოთხოვნილ ენაზე; თარგმანი თუ არ არის — ქართულად',
  })
  name!: string;
  @ApiProperty({ nullable: true, type: String }) short_description!:
    string | null;
  @ApiProperty({ description: 'ფასი თეთრებში, დღგ-ის ჩათვლით', example: 32900 })
  price_minor!: number;
  @ApiProperty({
    nullable: true,
    type: Number,
    description: 'გადახაზული ფასი (ფასდაკლება)',
  })
  compare_at_price_minor!: number | null;
  @ApiProperty({ enum: ['GEL'], example: 'GEL' }) currency!: 'GEL';
  @ApiProperty({
    type: PublicImage,
    nullable: true,
    description: 'მთავარი სურათი',
  })
  image!: PublicImage | null;
  @ApiProperty({
    enum: STOCK_STATUSES,
    description: 'ზუსტი რაოდენობა საჯაროდ არ ჩანს. `LOW_STOCK` — ცოტა დარჩა',
  })
  stock_status!: StockStatus;
  @ApiProperty({ description: 'ერგება ყველა დამტენს' }) is_universal!: boolean;
  @ApiProperty() is_featured!: boolean;
  @ApiProperty({ type: PublicCategoryRef }) category!: PublicCategoryRef;
}

export class PublicProductList {
  @ApiProperty({ type: [PublicProductCard] }) items!: PublicProductCard[];
  @ApiProperty() page!: number;
  @ApiProperty() page_size!: number;
  @ApiProperty() total!: number;
}

export class PublicBrandRef {
  @ApiProperty({ example: 'wallbox' }) slug!: string;
  @ApiProperty({ example: 'Wallbox' }) name!: string;
}

export class PublicChargerModel {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty({ example: 'pulsar-plus' }) slug!: string;
  @ApiProperty({ example: 'Pulsar Plus' }) name!: string;
  @ApiProperty({ nullable: true, type: String }) revision!: string | null;
  @ApiProperty({ nullable: true, type: Number, example: 22 }) power_kw!:
    number | null;
  @ApiProperty({ type: PublicBrandRef }) brand!: PublicBrandRef;
}

export class PublicProductDetail extends PublicProductCard {
  @ApiProperty({ nullable: true, type: String }) description!: string | null;
  @ApiProperty({ nullable: true, type: String }) seo_title!: string | null;
  @ApiProperty({ nullable: true, type: String }) seo_description!:
    string | null;
  @ApiProperty({
    type: [PublicImage],
    description: 'ყველა სურათი რიგით; პირველი — მთავარი',
  })
  images!: PublicImage[];
  @ApiProperty({
    type: 'object',
    additionalProperties: true,
    example: { connector: 'Type 2', current_a: 32 },
  })
  attributes!: Record<string, unknown>;
  @ApiProperty({ type: [String] }) oem_part_numbers!: string[];
  @ApiProperty({ nullable: true, type: Number }) weight_g!: number | null;
  @ApiProperty({
    type: [PublicCategoryRef],
    description: 'კატეგორიის გზა ფესვიდან (breadcrumbs)',
  })
  breadcrumbs!: PublicCategoryRef[];
  @ApiProperty({
    type: [PublicChargerModel],
    description:
      'თავსებადი დამტენები. `is_universal = true` — ერგება ყველას და სია შეიძლება ცარიელი იყოს',
  })
  compatible_models!: PublicChargerModel[];
}

export class PublicCategoryNode {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty({ example: 'cables' }) slug!: string;
  @ApiProperty({ example: 'კაბელები' }) name!: string;
  @ApiProperty({ nullable: true, type: String }) description!: string | null;
  @ApiProperty({
    description: 'აქტიური პროდუქტები ამ კატეგორიაში (ქვეკატეგორიების გარეშე)',
  })
  product_count!: number;
  @ApiProperty({ type: () => [PublicCategoryNode] })
  children!: PublicCategoryNode[];
}

export class PublicBrand {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty({ example: 'wallbox' }) slug!: string;
  @ApiProperty({ example: 'Wallbox' }) name!: string;
  @ApiProperty({ description: 'აქტიური მოდელების რაოდენობა' })
  model_count!: number;
}

export class SuggestProduct {
  @ApiProperty({ example: 'type2-cable-32a-5m' }) slug!: string;
  @ApiProperty() name!: string;
  @ApiProperty() price_minor!: number;
  @ApiProperty({ type: PublicImage, nullable: true })
  image!: PublicImage | null;
}

export class SearchSuggestResponse {
  @ApiProperty({ type: [SuggestProduct] }) products!: SuggestProduct[];
  @ApiProperty({ type: [PublicCategoryRef] }) categories!: PublicCategoryRef[];
  @ApiProperty({ type: [PublicChargerModel] })
  charger_models!: PublicChargerModel[];
}
