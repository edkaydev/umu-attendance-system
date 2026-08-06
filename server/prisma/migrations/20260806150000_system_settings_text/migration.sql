-- System settings values may now hold long content (e.g. user guide text).
ALTER TABLE `system_settings` MODIFY `value` TEXT NOT NULL;
