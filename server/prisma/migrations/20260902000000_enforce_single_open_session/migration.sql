-- Enforce the F-01 invariant at the database: never two simultaneously open
-- sessions for the same lecturer, and never two for the same course unit +
-- academic period. Applied via `prisma migrate deploy` (CI/staging/prod).
--
-- MySQL cannot express a true partial unique index (WHERE status='open'), so we
-- emulate it with generated columns: NULL when the row is NOT open, else the key.
-- InnoDB treats NULLs as distinct in a unique index, so multiple closed/historical
-- sessions coexist while simultaneous open ones collide and are rejected with
-- a unique-constraint error (P2002), translated to 409 by session.service.ts.

-- 0) Safety: downstream of a historical TOCTOU race there may be rows that
--    already violate the invariant. First close every duplicate OPEN session,
--    keeping only the most recent one per lecturer ...
UPDATE sessions AS s
JOIN (
  SELECT id
  FROM (
    SELECT id,
           ROW_NUMBER() OVER (PARTITION BY lecturerId ORDER BY openedAt DESC, id ASC) AS rn
    FROM sessions
    WHERE status = 'open'
  ) AS ranked
  WHERE ranked.rn > 1
) AS dup ON dup.id = s.id
SET s.status = 'closed', s.closedAt = COALESCE(s.closedAt, s.openedAt);

-- ... and then close every duplicate OPEN session per course unit + period
-- (which could otherwise be opened by two different lecturers).
UPDATE sessions AS s
JOIN (
  SELECT id
  FROM (
    SELECT id,
           ROW_NUMBER() OVER (PARTITION BY courseUnitId, academicYear, semester ORDER BY openedAt DESC, id ASC) AS rn
    FROM sessions
    WHERE status = 'open'
  ) AS ranked
  WHERE ranked.rn > 1
) AS dup ON dup.id = s.id
SET s.status = 'closed', s.closedAt = COALESCE(s.closedAt, s.openedAt);

-- 1) Generated key columns (STORED) that are NULL for non-open sessions and the
--    key for open ones. Use separators that cannot appear in a UUID or in the
--    academic-year format (YYYY/YYYY).
ALTER TABLE sessions
  ADD COLUMN open_lecturer_key VARCHAR(191)
    AS (IF(status = 'open', lecturerId, NULL)) STORED,
  ADD COLUMN open_unit_period_key VARCHAR(64)
    AS (IF(status = 'open', CONCAT(courseUnitId, ':', academicYear, ':', semester), NULL)) STORED;

-- 2) Unique indexes → at most one open session per lecturer, and at most one
--    open session per (course unit, academic year, semester). A violating
--    INSERT/UPDATE is rejected (ER_DUP_ENTRY / P2002).
ALTER TABLE sessions
  ADD UNIQUE INDEX sessions_open_lecturer_key_unique (open_lecturer_key),
  ADD UNIQUE INDEX sessions_open_unit_period_key_unique (open_unit_period_key);