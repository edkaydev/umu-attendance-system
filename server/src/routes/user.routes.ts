import { Router } from 'express'
import { authenticate } from '../middleware/auth'
import { requireRole } from '../middleware/role'
import {
  getUsers,
  getUserById,
  createUserController,
  deactivateUser,
  activateUser,
  updateUserRole,
  assignFacultyController,
  updateUserController,
  deleteUserController,
  bulkDeleteUsersController,
} from '../controllers/user.controller'

const router = Router()
const adminOnly = requireRole('system_admin')

router.get('/',                     authenticate, adminOnly, getUsers)
router.post('/',                    authenticate, adminOnly, createUserController)
router.post('/bulk-delete',         authenticate, adminOnly, bulkDeleteUsersController)
router.get('/:id',                  authenticate, adminOnly, getUserById)
router.patch('/:id',                authenticate, adminOnly, updateUserController)
router.delete('/:id',               authenticate, adminOnly, deleteUserController)
router.patch('/:id/deactivate',     authenticate, adminOnly, deactivateUser)
router.patch('/:id/activate',       authenticate, adminOnly, activateUser)
router.patch('/:id/role',           authenticate, adminOnly, updateUserRole)
router.patch('/:id/faculty',        authenticate, adminOnly, assignFacultyController)

export default router
