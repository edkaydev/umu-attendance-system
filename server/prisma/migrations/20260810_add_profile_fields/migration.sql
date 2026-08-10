-- Add new profile fields: WhatsApp number, gender, and Google profile photo URL.
ALTER TABLE `users`
  ADD COLUMN IF NOT EXISTS `whatsapp` VARCHAR(30) NULL,
  ADD COLUMN IF NOT EXISTS `gender`   ENUM('male','female','other') NULL,
  ADD COLUMN IF NOT EXISTS `photoUrl` VARCHAR(500) NULL;
