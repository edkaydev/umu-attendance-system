import { Router } from 'express'
import { authenticate } from '../middleware/auth'
import { requireRole } from '../middleware/role'
import {
  lecturerReportController,
  programmeReportController,
  courseUnitReportController,
  studentReportController,
} from '../controllers/report.controller'
import {
  lecturerPdfController,
  programmePdfController,
  courseUnitPdfController,
  studentPdfController,
} from '../controllers/pdf.controller'

const router = Router()
// System Admin has global report access; Faculty Admin is scoped to their
// faculty inside the service layer.
const facultyAdmin = requireRole('faculty_admin', 'system_admin')
const lecturerOrFacultyAdmin = requireRole('lecturer', 'faculty_admin', 'system_admin')

// JSON endpoints
router.get('/lecturer/:lecturerId', authenticate, facultyAdmin, lecturerReportController)
router.get('/programme/:programmeId', authenticate, facultyAdmin, programmeReportController)
router.get('/course-unit/:courseUnitId', authenticate, lecturerOrFacultyAdmin, courseUnitReportController)
router.get('/student/:studentId', authenticate, facultyAdmin, studentReportController)

// PDF endpoints (FR-10; course-unit PDF covers a lecturer's own units per FR-10.10)
router.get('/lecturer/:lecturerId/pdf', authenticate, facultyAdmin, lecturerPdfController)
router.get('/programme/:programmeId/pdf', authenticate, facultyAdmin, programmePdfController)
router.get('/course-unit/:courseUnitId/pdf', authenticate, lecturerOrFacultyAdmin, courseUnitPdfController)
router.get('/student/:studentId/pdf', authenticate, facultyAdmin, studentPdfController)

export default router
