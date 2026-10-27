import { AppError } from '../../common/filters/problem-details.filter.js';
import type { PrismaService } from '../../infra/prisma/prisma.service.js';
import { CategoriesService } from './categories.service.js';
import type { CreateCategoryDto } from './dto/category.dto.js';

type CategoryStub = {
  id: string;
  parent_id: string | null;
  slug: string;
  sort_order: number;
  is_active: boolean;
  created_at: Date;
  updated_at: Date;
  translations: {
    locale: string;
    name: string;
    description: string | null;
    seo_title: string | null;
    seo_description: string | null;
  }[];
  _count: { products: number };
};

function categoryStub(over: Partial<CategoryStub> = {}): CategoryStub {
  return {
    id: '11111111-1111-4111-8111-111111111111',
    parent_id: null,
    slug: 'cables',
    sort_order: 0,
    is_active: true,
    created_at: new Date('2026-10-27T00:00:00Z'),
    updated_at: new Date('2026-10-27T00:00:00Z'),
    translations: [
      {
        locale: 'ka',
        name: 'კაბელები',
        description: null,
        seo_title: null,
        seo_description: null,
      },
    ],
    _count: { products: 0 },
    ...over,
  };
}

/** მხოლოდ იმ მეთოდებით, რომლებსაც service იძახებს */
function makePrisma(over: Record<string, unknown> = {}): PrismaService {
  return {
    category: {
      findMany: async () => [],
      findUnique: async () => null,
      count: async () => 0,
      create: async () => categoryStub(),
      update: async () => categoryStub(),
      delete: async () => categoryStub(),
    },
    product: { count: async () => 0 },
    ...over,
  } as unknown as PrismaService;
}

const validDto: CreateCategoryDto = {
  slug: 'cables',
  translations: [{ locale: 'ka', name: 'კაბელები' }],
};

async function expectAppError(
  promise: Promise<unknown>,
  status: number,
  code: string,
): Promise<void> {
  await expect(promise).rejects.toBeInstanceOf(AppError);
  await promise.catch((error: AppError) => {
    expect(error.getStatus()).toBe(status);
    expect(error.code).toBe(code);
  });
}

describe('CategoriesService', () => {
  it('list: ბრუნდება page / page_size / total', async () => {
    const service = new CategoriesService(
      makePrisma({
        category: {
          findMany: async () => [categoryStub({ _count: { products: 4 } })],
          count: async () => 7,
        },
      }),
    );

    const result = await service.list({ page: 2, page_size: 10 });

    expect(result).toMatchObject({ page: 2, page_size: 10, total: 7 });
    expect(result.items[0]).toMatchObject({
      slug: 'cables',
      product_count: 4,
      created_at: '2026-10-27T00:00:00.000Z',
    });
  });

  it('list: skip ითვლება page-იდან', async () => {
    let captured: { skip?: number; take?: number } = {};
    const service = new CategoriesService(
      makePrisma({
        category: {
          findMany: async (args: { skip: number; take: number }) => {
            captured = args;
            return [];
          },
          count: async () => 0,
        },
      }),
    );

    await service.list({ page: 3, page_size: 24 });

    expect(captured).toMatchObject({ skip: 48, take: 24 });
  });

  it('getById: არარსებული → 404 CATEGORY_NOT_FOUND', async () => {
    const service = new CategoriesService(makePrisma());
    await expectAppError(
      service.getById('11111111-1111-4111-8111-111111111111'),
      404,
      'CATEGORY_NOT_FOUND',
    );
  });

  it('create: `ka` თარგმანის გარეშე → 422 TRANSLATION_REQUIRED', async () => {
    const service = new CategoriesService(makePrisma());
    await expectAppError(
      service.create({
        ...validDto,
        translations: [{ locale: 'en', name: 'Cables' }],
      }),
      422,
      'TRANSLATION_REQUIRED',
    );
  });

  it('create: გამოყენებული slug → 409 CATEGORY_SLUG_TAKEN', async () => {
    const service = new CategoriesService(
      makePrisma({
        category: {
          findUnique: async () => null,
          create: async () => {
            throw { code: 'P2002' };
          },
        },
      }),
    );
    await expectAppError(
      service.create(validDto),
      409,
      'CATEGORY_SLUG_TAKEN',
    );
  });

  it('create: არარსებული parent_id → 404 CATEGORY_NOT_FOUND', async () => {
    const service = new CategoriesService(makePrisma());
    await expectAppError(
      service.create({
        ...validDto,
        parent_id: '22222222-2222-4222-8222-222222222222',
      }),
      404,
      'CATEGORY_NOT_FOUND',
    );
  });

  it('remove: პროდუქტებიანი კატეგორია → 409 CATEGORY_NOT_EMPTY', async () => {
    const service = new CategoriesService(
      makePrisma({
        category: {
          findUnique: async () => ({ id: 'x' }),
          count: async () => 0,
        },
        product: { count: async () => 3 },
      }),
    );
    await expectAppError(
      service.remove('11111111-1111-4111-8111-111111111111'),
      409,
      'CATEGORY_NOT_EMPTY',
    );
  });

  it('remove: ქვეკატეგორიებიანი კატეგორია → 409 CATEGORY_NOT_EMPTY', async () => {
    const service = new CategoriesService(
      makePrisma({
        category: {
          findUnique: async () => ({ id: 'x' }),
          count: async () => 2,
        },
        product: { count: async () => 0 },
      }),
    );
    await expectAppError(
      service.remove('11111111-1111-4111-8111-111111111111'),
      409,
      'CATEGORY_NOT_EMPTY',
    );
  });

  it('remove: ცარიელი კატეგორია იშლება', async () => {
    let deleted = false;
    const service = new CategoriesService(
      makePrisma({
        category: {
          findUnique: async () => ({ id: 'x' }),
          count: async () => 0,
          delete: async () => {
            deleted = true;
            return categoryStub();
          },
        },
        product: { count: async () => 0 },
      }),
    );

    await service.remove('11111111-1111-4111-8111-111111111111');

    expect(deleted).toBe(true);
  });

  it('update: კატეგორია საკუთარ შვილზე ვერ მიებმება → 409 CATEGORY_CYCLE', async () => {
    const self = '11111111-1111-4111-8111-111111111111';
    const child = '22222222-2222-4222-8222-222222222222';
    // child-ის მშობელი არის self → self-ის child-ქვეშ გადატანა წრეა
    const parents: Record<string, string | null> = {
      [self]: null,
      [child]: self,
    };

    const service = new CategoriesService(
      makePrisma({
        category: {
          findUnique: async (args: {
            where: { id: string };
            select?: { parent_id?: boolean };
          }) =>
            args.select?.parent_id
              ? { parent_id: parents[args.where.id] ?? null }
              : { id: args.where.id },
          update: async () => categoryStub(),
        },
      }),
    );

    await expectAppError(
      service.update(self, { parent_id: child }),
      409,
      'CATEGORY_CYCLE',
    );
  });
});
