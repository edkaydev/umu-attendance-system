-- Accounts created with a temporary password must change it at first login.
ALTER TABLE `users` ADD COLUMN `mustChangePassword` BOOLEAN NOT NULL DEFAULT false;
