import {
  ApiProperty,
  ApiPropertyOptional,
  PartialType,
} from '@nestjs/swagger';
import {
  IsBoolean,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  Min,
} from 'class-validator';
import { BooleanQuery } from '../../../common/dto/boolean-query.decorator.js';
import { PageQueryDto } from '../../../common/dto/page-query.dto.js';
import { SLUG_PATTERN } from '../../catalog/dto/category.dto.js';

export class CreateChargerBrandDto {
  @ApiProperty({ pattern: SLUG_PATTERN.source, example: 'wallbox' })
  @IsString()
  @Matches(SLUG_PATTERN, {
    message: 'slug: მხოლოდ პატარა ასოები, ციფრები და დეფისები',
  })
  @MaxLength(120)
  slug!: string;

  @ApiProperty({
    maxLength: 200,
    example: 'Wallbox',
    description: 'ბრენდის სახელი — არ ითარგმნება',
  })
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  name!: string;

  @ApiPropertyOptional({
    nullable: true,
    description: 'ლოგოს გასაღები S3-ში',
  })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  logo_key?: string | null;

  @ApiPropertyOptional({ default: 0, minimum: 0 })
  @IsOptional()
  @IsInt()
  @Min(0)
  sort_order?: number;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  is_active?: boolean;
}

export class UpdateChargerBrandDto extends PartialType(CreateChargerBrandDto) {}

export class ListChargerBrandsQueryDto extends PageQueryDto {
  @ApiPropertyOptional({
    description: 'მითითების გარეშე ბრუნდება აქტიურიც და გამორთულიც',
  })
  @IsOptional()
  @BooleanQuery()
  @IsBoolean()
  is_active?: boolean;

  @ApiPropertyOptional({ description: 'ძებნა: slug ან სახელი' })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  q?: string;
}

export class ChargerBrandResponse {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty() slug!: string;
  @ApiProperty() name!: string;
  @ApiProperty({ nullable: true, type: String }) logo_key!: string | null;
  @ApiProperty() sort_order!: number;
  @ApiProperty() is_active!: boolean;
  @ApiProperty({ description: 'მოდელების რაოდენობა ამ ბრენდში' })
  model_count!: number;
  @ApiProperty({ format: 'date-time' }) created_at!: string;
  @ApiProperty({ format: 'date-time' }) updated_at!: string;
}

export class ChargerBrandListResponse {
  @ApiProperty({ type: [ChargerBrandResponse] }) items!: ChargerBrandResponse[];
  @ApiProperty() page!: number;
  @ApiProperty() page_size!: number;
  @ApiProperty() total!: number;
}
