import {
  Controller,
  Get,
  Header,
  Param,
  ParseUUIDPipe,
  StreamableFile,
} from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiProduces, ApiTags } from '@nestjs/swagger';
import { AppError } from '../../common/filters/problem-details.filter.js';
import { StorageService } from '../../infra/storage/storage.service.js';
import { PRODUCT_IMAGE_FILE } from './media-url.js';

/**
 * საჯარო სურათები (ავტორიზაციის გარეშე — პროდუქტის ფოტო საიდუმლო არ არის).
 * ფაილის სახელი უნიკალური uuid-ია და არასდროს იცვლება, ამიტომ ბრაუზერი და CDN
 * მას სამუდამოდ ინახავს ქეშში.
 */
@ApiTags('media')
@Controller('media')
export class MediaController {
  constructor(private readonly storage: StorageService) {}

  @Get('products/:product_id/:file')
  @ApiOperation({ summary: 'პროდუქტის სურათი' })
  @ApiProduces('image/jpeg', 'image/png', 'image/webp')
  @ApiOkResponse({ schema: { type: 'string', format: 'binary' } })
  @Header('Cache-Control', 'public, max-age=31536000, immutable')
  @Header('X-Content-Type-Options', 'nosniff')
  async productImage(
    @Param('product_id', ParseUUIDPipe) productId: string,
    @Param('file') file: string,
  ): Promise<StreamableFile> {
    if (!PRODUCT_IMAGE_FILE.test(file)) throw notFound();
    const object = await this.storage.get(`products/${productId}/${file}`);
    if (!object) throw notFound();
    return new StreamableFile(object.body, {
      type: object.content_type,
      length: object.content_length,
    });
  }
}

function notFound(): AppError {
  return new AppError(404, 'MEDIA_NOT_FOUND', 'ფაილი ვერ მოიძებნა');
}
