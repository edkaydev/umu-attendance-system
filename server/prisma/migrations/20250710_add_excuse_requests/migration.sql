-- CreateEnum
CREATE TABLE `excuse_requests` (
    `id` VARCHAR(36) NOT NULL,
    `studentId` VARCHAR(36) NOT NULL,
    `sessionId` VARCHAR(36) NOT NULL,
    `reason` TEXT NOT NULL,
    `status` ENUM('pending', 'approved', 'rejected') NOT NULL DEFAULT 'pending',
    `reviewedById` VARCHAR(36) NULL,
    `reviewedAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `excuse_requests_sessionId_studentId_key`(`sessionId`, `studentId`),
    INDEX `excuse_requests_sessionId_status_idx`(`sessionId`, `status`),
    INDEX `excuse_requests_studentId_idx`(`studentId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `excuse_requests` ADD CONSTRAINT `excuse_requests_studentId_fkey` FOREIGN KEY (`studentId`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `excuse_requests` ADD CONSTRAINT `excuse_requests_sessionId_fkey` FOREIGN KEY (`sessionId`) REFERENCES `sessions`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
