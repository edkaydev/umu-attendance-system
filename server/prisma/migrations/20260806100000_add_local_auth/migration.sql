-- Allow accounts to exist without a Google link (local email+password auth)
ALTER TABLE `users` MODIFY `googleId` VARCHAR(100) NULL;

-- Hashed password for local authentication (bcrypt)
ALTER TABLE `users` ADD COLUMN `password` VARCHAR(255) NULL;
