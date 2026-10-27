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
import { ChargerBrandsService } from './charger-brands.service.js';
import {
  ChargerBrandListResponse,
  ChargerBrandResponse,
  CreateChargerBrandDto,
  ListChargerBrandsQueryDto,
  UpdateChargerBrandDto,
} from './dto/charger-brand.dto.js';

/** docs/05-api.md §4 → „კატალოგი“: `/admin/charger-brands` (editor+) */
@ApiTags('admin/compatibility')
@ApiBearerAuth()
@Controller('admin/charger-brands')
@UseGuards(AdminGuard)
@Roles(...CATALOG_EDITOR_ROLES)
export class AdminChargerBrandsController {
  constructor(private readonly brands: ChargerBrandsService) {}

  @Get()
  @ApiOperation({ summary: 'დამტენის ბრენდების სია' })
  @ApiOkResponse({ type: ChargerBrandListResponse })
  list(
    @Query() query: ListChargerBrandsQueryDto,
  ): Promise<ChargerBrandListResponse> {
    return this.brands.list(query);
  }

  @Get(':id')
  @ApiOperation({ summary: 'ერთი ბრენდი' })
  @ApiOkResponse({ type: ChargerBrandResponse })
  getById(
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<ChargerBrandResponse> {
    return this.brands.getById(id);
  }

  @Post()
  @ApiOperation({ summary: 'ახალი ბრენდი' })
  @ApiCreatedResponse({ type: ChargerBrandResponse })
  create(@Body() dto: CreateChargerBrandDto): Promise<ChargerBrandResponse> {
    return this.brands.create(dto);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'ბრენდის შეცვლა' })
  @ApiOkResponse({ type: ChargerBrandResponse })
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateChargerBrandDto,
  ): Promise<ChargerBrandResponse> {
    return this.brands.update(id, dto);
  }

  @Delete(':id')
  @HttpCode(204)
  @ApiOperation({
    summary: 'ბრენდის წაშლა',
    description:
      'იშლება მხოლოდ ბრენდი მოდელების გარეშე, თორემ `409 CHARGER_BRAND_NOT_EMPTY`. დროებით დასამალად გამოიყენე `is_active: false`.',
  })
  @ApiNoContentResponse()
  remove(@Param('id', ParseUUIDPipe) id: string): Promise<void> {
    return this.brands.remove(id);
  }
}
