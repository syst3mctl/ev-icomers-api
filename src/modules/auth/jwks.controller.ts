import { Controller, Get, Header, VERSION_NEUTRAL } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { TokenService } from './token.service.js';
import { TAGS } from '../../openapi-tags.js';

/** access token-ის საჯარო გასაღები (RFC 7517) — სხვა სერვისებს შეუძლიათ ტოკენი თავად შეამოწმონ */
@ApiTags(TAGS.auth)
@Controller({ path: '.well-known', version: VERSION_NEUTRAL })
export class JwksController {
  constructor(private readonly tokens: TokenService) {}

  @Get('jwks.json')
  @Header('Cache-Control', 'public, max-age=300')
  @ApiOperation({ summary: 'JWKS — JWT-ის შესამოწმებელი საჯარო გასაღები' })
  @ApiOkResponse({ description: '`{ keys: [...] }`' })
  jwks(): Promise<{ keys: object[] }> {
    return this.tokens.jwks();
  }
}
