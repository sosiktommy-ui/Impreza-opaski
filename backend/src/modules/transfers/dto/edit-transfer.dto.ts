import { IsArray, IsString, IsOptional, ValidateNested, IsEnum, IsInt, Min } from 'class-validator';
import { Type } from 'class-transformer';
import { ItemType } from '@prisma/client';

class EditTransferItemDto {
  @IsEnum(ItemType)
  itemType!: ItemType;

  @IsInt()
  @Min(1)
  quantity!: number;
}

export class EditTransferDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => EditTransferItemDto)
  items!: EditTransferItemDto[];

  @IsString()
  password!: string;

  @IsOptional()
  @IsString()
  notes?: string;
}
