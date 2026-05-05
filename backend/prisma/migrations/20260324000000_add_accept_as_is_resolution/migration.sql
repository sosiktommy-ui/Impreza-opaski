-- AlterEnum: Add ACCEPT_AS_IS to ResolutionType
ALTER TYPE "ResolutionType" ADD VALUE IF NOT EXISTS 'ACCEPT_AS_IS';
