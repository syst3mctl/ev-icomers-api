import { Controller, Get, Param, ParseUUIDPipe } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { TAGS } from '../../openapi-tags.js';
import { PublicBrand, PublicChargerModel } from './dto/storefront.dto.js';
import { StorefrontService } from './storefront.service.js';

/** „აირჩიე შენი დამტენი“ — docs/05-api.md §2 */
@ApiTags(TAGS.publicCompatibility)
@Controller('compatibility')
export class PublicCompatibilityController {
  constructor(private readonly storefront: StorefrontService) {}

  @Get('brands')
  @ApiOperation({ summary: 'დამტენის ბრენდები (აქტიური)' })
  @ApiOkResponse({ type: [PublicBrand] })
  brands(): Promise<PublicBrand[]> {
    return this.storefront.brands();
  }

  @Get('brands/:brand_slug/models')
  @ApiOperation({
    summary: 'ბრენდის მოდელები',
    description:
      'მოდელის `id` გადაეცემა `GET /v1/catalog/products?charger_model=<id>`-ს.',
  })
  @ApiOkResponse({ type: [PublicChargerModel] })
  models(
    @Param('brand_slug') brandSlug: string,
  ): Promise<PublicChargerModel[]> {
    return this.storefront.brandModels(brandSlug);
  }

  @Get('models/:id')
  @ApiOperation({ summary: 'ერთი მოდელი (მაგ. შენახული დამტენის საჩვენებლად)' })
  @ApiOkResponse({ type: PublicChargerModel })
  model(@Param('id', ParseUUIDPipe) id: string): Promise<PublicChargerModel> {
    return this.storefront.model(id);
  }
}
