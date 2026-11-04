import { Module } from '@nestjs/common';
import { AdminGuard } from './admin.guard.js';
import { AdminUsersController } from './admin-users.controller.js';
import { AdminUsersService } from './admin-users.service.js';
import { AuthController } from './auth.controller.js';
import { AuthService } from './auth.service.js';
import { JwksController } from './jwks.controller.js';
import { TokenService } from './token.service.js';

/**
 * ადმინკის ავტორიზაცია: მომხმარებლები ჩვენს ბაზაში, JWT access token (ES256) +
 * refresh token rotation, httpOnly cookie ბრაუზერისთვის, OAuth 2.0 token endpoint
 * სხვა კლიენტებისთვის. გადაწყვეტილება: PROJECT.md §6 (2026-11-04).
 */
@Module({
  controllers: [AuthController, JwksController, AdminUsersController],
  providers: [TokenService, AuthService, AdminUsersService, AdminGuard],
  exports: [AdminGuard, TokenService, AuthService],
})
export class AuthModule {}
