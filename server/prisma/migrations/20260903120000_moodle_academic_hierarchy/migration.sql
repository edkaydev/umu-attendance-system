-- =============================================================================
-- Migration: moodle_academic_hierarchy
-- Adds the Moodle-synced academic hierarchy (source of truth: Moodle) as
-- additive, nullable, non-destructive columns and tables.
--
-- New Moodle category-id identity columns:
--   faculties.moodleCategoryId            @unique
--   programmes.moodleCategoryId           @unique
--   programmes.academicYearId             (FK -> academic_years)
--   course_units.moodleCategoryId         (not unique — a category holds many courses)
--   course_units.semesterId               (FK -> semesters)
--
-- New tables (Moodle-owned hierarchy nodes):
--   academic_levels, academic_years, programme_years, semesters,
--   semester_course_units (Moodle-sourced curriculum join).
--
-- SAFETY (all non-destructive):
--   - All new columns are NULL / defaulted — existing rows are unaffected.
--   - No existing table/column/index/FK is dropped or modified.
--   - No attendance, enrollment, session, or audit data is touched.
--   - The legacy `curriculum_units`/`elective_requirements` tables are left
--     intact so existing enrollment/attendance behavior is preserved; they are
--     retired in a later, separately-reviewed phase.
-- =============================================================================

-- AddColumn: faculties.moodleCategoryId
ALTER TABLE `faculties`
    ADD COLUMN `moodleCategoryId` BIGINT NULL;
ALTER TABLE `faculties`
    ADD UNIQUE INDEX `faculties_moodleCategoryId_key`(`moodleCategoryId`);

-- AddColumn: programmes.moodleCategoryId + academicYearId
ALTER TABLE `programmes`
    ADD COLUMN `moodleCategoryId` BIGINT NULL;
ALTER TABLE `programmes`
    ADD COLUMN `academicYearId` VARCHAR(191) NULL;
ALTER TABLE `programmes`
    ADD UNIQUE INDEX `programmes_moodleCategoryId_key`(`moodleCategoryId`);

-- AddColumn: course_units.moodleCategoryId + semesterId
ALTER TABLE `course_units`
    ADD COLUMN `moodleCategoryId` BIGINT NULL;
ALTER TABLE `course_units`
    ADD COLUMN `semesterId` VARCHAR(191) NULL;

