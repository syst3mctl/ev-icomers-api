import {
  Body,
  Controller,
  Get,
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
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { AdminGuard } from '../auth/admin.guard.js';
import { CATALOG_EDITOR_ROLES, Roles } from '../auth/roles.js';
import { ListProductsQueryDto } from './dto/list-products.query.dto.js';
import {
  CreateProductDto,
  ProductListResponse,
  ProductResponse,
  UpdateProductDto,
} from './dto/product.dto.js';
import { ProductsService } from './products.service.js';

/** docs/05-api.md §4 → „კატალოგი“: `/admin/products` (editor+) */
@ApiTags('admin/catalog')
@ApiBearerAuth()
@Controller('admin/products')
@UseGuards(AdminGuard)
@Roles(...CATALOG_EDITOR_ROLES)
export class AdminProductsController {
  constructor(private readonly products: ProductsService) {}

  @Get()
  @ApiOperation({ summary: 'პროდუქტების სია ფილტრებით' })
  @ApiOkResponse({ type: ProductListResponse })
  list(@Query() query: ListProductsQueryDto): Promise<ProductListResponse> {
    return this.products.list(query);
  }

  @Get(':id')
  @ApiOperation({ summary: 'ერთი პროდუქტი: თარგმანები და სურათები' })
  @ApiOkResponse({ type: ProductResponse })
  getById(@Param('id', ParseUUIDPipe) id: string): Promise<ProductResponse> {
    return this.products.getById(id);
  }

  @Post()
  @ApiOperation({ summary: 'ახალი პროდუქტი' })
  @ApiCreatedResponse({ type: ProductResponse })
  create(@Body() dto: CreateProductDto): Promise<ProductResponse> {
    return this.products.create(dto);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'პროდუქტის შეცვლა' })
  @ApiOkResponse({ type: ProductResponse })
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateProductDto,
  ): Promise<ProductResponse> {
    return this.products.update(id, dto);
  }

  @Post(':id/archive')
  @ApiOperation({
    summary: 'არქივში გადატანა',
    description:
      'პროდუქტი არ იშლება — მასზე შეკვეთები და მარაგის ისტორია შეიძლება იყოს მიბმული.',
  })
  @ApiOkResponse({ type: ProductResponse })
  archive(@Param('id', ParseUUIDPipe) id: string): Promise<ProductResponse> {
    return this.products.archive(id);
  }
}
