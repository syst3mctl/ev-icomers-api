import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { CatalogModule } from '../catalog/catalog.module.js';
import { AdminInventoryController } from './admin-inventory.controller.js';
import { InventoryService } from './inventory.service.js';

/**
 * მარაგი: `inventory_items` და `stock_movements`.
 *
 * `InventoryService` ექსპორტირებულია — `checkout`/`orders` მარაგს მხოლოდ მისით შეცვლის
 * (`stock_reservations` და `reserved` იმ ეტაპზე დაემატება, `docs/06-order-flow.md`).
 */
@Module({
  imports: [AuthModule, CatalogModule],
  controllers: [AdminInventoryController],
  providers: [InventoryService],
  exports: [InventoryService],
})
export class InventoryModule {}
