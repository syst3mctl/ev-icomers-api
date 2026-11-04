import { Injectable } from '@nestjs/common';
import { AppError } from '../../common/filters/problem-details.filter.js';
import { DEFAULT_LOCALE, type Locale } from '../../common/locales.js';
import {
  CatalogPublicService,
  type PublicProductRow,
  type PublicTranslation,
} from '../catalog/catalog-public.service.js';
import { mediaUrl } from '../catalog/media-url.js';
import {
  CompatibilityPublicService,
  type PublicModelRow,
} from '../compatibility/compatibility-public.service.js';
import { InventoryService } from '../inventory/inventory.service.js';
import type {
  PublicBrand,
  PublicCategoryNode,
  PublicChargerModel,
  PublicImage,
  PublicProductCard,
  PublicProductDetail,
  PublicProductList,
  PublicProductsQueryDto,
  SearchSuggestResponse,
  StockStatus,
} from './dto/storefront.dto.js';

const RELATED_LIMIT = 8;

/**
 * საიტის (storefront) საჯარო API: აწყობს კატალოგის, თავსებადობის და მარაგის
 * მოდულების მონაცემებს (თითოეული საკუთარ ცხრილებს თავად კითხულობს — CLAUDE.md → „მოდულები“).
 *
 * წესები: მხოლოდ აქტიური ჩანაწერები; ტექსტი ერთ ენაზე (თარგმანი თუ არ არის — `ka`);
 * მარაგი მხოლოდ სტატუსით — ზუსტი რიცხვი გარეთ არ გადის.
 */
@Injectable()
export class StorefrontService {
  constructor(
    private readonly catalog: CatalogPublicService,
    private readonly compatibility: CompatibilityPublicService,
    private readonly inventory: InventoryService,
  ) {}

  async categoryTree(locale: Locale): Promise<PublicCategoryNode[]> {
    const rows = await this.catalog.categories();
    const nodes = new Map<string, PublicCategoryNode>(
      rows.map((row) => {
        const t = pick(row.translations, locale);
        return [
          row.id,
          {
            id: row.id,
            slug: row.slug,
            name: t?.name ?? row.slug,
            description: t?.description ?? null,
            product_count: row.active_product_count,
            children: [],
          },
        ];
      }),
    );
    const roots: PublicCategoryNode[] = [];
    for (const row of rows) {
      const node = nodes.get(row.id)!;
      if (row.parent_id === null) roots.push(node);
      // მშობელი გამორთულია → ქვეკატეგორიაც არ ჩანს
      else nodes.get(row.parent_id)?.children.push(node);
    }
    return roots;
  }

  async listProducts(
    query: PublicProductsQueryDto,
  ): Promise<PublicProductList> {
    if (
      query.min_price !== undefined &&
      query.max_price !== undefined &&
      query.min_price > query.max_price
    ) {
      throw new AppError(
        422,
        'INVALID_PRICE_RANGE',
        'min_price მეტია max_price-ზე',
      );
    }
    const empty = {
      items: [],
      page: query.page,
      page_size: query.page_size,
      total: 0,
    };

    let categoryIds: string[] | undefined;
    if (query.category) {
      const ids = await this.catalog.categoryWithDescendants(query.category);
      if (!ids)
        throw new AppError(
          404,
          'CATEGORY_NOT_FOUND',
          `კატეგორია "${query.category}" ვერ მოიძებნა`,
        );
      categoryIds = ids;
    }

    let compatibleIds: string[] | undefined;
    if (query.charger_model) {
      const model = await this.compatibility.modelById(query.charger_model);
      if (!model)
        throw new AppError(
          404,
          'CHARGER_MODEL_NOT_FOUND',
          'დამტენის მოდელი ვერ მოიძებნა',
        );
      compatibleIds = await this.compatibility.productIdsForModels([model.id]);
    } else if (query.charger_brand) {
      const modelIds = await this.compatibility.modelIdsByBrandSlug(
        query.charger_brand,
      );
      if (!modelIds) {
        throw new AppError(
          404,
          'CHARGER_BRAND_NOT_FOUND',
          `ბრენდი "${query.charger_brand}" ვერ მოიძებნა`,
        );
      }
      compatibleIds = await this.compatibility.productIdsForModels(modelIds);
    }

    const onlyIds = query.in_stock
      ? await this.inventory.inStockProductIds()
      : undefined;
    if (onlyIds && onlyIds.length === 0) return empty;

    const { rows, total } = await this.catalog.searchProducts({
      categoryIds,
      q: query.q,
      minPrice: query.min_price,
      maxPrice: query.max_price,
      onlyIds,
      compatibleIds,
      sort: query.sort,
      skip: (query.page - 1) * query.page_size,
      take: query.page_size,
    });
    return {
      items: await this.cards(rows, query.locale),
      page: query.page,
      page_size: query.page_size,
      total,
    };
  }

