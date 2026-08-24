-- Demo-managed accounts: seeded/imported demo users whose password the
-- bootstrap keeps in sync with the known demo password until they change it.
ALTER TABLE `users` ADD COLUMN `demo_managed` BOOLEAN NOT NULL DEFAULT false;
