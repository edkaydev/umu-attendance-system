-- Curriculum path sets become standing (period-independent).
-- 1) Remove rows that would collide once academicYear is forgotten.
DELETE c1 FROM curriculum_units c1
JOIN curriculum_units c2
  ON c1.courseUnitId = c2.courseUnitId
 AND c1.programmeId = c2.programmeId
 AND c1.year = c2.year
 AND c1.semester = c2.semester
 AND c1.id > c2.id;
-- 2) Swap the unique constraint to the period-free one and drop the column.
-- Add the replacement index BEFORE dropping the old one: the FKs on
-- courseUnitId/programmeId rely on prefixes of the old composite index
-- (MySQL error 1553 otherwise).
ALTER TABLE `curriculum_units` ADD UNIQUE INDEX `courseUnitId_programmeId_year_semester_key`(`courseUnitId`, `programmeId`, `year`, `semester`);
ALTER TABLE `curriculum_units` DROP INDEX `curriculum_units_courseUnitId_programmeId_year_semester_acad_key`;
ALTER TABLE `curriculum_units` DROP COLUMN `academicYear`;
