import { IsEnum, IsOptional, IsString, IsDateString } from 'class-validator';
import { AccessType, ScopeType } from '@prisma/client';

export class GrantAccessDto {
  @IsString()
  userId!: string;

  @IsEnum(ScopeType)
  scopeType!: ScopeType;

  /** Required for OFFICE/COUNTRY/CITY, must be null for GLOBAL. */
  @IsOptional()
  @IsString()
  scopeId?: string | null;

  @IsOptional()
  @IsEnum(AccessType)
  accessType?: AccessType;

  @IsOptional()
  @IsDateString()
  expiresAt?: string;

  @IsOptional()
  @IsString()
  notes?: string;
}
