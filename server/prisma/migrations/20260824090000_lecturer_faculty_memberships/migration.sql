-- Lecturers can belong to up to 3 faculties (primary mirrored on users.facultyId)
CREATE TABLE `lecturer_faculties` (
    `id` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `facultyId` VARCHAR(191) NOT NULL,
    `isPrimary` BOOLEAN NOT NULL DEFAULT false,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `lecturer_faculties_userId_facultyId_key`(`userId`, `facultyId`),
    INDEX `lecturer_faculties_facultyId_idx`(`facultyId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `lecturer_faculties` ADD CONSTRAINT `lecturer_faculties_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `lecturer_faculties` ADD CONSTRAINT `lecturer_faculties_facultyId_fkey` FOREIGN KEY (`facultyId`) REFERENCES `faculties`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- Backfill: every existing lecturer's current faculty becomes their primary membership
INSERT INTO `lecturer_faculties` (`id`, `userId`, `facultyId`, `isPrimary`, `createdAt`)
SELECT UUID(), u.`id`, u.`facultyId`, true, CURRENT_TIMESTAMP(3)
FROM `users` u
WHERE u.`role` = 'lecturer' AND u.`facultyId` IS NOT NULL;
