-- Onboarding: track whether each user has seen (or skipped) the guided tour.
ALTER TABLE `users`
  ADD COLUMN `hasCompletedTour` BOOLEAN NOT NULL DEFAULT false AFTER `profileComplete`;
