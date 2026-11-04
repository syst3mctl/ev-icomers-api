import { Controller, Get, Query } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { TAGS } from '../../openapi-tags.js';
import {
  SearchSuggestQueryDto,
  SearchSuggestResponse,
} from './dto/storefront.dto.js';
import { StorefrontService } from './storefront.service.js';

@ApiTags(TAGS.publicSearch)
@Controller('search')
export class PublicSearchController {
  constructor(private readonly storefront: StorefrontService) {}

  @Get('suggest')
  @ApiOperation({
    summary: 'ავტოშევსება ძებნის ველისთვის',
    description:
      'მინიმუმ 2 სიმბოლო. 5 პროდუქტი, 3 კატეგორია, 5 დამტენის მოდელი. ' +
      'სრული შედეგები — `GET /v1/catalog/products?q=...`.',
  })
  @ApiOkResponse({ type: SearchSuggestResponse })
  suggest(
    @Query() query: SearchSuggestQueryDto,
  ): Promise<SearchSuggestResponse> {
    return this.storefront.suggest(query.q, query.locale);
  }
}
