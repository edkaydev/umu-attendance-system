-- ============================================================================
-- SECTION 11 — EXISTING-DATA DIAGNOSTIC AUDIT (UMU Attendance → Moodle)
-- File  : devops/scripts/moodle/section-11-data-audit.sql
-- Status: DRAFT / UNTRACKED — for ICT review. NOT to be deployed or executed.
--
-- READ-ONLY. Contains SELECT statements only.
-- No INSERT/UPDATE/DELETE/ALTER/CREATE/DROP/TRUNCATE, no stored-proc DDL.
-- Does not modify the database, schema, migrations, packages, or application code.
-- No credentials, tokens, passwords, or secrets.
--
-- Target schema/columns verified against server/prisma/schema.prisma
-- Columns use Prisma field names verbatim (camelCase) unless @@map/@map:
--   users(                 id, email, regNumber, studentNumber, role,
--                          fullName, googleId, facultyId, programmeId,
--                          isActive, profileComplete )
--   programmes(            id, facultyId, code, name )
--   course_units(          id, facultyId, code, name, isActive )
--   enrollments(           id, studentId, courseUnitId, academicYear, semester )
--   lecturer_assignments(  id, lecturerId, courseUnitId, academicYear, semester )
-- Role enum values: system_admin | faculty_admin | lecturer | student
--   (field-level exception: demoManaged -> demo_managed; unused in this audit)
--
-- Moodle external-ID note (documentation only, NOT a schema change):
--   Moodle `mdl_user.id` and `mdl_course.id` are MySQL BIGINT auto-increment
--   INTEGER IDs. When Phase 1 is eventually approved, the planned fields are:
--     moodleUserId   Int?  @unique
--     moodleCourseId Int?  @unique
--   Do NOT add these fields to the Prisma schema yet. This is documentation for
--   the eventual Phase-1 migration only.
-- ============================================================================


-- ----------------------------------------------------------------------------
--
-- 1. DUPLICATE USER EMAILS
--
-- WHY:
--   `User.email` is @unique at the DB level, so Prisma-originated duplicates are
--   impossible. This query is a safety net for rows written outside Prisma, or a
--   pre-existing dataset import with historical duplicates.
--   A non-zero result BLOCKS synchronization: email is a candidate Moodle match
--   key, and two accounts sharing one email make `email -> moodleUserId`
--   ambiguous (could seed duplicate Moodle accounts or a cross-account merge).
--
-- CONDITION: BLOCKS if non-zero.
-- ----------------------------------------------------------------------------
SELECT email, COUNT(*) AS duplicates
FROM users
GROUP BY email
HAVING COUNT(*) > 1;


-- ----------------------------------------------------------------------------
--
-- 2. DUPLICATE REGISTRATION NUMBERS
--
-- WHY:
--   `User.regNumber` is @unique in Prisma and is assumed to equal Moodle
--   `user.idnumber` — the PRIMARY match key for the user sync. Any duplicate
--   makes that key ambiguous and the Moodle match untrustworthy.
--
-- CONDITION: BLOCKS if non-zero.
-- ----------------------------------------------------------------------------
SELECT regNumber, COUNT(*) AS duplicates
FROM users
WHERE regNumber IS NOT NULL AND regNumber <> ''
GROUP BY regNumber
HAVING COUNT(*) > 1;


-- ----------------------------------------------------------------------------
--
-- 3. DUPLICATE STUDENT NUMBERS
--
-- WHY:
--   `User.studentNumber` is @unique in Prisma and is a secondary candidate match
--   key. Duplicates create the same ambiguity risk as #2.
--
-- CONDITION: BLOCKS if non-zero.
-- ----------------------------------------------------------------------------
SELECT studentNumber, COUNT(*) AS duplicates
FROM users
WHERE studentNumber IS NOT NULL AND studentNumber <> ''
GROUP BY studentNumber
HAVING COUNT(*) > 1;