  async productBySlug(
    slug: string,
    locale: Locale,
  ): Promise<PublicProductDetail> {
    const row = await this.catalog.productBySlug(slug);
    if (!row)
      throw new AppError(
        404,
        'PRODUCT_NOT_FOUND',
        `პროდუქტი "${slug}" ვერ მოიძებნა`,
      );

    const [[card], path, models] = await Promise.all([
      this.cards([row], locale),
      this.catalog.categoryPath(row.category_id),
      this.compatibility.modelsForProduct(row.id),
    ]);
    const t = pick(row.translations, locale);
    return {
      ...card!,
      description: t?.description ?? null,
      seo_title: t?.seo_title ?? null,
      seo_description: t?.seo_description ?? null,
      images: row.images.map((img) => toImage(img, locale)),
      attributes: (row.attributes ?? {}) as Record<string, unknown>,
      oem_part_numbers: row.oem_part_numbers,
      weight_g: row.weight_g,
      breadcrumbs: path.map((c) => ({
        slug: c.slug,
        name: pick(c.translations, locale)?.name ?? c.slug,
      })),
      compatible_models: models.map(toModel),
    };
  }

  /** იმავე კატეგორიის სხვა პროდუქტები (ჯერ მარაგში არსებულები) */
  async related(slug: string, locale: Locale): Promise<PublicProductCard[]> {
    const row = await this.catalog.productBySlug(slug);
    if (!row)
      throw new AppError(
        404,
        'PRODUCT_NOT_FOUND',
        `პროდუქტი "${slug}" ვერ მოიძებნა`,
      );
    const { rows } = await this.catalog.searchProducts({
      categoryIds: [row.category_id],
      excludeId: row.id,
      sort: 'featured',
      skip: 0,
      take: RELATED_LIMIT * 2,
    });
    const cards = await this.cards(rows, locale);
    const rank = (s: StockStatus) => (s === 'OUT_OF_STOCK' ? 1 : 0);
    return cards
      .sort((a, b) => rank(a.stock_status) - rank(b.stock_status))
      .slice(0, RELATED_LIMIT);
  }

  async brands(): Promise<PublicBrand[]> {
    return this.compatibility.brands();
  }

  async brandModels(brandSlug: string): Promise<PublicChargerModel[]> {
    const models = await this.compatibility.modelsByBrandSlug(brandSlug);
    if (!models)
      throw new AppError(
        404,
        'CHARGER_BRAND_NOT_FOUND',
        `ბრენდი "${brandSlug}" ვერ მოიძებნა`,
      );
    return models.map(toModel);
  }

  async model(id: string): Promise<PublicChargerModel> {
    const model = await this.compatibility.modelById(id);
    if (!model)
      throw new AppError(
        404,
        'CHARGER_MODEL_NOT_FOUND',
        'დამტენის მოდელი ვერ მოიძებნა',
      );
    return toModel(model);
  }

  async suggest(q: string, locale: Locale): Promise<SearchSuggestResponse> {
    const term = q.trim();
    const [products, categories, models] = await Promise.all([
      this.catalog.searchProducts({
        q: term,
        sort: 'featured',
        skip: 0,
        take: 5,
      }),
      this.catalog.suggestCategories(term, 3),
      this.compatibility.suggestModels(term, 5),
    ]);
    return {
      products: products.rows.map((p) => ({
        slug: p.slug,
        name: pick(p.translations, locale)?.name ?? p.sku,
        price_minor: p.price_minor,
        image: p.images[0] ? toImage(p.images[0], locale) : null,
      })),
      categories: categories.map((c) => ({
        slug: c.slug,
        name: pick(c.translations, locale)?.name ?? c.slug,
      })),
      charger_models: models.map(toModel),
    };
  }

  private async cards(
    rows: PublicProductRow[],
    locale: Locale,
  ): Promise<PublicProductCard[]> {
    const stock = await this.inventory.availability(rows.map((r) => r.id));
    return rows.map((row) => {
      const t = pick(row.translations, locale);
      return {
        id: row.id,
        slug: row.slug,
        sku: row.sku,
        name: t?.name ?? row.sku,
        short_description: t?.short_description ?? null,
        price_minor: row.price_minor,
        compare_at_price_minor: row.compare_at_price_minor,
        currency: 'GEL',
        image: row.images[0] ? toImage(row.images[0], locale) : null,
        stock_status: stockStatus(stock.get(row.id)),
        is_universal: row.is_universal,
        is_featured: row.is_featured,
        category: {
          slug: row.category.slug,
          name:
            pick(row.category.translations, locale)?.name ?? row.category.slug,
        },
      };
    });
  }
}

/** მოთხოვნილი ენა → ქართული → პირველი არსებული */
export function pick<T extends Pick<PublicTranslation, 'locale'>>(
  translations: readonly T[],
  locale: Locale,
): T | undefined {
  return (
    translations.find((t) => t.locale === locale) ??
    translations.find((t) => t.locale === DEFAULT_LOCALE) ??
    translations[0]
  );
}

export function stockStatus(
  item: { available: number; low_stock_threshold: number } | undefined,
): StockStatus {
  if (!item || item.available <= 0) return 'OUT_OF_STOCK';
  return item.available <= item.low_stock_threshold ? 'LOW_STOCK' : 'IN_STOCK';
}

function toImage(
  img: {
    storage_key: string;
    alt: unknown;
    width: number | null;
    height: number | null;
  },
  locale: Locale,
): PublicImage {
  const alt = (img.alt ?? {}) as Record<string, unknown>;
  const text = alt[locale] ?? alt[DEFAULT_LOCALE];
  return {
    url: mediaUrl(img.storage_key),
    alt: typeof text === 'string' ? text : null,
    width: img.width,
    height: img.height,
  };
}

function toModel(m: PublicModelRow): PublicChargerModel {
  return {
    id: m.id,
    slug: m.slug,
    name: m.name,
    revision: m.revision,
    power_kw: m.power_kw,
    brand: m.brand,
  };
}
