-- Drop password-based auth columns.
-- All authentication is now Google OAuth only.

ALTER TABLE `users` DROP COLUMN `password`;
ALTER TABLE `users` DROP COLUMN `mustChangePassword`;
