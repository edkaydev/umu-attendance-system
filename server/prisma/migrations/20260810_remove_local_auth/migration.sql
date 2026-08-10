-- Remove local authentication fields — Google OAuth is the only login method.
ALTER TABLE `users` DROP COLUMN IF EXISTS `password`;
ALTER TABLE `users` DROP COLUMN IF EXISTS `mustChangePassword`;
