import { Router } from 'express'
import multer from 'multer'
import { authenticate } from '../middleware/auth'
import { requireRole } from '../middleware/role'
import { validate } from '../middleware/validate'
import {
  getCampuses,
  getFaculties,
  postFaculty,
  putFaculty,
  getProgrammes,
  postProgramme,
  putProgramme,
  getCourseUnits,
  postCourseUnit,
  putCourseUnit,
  postCourseUnitFaculty,
  deleteCourseUnitFaculty,
  getCurriculum,
  postCurriculum,
  deleteCurriculum,
  getOptions,
  importStructure,
  importStaff,
  importStudents,
  facultySchema,
  programmeSchema,
  courseUnitSchema,
  curriculumSchema,
  updateFacultySchema,
  updateProgrammeSchema,
  updateCourseUnitSchema,
} from '../controllers/academic.controller'

const router = Router()
const adminOnly = requireRole('system_admin')

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 }, // 5 MB
})

// Profile cascade options — any authenticated user (profile setup)
router.get('/options', authenticate, getOptions)

// Campus (fixed list — read-only)
router.get('/campuses', authenticate, adminOnly, getCampuses)

// Faculty
router.get('/faculties', authenticate, adminOnly, getFaculties)
router.post('/faculties', authenticate, adminOnly, validate(facultySchema), postFaculty)
router.put('/faculties/:id', authenticate, adminOnly, validate(updateFacultySchema), putFaculty)

// Programme
router.get('/programmes', authenticate, adminOnly, getProgrammes)
router.post('/programmes', authenticate, adminOnly, validate(programmeSchema), postProgramme)
router.put('/programmes/:id', authenticate, adminOnly, validate(updateProgrammeSchema), putProgramme)

// Course unit
router.get('/course-units', authenticate, adminOnly, getCourseUnits)
router.post('/course-units', authenticate, adminOnly, validate(courseUnitSchema), postCourseUnit)
router.put('/course-units/:id', authenticate, adminOnly, validate(updateCourseUnitSchema), putCourseUnit)
// Share / unshare a course unit with additional faculties
router.post('/course-units/:id/faculties', authenticate, adminOnly, postCourseUnitFaculty)
router.delete('/course-units/:id/faculties/:facultyId', authenticate, adminOnly, deleteCourseUnitFaculty)

// Curriculum mapping
router.get('/curriculum', authenticate, adminOnly, getCurriculum)
router.post('/curriculum', authenticate, adminOnly, validate(curriculumSchema), postCurriculum)
router.delete('/curriculum/:id', authenticate, adminOnly, deleteCurriculum)

// CSV imports
router.post('/import/structure', authenticate, adminOnly, upload.single('file'), importStructure)
router.post('/import/staff', authenticate, adminOnly, upload.single('file'), importStaff)
router.post('/import/students', authenticate, adminOnly, upload.single('file'), importStudents)

export default router
