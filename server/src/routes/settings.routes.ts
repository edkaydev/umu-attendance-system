import { Router } from 'express'
import { authenticate } from '../middleware/auth'
import { requireRole } from '../middleware/role'
import { getProfileEditing, setProfileEditing } from '../controllers/settings.controller'

const router = Router()

router.get('/profile-editing', authenticate, getProfileEditing)
router.patch('/profile-editing', authenticate, requireRole('system_admin'), setProfileEditing)

export default router
