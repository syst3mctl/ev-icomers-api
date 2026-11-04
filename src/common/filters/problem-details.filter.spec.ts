import { BadRequestException, NotFoundException } from '@nestjs/common';
import { AppError, ProblemDetailsFilter } from './problem-details.filter.js';

describe('ProblemDetailsFilter', () => {
  const filter = new ProblemDetailsFilter();

  it('maps AppError with its stable code', () => {
    const p = filter.toProblem(
      new AppError(409, 'OUT_OF_STOCK', 'Not enough stock', [
        { product_id: 'x', requested: 3, available: 1 },
      ]),
    );
    expect(p).toMatchObject({
      status: 409,
      code: 'OUT_OF_STOCK',
      detail: 'Not enough stock',
    });
    expect(p.errors).toHaveLength(1);
  });

  it('maps Nest HTTP exceptions', () => {
    expect(filter.toProblem(new NotFoundException('nope'))).toMatchObject({
      status: 404,
      code: 'NOT_FOUND',
      detail: 'nope',
    });
  });

  it('keeps validation messages as errors', () => {
    const p = filter.toProblem(
      new BadRequestException(['name must be a string']),
    );
    expect(p.code).toBe('BAD_REQUEST');
    expect(p.errors).toEqual(['name must be a string']);
  });

  // ბაზის გათიშვა ინფრასტრუქტურის შეცდომაა: 503, რომ ფრონტმა „დროებით
  // მიუწვდომელია“ აჩვენოს და გამეორება სცადოს — და არა ზოგადი 500
  it.each([
    ['ECONNREFUSED', 'driver errno'],
    ['P1001', 'server unreachable'],
    ['P2024', 'pool timeout'],
  ])('maps %s to 503 DATABASE_UNAVAILABLE (%s)', (code) => {
    const p = filter.toProblem(
      Object.assign(new Error('connection failed'), { code }),
    );
    expect(p).toMatchObject({ status: 503, code: 'DATABASE_UNAVAILABLE' });
  });

  // `PrismaClientInitializationError` კოდს `errorCode`-ში ინახავს, არა `code`-ში
  it('recognises initialization errors by errorCode', () => {
    const p = filter.toProblem(
      Object.assign(new Error('init failed'), { errorCode: 'P1001' }),
    );
    expect(p.code).toBe('DATABASE_UNAVAILABLE');
  });

  // Prisma-ს `message` შეიცავს ფაილის გზას და SQL-ის ფრაგმენტს — ეს ფრონტამდე არ უნდა მივიდეს
  it('does not leak the Prisma message', () => {
    const p = filter.toProblem(
      Object.assign(
        new Error('Invalid `prisma.category.findMany()` at /src/x'),
        {
          code: 'ECONNREFUSED',
        },
      ),
    );
    expect(p.detail).not.toContain('prisma.category');
    expect(p.detail).not.toContain('/src/x');
  });

  // სხვა Prisma-ს კოდები მოთხოვნის შეცდომებია და 503-ში არ უნდა ჩავარდეს
  it('leaves other Prisma errors as 500', () => {
    const p = filter.toProblem(
      Object.assign(new Error('unique'), { code: 'P2002' }),
    );
    expect(p).toMatchObject({ status: 500, code: 'INTERNAL_ERROR' });
  });

  it('hides unknown errors', () => {
    expect(filter.toProblem(new Error('secret'))).toEqual({
      type: 'about:blank#internal_error',
      title: 'Internal Server Error',
      status: 500,
      code: 'INTERNAL_ERROR',
    });
  });
});
