import { Module } from '@nestjs/common';
import { CatalogModule } from '../catalog/catalog.module.js';
import { CompatibilityModule } from '../compatibility/compatibility.module.js';
import { InventoryModule } from '../inventory/inventory.module.js';
import { PublicCatalogController } from './public-catalog.controller.js';
import { PublicCompatibilityController } from './public-compatibility.controller.js';
import { PublicSearchController } from './public-search.controller.js';
import { StorefrontService } from './storefront.service.js';

/**
 * საიტის (storefront) საჯარო API — ავტორიზაციის გარეშე, მხოლოდ წაკითხვა:
 * `/v1/catalog/...`, `/v1/compatibility/...`, `/v1/search/...` (docs/05-api.md §2).
 * საკუთარი ცხრილები არ აქვს — კატალოგს, თავსებადობას და მარაგს მათი service-ებით კითხულობს.
 */
@Module({
  imports: [CatalogModule, CompatibilityModule, InventoryModule],
  controllers: [
    PublicCatalogController,
    PublicCompatibilityController,
    PublicSearchController,
  ],
  providers: [StorefrontService],
})
export class StorefrontModule {}
