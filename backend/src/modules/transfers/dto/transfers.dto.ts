import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';
import { BraceletColor, TransferStatus } from '@prisma/client';

export class TransferLineInputDto {
  @IsEnum(BraceletColor)
  color!: BraceletColor;

  @IsInt() @Min(1) @Max(1_000_000)
  sentCount!: number;
}

export class CreateTransferDto {
  @IsString() fromCityId!: string;
  @IsString() toCityId!: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => TransferLineInputDto)
  @ArrayMinSize(1)
  lines!: TransferLineInputDto[];

  @IsOptional() @IsString()
  comment?: string;
}

export class AcceptLineDto {
  @IsEnum(BraceletColor) color!: BraceletColor;
  @IsInt() @Min(0) @Max(1_000_000)
  receivedCount!: number;
}

export class AcceptTransferDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => AcceptLineDto)
  @ArrayMinSize(1)
  lines!: AcceptLineDto[];
}

export class TransferListQueryDto {
  @IsOptional() @IsEnum(TransferStatus)
  status?: TransferStatus;
  @IsOptional() @IsString() fromCityId?: string;
  @IsOptional() @IsString() toCityId?: string;
}
