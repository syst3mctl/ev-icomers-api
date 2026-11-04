import { describe, expect, it, vi } from 'vitest';
import { AppError } from '../../common/filters/problem-details.filter.js';
import type { PrismaService } from '../../infra/prisma/prisma.service.js';
import type { StorageService } from '../../infra/storage/storage.service.js';
import {
  MAX_IMAGE_BYTES,
  ProductImagesService,
} from './product-images.service.js';

const PRODUCT_ID = '11111111-1111-4111-8111-111111111111';
// 3×2 PNG
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAMAAAACCAIAAAASFvFNAAAAFElEQVR4XmM8ISfHAAZMEIqBgQEAEy4BCG2NhtEAAAAASUVORK5CYII=',
  'base64',
);

function setup(
  over: {
    product?: unknown;
    create?: () => Promise<unknown>;
    images?: { id: string }[];
  } = {},
) {
  const storage = { put: vi.fn(async () => {}), delete: vi.fn(async () => {}) };
  const update = vi.fn(async () => ({}));
  const prisma = {
    product: {
      findUnique: async () =>
        over.product === undefined
          ? {
              id: PRODUCT_ID,
              _count: { images: 1 },
              images: [{ sort_order: 4 }],
            }
          : over.product,
      count: async () => 1,
    },
    productImage: {
      create:
        over.create ??
        (async ({ data }: { data: Record<string, unknown> }) => ({
          id: 'img-1',
          ...data,
        })),
      findMany: async () => over.images ?? [],
      findFirst: async () => null,
      update,
    },
    $transaction: async (ops: unknown[]) => ops,
  } as unknown as PrismaService;
  return {
    service: new ProductImagesService(
      prisma,
      storage as unknown as StorageService,
    ),
    storage,
    update,
  };
}

async function code(promise: Promise<unknown>): Promise<string> {
  try {
    await promise;
  } catch (error) {
    return error instanceof AppError
      ? `${error.getStatus()} ${error.code}`
      : String(error);
  }
  return 'ok';
}

describe('ProductImagesService.upload', () => {
  it('PNG → საცავში იწერება, ბაზაში ზომით, რიგის ბოლოს', async () => {
    const { service, storage } = setup();
    const image = await service.upload(
      PRODUCT_ID,
      { buffer: PNG, size: PNG.length },
      { ka: ' კაბელი ', en: '' },
    );

    expect(storage.put).toHaveBeenCalledOnce();
    const [key, , type] = storage.put.mock.calls[0] as unknown as [
      string,
      Buffer,
      string,
    ];
    expect(key).toMatch(
      new RegExp(`^products/${PRODUCT_ID}/[0-9a-f-]{36}\\.png$`),
    );
    expect(type).toBe('image/png');
    expect(image).toMatchObject({
      storage_key: key,
      url: `/v1/media/${key}`,
      sort_order: 5,
      width: 3,
      height: 2,
      alt: { ka: 'კაბელი' },
    });
  });

  it('ფაილის გარეშე → 422 IMAGE_REQUIRED', async () => {
    expect(await code(setup().service.upload(PRODUCT_ID, undefined, {}))).toBe(
      '422 IMAGE_REQUIRED',
    );
  });

  it('8 MB-ზე დიდი → 413 IMAGE_TOO_LARGE', async () => {
    const big = { buffer: PNG, size: MAX_IMAGE_BYTES + 1 };
    expect(await code(setup().service.upload(PRODUCT_ID, big, {}))).toBe(
      '413 IMAGE_TOO_LARGE',
    );
  });

  it('სურათი არ არის (მაგ. PDF, სახელი .png-ით) → 415, საცავში არაფერი იწერება', async () => {
    const { service, storage } = setup();
    const pdf = Buffer.from('%PDF-1.7');
    expect(
      await code(
        service.upload(PRODUCT_ID, { buffer: pdf, size: pdf.length }, {}),
      ),
    ).toBe('415 IMAGE_TYPE_NOT_SUPPORTED');
    expect(storage.put).not.toHaveBeenCalled();
  });

  it('პროდუქტი არ არსებობს → 404', async () => {
    const { service } = setup({ product: null });
    expect(
      await code(
        service.upload(PRODUCT_ID, { buffer: PNG, size: PNG.length }, {}),
      ),
    ).toBe('404 PRODUCT_NOT_FOUND');
  });

  it('20 სურათი უკვე აქვს → 409 TOO_MANY_IMAGES', async () => {
    const { service } = setup({
      product: { id: PRODUCT_ID, _count: { images: 20 }, images: [] },
    });
    expect(
      await code(
        service.upload(PRODUCT_ID, { buffer: PNG, size: PNG.length }, {}),
      ),
    ).toBe('409 TOO_MANY_IMAGES');
  });

  it('ბაზაში ჩაწერა ჩავარდა → ატვირთული ფაილი იშლება', async () => {
    const { service, storage } = setup({
      create: async () => {
        throw new Error('db down');
      },
    });
    expect(
      await code(
        service.upload(PRODUCT_ID, { buffer: PNG, size: PNG.length }, {}),
      ),
    ).toContain('db down');
    const [key] = storage.put.mock.calls[0] as unknown as [string];
    expect(storage.delete).toHaveBeenCalledWith(key);
  });
});

describe('ProductImagesService.reorder', () => {
  const a = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
  const b = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';

  it('ყველა სურათი ახალი რიგით → sort_order 0, 1', async () => {
    const { service, update } = setup({ images: [{ id: a }, { id: b }] });
    await service.reorder(PRODUCT_ID, [b, a]);
    expect(
      update.mock.calls.map(
        (c) => (c as unknown as [{ where: unknown; data: unknown }])[0],
      ),
    ).toEqual([
      { where: { id: b }, data: { sort_order: 0 } },
      { where: { id: a }, data: { sort_order: 1 } },
    ]);
  });

  it.each([
    ['აკლია', [a]],
    ['ორჯერ', [a, a]],
    ['სხვისი', [a, 'cccccccc-cccc-4ccc-8ccc-cccccccccccc']],
  ])('სია არ ემთხვევა (%s) → 422 IMAGE_ORDER_MISMATCH', async (_, ids) => {
    const { service } = setup({ images: [{ id: a }, { id: b }] });
    expect(await code(service.reorder(PRODUCT_ID, ids))).toBe(
      '422 IMAGE_ORDER_MISMATCH',
    );
  });
});
