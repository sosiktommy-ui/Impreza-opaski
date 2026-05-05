import { IsString, IsNotEmpty, MinLength } from 'class-validator';

export class VerifyPasswordDto {
  @IsString()
  @IsNotEmpty()
  @MinLength(6)
  password!: string;
}
