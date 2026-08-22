-- Reg and student numbers must be unique across all accounts (NULLs allowed for staff)
-- studentNumber was never created by any earlier migration; add it here.
ALTER TABLE `users` ADD COLUMN `studentNumber` VARCHAR(30) NULL;
ALTER TABLE `users` ADD UNIQUE INDEX `users_regNumber_key`(`regNumber`);
ALTER TABLE `users` ADD UNIQUE INDEX `users_studentNumber_key`(`studentNumber`);
