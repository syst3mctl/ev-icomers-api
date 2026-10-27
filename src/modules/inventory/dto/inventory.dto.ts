import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsIn, IsInt, IsOptional, Max, Min } from 'class-validator';
import { BooleanQuery } from '../../../common/dto/boolean-query.decorator.js';
import { PageQueryDto } from '../../../common/dto/page-query.dto.js';
import { ProductSummaryResponse } from '../../catalog/dto/product.dto.js';

/** `low_stock_threshold`-ის ზედა ზღვარი — ასეთი მარაგი საწყობში არ გვაქვს */
export const MAX_THRESHOLD = 100_000;

export const INVENTORY_SORTS = [
  'available_asc',
  'available_desc',
  'updated_desc',
] as const;

export type InventorySort = (typeof INVENTORY_SORTS)[number];

export class ListInventoryQueryDto extends PageQueryDto {
  @ApiPropertyOptional({
    description:
      '`true` — მხოლოდ ის პროდუქტები, რომლებზეც ხელმისაწვდომი მარაგი ზღვარზე ნაკლები ან ტოლია',
  })
  @IsOptional()
  @BooleanQuery()
  @IsBoolean()
  low_stock?: boolean;

  @ApiPropertyOptional({ enum: INVENTORY_SORTS, default: 'available_asc' })
  @IsOptional()
  @IsIn(INVENTORY_SORTS)
  sort: InventorySort = 'available_asc';
}

/** `PATCH /admin/inventory/{product_id}` */
export class UpdateInventorySettingsDto {
  @ApiProperty({
    minimum: 0,
    maximum: MAX_THRESHOLD,
    description:
      'ზღვარი, რომლის ქვემოთ მარაგი „ცოტაა“ — ადმინკის გამაფრთხილებელი ნიშნისთვის',
    example: 2,
  })
  @IsInt()
  @Min(0)
  @Max(MAX_THRESHOLD)
  low_stock_threshold!: number;
}

export class InventoryItemResponse {
  @ApiProperty({ format: 'uuid' }) product_id!: string;
  @ApiProperty({
    type: ProductSummaryResponse,
    nullable: true,
    description: 'პროდუქტის მოკლე აღწერა; `null` — თუ პროდუქტი წაშლილია',
  })
  product!: ProductSummaryResponse | null;
  @ApiProperty({ description: 'საწყობში ფიზიკურად არსებული რაოდენობა' })
  on_hand!: number;
  @ApiProperty({ description: 'გადაუხდელი შეკვეთებით დაკავებული' })
  reserved!: number;
  @ApiProperty({ description: 'გასაყიდად ხელმისაწვდომი: `on_hand - reserved`' })
  available!: number;
  @ApiProperty() low_stock_threshold!: number;
  @ApiProperty({ description: '`available <= low_stock_threshold`' })
  is_low_stock!: boolean;
  @ApiProperty({ format: 'date-time' }) updated_at!: string;
}

export class InventoryListResponse {
  @ApiProperty({ type: [InventoryItemResponse] })
  items!: InventoryItemResponse[];
  @ApiProperty() page!: number;
  @ApiProperty() page_size!: number;
  @ApiProperty() total!: number;
}
