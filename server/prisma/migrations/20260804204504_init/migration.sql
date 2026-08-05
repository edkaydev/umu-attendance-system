-- CreateTable
CREATE TABLE `campuses` (
    `id` VARCHAR(191) NOT NULL,
    `name` VARCHAR(100) NOT NULL,
    `code` VARCHAR(20) NOT NULL,
    `isActive` BOOLEAN NOT NULL DEFAULT true,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `campuses_code_key`(`code`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `faculties` (
    `id` VARCHAR(191) NOT NULL,
    `campusId` VARCHAR(191) NOT NULL,
    `name` VARCHAR(100) NOT NULL,
    `code` VARCHAR(20) NOT NULL,
    `isActive` BOOLEAN NOT NULL DEFAULT true,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `faculties_campusId_code_key`(`campusId`, `code`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `programmes` (
    `id` VARCHAR(191) NOT NULL,
    `facultyId` VARCHAR(191) NOT NULL,
    `name` VARCHAR(150) NOT NULL,
    `code` VARCHAR(20) NOT NULL,
    `isActive` BOOLEAN NOT NULL DEFAULT true,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `programmes_facultyId_code_key`(`facultyId`, `code`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `course_units` (
    `id` VARCHAR(191) NOT NULL,
    `facultyId` VARCHAR(191) NOT NULL,
    `code` VARCHAR(20) NOT NULL,
    `name` VARCHAR(150) NOT NULL,
    `isActive` BOOLEAN NOT NULL DEFAULT true,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `course_units_facultyId_code_key`(`facultyId`, `code`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `curriculum_units` (
    `id` VARCHAR(191) NOT NULL,
    `courseUnitId` VARCHAR(191) NOT NULL,
    `programmeId` VARCHAR(191) NOT NULL,
    `year` TINYINT NOT NULL,
    `semester` TINYINT NOT NULL,
    `academicYear` VARCHAR(10) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `curriculum_units_courseUnitId_programmeId_year_semester_acad_key`(`courseUnitId`, `programmeId`, `year`, `semester`, `academicYear`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `users` (
    `id` VARCHAR(191) NOT NULL,
    `googleId` VARCHAR(100) NOT NULL,
    `email` VARCHAR(150) NOT NULL,
    `fullName` VARCHAR(100) NOT NULL,
    `role` ENUM('system_admin', 'faculty_admin', 'lecturer', 'student') NOT NULL,
    `facultyId` VARCHAR(191) NULL,
    `programmeId` VARCHAR(191) NULL,
    `year` TINYINT NULL,
    `semester` TINYINT NULL,
    `academicYear` VARCHAR(10) NULL,
    `regNumber` VARCHAR(30) NULL,
    `profileComplete` BOOLEAN NOT NULL DEFAULT false,
    `isActive` BOOLEAN NOT NULL DEFAULT true,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `users_googleId_key`(`googleId`),
    UNIQUE INDEX `users_email_key`(`email`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `enrollments` (
    `id` VARCHAR(191) NOT NULL,
    `studentId` VARCHAR(191) NOT NULL,
    `courseUnitId` VARCHAR(191) NOT NULL,
    `academicYear` VARCHAR(10) NOT NULL,
    `semester` TINYINT NOT NULL,
    `enrolledAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `enrollments_studentId_courseUnitId_academicYear_semester_key`(`studentId`, `courseUnitId`, `academicYear`, `semester`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `lecturer_assignments` (
    `id` VARCHAR(191) NOT NULL,
    `lecturerId` VARCHAR(191) NOT NULL,
    `courseUnitId` VARCHAR(191) NOT NULL,
    `academicYear` VARCHAR(10) NOT NULL,
    `semester` TINYINT NOT NULL,
    `assignedById` VARCHAR(191) NOT NULL,
    `assignedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `lecturer_assignments_lecturerId_courseUnitId_academicYear_se_key`(`lecturerId`, `courseUnitId`, `academicYear`, `semester`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `sessions` (
    `id` VARCHAR(191) NOT NULL,
    `courseUnitId` VARCHAR(191) NOT NULL,
    `lecturerId` VARCHAR(191) NOT NULL,
    `academicYear` VARCHAR(10) NOT NULL,
    `semester` TINYINT NOT NULL,
    `code` VARCHAR(8) NOT NULL,
    `codeExpiresAt` DATETIME(3) NOT NULL,
    `status` ENUM('open', 'closed') NOT NULL DEFAULT 'open',
    `venue` VARCHAR(100) NULL,
    `openedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `closedAt` DATETIME(3) NULL,

    INDEX `sessions_code_idx`(`code`),
    INDEX `sessions_courseUnitId_status_idx`(`courseUnitId`, `status`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `attendance_records` (
    `id` VARCHAR(191) NOT NULL,
    `sessionId` VARCHAR(191) NOT NULL,
    `studentId` VARCHAR(191) NOT NULL,
    `status` ENUM('present', 'absent', 'excused') NOT NULL,
    `checkedInAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `attendance_records_sessionId_studentId_key`(`sessionId`, `studentId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `attendance_edits` (
    `id` VARCHAR(191) NOT NULL,
    `attendanceRecordId` VARCHAR(191) NOT NULL,
    `changedById` VARCHAR(191) NOT NULL,
    `oldStatus` ENUM('present', 'absent', 'excused') NOT NULL,
    `newStatus` ENUM('present', 'absent', 'excused') NOT NULL,
    `reason` TEXT NOT NULL,
    `changedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `attendance_alerts` (
    `id` VARCHAR(191) NOT NULL,
    `studentId` VARCHAR(191) NOT NULL,
    `courseUnitId` VARCHAR(191) NOT NULL,
    `alertType` ENUM('warning', 'critical') NOT NULL,
    `attendancePct` DECIMAL(5, 2) NOT NULL,
    `sentAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `resolved` BOOLEAN NOT NULL DEFAULT false,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `refresh_tokens` (
    `id` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `tokenHash` VARCHAR(255) NOT NULL,
    `expiresAt` DATETIME(3) NOT NULL,
    `revoked` BOOLEAN NOT NULL DEFAULT false,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `audit_logs` (
    `id` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `action` VARCHAR(50) NOT NULL,
    `targetType` VARCHAR(50) NOT NULL,
    `targetId` VARCHAR(36) NOT NULL,
    `meta` JSON NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `audit_logs_userId_idx`(`userId`),
    INDEX `audit_logs_action_idx`(`action`),
    INDEX `audit_logs_createdAt_idx`(`createdAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `faculties` ADD CONSTRAINT `faculties_campusId_fkey` FOREIGN KEY (`campusId`) REFERENCES `campuses`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `programmes` ADD CONSTRAINT `programmes_facultyId_fkey` FOREIGN KEY (`facultyId`) REFERENCES `faculties`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `course_units` ADD CONSTRAINT `course_units_facultyId_fkey` FOREIGN KEY (`facultyId`) REFERENCES `faculties`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `curriculum_units` ADD CONSTRAINT `curriculum_units_courseUnitId_fkey` FOREIGN KEY (`courseUnitId`) REFERENCES `course_units`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `curriculum_units` ADD CONSTRAINT `curriculum_units_programmeId_fkey` FOREIGN KEY (`programmeId`) REFERENCES `programmes`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `users` ADD CONSTRAINT `users_facultyId_fkey` FOREIGN KEY (`facultyId`) REFERENCES `faculties`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `users` ADD CONSTRAINT `users_programmeId_fkey` FOREIGN KEY (`programmeId`) REFERENCES `programmes`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `enrollments` ADD CONSTRAINT `enrollments_studentId_fkey` FOREIGN KEY (`studentId`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `enrollments` ADD CONSTRAINT `enrollments_courseUnitId_fkey` FOREIGN KEY (`courseUnitId`) REFERENCES `course_units`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `lecturer_assignments` ADD CONSTRAINT `lecturer_assignments_lecturerId_fkey` FOREIGN KEY (`lecturerId`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `lecturer_assignments` ADD CONSTRAINT `lecturer_assignments_courseUnitId_fkey` FOREIGN KEY (`courseUnitId`) REFERENCES `course_units`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `lecturer_assignments` ADD CONSTRAINT `lecturer_assignments_assignedById_fkey` FOREIGN KEY (`assignedById`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `sessions` ADD CONSTRAINT `sessions_courseUnitId_fkey` FOREIGN KEY (`courseUnitId`) REFERENCES `course_units`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `sessions` ADD CONSTRAINT `sessions_lecturerId_fkey` FOREIGN KEY (`lecturerId`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `attendance_records` ADD CONSTRAINT `attendance_records_sessionId_fkey` FOREIGN KEY (`sessionId`) REFERENCES `sessions`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `attendance_records` ADD CONSTRAINT `attendance_records_studentId_fkey` FOREIGN KEY (`studentId`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `attendance_edits` ADD CONSTRAINT `attendance_edits_attendanceRecordId_fkey` FOREIGN KEY (`attendanceRecordId`) REFERENCES `attendance_records`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `attendance_edits` ADD CONSTRAINT `attendance_edits_changedById_fkey` FOREIGN KEY (`changedById`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `attendance_alerts` ADD CONSTRAINT `attendance_alerts_studentId_fkey` FOREIGN KEY (`studentId`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `attendance_alerts` ADD CONSTRAINT `attendance_alerts_courseUnitId_fkey` FOREIGN KEY (`courseUnitId`) REFERENCES `course_units`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `refresh_tokens` ADD CONSTRAINT `refresh_tokens_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `audit_logs` ADD CONSTRAINT `audit_logs_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

