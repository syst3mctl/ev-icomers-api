import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { CatalogModule } from '../catalog/catalog.module.js';
import { AdminChargerBrandsController } from './admin-charger-brands.controller.js';
import { AdminChargerModelsController } from './admin-charger-models.controller.js';
import { AdminProductCompatibilityController } from './admin-product-compatibility.controller.js';
import { ChargerBrandsService } from './charger-brands.service.js';
import { ChargerModelsService } from './charger-models.service.js';
import { CompatibilityService } from './compatibility.service.js';

/**
 * თავსებადობა: დამტენების ბრენდები/მოდელები და მათი კავშირი პროდუქტებთან.
 * ამჟამად მხოლოდ ადმინის endpoint-ები; საჯარო `/v1/compatibility/...` — შემდეგი ნაბიჯი.
 *
 * `CatalogModule` საჭიროა `ProductsService`-ისთვის: `products` ცხრილს ეს მოდული
 * პირდაპირ არ ეხება (CLAUDE.md → „მოდულები“).
 */
@Module({
  imports: [AuthModule, CatalogModule],
  controllers: [
    AdminChargerBrandsController,
    AdminChargerModelsController,
    AdminProductCompatibilityController,
  ],
  providers: [ChargerBrandsService, ChargerModelsService, CompatibilityService],
  exports: [ChargerBrandsService, ChargerModelsService, CompatibilityService],
})
export class CompatibilityModule {}
