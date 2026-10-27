import {
  ApiProperty,
  ApiPropertyOptional,
  PartialType,
} from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { BooleanQuery } from '../../../common/dto/boolean-query.decorator.js';
import { PageQueryDto } from '../../../common/dto/page-query.dto.js';
import { SLUG_PATTERN } from '../../catalog/dto/category.dto.js';

/** `power_kw` — `Decimal(6, 2)`: მაქსიმუმ 9999.99 kW, ორი ათწილადი */
export const MAX_POWER_KW = 9999.99;

export class CreateChargerModelDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  brand_id!: string;

  @ApiProperty({
    pattern: SLUG_PATTERN.source,
    example: 'pulsar-plus',
    description: 'უნიკალურია ბრენდის შიგნით',
  })
  @IsString()
  @Matches(SLUG_PATTERN, {
    message: 'slug: მხოლოდ პატარა ასოები, ციფრები და დეფისები',
  })
  @MaxLength(120)
  slug!: string;

  @ApiProperty({ maxLength: 200, example: 'Pulsar Plus' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  name!: string;

  @ApiPropertyOptional({
    nullable: true,
    maxLength: 100,
    description: 'ვერსია / რევიზია / თაობა',
    example: 'Gen 2',
  })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  revision?: string | null;

  @ApiPropertyOptional({
    nullable: true,
    maximum: MAX_POWER_KW,
    description: 'სიმძლავრე kW-ში, ორი ათწილადით',
    example: 22,
  })
  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(MAX_POWER_KW)
  power_kw?: number | null;

  @ApiPropertyOptional({
    nullable: true,
    description: 'სურათის გასაღები S3-ში',
  })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  image_key?: string | null;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  is_active?: boolean;
}

export class UpdateChargerModelDto extends PartialType(CreateChargerModelDto) {}

export class ListChargerModelsQueryDto extends PageQueryDto {
  @ApiPropertyOptional({ format: 'uuid', description: 'ფილტრი ბრენდით' })
  @IsOptional()
  @IsUUID()
  brand_id?: string;

  @ApiPropertyOptional({
    description: 'მითითების გარეშე ბრუნდება აქტიურიც და გამორთულიც',
  })
  @IsOptional()
  @BooleanQuery()
  @IsBoolean()
  is_active?: boolean;

  @ApiPropertyOptional({ description: 'ძებნა: slug, სახელი ან რევიზია' })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  q?: string;
}

export class ChargerModelResponse {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty({ format: 'uuid' }) brand_id!: string;
  @ApiProperty() brand_slug!: string;
  @ApiProperty() brand_name!: string;
  @ApiProperty() slug!: string;
  @ApiProperty() name!: string;
  @ApiProperty({ nullable: true, type: String }) revision!: string | null;
  @ApiProperty({ nullable: true, type: Number }) power_kw!: number | null;
  @ApiProperty({ nullable: true, type: String }) image_key!: string | null;
  @ApiProperty() is_active!: boolean;
  @ApiProperty({ description: 'ამ მოდელზე მიბმული პროდუქტების რაოდენობა' })
  product_count!: number;
  @ApiProperty({ format: 'date-time' }) created_at!: string;
  @ApiProperty({ format: 'date-time' }) updated_at!: string;
}

export class ChargerModelListResponse {
  @ApiProperty({ type: [ChargerModelResponse] }) items!: ChargerModelResponse[];
  @ApiProperty() page!: number;
  @ApiProperty() page_size!: number;
  @ApiProperty() total!: number;
}
