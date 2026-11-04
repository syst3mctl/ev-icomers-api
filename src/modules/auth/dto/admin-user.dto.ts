import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  ArrayMinSize,
  ArrayUnique,
  IsArray,
  IsBoolean,
  IsEmail,
  IsIn,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';
import { PASSWORD_MAX_LENGTH, PASSWORD_MIN_LENGTH } from '../password.js';
import { ROLES, type Role } from '../roles.js';
import { AdminUserResponse } from './auth.dto.js';

export class CreateAdminUserDto {
  @ApiProperty({ example: 'editor@example.com' })
  @IsEmail({}, { message: 'email: არასწორი ელ. ფოსტა' })
  @MaxLength(254)
  email!: string;

  @ApiProperty({
    format: 'password',
    minLength: PASSWORD_MIN_LENGTH,
    maxLength: PASSWORD_MAX_LENGTH,
  })
  @IsString()
  @MinLength(PASSWORD_MIN_LENGTH, {
    message: `password: მინიმუმ ${PASSWORD_MIN_LENGTH} სიმბოლო`,
  })
  @MaxLength(PASSWORD_MAX_LENGTH)
  password!: string;

  @ApiPropertyOptional({ nullable: true, type: String, maxLength: 120 })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  display_name?: string | null;

  @ApiProperty({ enum: ROLES, isArray: true, example: ['content_editor'] })
  @IsArray()
  @ArrayMinSize(1, { message: 'roles: მინიმუმ ერთი როლი' })
  @ArrayUnique()
  @IsIn(ROLES, { each: true })
  roles!: Role[];
}

/** ყველა ველი არასავალდებულოა. `password` — ახალი პაროლის დაყენება; ყველა სესია უქმდება */
export class UpdateAdminUserDto {
  @ApiPropertyOptional({ nullable: true, type: String, maxLength: 120 })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  display_name?: string | null;

  @ApiPropertyOptional({ enum: ROLES, isArray: true })
  @IsOptional()
  @IsArray()
  @ArrayMinSize(1, { message: 'roles: მინიმუმ ერთი როლი' })
  @ArrayUnique()
  @IsIn(ROLES, { each: true })
  roles?: Role[];

  @ApiPropertyOptional({
    description: '`false` — ანგარიში ითიშება, სესიები უქმდება',
  })
  @IsOptional()
  @IsBoolean()
  is_active?: boolean;

  @ApiPropertyOptional({
    format: 'password',
    minLength: PASSWORD_MIN_LENGTH,
    maxLength: PASSWORD_MAX_LENGTH,
  })
  @IsOptional()
  @IsString()
  @MinLength(PASSWORD_MIN_LENGTH, {
    message: `password: მინიმუმ ${PASSWORD_MIN_LENGTH} სიმბოლო`,
  })
  @MaxLength(PASSWORD_MAX_LENGTH)
  password?: string;
}

export class AdminUserListResponse {
  @ApiProperty({ type: [AdminUserResponse] }) items!: AdminUserResponse[];
  @ApiProperty() page!: number;
  @ApiProperty() page_size!: number;
  @ApiProperty() total!: number;
}
