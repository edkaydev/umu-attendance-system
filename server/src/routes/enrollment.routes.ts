import { Router } from 'express'
import { authenticate } from '../middleware/auth'
import { requireRole } from '../middleware/role'
import {
  getUnitOverview,
  postEnrollment,
  deleteEnrollment,
  getElectives,
  putElectives,
} from '../controllers/enrollment.controller'

const router = Router()
const facultyAdminOnly = requireRole('faculty_admin')

router.get('/overview', authenticate, facultyAdminOnly, getUnitOverview)
router.get('/electives', authenticate, requireRole('student'), getElectives)
router.put('/electives', authenticate, requireRole('student'), putElectives)
router.post('/', authenticate, facultyAdminOnly, postEnrollment)
router.delete('/:id', authenticate, facultyAdminOnly, deleteEnrollment)

export default router
