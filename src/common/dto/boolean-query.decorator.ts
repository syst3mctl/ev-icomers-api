import { Transform } from 'class-transformer';

/**
 * `?is_active=true` → `true`. query-ში ყველა მნიშვნელობა სტრიქონია, ამიტომ
 * `@Type(() => Boolean)` არ გამოდგება: `Boolean('false')` → `true`.
 *
 * უცნობი მნიშვნელობა უცვლელი გადაეცემა `@IsBoolean()`-ს, რომ პასუხი იყოს `400`,
 * და არა ჩუმად `false`.
 */
export function BooleanQuery(): PropertyDecorator {
  return Transform(({ value }: { value: unknown }) => {
    if (value === undefined || value === '') return undefined;
    if (typeof value === 'boolean') return value;
    if (value === 'true' || value === '1') return true;
    if (value === 'false' || value === '0') return false;
    return value;
  });
}
