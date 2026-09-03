-- This migration has been superseded by 20260804204504_init which creates the
-- sessions table with code VARCHAR(8) from the start. The excuse_requests table
-- was already created in 20250710_add_excuse_requests.
-- This file exists so `prisma migrate resolve --applied` can mark it as applied
-- during the fresh-install flow (devops/scripts/mark-migrations-applied.sh).
SELECT 1;
