-- Join table for lecturer additional faculties (beyond the primary facultyId).
CREATE TABLE IF NOT EXISTS `user_faculties` (
  `id`        VARCHAR(36)  NOT NULL,
  `userId`    VARCHAR(36)  NOT NULL,
  `facultyId` VARCHAR(36)  NOT NULL,
  `createdAt` DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  UNIQUE KEY `user_faculties_userId_facultyId_key` (`userId`, `facultyId`),
  CONSTRAINT `user_faculties_userId_fkey`    FOREIGN KEY (`userId`)    REFERENCES `users`    (`id`) ON DELETE CASCADE,
  CONSTRAINT `user_faculties_facultyId_fkey` FOREIGN KEY (`facultyId`) REFERENCES `faculties` (`id`) ON DELETE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
