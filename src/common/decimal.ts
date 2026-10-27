/**
 * Prisma-ს `Decimal` → `number`, რომ JSON-ში ჩვეულებრივი რიცხვი გავიდეს.
 *
 * მხოლოდ **არა-ფულადი** მნიშვნელობებისთვის (მაგ. `power_kw`): თანხა ყველგან
 * მთელი რიცხვია თეთრებში და `Decimal`-ად არ ინახება (SYSTEM.md §4).
 */
export function decimalToNumber(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  const n = Number(value);
  return Number.isNaN(n) ? null : n;
}
