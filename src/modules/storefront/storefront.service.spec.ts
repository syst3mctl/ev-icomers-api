import { describe, expect, it, vi } from 'vitest';
import { AppError } from '../../common/filters/problem-details.filter.js';
import type { CatalogPublicService } from '../catalog/catalog-public.service.js';
import type { CompatibilityPublicService } from '../compatibility/compatibility-public.service.js';
import type { InventoryService } from '../inventory/inventory.service.js';
import type { PublicProductsQueryDto } from './dto/storefront.dto.js';
import { pick, StorefrontService, stockStatus } from './storefront.service.js';

const productRow = {
  id: 'p1',
  sku: 'CBL-1',
  slug: 'cable-1',
  category_id: 'c1',
  price_minor: 32900,
  compare_at_price_minor: null,
  is_universal: false,
  is_featured: false,
  translations: [
    { locale: 'ka', name: 'კაბელი', short_description: 'მოკლე' },
    { locale: 'en', name: 'Cable', short_description: null },
  ],
  images: [
    {
      storage_key: 'products/p1/a.webp',
      alt: { ka: 'ფოტო' },
      width: 10,
      height: 20,
    },
  ],
  category: {
    slug: 'cables',
    translations: [{ locale: 'ka', name: 'კაბელები' }],
  },
};

function setup(
  over: { inStock?: string[]; brandModels?: string[] | null } = {},
) {
  const searchProducts = vi.fn(async () => ({ rows: [productRow], total: 1 }));
  const catalog = {
    searchProducts,
    categoryWithDescendants: async (slug: string) =>
      slug === 'cables' ? ['c1', 'c2'] : null,
    categories: async () => [
      {
        id: 'c1',
        parent_id: null,
        slug: 'cables',
        sort_order: 0,
        translations: [{ locale: 'ka', name: 'კაბელები' }],
        active_product_count: 3,
      },
      {
        id: 'c2',
        parent_id: 'c1',
        slug: 't2',
        sort_order: 0,
        translations: [{ locale: 'ka', name: 'Type 2' }],
        active_product_count: 1,
      },
      // მშობელი (c-off) გამორთულია → არ ჩანს
      {
        id: 'c3',
        parent_id: 'c-off',
        slug: 'orphan',
        sort_order: 0,
        translations: [],
        active_product_count: 0,
      },
    ],
  } as unknown as CatalogPublicService;
  const compatibility = {
    modelById: async (id: string) => (id === 'm1' ? { id: 'm1' } : null),
    modelIdsByBrandSlug: async () =>
      over.brandModels === undefined ? ['m1', 'm2'] : over.brandModels,
    productIdsForModels: vi.fn(async (ids: string[]) =>
      ids.map((i) => `prod-of-${i}`),
    ),
  } as unknown as CompatibilityPublicService;
  const inventory = {
    availability: async () =>
      new Map([['p1', { available: 1, low_stock_threshold: 2 }]]),
    inStockProductIds: async () => over.inStock ?? ['p1'],
  } as unknown as InventoryService;
  return {
    service: new StorefrontService(catalog, compatibility, inventory),
    searchProducts,
    compatibility,
  };
}

const query = (over: Partial<PublicProductsQueryDto> = {}) =>
  ({
    locale: 'ka',
    sort: 'featured',
    page: 1,
    page_size: 24,
    ...over,
  }) as PublicProductsQueryDto;

async function code(promise: Promise<unknown>): Promise<string> {
  try {
    await promise;
  } catch (error) {
    if (error instanceof AppError) return `${error.getStatus()} ${error.code}`;
    throw error;
  }
  return 'ok';
}

describe('stockStatus — ზუსტი რაოდენობა გარეთ არ გადის', () => {
  it.each([
    [undefined, 'OUT_OF_STOCK'],
    [{ available: 0, low_stock_threshold: 2 }, 'OUT_OF_STOCK'],
    [{ available: -1, low_stock_threshold: 2 }, 'OUT_OF_STOCK'],
    [{ available: 2, low_stock_threshold: 2 }, 'LOW_STOCK'],
    [{ available: 3, low_stock_threshold: 2 }, 'IN_STOCK'],
  ] as const)('%o → %s', (item, expected) => {
    expect(stockStatus(item)).toBe(expected);
  });
});

describe('pick — ენა', () => {
  const t = [
    { locale: 'ka', name: 'კა' },
    { locale: 'en', name: 'En' },
  ];
  it('მოთხოვნილი ენა', () => expect(pick(t, 'en')?.name).toBe('En'));
  it('en არ არის → ქართული', () =>
    expect(pick([t[0]!], 'en')?.name).toBe('კა'));
});

describe('StorefrontService', () => {
  it('ბარათი: ენა, სურათის url, სტატუსი; რაოდენობა პასუხში არ არის', async () => {
    const { service } = setup();
    const res = await service.listProducts(query({ locale: 'en' }));
    expect(res.items[0]).toMatchObject({
      name: 'Cable',
      short_description: null,
      currency: 'GEL',
      stock_status: 'LOW_STOCK',
      image: {
        url: '/v1/media/products/p1/a.webp',
        alt: 'ფოტო',
        width: 10,
        height: 20,
      },
      category: { slug: 'cables', name: 'კაბელები' },
    });
    expect(JSON.stringify(res)).not.toMatch(/available|on_hand|reserved/);
  });

  it('კატეგორიის ხე: ქვეკატეგორია მშობლის ქვეშ, გამორთული მშობლის შვილი არ ჩანს', async () => {
    const tree = await setup().service.categoryTree('ka');
    expect(tree.map((n) => n.slug)).toEqual(['cables']);
    expect(tree[0]!.children.map((n) => n.slug)).toEqual(['t2']);
  });

  it('category → ქვეკატეგორიებიც; უცნობი → 404', async () => {
    const { service, searchProducts } = setup();
    await service.listProducts(query({ category: 'cables' }));
    expect(searchProducts).toHaveBeenCalledWith(
      expect.objectContaining({ categoryIds: ['c1', 'c2'] }),
    );
    expect(await code(service.listProducts(query({ category: 'nope' })))).toBe(
      '404 CATEGORY_NOT_FOUND',
    );
  });

  it('charger_brand → ბრენდის ყველა მოდელის თავსებადი პროდუქტები; უცნობი → 404', async () => {
    const { service, searchProducts } = setup();
    await service.listProducts(query({ charger_brand: 'wallbox' }));
    expect(searchProducts).toHaveBeenCalledWith(
      expect.objectContaining({ compatibleIds: ['prod-of-m1', 'prod-of-m2'] }),
    );
    const missing = setup({ brandModels: null });
    expect(
      await code(missing.service.listProducts(query({ charger_brand: 'x' }))),
    ).toBe('404 CHARGER_BRAND_NOT_FOUND');
  });

  it('charger_model უცნობი → 404', async () => {
    expect(
      await code(setup().service.listProducts(query({ charger_model: 'zzz' }))),
    ).toBe('404 CHARGER_MODEL_NOT_FOUND');
  });

  it('in_stock და მარაგში არაფერია → ცარიელი, ბაზის ძებნის გარეშე', async () => {
    const { service, searchProducts } = setup({ inStock: [] });
    const res = await service.listProducts(query({ in_stock: true }));
    expect(res.total).toBe(0);
    expect(searchProducts).not.toHaveBeenCalled();
  });

  it('min_price > max_price → 422', async () => {
    expect(
      await code(
        setup().service.listProducts(query({ min_price: 500, max_price: 100 })),
      ),
    ).toBe('422 INVALID_PRICE_RANGE');
  });
});
