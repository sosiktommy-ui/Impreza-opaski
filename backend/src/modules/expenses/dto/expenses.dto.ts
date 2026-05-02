import { IsEnum, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';
import { BraceletColor, ExpenseKind } from '@prisma/client';

export class CreateExpenseDto {
  @IsString() cityId!: string;
  @IsEnum(BraceletColor) color!: BraceletColor;
  @IsInt() @Min(1) @Max(1_000_000) count!: number;
  @IsEnum(ExpenseKind) kind!: ExpenseKind;
  @IsOptional() @IsString() reason?: string;
}

export class ExpenseListQueryDto {
  @IsOptional() @IsString() cityId?: string;
  @IsOptional() @IsEnum(ExpenseKind) kind?: ExpenseKind;
  @IsOptional() @IsEnum(BraceletColor) color?: BraceletColor;
}
