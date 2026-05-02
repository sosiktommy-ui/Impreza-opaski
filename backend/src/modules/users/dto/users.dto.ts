import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsEnum,
  IsOptional,
  IsString,
  MinLength,
  ValidateIf,
  ValidateNested,
} from 'class-validator';
import { AccessScope, Role } from '@prisma/client';

export class AccessDto {
  @IsEnum(AccessScope)
  scope!: AccessScope;

  @IsOptional()
  @IsString()
  countryId?: string;

  @IsOptional()
  @IsString()
  cityId?: string;
}

export class CreateUserDto {
  @IsString()
  @MinLength(2)
  username!: string;

  @IsString()
  @MinLength(1)
  displayName!: string;

  @IsString()
  @MinLength(6)
  password!: string;

  @IsEnum(Role)
  role!: Role;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => AccessDto)
  @ArrayMinSize(1)
  accesses!: AccessDto[];
}

export class UpdateUserDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  displayName?: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @IsOptional()
  @IsEnum(Role)
  role?: Role;
}

export class ResetPasswordDto {
  @IsString()
  @MinLength(6)
  newPassword!: string;
}

export class ReplaceAccessesDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => AccessDto)
  @ArrayMinSize(1)
  accesses!: AccessDto[];
}
