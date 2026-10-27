import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Put,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { AdminGuard } from '../auth/admin.guard.js';
import { CATALOG_EDITOR_ROLES, Roles } from '../auth/roles.js';
import { CompatibilityService } from './compatibility.service.js';
import {
  ProductCompatibilityResponse,
  SetProductCompatibilityDto,
} from './dto/product-compatibility.dto.js';

/**
 * docs/05-api.md §4 → `/admin/products/{id}/compatibility` (editor+).
 *
 * prefix კატალოგის controller-ის ტოლია, მოდული კი სხვა: თავსებადობის ცხრილს
 * მხოლოდ ეს მოდული ეხება (CLAUDE.md → „მოდულები“).
 */
@ApiTags('admin/compatibility')
@ApiBearerAuth()
@Controller('admin/products')
@UseGuards(AdminGuard)
@Roles(...CATALOG_EDITOR_ROLES)
export class AdminProductCompatibilityController {
  constructor(private readonly compatibility: CompatibilityService) {}

  @Get(':id/compatibility')
  @ApiOperation({ summary: 'პროდუქტის თავსებადი დამტენის მოდელები' })
  @ApiOkResponse({ type: ProductCompatibilityResponse })
  get(
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<ProductCompatibilityResponse> {
    return this.compatibility.getForProduct(id);
  }

  @Put(':id/compatibility')
  @ApiOperation({
    summary: 'თავსებადი მოდელების სიის ჩანაცვლება',
    description:
      'სია **მთლიანად ჩაენაცვლება**: რაც `model_ids`-ში არ არის, წაიშლება. ' +
      '`[]` ყველა კავშირს შლის.',
  })
  @ApiOkResponse({ type: ProductCompatibilityResponse })
  set(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: SetProductCompatibilityDto,
  ): Promise<ProductCompatibilityResponse> {
    return this.compatibility.setForProduct(id, dto);
  }
}
