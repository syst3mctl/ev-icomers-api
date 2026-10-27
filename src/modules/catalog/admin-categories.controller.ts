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
import { PageQueryDto } from '../../common/dto/page-query.dto.js';
import { AdminGuard } from '../auth/admin.guard.js';
import { CATALOG_EDITOR_ROLES, Roles } from '../auth/roles.js';
import { CategoriesService } from './categories.service.js';
import {
  CategoryListResponse,
  CategoryResponse,
  CreateCategoryDto,
  UpdateCategoryDto,
} from './dto/category.dto.js';

/** docs/05-api.md §4 → „კატალოგი“: `/admin/categories` (editor+) */
@ApiTags('admin/catalog')
@ApiBearerAuth()
@Controller('admin/categories')
@UseGuards(AdminGuard)
@Roles(...CATALOG_EDITOR_ROLES)
export class AdminCategoriesController {
  constructor(private readonly categories: CategoriesService) {}

  @Get()
  @ApiOperation({ summary: 'კატეგორიების სია' })
  @ApiOkResponse({ type: CategoryListResponse })
  list(@Query() query: PageQueryDto): Promise<CategoryListResponse> {
    return this.categories.list(query);
  }

  @Get(':id')
  @ApiOperation({ summary: 'ერთი კატეგორია' })
  @ApiOkResponse({ type: CategoryResponse })
  getById(
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<CategoryResponse> {
    return this.categories.getById(id);
  }

  @Post()
  @ApiOperation({ summary: 'ახალი კატეგორია' })
  @ApiCreatedResponse({ type: CategoryResponse })
  create(@Body() dto: CreateCategoryDto): Promise<CategoryResponse> {
    return this.categories.create(dto);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'კატეგორიის შეცვლა' })
  @ApiOkResponse({ type: CategoryResponse })
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateCategoryDto,
  ): Promise<CategoryResponse> {
    return this.categories.update(id, dto);
  }

  @Delete(':id')
  @HttpCode(204)
  @ApiOperation({
    summary: 'კატეგორიის წაშლა',
    description:
      'იშლება მხოლოდ ცარიელი კატეგორია. წინააღმდეგ შემთხვევაში `409 CATEGORY_NOT_EMPTY`.',
  })
  @ApiNoContentResponse()
  remove(@Param('id', ParseUUIDPipe) id: string): Promise<void> {
    return this.categories.remove(id);
  }
}
