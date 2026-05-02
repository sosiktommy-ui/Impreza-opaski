import { IsEnum, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';
import { BraceletColor } from '@prisma/client';

export class IntakeDto {
  @IsString()
  cityId!: string;

  @IsEnum(BraceletColor)
  color!: BraceletColor;

  @IsInt()
  @Min(1)
  @Max(1_000_000)
  count!: number;

  @IsOptional()
  @IsString()
  note?: string;
}
