import { Router } from 'express'
import { authenticate } from '../middleware/auth'
import { requireRole } from '../middleware/role'
import {
  getConfig,
  testConnection,
  getSyncStatus,
  sync,
} from '../controllers/moodle-sync.controller'

const router = Router()

// All Moodle sync endpoints are restricted to System Admin (config, testing,
// running a sync, and viewing status are administrative operations).
router.get('/config', authenticate, requireRole('system_admin'), getConfig)
router.post('/test-connection', authenticate, requireRole('system_admin'), testConnection)
router.get('/sync-status', authenticate, requireRole('system_admin'), getSyncStatus)
router.post('/sync', authenticate, requireRole('system_admin'), sync)

export default router
