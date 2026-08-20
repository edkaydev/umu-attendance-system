-- Add lecturer GPS + proximity radius to sessions for two-check physical geofencing
ALTER TABLE `sessions`
  ADD COLUMN `lecturerLat`     DECIMAL(10, 7) NULL AFTER `codeTtl`,
  ADD COLUMN `lecturerLng`     DECIMAL(10, 7) NULL AFTER `lecturerLat`,
  ADD COLUMN `proximityRadius` INT            NULL AFTER `lecturerLng`;
