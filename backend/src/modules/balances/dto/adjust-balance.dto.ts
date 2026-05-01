import { IsIn, IsInt, IsString, IsUUID, MaxLength, MinLength, NotEquals } from 'class-validator';

export const BALANCE_COLORS = ['BLACK', 'WHITE', 'RED', 'BLUE'] as const;
export type BalanceColor = (typeof BALANCE_COLORS)[number];

export class AdjustBalanceDto {
  @IsUUID()
  userId!: string;

  @IsIn(BALANCE_COLORS)
  color!: BalanceColor;

  @IsInt()
  @NotEquals(0, { message: 'Delta cannot be zero' })
  delta!: number;

  @IsString()
  @MinLength(3, { message: 'Reason must be at least 3 characters' })
  @MaxLength(500)
  reason!: string;
}
