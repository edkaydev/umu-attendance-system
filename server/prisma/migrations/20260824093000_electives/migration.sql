-- Electives: curriculum entries can be flagged as electives; path cells carry
-- a "must pick at least N" requirement. Existing rows stay core by default.
ALTER TABLE `curriculum_units` ADD COLUMN `isElective` BOOLEAN NOT NULL DEFAULT false;

CREATE TABLE `elective_requirements` (
    `id` VARCHAR(191) NOT NULL,
    `programmeId` VARCHAR(191) NOT NULL,
    `year` TINYINT NOT NULL,
    `semester` TINYINT NOT NULL,
    `minPick` TINYINT NOT NULL DEFAULT 1,

    UNIQUE INDEX `elective_requirements_programmeId_year_semester_key`(`programmeId`, `year`, `semester`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `elective_requirements` ADD CONSTRAINT `elective_requirements_programmeId_fkey` FOREIGN KEY (`programmeId`) REFERENCES `programmes`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
