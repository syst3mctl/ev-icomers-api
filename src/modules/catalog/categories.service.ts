import { Injectable } from '@nestjs/common';
import {
  PageQueryDto,
  toSkipTake,
} from '../../common/dto/page-query.dto.js';
import { AppError } from '../../common/filters/problem-details.filter.js';
import { DEFAULT_LOCALE } from '../../common/locales.js';
import { isUniqueViolation } from '../../infra/prisma/prisma-errors.js';
import { PrismaService } from '../../infra/prisma/prisma.service.js';
import type {
  CategoryListResponse,
  CategoryResponse,
  CategoryTranslationDto,
  CreateCategoryDto,
  UpdateCategoryDto,
} from './dto/category.dto.js';

/** `include`, რომელიც პასუხის ასაგებად საჭირო ყველა ველს მოიტანს */
const CATEGORY_INCLUDE = {
  translations: { orderBy: { locale: 'asc' } },
  _count: { select: { products: true } },
} as const;

type CategoryRow = {
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

@Injectable()
export class CategoriesService {
  constructor(private readonly prisma: PrismaService) {}

  async list(query: PageQueryDto): Promise<CategoryListResponse> {
    const { skip, take } = toSkipTake(query);
    const [rows, total] = await Promise.all([
      this.prisma.category.findMany({
        include: CATEGORY_INCLUDE,
        orderBy: [{ sort_order: 'asc' }, { slug: 'asc' }],
        skip,
        take,
      }),
      this.prisma.category.count(),
    ]);

    return {
      items: rows.map(toCategoryResponse),
      page: query.page,
      page_size: query.page_size,
      total,
    };
  }

  async getById(id: string): Promise<CategoryResponse> {
    const row = await this.prisma.category.findUnique({
      where: { id },
      include: CATEGORY_INCLUDE,
    });
    if (!row) {
      throw new AppError(404, 'CATEGORY_NOT_FOUND', `კატეგორია ${id} ვერ მოიძებნა`);
    }
    return toCategoryResponse(row);
  }

  async create(dto: CreateCategoryDto): Promise<CategoryResponse> {
    requireDefaultLocale(dto.translations);
    if (dto.parent_id) await this.assertCategoryExists(dto.parent_id);

    try {
      const row = await this.prisma.category.create({
        data: {
          slug: dto.slug,
          parent_id: dto.parent_id ?? null,
          sort_order: dto.sort_order ?? 0,
          is_active: dto.is_active ?? true,
          translations: { create: dto.translations.map(toTranslationData) },
        },
        include: CATEGORY_INCLUDE,
      });
      return toCategoryResponse(row);
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw new AppError(
          409,
          'CATEGORY_SLUG_TAKEN',
          `slug "${dto.slug}" უკვე გამოყენებულია`,
        );
      }
      throw error;
    }
  }

  async update(id: string, dto: UpdateCategoryDto): Promise<CategoryResponse> {
    await this.assertCategoryExists(id);
    if (dto.translations) requireDefaultLocale(dto.translations);

    if (dto.parent_id !== undefined && dto.parent_id !== null) {
      await this.assertCategoryExists(dto.parent_id);
      await this.assertNoCycle(id, dto.parent_id);
    }

    try {
      const row = await this.prisma.category.update({
        where: { id },
        data: {
          ...(dto.slug === undefined ? {} : { slug: dto.slug }),
          ...(dto.parent_id === undefined ? {} : { parent_id: dto.parent_id }),
          ...(dto.sort_order === undefined
            ? {}
            : { sort_order: dto.sort_order }),
          ...(dto.is_active === undefined ? {} : { is_active: dto.is_active }),
          ...(dto.translations
            ? {
                translations: {
                  upsert: dto.translations.map((t) => ({
                    where: { category_id_locale: { category_id: id, locale: t.locale } },
                    create: toTranslationData(t),
                    update: toTranslationData(t),
                  })),
                },
              }
            : {}),
        },
        include: CATEGORY_INCLUDE,
      });
      return toCategoryResponse(row);
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw new AppError(
          409,
          'CATEGORY_SLUG_TAKEN',
          `slug "${dto.slug}" უკვე გამოყენებულია`,
        );
      }
      throw error;
    }
  }

  /** წაშლა მხოლოდ მაშინ, თუ არც ქვეკატეგორიები აქვს, არც პროდუქტები */
  async remove(id: string): Promise<void> {
    await this.assertCategoryExists(id);

    const [children, products] = await Promise.all([
      this.prisma.category.count({ where: { parent_id: id } }),
      this.prisma.product.count({ where: { category_id: id } }),
    ]);

    if (children > 0 || products > 0) {
      throw new AppError(
        409,
        'CATEGORY_NOT_EMPTY',
        `კატეგორია არ იშლება: ${children} ქვეკატეგორია, ${products} პროდუქტი`,
        [{ children, products }],
      );
    }

    await this.prisma.category.delete({ where: { id } });
  }

  private async assertCategoryExists(id: string): Promise<void> {
    const found = await this.prisma.category.findUnique({
      where: { id },
      select: { id: true },
    });
    if (!found) {
      throw new AppError(404, 'CATEGORY_NOT_FOUND', `კატეგორია ${id} ვერ მოიძებნა`);
    }
  }

  /** კატეგორია საკუთარი შვილის ქვეშ ვერ გადავა (ხე არ უნდა ჩაიკეტოს წრედ) */
  private async assertNoCycle(id: string, parentId: string): Promise<void> {
    let cursor: string | null = parentId;
    const seen = new Set<string>();

    while (cursor) {
      if (cursor === id) {
        throw new AppError(
          409,
          'CATEGORY_CYCLE',
          'კატეგორია საკუთარ ქვეკატეგორიაში ვერ გადავა',
        );
      }
      if (seen.has(cursor)) break;
      seen.add(cursor);

      const parent: { parent_id: string | null } | null =
        await this.prisma.category.findUnique({
          where: { id: cursor },
          select: { parent_id: true },
        });
      cursor = parent?.parent_id ?? null;
    }
  }
}

function toTranslationData(t: CategoryTranslationDto): {
  locale: string;
  name: string;
  description: string | null;
  seo_title: string | null;
  seo_description: string | null;
} {
  return {
    locale: t.locale,
    name: t.name,
    description: t.description ?? null,
    seo_title: t.seo_title ?? null,
    seo_description: t.seo_description ?? null,
  };
}

function requireDefaultLocale(translations: CategoryTranslationDto[]): void {
  if (!translations.some((t) => t.locale === DEFAULT_LOCALE)) {
    throw new AppError(
      422,
      'TRANSLATION_REQUIRED',
      `"${DEFAULT_LOCALE}" თარგმანი სავალდებულოა`,
    );
  }
}

function toCategoryResponse(row: CategoryRow): CategoryResponse {
  return {
    id: row.id,
    parent_id: row.parent_id,
    slug: row.slug,
    sort_order: row.sort_order,
    is_active: row.is_active,
    translations: row.translations.map((t) => ({
      locale: t.locale as CategoryResponse['translations'][number]['locale'],
      name: t.name,
      description: t.description,
      seo_title: t.seo_title,
      seo_description: t.seo_description,
    })),
    product_count: row._count.products,
    created_at: row.created_at.toISOString(),
    updated_at: row.updated_at.toISOString(),
  };
}
