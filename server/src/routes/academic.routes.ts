import { Router } from 'express'
import multer from 'multer'
import { authenticate } from '../middleware/auth'
import { requireRole } from '../middleware/role'
import {
  getCampuses,
  getFaculties,
  getProgrammes,
  getCourseUnits,
  getCurriculum,
  getOptions,
  importFacultyAdmins,
} from '../controllers/academic.controller'

const router = Router()
const adminOnly = requireRole('system_admin')
const curriculumAccess = requireRole('system_admin', 'faculty_admin')

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 }, // 5 MB
})

// Profile cascade options — any authenticated user (profile setup)
router.get('/options', authenticate, getOptions)

// Campus (fixed list — read-only)
router.get('/campuses', authenticate, adminOnly, getCampuses)

// Faculty (read-only — created by Moodle hierarchy sync)
router.get('/faculties', authenticate, adminOnly, getFaculties)

// Programme (read-only — created by Moodle hierarchy sync)
router.get('/programmes', authenticate, curriculumAccess, getProgrammes)

// Course unit (read-only — created by Moodle hierarchy sync)
router.get('/course-units', authenticate, curriculumAccess, getCourseUnits)

// Curriculum mapping (read-only — managed by Moodle hierarchy sync)
router.get('/curriculum', authenticate, curriculumAccess, getCurriculum)

// CSV imports — only Faculty Admin import remains
router.post('/import/faculty-admins', authenticate, adminOnly, upload.single('file'), importFacultyAdmins)

export default router
