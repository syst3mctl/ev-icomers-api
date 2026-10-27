import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import type { AdminPrincipal } from '../auth/admin.guard.js';
import { AdminGuard } from '../auth/admin.guard.js';
import { CurrentAdmin } from '../auth/current-admin.decorator.js';
import { INVENTORY_ROLES, Roles } from '../auth/roles.js';
import {
  InventoryItemResponse,
  InventoryListResponse,
  ListInventoryQueryDto,
  UpdateInventorySettingsDto,
} from './dto/inventory.dto.js';
import {
  CreateStockMovementDto,
  ListStockMovementsQueryDto,
  StockMovementListResponse,
  StockMovementResultResponse,
} from './dto/stock-movement.dto.js';
import { InventoryService } from './inventory.service.js';

/** docs/05-api.md §4 → „მარაგი“: `/admin/inventory` (warehouse+) */
@ApiTags('admin/inventory')
@ApiBearerAuth()
@Controller('admin/inventory')
@UseGuards(AdminGuard)
@Roles(...INVENTORY_ROLES)
export class AdminInventoryController {
  constructor(private readonly inventory: InventoryService) {}

  @Get()
  @ApiOperation({
    summary: 'მარაგის სია',
    description:
      '`low_stock=true` — მხოლოდ ის პროდუქტები, რომლებზეც `available <= low_stock_threshold`.',
  })
  @ApiOkResponse({ type: InventoryListResponse })
  list(@Query() query: ListInventoryQueryDto): Promise<InventoryListResponse> {
    return this.inventory.list(query);
  }

  @Get(':product_id')
  @ApiOperation({ summary: 'ერთი პროდუქტის მარაგი' })
  @ApiOkResponse({ type: InventoryItemResponse })
  getByProductId(
    @Param('product_id', ParseUUIDPipe) productId: string,
  ): Promise<InventoryItemResponse> {
    return this.inventory.getByProductId(productId);
  }

  @Patch(':product_id')
  @ApiOperation({
    summary: '„ცოტა მარაგის“ ზღვრის შეცვლა',
    description:
      'რაოდენობა ამ endpoint-იდან არ იცვლება — მხოლოდ `movements`-ით, რომ ყველა ცვლილება ისტორიაში დარჩეს.',
  })
  @ApiOkResponse({ type: InventoryItemResponse })
  updateSettings(
    @Param('product_id', ParseUUIDPipe) productId: string,
    @Body() dto: UpdateInventorySettingsDto,
  ): Promise<InventoryItemResponse> {
    return this.inventory.updateSettings(productId, dto);
  }

  @Post(':product_id/movements')
  @ApiOperation({
    summary: 'მარაგის ცვლილება (მიღება, კორექცია, დაზიანება…)',
    description:
      'ცვლილება და ისტორიის ჩანაწერი ერთ ტრანზაქციაშია. თუ `on_hand` დაკავებულზე ' +
      '(`reserved`) ნაკლები გამოდის — `409 INSUFFICIENT_STOCK` და არაფერი იცვლება.',
  })
  @ApiCreatedResponse({ type: StockMovementResultResponse })
  addMovement(
    @Param('product_id', ParseUUIDPipe) productId: string,
    @Body() dto: CreateStockMovementDto,
    @CurrentAdmin() admin: AdminPrincipal,
  ): Promise<StockMovementResultResponse> {
    return this.inventory.addMovement(productId, dto, admin.id);
  }

  @Get(':product_id/movements')
  @ApiOperation({ summary: 'მარაგის ცვლილებების ისტორია' })
  @ApiOkResponse({ type: StockMovementListResponse })
  listMovements(
    @Param('product_id', ParseUUIDPipe) productId: string,
    @Query() query: ListStockMovementsQueryDto,
  ): Promise<StockMovementListResponse> {
    return this.inventory.listMovements(productId, query);
  }
}
