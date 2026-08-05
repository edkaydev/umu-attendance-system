-- CreateTable: course_unit_faculties
-- Allows a course unit to be shared across multiple faculties
-- beyond its owning faculty (CourseUnit.facultyId).

CREATE TABLE `course_unit_faculties` (
    `id` VARCHAR(191) NOT NULL,
    `courseUnitId` VARCHAR(191) NOT NULL,
    `facultyId` VARCHAR(191) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `course_unit_faculties_courseUnitId_facultyId_key`(`courseUnitId`, `facultyId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `course_unit_faculties` ADD CONSTRAINT `course_unit_faculties_courseUnitId_fkey` FOREIGN KEY (`courseUnitId`) REFERENCES `course_units`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `course_unit_faculties` ADD CONSTRAINT `course_unit_faculties_facultyId_fkey` FOREIGN KEY (`facultyId`) REFERENCES `faculties`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
