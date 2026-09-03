-- =============================================================================
-- Migration: moodle_identity
-- Adds Moodle external-identity columns to `users` and `course_units`,
-- and creates the `sync_runs` audit table for synchronization observability.
--
-- DEPLOYMENT VERIFICATION REQUIRED BEFORE RUNNING THIS MIGRATION:
--   On the Moodle MySQL instance, confirm the actual column types and ID ranges:
--
--     SHOW CREATE TABLE mdl_user;
--     SHOW CREATE TABLE mdl_course;
--     SELECT MAX(id) AS max_user_id,   COUNT(*) AS user_count   FROM mdl_user;
--     SELECT MAX(id) AS max_course_id, COUNT(*) AS course_count FROM mdl_course;
--
--   Expected result: id columns are BIGINT (Moodle's standard since v2.x).
--   If the instance uses INT instead of BIGINT, change BIGINT to INT below
--   before running — then document the deviation and the confirmed MAX(id).
--
-- SAFETY:
--   - All new columns are NULL — no existing rows are affected.
--   - No existing columns, indexes, foreign keys, or constraints are modified.
--   - No attendance, enrollment, session, or audit data is touched.
--   - No destructive operations (no DROP, no TRUNCATE, no data updates).
-- =============================================================================

-- AddColumn: Moodle user ID on `users`
-- Mirrors mdl_user.id (BIGINT in Moodle). NULL until the account is linked
-- by the Moodle synchronization service. The unique index prevents two
-- Attendance accounts from being mapped to the same Moodle user.
ALTER TABLE `users`
    ADD COLUMN `moodleUserId` BIGINT NULL;

ALTER TABLE `users`
    ADD UNIQUE INDEX `users_moodleUserId_key`(`moodleUserId`);

-- AddColumn: Moodle course ID on `course_units`
-- Mirrors mdl_course.id (BIGINT in Moodle). NULL until the course unit is
-- matched to a Moodle course by the synchronization service.
ALTER TABLE `course_units`
    ADD COLUMN `moodleCourseId` BIGINT NULL;

ALTER TABLE `course_units`
    ADD UNIQUE INDEX `course_units_moodleCourseId_key`(`moodleCourseId`);

-- CreateTable: sync_runs
-- Audit log for every Moodle → Attendance synchronization run.
-- One row per entity type per run. Never deleted.
-- `status`  values: "running" | "success" | "partial" | "failed"
-- `entity`  values: "users"   | "courses" | "enrolments" | "full"
-- `stats`   JSON:  { fetched, created, updated, unchanged, skipped,
--                    conflicts, errors }
-- `errorSummary`: plain-text summary, no credentials or tokens.
CREATE TABLE `sync_runs` (
    `id`           VARCHAR(191)  NOT NULL,
    `startedAt`    DATETIME(3)   NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `completedAt`  DATETIME(3)   NULL,
    `status`       VARCHAR(20)   NOT NULL,
    `entity`       VARCHAR(30)   NOT NULL,
    `stats`        JSON          NULL,
    `errorSummary` TEXT          NULL,
    `durationMs`   INT           NULL,

    INDEX `sync_runs_entity_startedAt_idx`(`entity`, `startedAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
