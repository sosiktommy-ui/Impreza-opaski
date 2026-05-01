import { IsOptional, IsString, IsDateString } from 'class-validator';

export class UpdateAccessDto {
  @IsOptional()
  @IsDateString()
  expiresAt?: string | null;

  @IsOptional()
  @IsString()
  notes?: string | null;
}
