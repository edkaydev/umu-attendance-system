import { Router } from 'express'
import { authenticate } from '../middleware/auth'
import { requireRole } from '../middleware/role'
import { listAuditLogsController } from '../controllers/audit-log.controller'

const router = Router()

router.get('/', authenticate, requireRole('faculty_admin', 'system_admin'), listAuditLogsController)

export default router
