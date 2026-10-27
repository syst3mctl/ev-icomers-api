import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiNoContentResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { AdminGuard } from '../auth/admin.guard.js';
import { CATALOG_EDITOR_ROLES, Roles } from '../auth/roles.js';
import { ChargerModelsService } from './charger-models.service.js';
import { CompatibilityService } from './compatibility.service.js';
import {
  ChargerModelListResponse,
  ChargerModelResponse,
  CreateChargerModelDto,
  ListChargerModelsQueryDto,
  UpdateChargerModelDto,
} from './dto/charger-model.dto.js';
import {
  AttachProductsDto,
  AttachProductsResponse,
} from './dto/product-compatibility.dto.js';

/** docs/05-api.md §4 → „კატალოგი“: `/admin/charger-models` (editor+) */
@ApiTags('admin/compatibility')
@ApiBearerAuth()
@Controller('admin/charger-models')
@UseGuards(AdminGuard)
@Roles(...CATALOG_EDITOR_ROLES)
export class AdminChargerModelsController {
  constructor(
    private readonly models: ChargerModelsService,
    private readonly compatibility: CompatibilityService,
  ) {}

  @Get()
  @ApiOperation({ summary: 'დამტენის მოდელების სია' })
  @ApiOkResponse({ type: ChargerModelListResponse })
  list(
    @Query() query: ListChargerModelsQueryDto,
  ): Promise<ChargerModelListResponse> {
    return this.models.list(query);
  }

  @Get(':id')
  @ApiOperation({ summary: 'ერთი მოდელი' })
  @ApiOkResponse({ type: ChargerModelResponse })
  getById(
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<ChargerModelResponse> {
    return this.models.getById(id);
  }

  @Post()
  @ApiOperation({ summary: 'ახალი მოდელი' })
  @ApiCreatedResponse({ type: ChargerModelResponse })
  create(@Body() dto: CreateChargerModelDto): Promise<ChargerModelResponse> {
    return this.models.create(dto);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'მოდელის შეცვლა' })
  @ApiOkResponse({ type: ChargerModelResponse })
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateChargerModelDto,
  ): Promise<ChargerModelResponse> {
    return this.models.update(id, dto);
  }

  @Delete(':id')
  @HttpCode(204)
  @ApiOperation({
    summary: 'მოდელის წაშლა',
    description:
      'მიბმულ მოდელზე პასუხია `409 CHARGER_MODEL_IN_USE`: ჯერ მოხსენი კავშირები ან გამორთე (`is_active: false`).',
  })
  @ApiNoContentResponse()
  remove(@Param('id', ParseUUIDPipe) id: string): Promise<void> {
    return this.models.remove(id);
  }

  @Post(':id/products')
  @ApiOperation({
    summary: 'ერთ მოდელზე ბევრი პროდუქტის მიბმა',
    description:
      'არსებული კავშირები არ იშლება; განმეორებითი გამოძახება უვნებელია. ' +
      'პასუხში `added` — ახალი კავშირები, `skipped` — უკვე არსებული.',
  })
  @ApiCreatedResponse({ type: AttachProductsResponse })
  attachProducts(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: AttachProductsDto,
  ): Promise<AttachProductsResponse> {
    return this.compatibility.attachProducts(id, dto);
  }

  @Delete(':id/products/:product_id')
  @HttpCode(204)
  @ApiOperation({ summary: 'ერთი პროდუქტის მოხსნა მოდელიდან' })
  @ApiNoContentResponse()
  detachProduct(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('product_id', ParseUUIDPipe) productId: string,
  ): Promise<void> {
    return this.compatibility.detachProduct(id, productId);
  }
}