-- CreateTable: academic_levels
CREATE TABLE `academic_levels` (
    `id`               VARCHAR(191)  NOT NULL,
    `facultyId`        VARCHAR(191)  NOT NULL,
    `name`             VARCHAR(100)  NOT NULL,
    `moodleCategoryId` BIGINT        NULL,
    `isActive`         BOOLEAN       NOT NULL DEFAULT true,
    `createdAt`        DATETIME(3)   NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt`        DATETIME(3)   NOT NULL,

    UNIQUE INDEX `academic_levels_moodleCategoryId_key`(`moodleCategoryId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `academic_levels`
    ADD CONSTRAINT `academic_levels_facultyId_fkey`
        FOREIGN KEY (`facultyId`) REFERENCES `faculties`(`id`)
        ON DELETE RESTRICT ON UPDATE CASCADE;

-- CreateTable: academic_years
CREATE TABLE `academic_years` (
    `id`               VARCHAR(191)  NOT NULL,
    `levelId`          VARCHAR(191)  NOT NULL,
    `name`             VARCHAR(100)  NOT NULL,
    `moodleCategoryId` BIGINT        NULL,
    `isActive`         BOOLEAN       NOT NULL DEFAULT true,
    `createdAt`        DATETIME(3)   NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt`        DATETIME(3)   NOT NULL,

    UNIQUE INDEX `academic_years_moodleCategoryId_key`(`moodleCategoryId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `academic_years`
    ADD CONSTRAINT `academic_years_levelId_fkey`
        FOREIGN KEY (`levelId`) REFERENCES `academic_levels`(`id`)
        ON DELETE RESTRICT ON UPDATE CASCADE;

-- CreateTable: programme_years
CREATE TABLE `programme_years` (
    `id`               VARCHAR(191)  NOT NULL,
    `programmeId`      VARCHAR(191)  NOT NULL,
    `year`             TINYINT       NOT NULL,
    `moodleCategoryId` BIGINT        NULL,
    `isActive`         BOOLEAN       NOT NULL DEFAULT true,
    `createdAt`        DATETIME(3)   NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt`        DATETIME(3)   NOT NULL,

    UNIQUE INDEX `programme_years_moodleCategoryId_key`(`moodleCategoryId`),
    UNIQUE INDEX `programme_years_programmeId_year_key`(`programmeId`, `year`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `programme_years`
    ADD CONSTRAINT `programme_years_programmeId_fkey`
        FOREIGN KEY (`programmeId`) REFERENCES `programmes`(`id`)
        ON DELETE RESTRICT ON UPDATE CASCADE;

-- CreateTable: semesters
CREATE TABLE `semesters` (
    `id`               VARCHAR(191)  NOT NULL,
    `programmeYearId`  VARCHAR(191)  NOT NULL,
    `number`           TINYINT       NOT NULL,
    `name`             VARCHAR(50)   NOT NULL,
    `moodleCategoryId` BIGINT        NULL,
    `isActive`         BOOLEAN       NOT NULL DEFAULT true,
    `createdAt`        DATETIME(3)   NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt`        DATETIME(3)   NOT NULL,

    UNIQUE INDEX `semesters_moodleCategoryId_key`(`moodleCategoryId`),
    UNIQUE INDEX `semesters_programmeYearId_number_key`(`programmeYearId`, `number`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `semesters`
    ADD CONSTRAINT `semesters_programmeYearId_fkey`
        FOREIGN KEY (`programmeYearId`) REFERENCES `programme_years`(`id`)
        ON DELETE RESTRICT ON UPDATE CASCADE;

-- CreateTable: semester_course_units
CREATE TABLE `semester_course_units` (
    `id`           VARCHAR(191) NOT NULL,
    `semesterId`   VARCHAR(191) NOT NULL,
    `courseUnitId` VARCHAR(191) NOT NULL,
    `createdAt`    DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `semester_course_units_semesterId_courseUnitId_key`(`semesterId`, `courseUnitId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `semester_course_units`
    ADD CONSTRAINT `semester_course_units_semesterId_fkey`
        FOREIGN KEY (`semesterId`) REFERENCES `semesters`(`id`)
        ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `semester_course_units`
    ADD CONSTRAINT `semester_course_units_courseUnitId_fkey`
        FOREIGN KEY (`courseUnitId`) REFERENCES `course_units`(`id`)
        ON DELETE RESTRICT ON UPDATE CASCADE;

-- ANTI-MERGE: a programme/course-unit may recur across academic years in Moodle
-- with the same natural code. (facultyId, code) is now a non-unique lookup index,
-- not an identity; the primary identity is moodleCategoryId / moodleCourseId.
-- Dropping the legacy unique indexes is non-destructive (no data change).
ALTER TABLE `programmes`
    DROP INDEX `programmes_facultyId_code_key`;
ALTER TABLE `programmes`
    ADD INDEX `programmes_facultyId_code_idx`(`facultyId`, `code`);

ALTER TABLE `course_units`
    DROP INDEX `course_units_facultyId_code_key`;
ALTER TABLE `course_units`
    ADD INDEX `course_units_facultyId_code_idx`(`facultyId`, `code`);

-- Foreign keys for the new nullable columns on existing tables.
ALTER TABLE `programmes`
    ADD CONSTRAINT `programmes_academicYearId_fkey`
        FOREIGN KEY (`academicYearId`) REFERENCES `academic_years`(`id`)
        ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE `course_units`
    ADD CONSTRAINT `course_units_semesterId_fkey`
        FOREIGN KEY (`semesterId`) REFERENCES `semesters`(`id`)
        ON DELETE SET NULL ON UPDATE CASCADE;
