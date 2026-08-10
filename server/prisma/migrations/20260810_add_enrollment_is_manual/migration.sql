-- Flag to distinguish Faculty-Admin-added enrollments from curriculum-derived ones.
-- Manual enrollments are preserved when a student updates their academic path.
ALTER TABLE `enrollments`
  ADD COLUMN IF NOT EXISTS `isManual` TINYINT(1) NOT NULL DEFAULT 0;
