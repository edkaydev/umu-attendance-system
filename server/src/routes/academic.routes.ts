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
  importLecturers,
  importFacultyAdmins,
  importStudents,
  facultySchema,
  programmeSchema,
  courseUnitSchema,
  curriculumSchema,
  curriculumUpdateSchema,
  electiveRequirementSchema,
  patchCurriculum,
  putElectiveRequirement,
  getElectiveRequirements,
  updateFacultySchema,
  updateProgrammeSchema,
  updateCourseUnitSchema,
} from '../controllers/academic.controller'

const router = Router()
const adminOnly     = requireRole('system_admin')
const curriculumAccess = requireRole('system_admin', 'faculty_admin')
// Faculty Admins may create units (forced into their own faculty by the controller)
const unitWriters   = requireRole('system_admin', 'faculty_admin')

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

// Programme — faculty_admin can read (for curriculum dropdowns)
router.get('/programmes', authenticate, curriculumAccess, getProgrammes)
router.post('/programmes', authenticate, adminOnly, validate(programmeSchema), postProgramme)
router.put('/programmes/:id', authenticate, adminOnly, validate(updateProgrammeSchema), putProgramme)

// Course unit — faculty_admin can read (for curriculum dropdowns)
router.get('/course-units', authenticate, curriculumAccess, getCourseUnits)
router.post('/course-units', authenticate, unitWriters, validate(courseUnitSchema), postCourseUnit)
router.put('/course-units/:id', authenticate, adminOnly, validate(updateCourseUnitSchema), putCourseUnit)
// Share / unshare a course unit with additional faculties
router.post('/course-units/:id/faculties', authenticate, adminOnly, postCourseUnitFaculty)
router.delete('/course-units/:id/faculties/:facultyId', authenticate, adminOnly, deleteCourseUnitFaculty)

// Curriculum mapping — faculty_admin can read and write (scoped to their faculty)
router.get('/curriculum', authenticate, curriculumAccess, getCurriculum)
router.post('/curriculum', authenticate, curriculumAccess, validate(curriculumSchema), postCurriculum)
router.patch('/curriculum/:id', authenticate, curriculumAccess, validate(curriculumUpdateSchema), patchCurriculum)
router.delete('/curriculum/:id', authenticate, curriculumAccess, deleteCurriculum)

// Elective rules per path cell — faculty_admin scoped to own faculty
router.get('/elective-requirements', authenticate, curriculumAccess, getElectiveRequirements)
router.put('/elective-requirement', authenticate, curriculumAccess, validate(electiveRequirementSchema), putElectiveRequirement)

// CSV imports — system_admin only
router.post('/import/structure', authenticate, adminOnly, upload.single('file'), importStructure)
router.post('/import/lecturers', authenticate, adminOnly, upload.single('file'), importLecturers)
router.post('/import/faculty-admins', authenticate, adminOnly, upload.single('file'), importFacultyAdmins)
router.post('/import/students', authenticate, adminOnly, upload.single('file'), importStudents)

export default router
