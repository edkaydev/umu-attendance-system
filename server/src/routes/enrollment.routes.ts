import { Router } from 'express'
import { authenticate } from '../middleware/auth'
import { requireRole } from '../middleware/role'
import {
  getUnitOverview,
  postEnrollment,
  deleteEnrollment,
} from '../controllers/enrollment.controller'

const router = Router()
const facultyAdminOnly = requireRole('faculty_admin')

router.get('/overview', authenticate, facultyAdminOnly, getUnitOverview)
router.post('/', authenticate, facultyAdminOnly, postEnrollment)
router.delete('/:id', authenticate, facultyAdminOnly, deleteEnrollment)

export default router
