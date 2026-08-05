-- AlterTable
ALTER TABLE `sessions`
  ADD COLUMN `mode` ENUM('physical', 'online') NOT NULL DEFAULT 'physical',
  ADD COLUMN `startsAt` DATETIME(3) NULL;
