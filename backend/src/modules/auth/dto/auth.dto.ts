import { IsString, MinLength } from 'class-validator';

export class LoginDto {
  @IsString()
  @MinLength(2)
  username!: string;

  @IsString()
  @MinLength(1)
  password!: string;
}

export class SelectScopeDto {
  @IsString()
  accessId!: string;
}

export class ChangePasswordDto {
  @IsString()
  oldPassword!: string;

  @IsString()
  @MinLength(6)
  newPassword!: string;
}
