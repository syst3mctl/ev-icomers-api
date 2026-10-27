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
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { LOCALES, type Locale } from '../../../common/locales.js';

/** `slug`: პატარა ასოები, ციფრები და დეფისები — `ev-cables-2` */
export const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export class CategoryTranslationDto {
  @ApiProperty({ enum: LOCALES })
  @IsIn(LOCALES)
  locale!: Locale;

  @ApiProperty({ maxLength: 200, example: 'კაბელები' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  name!: string;

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

export class CreateCategoryDto {
  @ApiProperty({ pattern: SLUG_PATTERN.source, example: 'cables' })
  @IsString()
  @Matches(SLUG_PATTERN, {
    message: 'slug: მხოლოდ პატარა ასოები, ციფრები და დეფისები',
  })
  @MaxLength(120)
  slug!: string;

  @ApiPropertyOptional({
    nullable: true,
    format: 'uuid',
    description: 'მშობელი კატეგორია; `null` — ზედა დონე',
  })
  @IsOptional()
  @IsUUID()
  parent_id?: string | null;

  @ApiPropertyOptional({ default: 0, minimum: 0 })
  @IsOptional()
  @IsInt()
  @Min(0)
  sort_order?: number;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  is_active?: boolean;

  @ApiProperty({
    type: [CategoryTranslationDto],
    description: '`ka` სავალდებულოა',
  })
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => CategoryTranslationDto)
  translations!: CategoryTranslationDto[];
}

/**
 * ყველა ველი არასავალდებულოა. `translations`-ის გადმოცემისას მითითებული
 * ენები განახლდება (upsert), დანარჩენი ხელუხლებელი რჩება.
 */
export class UpdateCategoryDto extends PartialType(CreateCategoryDto) {}

export class CategoryTranslationResponse {
  @ApiProperty({ enum: LOCALES }) locale!: Locale;
  @ApiProperty() name!: string;
  @ApiProperty({ nullable: true, type: String }) description!: string | null;
  @ApiProperty({ nullable: true, type: String }) seo_title!: string | null;
  @ApiProperty({ nullable: true, type: String })
  seo_description!: string | null;
}

export class CategoryResponse {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty({ nullable: true, type: String, format: 'uuid' })
  parent_id!: string | null;
  @ApiProperty() slug!: string;
  @ApiProperty() sort_order!: number;
  @ApiProperty() is_active!: boolean;
  @ApiProperty({ type: [CategoryTranslationResponse] })
  translations!: CategoryTranslationResponse[];
  @ApiProperty({ description: 'პროდუქტების რაოდენობა ამ კატეგორიაში' })
  product_count!: number;
  @ApiProperty({ format: 'date-time' }) created_at!: string;
  @ApiProperty({ format: 'date-time' }) updated_at!: string;
}

export class CategoryListResponse {
  @ApiProperty({ type: [CategoryResponse] }) items!: CategoryResponse[];
  @ApiProperty() page!: number;
  @ApiProperty() page_size!: number;
  @ApiProperty() total!: number;
}
