import {
  Body,
  Controller,
  Get,
  HttpCode,
  Post,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiConsumes,
  ApiCookieAuth,
  ApiNoContentResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import type { Request, Response } from 'express';
import { AppError } from '../../common/filters/problem-details.filter.js';
import type { Env } from '../../config/env.js';
import { AdminGuard, type RequestWithAdmin } from './admin.guard.js';
import {
  clearAuthCookies,
  readCookie,
  REFRESH_COOKIE,
  setAuthCookies,
} from './auth.cookies.js';
import {
  AuthService,
  type ClientInfo,
  type IssuedTokens,
} from './auth.service.js';
import { CurrentAdmin } from './current-admin.decorator.js';
import {
  AdminUserResponse,
  ChangePasswordDto,
  LoginDto,
  OAuthErrorResponse,
  SessionResponse,
  TokenRequestDto,
  TokenResponse,
} from './dto/auth.dto.js';
import type { AdminPrincipal } from './auth.service.js';
import { ANY_ROLE, Roles } from './roles.js';

/**
 * ადმინკის ავტორიზაცია.
 *
 * - ბრაუზერი (ადმინკა): `login` / `refresh` / `logout` — ტოკენები httpOnly cookie-ში.
 * - სხვა კლიენტები (Postman, სკრიპტები, სერვისები): `POST /v1/auth/token` — OAuth 2.0
 *   (`password` და `refresh_token` grant), ტოკენი პასუხში, შემდეგ `Authorization: Bearer`.
 */
@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly config: ConfigService<Env, true>,
  ) {}

  private get secureCookies(): boolean {
    return (
      this.config.get('COOKIE_SECURE', { infer: true }) ??
      this.config.get('NODE_ENV', { infer: true }) !== 'development'
    );
  }

  @Post('login')
  @HttpCode(200)
  @ApiOperation({
    summary: 'შესვლა (ბრაუზერი)',
    description:
      'ტოკენებს httpOnly cookie-ებად აყენებს. შეცდომები: `401 INVALID_CREDENTIALS`, `403 ACCOUNT_DISABLED`, `429 ACCOUNT_LOCKED` (5 წარუმატებელი ცდის შემდეგ 15 წუთით).',
  })
  @ApiOkResponse({ type: SessionResponse })
  async login(
    @Body() dto: LoginDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<SessionResponse> {
    const tokens = await this.auth.login(
      dto.email,
      dto.password,
      clientInfo(req),
    );
    return this.startSession(res, tokens);
  }

  @Post('refresh')
  @HttpCode(200)
  @ApiOperation({
    summary: 'სესიის განახლება (ბრაუზერი)',
    description:
      'refresh cookie-ით გასცემს ახალ წყვილს; ძველი refresh token უქმდება. `401 INVALID_REFRESH_TOKEN`',
  })
  @ApiOkResponse({ type: SessionResponse })
  async refresh(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<SessionResponse> {
    const token = readCookie(req, REFRESH_COOKIE);
    if (!token)
      throw new AppError(
        401,
        'INVALID_REFRESH_TOKEN',
        'სესია ამოიწურა. შედი თავიდან',
      );
    try {
      const tokens = await this.auth.refresh(token, clientInfo(req));
      return this.startSession(res, tokens);
    } catch (error) {
      if (error instanceof AppError && error.code === 'INVALID_REFRESH_TOKEN') {
        clearAuthCookies(res, this.secureCookies);
      }
      throw error;
    }
  }

  @Post('logout')
  @HttpCode(204)
  @ApiOperation({
    summary: 'გასვლა',
    description: 'სესია უქმდება, cookie-ები იშლება. ყოველთვის 204',
  })
  @ApiNoContentResponse()
  async logout(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<void> {
    await this.auth.logout(readCookie(req, REFRESH_COOKIE));
    clearAuthCookies(res, this.secureCookies);
  }

  @Get('me')
  @UseGuards(AdminGuard)
  @Roles(...ANY_ROLE)
  @ApiBearerAuth()
  @ApiCookieAuth()
  @ApiOperation({ summary: 'მიმდინარე მომხმარებელი' })
  @ApiOkResponse({ type: AdminUserResponse })
  me(@CurrentAdmin() admin: AdminPrincipal): Promise<AdminUserResponse> {
    return this.auth.me(admin.id);
  }

  @Post('password')
  @HttpCode(200)
  @UseGuards(AdminGuard)
  @Roles(...ANY_ROLE)
  @ApiBearerAuth()
  @ApiCookieAuth()
  @ApiOperation({
    summary: 'საკუთარი პაროლის შეცვლა',
    description: 'ყველა სხვა სესია უქმდება. `422 INVALID_CURRENT_PASSWORD`',
  })
  @ApiOkResponse({ type: SessionResponse })
  async changePassword(
    @Body() dto: ChangePasswordDto,
    @Req() req: RequestWithAdmin,
    @Res({ passthrough: true }) res: Response,
  ): Promise<SessionResponse> {
    const tokens = await this.auth.changePassword(
      req.admin!.id,
      dto.current_password,
      dto.new_password,
      clientInfo(req),
    );
    return this.startSession(res, tokens);
  }

  @Post('token')
  @HttpCode(200)
  @ApiConsumes('application/x-www-form-urlencoded', 'application/json')
  @ApiOperation({
    summary: 'OAuth 2.0 token endpoint',
    description:
      '`grant_type=password` (username + password) ან `grant_type=refresh_token`. პასუხი და შეცდომები RFC 6749-ის ფორმატშია (არა problem+json).',
  })
  @ApiOkResponse({ type: TokenResponse })
  @ApiBadRequestResponse({ type: OAuthErrorResponse })
  async token(
    @Body() dto: TokenRequestDto,
    @Req() req: Request,
    @Res() res: Response,
  ): Promise<void> {
    // RFC 6749 §5.1: ტოკენის პასუხი არ უნდა დაიქეშოს
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('Pragma', 'no-cache');

    const fail = (status: number, error: string, description: string): void => {
      res.status(status).json({ error, error_description: description });
    };

    let tokens: IssuedTokens;
    try {
      if (dto.grant_type === 'password') {
        if (!dto.username || !dto.password) {
          return fail(
            400,
            'invalid_request',
            'username and password are required',
          );
        }
        tokens = await this.auth.login(
          dto.username,
          dto.password,
          clientInfo(req),
        );
      } else if (dto.grant_type === 'refresh_token') {
        if (!dto.refresh_token) {
          return fail(400, 'invalid_request', 'refresh_token is required');
        }
        tokens = await this.auth.refresh(dto.refresh_token, clientInfo(req));
      } else if (!dto.grant_type) {
        return fail(400, 'invalid_request', 'grant_type is required');
      } else {
        return fail(
          400,
          'unsupported_grant_type',
          `grant_type "${dto.grant_type}" is not supported`,
        );
      }
    } catch (error) {
      if (error instanceof AppError && error.getStatus() < 500) {
        return fail(400, 'invalid_grant', error.message);
      }
      throw error;
    }

    const body: TokenResponse = {
      access_token: tokens.access_token,
      token_type: 'Bearer',
      expires_in: tokens.expires_in,
      refresh_token: tokens.refresh_token,
    };
    res.status(200).json(body);
  }

  private startSession(res: Response, tokens: IssuedTokens): SessionResponse {
    setAuthCookies(res, tokens, this.secureCookies);
    res.setHeader('Cache-Control', 'no-store');
    return { user: tokens.user, expires_in: tokens.expires_in };
  }
}

function clientInfo(req: Request): ClientInfo {
  const ua = req.headers['user-agent'];
  return { userAgent: typeof ua === 'string' ? ua : undefined, ip: req.ip };
}
