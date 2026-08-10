-- Add programme level for filtering in profile setup.
ALTER TABLE `programmes`
  ADD COLUMN IF NOT EXISTS `level` ENUM('bachelors','masters','phd','diploma','certificate','other') NOT NULL DEFAULT 'bachelors';
