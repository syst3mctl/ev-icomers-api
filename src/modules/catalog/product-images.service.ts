import { Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { AppError } from '../../common/filters/problem-details.filter.js';
import { PrismaService } from '../../infra/prisma/prisma.service.js';
import { StorageService } from '../../infra/storage/storage.service.js';
import type { ProductImageResponse } from './dto/product.dto.js';
import { readImageInfo } from './image-info.js';
import { toImageResponse } from './products.service.js';

/** nginx-ის `client_max_body_size 10m`-ში ეტევა (ev-icomers-admin/nginx.conf.template) */
export const MAX_IMAGE_BYTES = 8 * 1024 * 1024;
export const MAX_IMAGES_PER_PRODUCT = 20;

export type UploadedImageFile = { buffer: Buffer; size: number };

/**
 * პროდუქტის სურათები: ფაილი — საცავში (S3 / ლოკალური დისკი), ჩანაწერი — `product_images`-ში.
 * რიგი (`sort_order`): პირველი სურათი მთავარია (სიაში და storefront-ის ბარათზე).
 */
@Injectable()
export class ProductImagesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
  ) {}

  async upload(
    productId: string,
    file: UploadedImageFile | undefined,
    alt: { ka?: string; en?: string },
  ): Promise<ProductImageResponse> {
    if (!file || file.size === 0) {
      throw new AppError(422, 'IMAGE_REQUIRED', 'ფაილი არ არის (ველი `file`)');
    }
    if (file.size > MAX_IMAGE_BYTES) {
      throw new AppError(413, 'IMAGE_TOO_LARGE', 'სურათი 8 MB-ზე დიდია');
    }
    const info = readImageInfo(file.buffer);
    if (!info) {
      throw new AppError(
        415,
        'IMAGE_TYPE_NOT_SUPPORTED',
        'მხოლოდ JPEG, PNG ან WebP',
      );
    }

    const product = await this.prisma.product.findUnique({
      where: { id: productId },
      select: {
        id: true,
        _count: { select: { images: true } },
        images: { select: { sort_order: true }, orderBy: { sort_order: 'desc' }, take: 1 },
      },
    });
    if (!product) {
      throw new AppError(404, 'PRODUCT_NOT_FOUND', `პროდუქტი ${productId} ვერ მოიძებნა`);
    }
    if (product._count.images >= MAX_IMAGES_PER_PRODUCT) {
      throw new AppError(
        409,
        'TOO_MANY_IMAGES',
        `პროდუქტს მაქსიმუმ ${MAX_IMAGES_PER_PRODUCT} სურათი შეიძლება ჰქონდეს`,
      );
    }

    const key = `products/${productId}/${randomUUID()}.${info.ext}`;
    await this.storage.put(key, file.buffer, info.content_type);

    try {
      const row = await this.prisma.productImage.create({
        data: {
          product_id: productId,
          storage_key: key,
          alt: cleanAlt(alt),
          sort_order: (product.images[0]?.sort_order ?? -1) + 1,
          width: info.width,
          height: info.height,
        },
      });
      return toImageResponse(row);
    } catch (error) {
      await this.storage.delete(key);
      throw error;
    }
  }

  async remove(productId: string, imageId: string): Promise<void> {
    const image = await this.prisma.productImage.findFirst({
      where: { id: imageId, product_id: productId },
      select: { id: true, storage_key: true },
    });
    if (!image) {
      throw new AppError(404, 'IMAGE_NOT_FOUND', `სურათი ${imageId} ვერ მოიძებნა`);
    }
    await this.prisma.productImage.delete({ where: { id: image.id } });
    await this.storage.delete(image.storage_key);
  }

  /** ახალი რიგი; `imageIds` უნდა შეიცავდეს პროდუქტის ყველა სურათს, თითოს ერთხელ */
  async reorder(productId: string, imageIds: string[]): Promise<ProductImageResponse[]> {
    const images = await this.prisma.productImage.findMany({
      where: { product_id: productId },
      select: { id: true },
    });
    if (images.length === 0) {
      const exists = await this.prisma.product.count({ where: { id: productId } });
      if (!exists) {
        throw new AppError(404, 'PRODUCT_NOT_FOUND', `პროდუქტი ${productId} ვერ მოიძებნა`);
      }
    }
    const current = new Set(images.map((i) => i.id));
    const requested = new Set(imageIds);
    if (
      requested.size !== imageIds.length ||
      requested.size !== current.size ||
      imageIds.some((id) => !current.has(id))
    ) {
      throw new AppError(
        422,
        'IMAGE_ORDER_MISMATCH',
        'image_ids-ში უნდა იყოს პროდუქტის ყველა სურათი, თითო ერთხელ',
      );
    }

    await this.prisma.$transaction(
      imageIds.map((id, index) =>
        this.prisma.productImage.update({ where: { id }, data: { sort_order: index } }),
      ),
    );
    const rows = await this.prisma.productImage.findMany({
      where: { product_id: productId },
      orderBy: { sort_order: 'asc' },
    });
    return rows.map(toImageResponse);
  }
}

function cleanAlt(alt: { ka?: string; en?: string }): Record<string, string> {
  const out: Record<string, string> = {};
  if (alt.ka?.trim()) out.ka = alt.ka.trim();
  if (alt.en?.trim()) out.en = alt.en.trim();
  return out;
}
