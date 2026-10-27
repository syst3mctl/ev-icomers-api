import { Injectable } from '@nestjs/common';
import { decimalToNumber } from '../../common/decimal.js';
import { AppError } from '../../common/filters/problem-details.filter.js';
import { PrismaService } from '../../infra/prisma/prisma.service.js';
import { ProductsService } from '../catalog/products.service.js';
import { ChargerModelsService } from './charger-models.service.js';
import type {
  AttachProductsDto,
  AttachProductsResponse,
  CompatibleModelResponse,
  ProductCompatibilityResponse,
  SetProductCompatibilityDto,
} from './dto/product-compatibility.dto.js';

const LINK_SELECT = {
  charger_model_id: true,
  note: true,
  charger_model: {
    select: {
      slug: true,
      name: true,
      revision: true,
      power_kw: true,
      brand_id: true,
      brand: { select: { slug: true, name: true } },
    },
  },
} as const;

type LinkRow = {
  charger_model_id: string;
  note: string | null;
  charger_model: {
    slug: string;
    name: string;
    revision: string | null;
    power_kw: unknown;
    brand_id: string;
    brand: { slug: string; name: string };
  };
};

/**
 * პროდუქტი ↔ დამტენის მოდელი (`product_compatibility`).
 *
 * `products` და `product_compatibility` სხვადასხვა მოდულის ცხრილებია, ამიტომ
 * პროდუქტთან ყველა მიმართვა `ProductsService`-ით ხდება (CLAUDE.md → „მოდულები“).
 */
@Injectable()
export class CompatibilityService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly products: ProductsService,
    private readonly models: ChargerModelsService,
  ) {}

  /** პროდუქტის თავსებადი მოდელები */
  async getForProduct(
    productId: string,
  ): Promise<ProductCompatibilityResponse> {
    const isUniversal = await this.products.isUniversal(productId);
    const rows = await this.prisma.productCompatibility.findMany({
      where: { product_id: productId },
      select: LINK_SELECT,
      orderBy: [
        { charger_model: { brand: { name: 'asc' } } },
        { charger_model: { name: 'asc' } },
      ],
    });

    return {
      product_id: productId,
      is_universal: isUniversal,
      models: rows.map(toCompatibleModel),
    };
  }

  /**
   * `PUT /admin/products/{id}/compatibility` — სია მთლიანად ჩაენაცვლება.
   *
   * კავშირები ერთ ტრანზაქციაში იცვლება; `is_universal` პროდუქტის ცხრილშია და
   * ცალკე იწერება (`ProductsService`). პასუხი ბაზიდან ხელახლა იკითხება, ანუ
   * ყოველთვის ემთხვევა შენახულ მდგომარეობას.
   */
  async setForProduct(
    productId: string,
    dto: SetProductCompatibilityDto,
  ): Promise<ProductCompatibilityResponse> {
    await this.products.assertExists(productId);

    const modelIds = [...new Set(dto.model_ids)];
    await this.assertModelsExist(modelIds);

    await this.prisma.$transaction([
      this.prisma.productCompatibility.deleteMany({
        where: { product_id: productId },
      }),
      this.prisma.productCompatibility.createMany({
        data: modelIds.map((id) => ({
          product_id: productId,
          charger_model_id: id,
        })),
      }),
    ]);

    if (dto.is_universal !== undefined) {
      await this.products.setUniversal(productId, dto.is_universal);
    }

    return this.getForProduct(productId);
  }

  /**
   * `POST /admin/charger-models/{id}/products` — ერთ მოდელზე ბევრი პროდუქტის მიბმა.
   * არსებული კავშირები არ იშლება; განმეორებითი გამოძახება უვნებელია (idempotent).
   */
  async attachProducts(
    modelId: string,
    dto: AttachProductsDto,
  ): Promise<AttachProductsResponse> {
    await this.models.assertExists(modelId);

    const productIds = [...new Set(dto.product_ids)];
    const missing = await this.products.findMissingIds(productIds);
    if (missing.length > 0) {
      throw new AppError(
        422,
        'PRODUCT_NOT_FOUND',
        `პროდუქტები ვერ მოიძებნა: ${missing.join(', ')}`,
        missing.map((id) => ({ product_id: id })),
      );
    }

    const { count: added } = await this.prisma.productCompatibility.createMany({
      data: productIds.map((id) => ({
        product_id: id,
        charger_model_id: modelId,
      })),
      skipDuplicates: true,
    });

    const [total, products] = await Promise.all([
      this.prisma.productCompatibility.count({
        where: { charger_model_id: modelId },
      }),
      this.products.summariesByIds(productIds),
    ]);

    return {
      charger_model_id: modelId,
      added,
      skipped: productIds.length - added,
      total,
      products,
    };
  }

  /** ერთი კავშირის მოხსნა */
  async detachProduct(modelId: string, productId: string): Promise<void> {
    await this.models.assertExists(modelId);

    const { count } = await this.prisma.productCompatibility.deleteMany({
      where: { charger_model_id: modelId, product_id: productId },
    });
    if (count === 0) {
      throw new AppError(
        404,
        'COMPATIBILITY_NOT_FOUND',
        `პროდუქტი ${productId} ამ მოდელზე მიბმული არ არის`,
      );
    }
  }

  private async assertModelsExist(ids: string[]): Promise<void> {
    const missing = await this.models.findMissingIds(ids);
    if (missing.length > 0) {
      throw new AppError(
        422,
        'CHARGER_MODEL_NOT_FOUND',
        `დამტენის მოდელები ვერ მოიძებნა: ${missing.join(', ')}`,
        missing.map((id) => ({ charger_model_id: id })),
      );
    }
  }
}

function toCompatibleModel(row: LinkRow): CompatibleModelResponse {
  return {
    charger_model_id: row.charger_model_id,
    brand_id: row.charger_model.brand_id,
    brand_slug: row.charger_model.brand.slug,
    brand_name: row.charger_model.brand.name,
    model_slug: row.charger_model.slug,
    model_name: row.charger_model.name,
    revision: row.charger_model.revision,
    power_kw: decimalToNumber(row.charger_model.power_kw),
    note: row.note,
  };
}
