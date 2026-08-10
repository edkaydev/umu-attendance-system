import { Router } from 'express'
import { authenticate } from '../middleware/auth'
import { requireRole } from '../middleware/role'
import {
  getProfileEditing,
  setProfileEditing,
  getCurrentPeriodController,
  setCurrentPeriodController,
  getSupportSettingsController,
  setSupportSettingsController,
  resetDatabaseController,
  clearCacheController,
  updateSystemController,
  updateLogController,
} from '../controllers/settings.controller'

const router = Router()

router.get('/profile-editing',  authenticate, getProfileEditing)
router.patch('/profile-editing', authenticate, requireRole('system_admin'), setProfileEditing)

router.get('/current-period',   getCurrentPeriodController)
router.patch('/current-period', authenticate, requireRole('system_admin'), setCurrentPeriodController)

router.get('/support',   authenticate, getSupportSettingsController)
router.patch('/support', authenticate, requireRole('system_admin'), setSupportSettingsController)

router.post('/reset-database', authenticate, requireRole('system_admin'), resetDatabaseController)
router.post('/clear-cache',    authenticate, requireRole('system_admin'), clearCacheController)
router.post('/update-system',  authenticate, requireRole('system_admin'), updateSystemController)
router.get('/update-log',      authenticate, requireRole('system_admin'), updateLogController)

export default router