-- ----------------------------------------------------------------------------
--
-- 4. DUPLICATE COURSEUNIT CODES WITHIN A FACULTY
--
-- WHY:
--   `CourseUnit.code` is @@unique([facultyId, code]) — unique PER faculty only.
--   Moodle `course.shortname` (matched from `CourseUnit.code`) is campus-global,
--   so a code must be globally resolvable. Two units sharing a code within one
--   faculty make code -> moodleCourseId ambiguous for those units.
--
-- CONDITION: BLOCKS mapping of the affected units (does not necessarily block
--   the rest of sync).
-- ----------------------------------------------------------------------------
SELECT cu.facultyId, cu.code, COUNT(*) AS duplicates
FROM course_units cu
GROUP BY cu.facultyId, cu.code
HAVING COUNT(*) > 1;


-- ----------------------------------------------------------------------------
--
-- 5. DUPLICATE PROGRAMME CODES WITHIN A FACULTY
--
-- WHY:
--   `Programme.code` is @@unique([facultyId, code]). Included for completeness
--   because Programme is part of the identity mapping tree. In practice Prisma
--   forbids duplicates, so this mostly guards against non-Prisma writes.
--
-- CONDITION: REVIEW if non-zero (does not directly gate the Phase-1 user/course
--   writers; programmes are not a Phase-1 writer target).
-- ----------------------------------------------------------------------------
SELECT p.facultyId, p.code, COUNT(*) AS duplicates
FROM programmes p
GROUP BY p.facultyId, p.code
HAVING COUNT(*) > 1;


-- ----------------------------------------------------------------------------
--
-- 6. ORPHAN ENROLLMENTS (courseUnitId references a missing CourseUnit)
--
-- WHY:
--   An Enrollment whose courseUnitId has no matching CourseUnit cannot be mapped
--   and would fail (or corrupt) a Moodle membership write.
--
-- CONDITION: REVIEW if non-zero — cleanup before the membership writer runs
--   (Phase 4+); NOT a Phase-1 gate.
-- ----------------------------------------------------------------------------
SELECT e.id, e.studentId, e.courseUnitId
FROM enrollments e
LEFT JOIN course_units cu ON cu.id = e.courseUnitId
WHERE cu.id IS NULL;


-- ----------------------------------------------------------------------------
--
-- 7. ORPHAN LECTURER ASSIGNMENTS (courseUnitId references a missing CourseUnit)
--
-- WHY:
--   Same as #6 — an assignment to a missing unit blocks an accurate
--   lecturer -> course Moodle write.
--
-- CONDITION: REVIEW if non-zero — cleanup before the lecturer writer runs
--   (Phase 4+); NOT a Phase-1 gate.
-- ----------------------------------------------------------------------------
SELECT la.id, la.lecturerId, la.courseUnitId
FROM lecturer_assignments la
LEFT JOIN course_units cu ON cu.id = la.courseUnitId
WHERE cu.id IS NULL;


-- ----------------------------------------------------------------------------
--
-- 8. COURSEUNITS WITH MISSING OR EMPTY CODES
--
-- WHY:
--   Moodle matching relies on `code` (or the future moodleCourseId). A unit with
--   no usable code cannot be auto-matched and needs a manual/fixed code.
--
-- CONDITION: BLOCKS the affected units (not the whole sync) until resolved.
-- ----------------------------------------------------------------------------
SELECT id, facultyId, code, name, isActive
FROM course_units
WHERE code IS NULL OR code = '' OR LENGTH(TRIM(code)) = 0;


-- ----------------------------------------------------------------------------
--
-- 9. INACTIVE COURSEUNITS
--
-- WHY:
--   isActive = 0 means "not offered." Moodle may still hold the course. Flagging
--   them lets ICT decide whether to reactivate or remove on the Moodle side, so
--   sync does not silently resurrect/overwrite an intentionally-inactive unit.
--
-- CONDITION: REVIEW each row before sync.
-- ----------------------------------------------------------------------------
SELECT id, facultyId, code, name, isActive
FROM course_units
WHERE isActive = 0;


