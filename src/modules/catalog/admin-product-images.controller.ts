import {
  Body,
  Controller,
  Delete,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
  Put,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  ApiBearerAuth,
  ApiBody,
  ApiConsumes,
  ApiCreatedResponse,
  ApiNoContentResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { AdminGuard } from '../auth/admin.guard.js';
import { CATALOG_EDITOR_ROLES, Roles } from '../auth/roles.js';
import {
  ProductImageResponse,
  ReorderProductImagesDto,
  UploadProductImageDto,
} from './dto/product.dto.js';
import {
  MAX_IMAGE_BYTES,
  ProductImagesService,
  type UploadedImageFile,
} from './product-images.service.js';

/**
 * პროდუქტის სურათები. ფაილი API-ზე იტვირთება (multipart) — usectl-ის S3 კლასტერის
 * შიგნითაა და ბრაუზერიდან პირდაპირ (presigned URL-ით) მიუწვდომელია.
 */
@ApiTags('admin/catalog')
@ApiBearerAuth()
@Controller('admin/products/:id/images')
@UseGuards(AdminGuard)
@Roles(...CATALOG_EDITOR_ROLES)
export class AdminProductImagesController {
  constructor(private readonly images: ProductImagesService) {}

  @Post()
  @ApiOperation({
    summary: 'სურათის ატვირთვა',
    description:
      'multipart/form-data, ველი `file` (JPEG / PNG / WebP, ≤ 8 MB). ემატება რიგის ბოლოს. ' +
      'შეცდომები: `413 IMAGE_TOO_LARGE`, `415 IMAGE_TYPE_NOT_SUPPORTED`, `409 TOO_MANY_IMAGES`.',
  })
  @ApiConsumes('multipart/form-data')
  @ApiBody({ type: UploadProductImageDto })
  @ApiCreatedResponse({ type: ProductImageResponse })
  @UseInterceptors(
    // ლიმიტი +1 ბაიტით: ზედმეტად დიდ ფაილს multer არ წყვეტს უხეშად — service აბრუნებს გასაგებ შეცდომას
    FileInterceptor('file', { limits: { fileSize: MAX_IMAGE_BYTES + 1, files: 1 } }),
  )
  upload(
    @Param('id', ParseUUIDPipe) id: string,
    @UploadedFile() file: UploadedImageFile | undefined,
    @Body() body: UploadProductImageDto,
  ): Promise<ProductImageResponse> {
    return this.images.upload(id, file, { ka: body.alt_ka, en: body.alt_en });
  }

  @Put('order')
  @ApiOperation({ summary: 'სურათების რიგის შეცვლა (პირველი — მთავარი)' })
  @ApiOkResponse({ type: [ProductImageResponse] })
  reorder(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ReorderProductImagesDto,
  ): Promise<ProductImageResponse[]> {
    return this.images.reorder(id, dto.image_ids);
  }

  @Delete(':image_id')
  @HttpCode(204)
  @ApiOperation({ summary: 'სურათის წაშლა (ბაზიდანაც და საცავიდანაც)' })
  @ApiNoContentResponse()
  remove(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('image_id', ParseUUIDPipe) imageId: string,
  ): Promise<void> {
    return this.images.remove(id, imageId);
  }
}
