import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  NotEquals,
} from 'class-validator';
import { PageQueryDto } from '../../../common/dto/page-query.dto.js';
import { StockMovementType } from '../../../generated/prisma/enums.js';
import { InventoryItemResponse } from './inventory.dto.js';

export const STOCK_MOVEMENT_TYPES = Object.values(StockMovementType);

/** ერთ ჩანაწერში დასაშვები მაქსიმუმი — შეცდომით აკრეფილი რიცხვის დასაჭერად */
export const MAX_MOVEMENT_QUANTITY = 1_000_000;

/**
 * ცვლილების მიმართულება ტიპის მიხედვით (`docs/04-data-model.md` → მარაგი):
 * მიღება და დაბრუნება ზრდის, გაყიდვა და დაზიანება ამცირებს,
 * კორექცია — ორივე მიმართულებით.
 */
export const MOVEMENT_SIGN: Record<StockMovementType, 'positive' | 'negative' | 'any'> =
  {
    [StockMovementType.RECEIPT]: 'positive',
    [StockMovementType.RETURN]: 'positive',
    [StockMovementType.SALE]: 'negative',
    [StockMovementType.DAMAGE]: 'negative',
    [StockMovementType.ADJUSTMENT]: 'any',
  };

/** `POST /admin/inventory/{product_id}/movements` — docs/05-api.md §4 → „მარაგი“ */
export class CreateStockMovementDto {
  @ApiProperty({ enum: STOCK_MOVEMENT_TYPES })
  @IsIn(STOCK_MOVEMENT_TYPES)
  type!: StockMovementType;

  @ApiProperty({
    description:
      'ცვლილება ნიშნით: `+` ზრდის, `−` ამცირებს. ნული დაუშვებელია. ' +
      'ნიშანი უნდა ემთხვეოდეს ტიპს: RECEIPT/RETURN — `+`, SALE/DAMAGE — `−`, ADJUSTMENT — ორივე.',
    minimum: -MAX_MOVEMENT_QUANTITY,
    maximum: MAX_MOVEMENT_QUANTITY,
    example: 10,
  })
  @IsInt()
  @NotEquals(0, { message: 'quantity: ნული დაუშვებელია' })
  @Min(-MAX_MOVEMENT_QUANTITY)
  @Max(MAX_MOVEMENT_QUANTITY)
  quantity!: number;

  @ApiPropertyOptional({
    nullable: true,
    maxLength: 500,
    description: 'მიზეზი / კომენტარი — რჩება ისტორიაში',
  })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string | null;
}

export class ListStockMovementsQueryDto extends PageQueryDto {
  @ApiPropertyOptional({ enum: STOCK_MOVEMENT_TYPES })
  @IsOptional()
  @IsIn(STOCK_MOVEMENT_TYPES)
  type?: StockMovementType;
}

export class StockMovementResponse {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty({ format: 'uuid' }) product_id!: string;
  @ApiProperty({ enum: STOCK_MOVEMENT_TYPES }) type!: StockMovementType;
  @ApiProperty({ description: 'ცვლილება ნიშნით' }) quantity!: number;
  @ApiProperty({
    nullable: true,
    type: String,
    format: 'uuid',
    description: 'შეკვეთა, რომელმაც ცვლილება გამოიწვია (ავტომატურ ჩანაწერებზე)',
  })
  order_id!: string | null;
  @ApiProperty({ nullable: true, type: String }) reason!: string | null;
  @ApiProperty({
    nullable: true,
    type: String,
    description: 'ადმინის Identity id (`sub`); `null` — სისტემური ჩანაწერი',
  })
  actor_id!: string | null;
  @ApiProperty({ format: 'date-time' }) created_at!: string;
}

/**
 * ჩანაწერის დამატების პასუხი: ადმინკას ერთ მოთხოვნაში სჭირდება ორივე —
 * რა ჩაიწერა ისტორიაში და რა დარჩა მარაგში (მეორე GET-ის გარეშე).
 */
export class StockMovementResultResponse {
  @ApiProperty({ type: StockMovementResponse })
  movement!: StockMovementResponse;
  @ApiProperty({ type: InventoryItemResponse })
  inventory!: InventoryItemResponse;
}

export class StockMovementListResponse {
  @ApiProperty({ type: [StockMovementResponse] })
  items!: StockMovementResponse[];
  @ApiProperty() page!: number;
  @ApiProperty() page_size!: number;
  @ApiProperty() total!: number;
}
