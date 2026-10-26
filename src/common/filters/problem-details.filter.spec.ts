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

  it('hides unknown errors', () => {
    expect(filter.toProblem(new Error('secret'))).toEqual({
      type: 'about:blank#internal_error',
      title: 'Internal Server Error',
      status: 500,
      code: 'INTERNAL_ERROR',
    });
  });
});
