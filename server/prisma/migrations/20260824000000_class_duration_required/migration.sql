-- Sessions must always auto-close: backfill legacy nulls to 60 min,
-- then make classDuration required with a 60-minute default.
UPDATE "sessions" SET "classDuration" = 60 WHERE "classDuration" IS NULL;
ALTER TABLE "sessions" ALTER COLUMN "classDuration" SET NOT NULL;
ALTER TABLE "sessions" ALTER COLUMN "classDuration" SET DEFAULT 60;
