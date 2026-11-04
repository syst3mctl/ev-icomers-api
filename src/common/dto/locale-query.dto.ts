import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsOptional } from 'class-validator';
import { DEFAULT_LOCALE, LOCALES, type Locale } from '../locales.js';

/** `?locale=en` — რა ენაზე დაბრუნდეს ტექსტი. თარგმანი თუ არ არის — ქართული */
export class LocaleQueryDto {
  @ApiPropertyOptional({ enum: LOCALES, default: DEFAULT_LOCALE })
  @IsOptional()
  @IsIn(LOCALES)
  locale: Locale = DEFAULT_LOCALE;
}
