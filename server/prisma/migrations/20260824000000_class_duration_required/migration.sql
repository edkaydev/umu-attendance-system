-- Sessions must always auto-close: backfill legacy nulls to 60 min,
-- then make classDuration required with a 60-minute default.
UPDATE `sessions` SET `classDuration` = 60 WHERE `classDuration` IS NULL;
ALTER TABLE `sessions` MODIFY COLUMN `classDuration` INT NOT NULL DEFAULT 60;
