import { Router } from 'express'
import { authenticate } from '../middleware/auth'
import { requireRole } from '../middleware/role'
import {
  getUsers,
  getUserById,
  deactivateUser,
  activateUser,
  updateUserRole,
  assignFacultyController,
} from '../controllers/user.controller'

const router = Router()
const adminOnly = requireRole('system_admin')

router.get('/',                     authenticate, adminOnly, getUsers)
router.get('/:id',                  authenticate, adminOnly, getUserById)
router.patch('/:id/deactivate',     authenticate, adminOnly, deactivateUser)
router.patch('/:id/activate',       authenticate, adminOnly, activateUser)
router.patch('/:id/role',           authenticate, adminOnly, updateUserRole)
router.patch('/:id/faculty',        authenticate, adminOnly, assignFacultyController)

export default router
