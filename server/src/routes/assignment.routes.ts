import { Router } from 'express'
import { authenticate } from '../middleware/auth'
import { requireRole } from '../middleware/role'
import {
  getAssignments,
  postAssignment,
  deleteAssignment,
} from '../controllers/assignment.controller'

const router = Router()
const facultyAdminOnly = requireRole('faculty_admin')

router.get('/', authenticate, facultyAdminOnly, getAssignments)
router.post('/', authenticate, facultyAdminOnly, postAssignment)
router.delete('/:id', authenticate, facultyAdminOnly, deleteAssignment)

export default router
