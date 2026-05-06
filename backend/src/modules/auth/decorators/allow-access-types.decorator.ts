import { SetMetadata } from '@nestjs/common';
import { AccessType } from '@prisma/client';

export const ALLOW_ACCESS_TYPES_KEY = 'allow-access-types';

export const AllowAccessTypes = (...types: AccessType[]) =>
  SetMetadata(ALLOW_ACCESS_TYPES_KEY, types);
