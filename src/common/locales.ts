/** თარგმნადი ველების ენები (SYSTEM.md §4). `ka` ნაგულისხმევია. */
export const LOCALES = ['ka', 'en'] as const;

export type Locale = (typeof LOCALES)[number];

/** ენა, რომლის თარგმანის გარეშე ჩანაწერი არ იქმნება */
export const DEFAULT_LOCALE: Locale = 'ka';
