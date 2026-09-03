-- =============================================================================
-- UMU Attendance System — Consolidated Init Migration
-- Final production schema. Google OAuth only — no password columns.
--
-- For FRESH INSTALLS: run this single file instead of all incremental migrations.
-- For EXISTING PRODUCTION DATABASES: use `prisma migrate deploy` as normal —
--   all incremental migrations in this directory remain intact.
--
-- Usage (fresh install):
--   1. Apply this SQL against an empty database.
--   2. Mark every incremental migration as already applied:
--        bash devops/scripts/mark-migrations-applied.sh
--   3. Run the seed script: npm run seed:admin
-- =============================================================================

-- Disable FK checks for the duration of the import so table/column creation
-- order does not matter and MySQL does not reject STORED generated-column
-- additions due to FK constraint re-validation during table rebuilds.
SET FOREIGN_KEY_CHECKS = 0;

-- ── Faculties ────────────────────────────────────────────────────────────────
CREATE TABLE `faculties` (
    `id`               VARCHAR(191) NOT NULL,
    `campusCode`       VARCHAR(20)  NOT NULL,
    `name`             VARCHAR(100) NOT NULL,
    `code`             VARCHAR(20)  NOT NULL,
    `isActive`         BOOLEAN      NOT NULL DEFAULT true,
    `moodleCategoryId` BIGINT       NULL,
    `createdAt`        DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt`        DATETIME(3)  NOT NULL,

    UNIQUE INDEX `faculties_campusCode_code_key`(`campusCode`, `code`),
    UNIQUE INDEX `faculties_moodleCategoryId_key`(`moodleCategoryId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- ── Programmes ───────────────────────────────────────────────────────────────
CREATE TABLE `programmes` (
    `id`               VARCHAR(191) NOT NULL,
    `facultyId`        VARCHAR(191) NOT NULL,
    `name`             VARCHAR(150) NOT NULL,
    `code`             VARCHAR(20)  NOT NULL,
    `isActive`         BOOLEAN      NOT NULL DEFAULT true,
    `moodleCategoryId` BIGINT       NULL,
    `academicYearId`   VARCHAR(191) NULL,
    `createdAt`        DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt`        DATETIME(3)  NOT NULL,

    INDEX  `programmes_facultyId_code_idx`(`facultyId`, `code`),
    UNIQUE INDEX `programmes_moodleCategoryId_key`(`moodleCategoryId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- ── Course Units ─────────────────────────────────────────────────────────────
CREATE TABLE `course_units` (
    `id`               VARCHAR(191) NOT NULL,
    `facultyId`        VARCHAR(191) NOT NULL,
    `code`             VARCHAR(20)  NOT NULL,
    `name`             VARCHAR(150) NOT NULL,
    `isActive`         BOOLEAN      NOT NULL DEFAULT true,
    `moodleCourseId`   BIGINT       NULL,
    `moodleCategoryId` BIGINT       NULL,
    `semesterId`       VARCHAR(191) NULL,
    `createdAt`        DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt`        DATETIME(3)  NOT NULL,

    INDEX  `course_units_facultyId_code_idx`(`facultyId`, `code`),
    UNIQUE INDEX `course_units_moodleCourseId_key`(`moodleCourseId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- ── Course Unit ↔ Faculty (shared units) ────────────────────────────────────
CREATE TABLE `course_unit_faculties` (
    `id`           VARCHAR(191) NOT NULL,
    `courseUnitId` VARCHAR(191) NOT NULL,
    `facultyId`    VARCHAR(191) NOT NULL,
    `createdAt`    DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `course_unit_faculties_courseUnitId_facultyId_key`(`courseUnitId`, `facultyId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- ── Curriculum Units (legacy, kept for fallback enrolment) ───────────────────
CREATE TABLE `curriculum_units` (
    `id`          VARCHAR(191) NOT NULL,
    `courseUnitId` VARCHAR(191) NOT NULL,
    `programmeId` VARCHAR(191) NOT NULL,
    `year`        TINYINT      NOT NULL,
    `semester`    TINYINT      NOT NULL,
    `isElective`  BOOLEAN      NOT NULL DEFAULT false,
    `createdAt`   DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `courseUnitId_programmeId_year_semester_key`(`courseUnitId`, `programmeId`, `year`, `semester`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- ── Elective Requirements ────────────────────────────────────────────────────
CREATE TABLE `elective_requirements` (
    `id`          VARCHAR(191) NOT NULL,
    `programmeId` VARCHAR(191) NOT NULL,
    `year`        TINYINT      NOT NULL,
    `semester`    TINYINT      NOT NULL,
    `minPick`     TINYINT      NOT NULL DEFAULT 1,

    UNIQUE INDEX `elective_requirements_programmeId_year_semester_key`(`programmeId`, `year`, `semester`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- ── Moodle Academic Hierarchy ────────────────────────────────────────────────
CREATE TABLE `academic_levels` (
    `id`               VARCHAR(191) NOT NULL,
    `facultyId`        VARCHAR(191) NOT NULL,
    `name`             VARCHAR(100) NOT NULL,
    `moodleCategoryId` BIGINT       NULL,
    `isActive`         BOOLEAN      NOT NULL DEFAULT true,
    `createdAt`        DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt`        DATETIME(3)  NOT NULL,

    UNIQUE INDEX `academic_levels_moodleCategoryId_key`(`moodleCategoryId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `academic_years` (
    `id`               VARCHAR(191) NOT NULL,
    `levelId`          VARCHAR(191) NOT NULL,
    `name`             VARCHAR(100) NOT NULL,
    `moodleCategoryId` BIGINT       NULL,
    `isActive`         BOOLEAN      NOT NULL DEFAULT true,
    `createdAt`        DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt`        DATETIME(3)  NOT NULL,

    UNIQUE INDEX `academic_years_moodleCategoryId_key`(`moodleCategoryId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `programme_years` (
    `id`               VARCHAR(191) NOT NULL,
    `programmeId`      VARCHAR(191) NOT NULL,
    `year`             TINYINT      NOT NULL,
    `moodleCategoryId` BIGINT       NULL,
    `isActive`         BOOLEAN      NOT NULL DEFAULT true,
    `createdAt`        DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt`        DATETIME(3)  NOT NULL,

    UNIQUE INDEX `programme_years_moodleCategoryId_key`(`moodleCategoryId`),
    UNIQUE INDEX `programme_years_programmeId_year_key`(`programmeId`, `year`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `semesters` (
    `id`               VARCHAR(191) NOT NULL,
    `programmeYearId`  VARCHAR(191) NOT NULL,
    `number`           TINYINT      NOT NULL,
    `name`             VARCHAR(50)  NOT NULL,
    `moodleCategoryId` BIGINT       NULL,
    `isActive`         BOOLEAN      NOT NULL DEFAULT true,
    `createdAt`        DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt`        DATETIME(3)  NOT NULL,

    UNIQUE INDEX `semesters_moodleCategoryId_key`(`moodleCategoryId`),
    UNIQUE INDEX `semesters_programmeYearId_number_key`(`programmeYearId`, `number`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `semester_course_units` (
    `id`           VARCHAR(191) NOT NULL,
    `semesterId`   VARCHAR(191) NOT NULL,
    `courseUnitId` VARCHAR(191) NOT NULL,
    `createdAt`    DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `semester_course_units_semesterId_courseUnitId_key`(`semesterId`, `courseUnitId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- ── Users ────────────────────────────────────────────────────────────────────
-- No password column — authentication is Google OAuth only.
CREATE TABLE `users` (
    `id`               VARCHAR(191) NOT NULL,
    `googleId`         VARCHAR(100) NULL,
    `email`            VARCHAR(150) NOT NULL,
    `fullName`         VARCHAR(100) NOT NULL,
    `role`             ENUM('system_admin','faculty_admin','lecturer','student') NOT NULL,
    `facultyId`        VARCHAR(191) NULL,
    `programmeId`      VARCHAR(191) NULL,
    `year`             TINYINT      NULL,
    `semester`         TINYINT      NULL,
    `academicYear`     VARCHAR(10)  NULL,
    `regNumber`        VARCHAR(30)  NULL,
    `studentNumber`    VARCHAR(30)  NULL,
    `moodleUserId`     BIGINT       NULL,
    `profileComplete`  BOOLEAN      NOT NULL DEFAULT false,
    `isActive`         BOOLEAN      NOT NULL DEFAULT true,
    `hasCompletedTour` BOOLEAN      NOT NULL DEFAULT false,
    `demo_managed`     BOOLEAN      NOT NULL DEFAULT false,
    `createdAt`        DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt`        DATETIME(3)  NOT NULL,

    UNIQUE INDEX `users_googleId_key`(`googleId`),
    UNIQUE INDEX `users_email_key`(`email`),
    UNIQUE INDEX `users_regNumber_key`(`regNumber`),
    UNIQUE INDEX `users_studentNumber_key`(`studentNumber`),
    UNIQUE INDEX `users_moodleUserId_key`(`moodleUserId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- ── Lecturer Faculty Memberships ─────────────────────────────────────────────
CREATE TABLE `lecturer_faculties` (
    `id`        VARCHAR(191) NOT NULL,
    `userId`    VARCHAR(191) NOT NULL,
    `facultyId` VARCHAR(191) NOT NULL,
    `isPrimary` BOOLEAN      NOT NULL DEFAULT false,
    `createdAt` DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `lecturer_faculties_userId_facultyId_key`(`userId`, `facultyId`),
    INDEX `lecturer_faculties_facultyId_idx`(`facultyId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- ── Enrollments ──────────────────────────────────────────────────────────────
CREATE TABLE `enrollments` (
    `id`           VARCHAR(191) NOT NULL,
    `studentId`    VARCHAR(191) NOT NULL,
    `courseUnitId` VARCHAR(191) NOT NULL,
    `academicYear` VARCHAR(10)  NOT NULL,
    `semester`     TINYINT      NOT NULL,
    `enrolledAt`   DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `enrollments_studentId_courseUnitId_academicYear_semester_key`(`studentId`, `courseUnitId`, `academicYear`, `semester`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- ── Lecturer Assignments ─────────────────────────────────────────────────────
CREATE TABLE `lecturer_assignments` (
    `id`           VARCHAR(191) NOT NULL,
    `lecturerId`   VARCHAR(191) NOT NULL,
    `courseUnitId` VARCHAR(191) NOT NULL,
    `academicYear` VARCHAR(10)  NOT NULL,
    `semester`     TINYINT      NOT NULL,
    `assignedById` VARCHAR(191) NOT NULL,
    `assignedAt`   DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `lecturer_assignments_lecturerId_courseUnitId_academicYear_se_key`(`lecturerId`, `courseUnitId`, `academicYear`, `semester`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- ── Sessions ─────────────────────────────────────────────────────────────────
-- NOTE: Generated columns (open_lecturer_key, open_unit_period_key) are added
-- via ALTER TABLE after all foreign keys are defined. MySQL 8.0 rejects FK
-- constraints on tables whose generated columns reference the FK column when
-- the generated columns are defined inline in CREATE TABLE.
CREATE TABLE `sessions` (
    `id`               VARCHAR(191)   NOT NULL,
    `courseUnitId`     VARCHAR(191)   NOT NULL,
    `lecturerId`       VARCHAR(191)   NOT NULL,
    `academicYear`     VARCHAR(10)    NOT NULL,
    `semester`         TINYINT        NOT NULL,
    `code`             VARCHAR(8)     NOT NULL,
    `codeExpiresAt`    DATETIME(3)    NOT NULL,
    `status`           ENUM('open','closed') NOT NULL DEFAULT 'open',
    `venue`            VARCHAR(100)   NULL,
    `mode`             ENUM('physical','online') NOT NULL DEFAULT 'physical',
    `startsAt`         DATETIME(3)    NULL,
    `classDuration`    INT            NOT NULL DEFAULT 60,
    `codeTtl`          INT            NULL,
    `lecturerLat`      DECIMAL(10,7)  NULL,
    `lecturerLng`      DECIMAL(10,7)  NULL,
    `proximityRadius`  INT            NULL,
    `meetingLink`      VARCHAR(500)   NULL,
    `openedAt`         DATETIME(3)    NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `closedAt`         DATETIME(3)    NULL,

    INDEX `sessions_code_idx`(`code`),
    INDEX `sessions_courseUnitId_status_idx`(`courseUnitId`, `status`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- ── Attendance Records ───────────────────────────────────────────────────────
CREATE TABLE `attendance_records` (
    `id`          VARCHAR(191) NOT NULL,
    `sessionId`   VARCHAR(191) NOT NULL,
    `studentId`   VARCHAR(191) NOT NULL,
    `status`      ENUM('present','absent','excused') NOT NULL,
    `checkedInAt` DATETIME(3)  NULL,
    `createdAt`   DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `attendance_records_sessionId_studentId_key`(`sessionId`, `studentId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- ── Attendance Edits ─────────────────────────────────────────────────────────
CREATE TABLE `attendance_edits` (
    `id`                 VARCHAR(191) NOT NULL,
    `attendanceRecordId` VARCHAR(191) NOT NULL,
    `changedById`        VARCHAR(191) NOT NULL,
    `oldStatus`          ENUM('present','absent','excused') NOT NULL,
    `newStatus`          ENUM('present','absent','excused') NOT NULL,
    `reason`             TEXT         NOT NULL,
    `changedAt`          DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- ── Attendance Alerts ────────────────────────────────────────────────────────
CREATE TABLE `attendance_alerts` (
    `id`            VARCHAR(191)   NOT NULL,
    `studentId`     VARCHAR(191)   NOT NULL,
    `courseUnitId`  VARCHAR(191)   NOT NULL,
    `alertType`     ENUM('warning','critical') NOT NULL,
    `attendancePct` DECIMAL(5,2)   NOT NULL,
    `sentAt`        DATETIME(3)    NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `resolved`      BOOLEAN        NOT NULL DEFAULT false,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- ── Excuse Requests ──────────────────────────────────────────────────────────
CREATE TABLE `excuse_requests` (
    `id`            VARCHAR(36)  NOT NULL,
    `studentId`     VARCHAR(36)  NOT NULL,
    `sessionId`     VARCHAR(36)  NOT NULL,
    `reason`        TEXT         NOT NULL,
    `status`        ENUM('pending','approved','rejected') NOT NULL DEFAULT 'pending',
    `reviewedById`  VARCHAR(36)  NULL,
    `reviewedAt`    DATETIME(3)  NULL,
    `createdAt`     DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `excuse_requests_sessionId_studentId_key`(`sessionId`, `studentId`),
    INDEX `excuse_requests_sessionId_status_idx`(`sessionId`, `status`),
    INDEX `excuse_requests_studentId_idx`(`studentId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- ── Refresh Tokens ───────────────────────────────────────────────────────────
CREATE TABLE `refresh_tokens` (
    `id`        VARCHAR(191) NOT NULL,
    `userId`    VARCHAR(191) NOT NULL,
    `tokenHash` VARCHAR(255) NOT NULL,
    `expiresAt` DATETIME(3)  NOT NULL,
    `revoked`   BOOLEAN      NOT NULL DEFAULT false,
    `createdAt` DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- ── System Settings ──────────────────────────────────────────────────────────
CREATE TABLE `system_settings` (
    `key`       VARCHAR(50) NOT NULL,
    `value`     TEXT        NOT NULL,
    `updatedAt` DATETIME(3) NOT NULL,

    PRIMARY KEY (`key`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- ── Audit Logs ───────────────────────────────────────────────────────────────
CREATE TABLE `audit_logs` (
    `id`         VARCHAR(191) NOT NULL,
    `userId`     VARCHAR(191) NOT NULL,
    `action`     VARCHAR(50)  NOT NULL,
    `targetType` VARCHAR(50)  NOT NULL,
    `targetId`   VARCHAR(36)  NOT NULL,
    `meta`       JSON         NULL,
    `createdAt`  DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `audit_logs_userId_idx`(`userId`),
    INDEX `audit_logs_action_idx`(`action`),
    INDEX `audit_logs_createdAt_idx`(`createdAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- ── Moodle Sync Runs ─────────────────────────────────────────────────────────
CREATE TABLE `sync_runs` (
    `id`           VARCHAR(191) NOT NULL,
    `startedAt`    DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `completedAt`  DATETIME(3)  NULL,
    `status`       VARCHAR(20)  NOT NULL,
    `entity`       VARCHAR(30)  NOT NULL,
    `stats`        JSON         NULL,
    `errorSummary` TEXT         NULL,
    `durationMs`   INT          NULL,

    INDEX `sync_runs_entity_startedAt_idx`(`entity`, `startedAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- =============================================================================
-- Foreign Keys
-- =============================================================================

ALTER TABLE `programmes`
    ADD CONSTRAINT `programmes_facultyId_fkey`
        FOREIGN KEY (`facultyId`) REFERENCES `faculties`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE `programmes`
    ADD CONSTRAINT `programmes_academicYearId_fkey`
        FOREIGN KEY (`academicYearId`) REFERENCES `academic_years`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE `course_units`
    ADD CONSTRAINT `course_units_facultyId_fkey`
        FOREIGN KEY (`facultyId`) REFERENCES `faculties`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE `course_units`
    ADD CONSTRAINT `course_units_semesterId_fkey`
        FOREIGN KEY (`semesterId`) REFERENCES `semesters`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE `course_unit_faculties`
    ADD CONSTRAINT `course_unit_faculties_courseUnitId_fkey`
        FOREIGN KEY (`courseUnitId`) REFERENCES `course_units`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE `course_unit_faculties`
    ADD CONSTRAINT `course_unit_faculties_facultyId_fkey`
        FOREIGN KEY (`facultyId`) REFERENCES `faculties`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE `curriculum_units`
    ADD CONSTRAINT `curriculum_units_courseUnitId_fkey`
        FOREIGN KEY (`courseUnitId`) REFERENCES `course_units`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE `curriculum_units`
    ADD CONSTRAINT `curriculum_units_programmeId_fkey`
        FOREIGN KEY (`programmeId`) REFERENCES `programmes`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE `elective_requirements`
    ADD CONSTRAINT `elective_requirements_programmeId_fkey`
        FOREIGN KEY (`programmeId`) REFERENCES `programmes`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE `academic_levels`
    ADD CONSTRAINT `academic_levels_facultyId_fkey`
        FOREIGN KEY (`facultyId`) REFERENCES `faculties`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE `academic_years`
    ADD CONSTRAINT `academic_years_levelId_fkey`
        FOREIGN KEY (`levelId`) REFERENCES `academic_levels`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE `programme_years`
    ADD CONSTRAINT `programme_years_programmeId_fkey`
        FOREIGN KEY (`programmeId`) REFERENCES `programmes`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE `semesters`
    ADD CONSTRAINT `semesters_programmeYearId_fkey`
        FOREIGN KEY (`programmeYearId`) REFERENCES `programme_years`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE `semester_course_units`
    ADD CONSTRAINT `semester_course_units_semesterId_fkey`
        FOREIGN KEY (`semesterId`) REFERENCES `semesters`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE `semester_course_units`
    ADD CONSTRAINT `semester_course_units_courseUnitId_fkey`
        FOREIGN KEY (`courseUnitId`) REFERENCES `course_units`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE `users`
    ADD CONSTRAINT `users_facultyId_fkey`
        FOREIGN KEY (`facultyId`) REFERENCES `faculties`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE `users`
    ADD CONSTRAINT `users_programmeId_fkey`
        FOREIGN KEY (`programmeId`) REFERENCES `programmes`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE `lecturer_faculties`
    ADD CONSTRAINT `lecturer_faculties_userId_fkey`
        FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE `lecturer_faculties`
    ADD CONSTRAINT `lecturer_faculties_facultyId_fkey`
        FOREIGN KEY (`facultyId`) REFERENCES `faculties`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE `enrollments`
    ADD CONSTRAINT `enrollments_studentId_fkey`
        FOREIGN KEY (`studentId`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE `enrollments`
    ADD CONSTRAINT `enrollments_courseUnitId_fkey`
        FOREIGN KEY (`courseUnitId`) REFERENCES `course_units`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE `lecturer_assignments`
    ADD CONSTRAINT `lecturer_assignments_lecturerId_fkey`
        FOREIGN KEY (`lecturerId`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE `lecturer_assignments`
    ADD CONSTRAINT `lecturer_assignments_courseUnitId_fkey`
        FOREIGN KEY (`courseUnitId`) REFERENCES `course_units`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE `lecturer_assignments`
    ADD CONSTRAINT `lecturer_assignments_assignedById_fkey`
        FOREIGN KEY (`assignedById`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE `attendance_records`
    ADD CONSTRAINT `attendance_records_sessionId_fkey`
        FOREIGN KEY (`sessionId`) REFERENCES `sessions`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE `attendance_records`
    ADD CONSTRAINT `attendance_records_studentId_fkey`
        FOREIGN KEY (`studentId`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE `attendance_edits`
    ADD CONSTRAINT `attendance_edits_attendanceRecordId_fkey`
        FOREIGN KEY (`attendanceRecordId`) REFERENCES `attendance_records`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE `attendance_edits`
    ADD CONSTRAINT `attendance_edits_changedById_fkey`
        FOREIGN KEY (`changedById`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE `attendance_alerts`
    ADD CONSTRAINT `attendance_alerts_studentId_fkey`
        FOREIGN KEY (`studentId`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE `attendance_alerts`
    ADD CONSTRAINT `attendance_alerts_courseUnitId_fkey`
        FOREIGN KEY (`courseUnitId`) REFERENCES `course_units`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE `excuse_requests`
    ADD CONSTRAINT `excuse_requests_studentId_fkey`
        FOREIGN KEY (`studentId`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE `excuse_requests`
    ADD CONSTRAINT `excuse_requests_sessionId_fkey`
        FOREIGN KEY (`sessionId`) REFERENCES `sessions`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE `refresh_tokens`
    ADD CONSTRAINT `refresh_tokens_userId_fkey`
        FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE `audit_logs`
    ADD CONSTRAINT `audit_logs_userId_fkey`
        FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- =============================================================================
-- Generated columns for single-open-session enforcement
-- Added after FKs because MySQL 8.0 cannot add a FK to a table whose stored
-- generated columns reference the FK column when defined in CREATE TABLE.
-- =============================================================================

ALTER TABLE `sessions`
    ADD COLUMN `open_lecturer_key`    VARCHAR(191)
        AS (IF(status = 'open', lecturerId, NULL)) STORED,
    ADD COLUMN `open_unit_period_key` VARCHAR(64)
        AS (IF(status = 'open', CONCAT(courseUnitId, ':', academicYear, ':', semester), NULL)) STORED;

ALTER TABLE `sessions`
    ADD UNIQUE INDEX `sessions_open_lecturer_key_unique`(`open_lecturer_key`),
    ADD UNIQUE INDEX `sessions_open_unit_period_key_unique`(`open_unit_period_key`);

-- Sessions FKs are added last (after generated columns) to work around
-- MySQL 8.0 bug 90763: InnoDB rejects ADD COLUMN ... STORED when the
-- generated expression references a column that already has a FK constraint.
ALTER TABLE `sessions`
    ADD CONSTRAINT `sessions_courseUnitId_fkey`
        FOREIGN KEY (`courseUnitId`) REFERENCES `course_units`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE `sessions`
    ADD CONSTRAINT `sessions_lecturerId_fkey`
        FOREIGN KEY (`lecturerId`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

SET FOREIGN_KEY_CHECKS = 1;
