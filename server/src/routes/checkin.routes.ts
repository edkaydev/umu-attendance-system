import { Router } from 'express'
import { authenticate } from '../middleware/auth'
import { requireRole } from '../middleware/role'
import { checkInController, listLiveController } from '../controllers/checkin.controller'

const router = Router()
const studentOnly = requireRole('student')

router.get('/live', authenticate, studentOnly, listLiveController)
router.post('/', authenticate, studentOnly, checkInController)

export default router
