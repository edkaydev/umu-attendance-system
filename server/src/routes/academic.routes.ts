import { Router } from 'express'
import { authenticate } from '../middleware/auth'
import { requireRole } from '../middleware/role'
import { validate } from '../middleware/validate'
import {
  getCampuses,
  postCampus,
  putCampus,
  getFaculties,
  postFaculty,
  putFaculty,
  getProgrammes,
  postProgramme,
  putProgramme,
  getCourseUnits,
  postCourseUnit,
  putCourseUnit,
  getCurriculum,
  postCurriculum,
  deleteCurriculum,
  getOptions,
  campusSchema,
  facultySchema,
  programmeSchema,
  courseUnitSchema,
  curriculumSchema,
  updateCampusSchema,
  updateFacultySchema,
  updateProgrammeSchema,
  updateCourseUnitSchema,
} from '../controllers/academic.controller'

const router = Router()
const adminOnly = requireRole('system_admin')

// Profile cascade options — any authenticated user (profile setup)
router.get('/options', authenticate, getOptions)

// Campus
router.get('/campuses', authenticate, adminOnly, getCampuses)
router.post('/campuses', authenticate, adminOnly, validate(campusSchema), postCampus)
router.put('/campuses/:id', authenticate, adminOnly, validate(updateCampusSchema), putCampus)

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

// Curriculum mapping
router.get('/curriculum', authenticate, adminOnly, getCurriculum)
router.post('/curriculum', authenticate, adminOnly, validate(curriculumSchema), postCurriculum)
router.delete('/curriculum/:id', authenticate, adminOnly, deleteCurriculum)

export default router
