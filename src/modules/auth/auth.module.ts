import { Module } from '@nestjs/common';
import { AdminGuard } from './admin.guard.js';

/**
 * ავტორიზაცია. ამჟამად მხოლოდ `AdminGuard`-ია (იხ. მისი კომენტარი — დროებითი რეჟიმი).
 * Identity-ის პასუხის შემდეგ აქვე დაემატება JWKS-ის კლიენტი და ტოკენის ვერიფიკაცია.
 */
@Module({
  providers: [AdminGuard],
  exports: [AdminGuard],
})
export class AuthModule {}
