import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsEmail,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';
import { PASSWORD_MAX_LENGTH, PASSWORD_MIN_LENGTH } from '../password.js';
import { ROLES, type Role } from '../roles.js';

export class LoginDto {
  @ApiProperty({ example: 'superadmin@gmail.com' })
  @IsEmail({}, { message: 'email: არასწორი ელ. ფოსტა' })
  @MaxLength(254)
  email!: string;

  @ApiProperty({ format: 'password' })
  @IsString()
  @MinLength(1)
  @MaxLength(PASSWORD_MAX_LENGTH)
  password!: string;
}

export class ChangePasswordDto {
  @ApiProperty({ format: 'password' })
  @IsString()
  @MaxLength(PASSWORD_MAX_LENGTH)
  current_password!: string;

  @ApiProperty({
    format: 'password',
    minLength: PASSWORD_MIN_LENGTH,
    maxLength: PASSWORD_MAX_LENGTH,
  })
  @IsString()
  @MinLength(PASSWORD_MIN_LENGTH, {
    message: `new_password: მინიმუმ ${PASSWORD_MIN_LENGTH} სიმბოლო`,
  })
  @MaxLength(PASSWORD_MAX_LENGTH)
  new_password!: string;
}

/**
 * OAuth 2.0 token request (RFC 6749 §4.3, §6). იღებს
 * `application/x-www-form-urlencoded`-საც და JSON-საც.
 */
export class TokenRequestDto {
  @ApiProperty({ enum: ['password', 'refresh_token'] })
  @IsOptional()
  @IsString()
  grant_type?: string;

  @ApiPropertyOptional({ description: '`grant_type=password`: ელ. ფოსტა' })
  @IsOptional()
  @IsString()
  @MaxLength(254)
  username?: string;

  @ApiPropertyOptional({
    format: 'password',
    description: '`grant_type=password`',
  })
  @IsOptional()
  @IsString()
  @MaxLength(PASSWORD_MAX_LENGTH)
  password?: string;

  @ApiPropertyOptional({ description: '`grant_type=refresh_token`' })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  refresh_token?: string;

  @ApiPropertyOptional({ description: 'იგნორირდება' })
  @IsOptional()
  @IsString()
  scope?: string;

  @ApiPropertyOptional({ description: 'იგნორირდება (first-party კლიენტი)' })
  @IsOptional()
  @IsString()
  client_id?: string;
}

/** OAuth 2.0 token response (RFC 6749 §5.1) */
export class TokenResponse {
  @ApiProperty() access_token!: string;
  @ApiProperty({ example: 'Bearer' }) token_type!: 'Bearer';
  @ApiProperty({ description: 'access token-ის ვადა, წამებში', example: 900 })
  expires_in!: number;
  @ApiProperty() refresh_token!: string;
}

/** OAuth 2.0 error response (RFC 6749 §5.2) */
export class OAuthErrorResponse {
  @ApiProperty({
    enum: ['invalid_request', 'invalid_grant', 'unsupported_grant_type'],
  })
  error!: string;
  @ApiPropertyOptional() error_description?: string;
}

export class AdminUserResponse {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty() email!: string;
  @ApiProperty({ nullable: true, type: String }) display_name!: string | null;
  @ApiProperty({ enum: ROLES, isArray: true }) roles!: Role[];
  @ApiProperty() is_active!: boolean;
  @ApiProperty({ nullable: true, type: String, format: 'date-time' })
  last_login_at!: string | null;
  @ApiProperty({ format: 'date-time' }) created_at!: string;
  @ApiProperty({ format: 'date-time' }) updated_at!: string;
}

/** ბრაუზერის სესია: ტოკენები cookie-შია, პასუხში მხოლოდ მომხმარებელი */
export class SessionResponse {
  @ApiProperty({ type: AdminUserResponse }) user!: AdminUserResponse;
  @ApiProperty({ description: 'access token-ის ვადა, წამებში' })
  expires_in!: number;
}
