-- Reg and student numbers must be unique across all accounts (NULLs allowed for staff)
ALTER TABLE `users` ADD UNIQUE INDEX `users_regNumber_key`(`regNumber`);
ALTER TABLE `users` ADD UNIQUE INDEX `users_studentNumber_key`(`studentNumber`);
