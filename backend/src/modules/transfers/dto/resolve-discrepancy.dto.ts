import { IsEnum, IsOptional, IsInt, Min, IsString, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import { ResolutionType } from '@prisma/client';

export class CompromiseValuesDto {
  @IsInt()
  @Min(0)
  black!: number;

  @IsInt()
  @Min(0)
  white!: number;

  @IsInt()
  @Min(0)
  red!: number;

  @IsInt()
  @Min(0)
  blue!: number;
}

export class ResolveDiscrepancyDto {
  @IsEnum(ResolutionType)
  resolutionType!: ResolutionType;

  @IsOptional()
  @ValidateNested()
  @Type(() => CompromiseValuesDto)
  compromiseValues?: CompromiseValuesDto;

  @IsOptional()
  @IsString()
  notes?: string;
}
