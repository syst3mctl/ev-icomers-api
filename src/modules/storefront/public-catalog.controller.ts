import { Controller, Get, Param, Query } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { LocaleQueryDto } from '../../common/dto/locale-query.dto.js';
import { TAGS } from '../../openapi-tags.js';
import {
  PublicCategoryNode,
  PublicProductCard,
  PublicProductDetail,
  PublicProductList,
  PublicProductsQueryDto,
} from './dto/storefront.dto.js';
import { StorefrontService } from './storefront.service.js';

/** docs/05-api.md §2 — საჯარო კატალოგი (ავტორიზაციის გარეშე) */
@ApiTags(TAGS.publicCatalog)
@Controller('catalog')
export class PublicCatalogController {
  constructor(private readonly storefront: StorefrontService) {}

  @Get('categories')
  @ApiOperation({
    summary: 'კატეგორიების ხე',
    description:
      'მხოლოდ აქტიური კატეგორიები. გამორთული კატეგორიის ქვეკატეგორიებიც დამალულია.',
  })
  @ApiOkResponse({ type: [PublicCategoryNode] })
  categories(@Query() query: LocaleQueryDto): Promise<PublicCategoryNode[]> {
    return this.storefront.categoryTree(query.locale);
  }

  @Get('products')
  @ApiOperation({
    summary: 'პროდუქტების სია ფილტრებით',
    description:
      'მხოლოდ `ACTIVE` პროდუქტები აქტიურ კატეგორიაში. ფილტრები ერთმანეთს ემატება (AND). ' +
      '`charger_model` / `charger_brand` — თავსებადი **და** უნივერსალური პროდუქტები. ' +
      'შეცდომები: `404 CATEGORY_NOT_FOUND`, `404 CHARGER_MODEL_NOT_FOUND`, `404 CHARGER_BRAND_NOT_FOUND`, ' +
      '`422 INVALID_PRICE_RANGE`.',
  })
  @ApiOkResponse({ type: PublicProductList })
  products(@Query() query: PublicProductsQueryDto): Promise<PublicProductList> {
    return this.storefront.listProducts(query);
  }

  @Get('products/:slug')
  @ApiOperation({
    summary: 'ერთი პროდუქტი slug-ით',
    description:
      'სურათები, მახასიათებლები, breadcrumbs, თავსებადი დამტენები, მარაგის სტატუსი. ' +
      'მონახაზი / არქივი / გამორთული კატეგორია → `404 PRODUCT_NOT_FOUND`.',
  })
  @ApiOkResponse({ type: PublicProductDetail })
  product(
    @Param('slug') slug: string,
    @Query() query: LocaleQueryDto,
  ): Promise<PublicProductDetail> {
    return this.storefront.productBySlug(slug, query.locale);
  }

  @Get('products/:slug/related')
  @ApiOperation({
    summary: 'მსგავსი პროდუქტები (იმავე კატეგორიიდან, მაქსიმუმ 8)',
  })
  @ApiOkResponse({ type: [PublicProductCard] })
  related(
    @Param('slug') slug: string,
    @Query() query: LocaleQueryDto,
  ): Promise<PublicProductCard[]> {
    return this.storefront.related(slug, query.locale);
  }
}
