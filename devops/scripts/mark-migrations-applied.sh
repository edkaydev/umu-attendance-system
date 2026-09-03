#!/bin/bash
# =============================================================================
# mark-migrations-applied.sh
#
# For FRESH INSTALLS only — run after applying prisma/migrations/init/migration.sql
# directly to a new database. Tells Prisma that all incremental migrations are
# already applied (because the init SQL contains their cumulative result).
#
# Usage (inside the running app container):
#   docker compose exec app bash devops/scripts/mark-migrations-applied.sh
#
# DO NOT run this on an existing production database — it will confuse Prisma.
# =============================================================================
set -e

MIGRATIONS=(
  "20250710_add_excuse_requests"
  "20250825000000_add_excuse_requests_and_extend_code_length"
  "20260804204504_init"
  "20260805120000_add_system_settings"
  "20260805130000_add_session_mode_time"
  "20260805160000_add_course_unit_faculties"
  "20260806100000_add_local_auth"
  "20260806120000_campuses_to_code"
  "20260806140000_must_change_password"
  "20260806150000_system_settings_text"
  "20260807100000_add_class_duration"
  "20260820_add_session_geofence"
  "20260821_standing_curriculum"
  "20260821_unique_student_identifiers"
  "20260822120000_add_has_completed_tour"
  "20260824000000_class_duration_required"
  "20260824080000_add_session_meeting_link"
  "20260824090000_lecturer_faculty_memberships"
  "20260824093000_electives"
  "20260824100000_demo_managed_passwords"
  "20260902000000_enforce_single_open_session"
  "20260902120000_moodle_identity"
  "20260903120000_moodle_academic_hierarchy"
  "20260903200000_drop_password_fields"
)

echo "Marking ${#MIGRATIONS[@]} incremental migrations as applied..."

for migration in "${MIGRATIONS[@]}"; do
  echo "  → $migration"
  npx prisma migrate resolve --applied "$migration"
done

echo "Done. Prisma migration history is now in sync."