-- ----------------------------------------------------------------------------
--
-- 10. USERS THAT CANNOT BE MATCHED TO MOODLE (no usable identity)
--
-- WHY:
--   The identity match order is moodleUserId -> regNumber -> email -> googleId.
--   A user with no regNumber, no email, AND no googleId (and is not an
--   admin/inactive/incomplete-profile seed) has no key the sync can use to
--   attach an integer moodleUserId. Each must be manually mapped or set aside.
--   system_admin / faculty_admin / inactive / not-profileComplete rows are
--   excluded because they are not Moodle sync targets.
--
-- CONDITION: BLOCKS the returned users (manual mapping required), not the whole
--   sync.
-- ----------------------------------------------------------------------------
SELECT u.id, u.email, u.fullName, u.role, u.regNumber, u.studentNumber,
       u.googleId, u.isActive, u.profileComplete
FROM users u
WHERE u.role NOT IN ('system_admin', 'faculty_admin')
  AND u.isActive = 1
  AND u.profileComplete = 1
  AND ( (u.regNumber IS NULL OR u.regNumber = '')
        AND (u.email IS NULL OR u.email = '')
        AND (u.googleId IS NULL OR u.googleId = '') );


-- ----------------------------------------------------------------------------
--
-- 11. USERS WITH DUPLICATE / CONFLICTING IDENTITY
--
-- WHY:
--   An active student whose regNumber equals another user's studentNumber (or
--   googleId / email-role mismatch) can cause a cross-account merge in Moodle.
--   Flag for manual review.
--
-- CONDITION: BLOCKS colliding users; otherwise REVIEW.
-- ----------------------------------------------------------------------------
SELECT a.id AS user_a, b.id AS user_b, a.regNumber AS shared_key
FROM users a
JOIN users b ON b.id <> a.id
            AND ( b.regNumber = a.regNumber
                  OR b.studentNumber = a.regNumber
                  OR a.studentNumber = b.regNumber )
WHERE a.regNumber IS NOT NULL AND a.regNumber <> '';


-- ----------------------------------------------------------------------------
--
-- 12. CATCH-ALL — ANY OTHER UNSAFE CONDITION
--
-- (a) Programme codes missing/empty        -> REVIEW
-- (b) Inactive users (potential "suspended")-> REVIEW
-- (c) Incomplete profiles excluded from matching -> REVIEW
--
-- CONDITION: REVIEW (below threshold = clean).
-- ----------------------------------------------------------------------------
-- (a) Programmes with unusable code
SELECT id, facultyId, code, name
FROM programmes
WHERE code IS NULL OR code = '' OR LENGTH(TRIM(code)) = 0;

-- (b) Inactive users (potential "suspended" markers)
SELECT id, email, fullName, role, isActive, profileComplete
FROM users
WHERE isActive = 0;

-- (c) Profiles not yet complete (excluded from matching)
SELECT id, email, fullName, role, profileComplete
FROM users
WHERE profileComplete = 0
  AND role NOT IN ('system_admin', 'faculty_admin');


-- ============================================================================
-- SUMMARY — INTERPRETATION GUIDE
-- ============================================================================
-- PASS CONDITIONS (must return zero rows/counts before Phase 1 or the first
--   Moodle writer can safely run):
--   #1 duplicate emails
--   #2 duplicate registration numbers
--   #3 duplicate student numbers
--
-- BLOCKING CONDITIONS (require data cleanup / manual mapping before sync):
--   #4 duplicate CourseUnit codes within a faculty  (blocks those units)
--   #8 CourseUnits with missing/empty codes           (blocks those units)
--   #10 users with no usable identity                 (blocks those users)
--   #11 users with conflicting identity               (blocks those users)
--
-- REVIEW CONDITIONS (do NOT necessarily block Phase 1; need human review):
--   #5 duplicate Programme codes
--   #6 orphan enrollments
--   #7 orphan lecturer assignments
--   #9 inactive CourseUnits
--   #12 catch-all (programme codes, inactive users, incomplete profiles)
-- ============================================================================