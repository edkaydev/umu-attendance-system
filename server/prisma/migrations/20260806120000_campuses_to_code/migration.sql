-- Campuses are fixed and moved to code (server/src/constants/campuses.ts).
-- Faculties now store a campusCode instead of a campus FK.

-- 1. Add the campusCode column
ALTER TABLE `faculties` ADD COLUMN `campusCode` VARCHAR(20) NULL;

-- 2. Backfill from the campuses table
UPDATE `faculties` f
JOIN `campuses` c ON c.id = f.campusId
SET f.campusCode = c.code;

-- 3. Make it NOT NULL
ALTER TABLE `faculties` MODIFY `campusCode` VARCHAR(20) NOT NULL;

-- 4. Drop the old FK, unique constraint and column
ALTER TABLE `faculties` DROP FOREIGN KEY `faculties_campusId_fkey`;
ALTER TABLE `faculties` DROP INDEX `faculties_campusId_code_key`;
ALTER TABLE `faculties` DROP COLUMN `campusId`;

-- 5. Recreate the unique constraint on campusCode + code
ALTER TABLE `faculties` ADD UNIQUE INDEX `faculties_campusCode_code_key` (`campusCode`, `code`);

-- 6. Drop the campuses table (no longer needed)
DROP TABLE `campuses`;
