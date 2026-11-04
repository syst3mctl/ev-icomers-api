import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { AdminCategoriesController } from './admin-categories.controller.js';
import { AdminProductImagesController } from './admin-product-images.controller.js';
import { AdminProductsController } from './admin-products.controller.js';
import { MediaController } from './media.controller.js';
import { ProductImagesService } from './product-images.service.js';
import { CategoriesService } from './categories.service.js';
import { ProductsService } from './products.service.js';

/**
 * კატალოგი: კატეგორიები, პროდუქტები და მათი სურათები (`GET /v1/media/...` — საჯარო).
 * ამჟამად მხოლოდ ადმინის endpoint-ები (`/v1/admin/...`); საჯარო `/v1/catalog/...` — შემდეგი ნაბიჯი.
 * service-ები ექსპორტირებულია, რომ სხვა მოდულებმა (compatibility, inventory, cart)
 * კატალოგის ცხრილებს პირდაპირ არ მიმართონ.
 */
@Module({
  imports: [AuthModule],
  controllers: [
    AdminCategoriesController,
    AdminProductsController,
    AdminProductImagesController,
    MediaController,
  ],
  providers: [CategoriesService, ProductsService, ProductImagesService],
  exports: [CategoriesService, ProductsService],
})
export class CatalogModule {}
