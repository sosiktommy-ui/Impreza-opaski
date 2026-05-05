import { IsString, IsNotEmpty } from 'class-validator';

export class SelectScopeDto {
  @IsString()
  @IsNotEmpty()
  accessId!: string;
}
