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
  getDefaultUserPasswordController,
  setDefaultUserPasswordController,
  resetDatabaseController,
  clearCacheController,
} from '../controllers/settings.controller'

const router = Router()

router.get('/profile-editing', authenticate, getProfileEditing)
router.patch('/profile-editing', authenticate, requireRole('system_admin'), setProfileEditing)

router.get('/current-period', getCurrentPeriodController)
router.patch('/current-period', authenticate, requireRole('system_admin'), setCurrentPeriodController)

router.get('/support', authenticate, getSupportSettingsController)
router.patch('/support', authenticate, requireRole('system_admin'), setSupportSettingsController)

router.get('/default-user-password', authenticate, requireRole('system_admin'), getDefaultUserPasswordController)
router.patch('/default-user-password', authenticate, requireRole('system_admin'), setDefaultUserPasswordController)

router.post('/reset-database', authenticate, requireRole('system_admin'), resetDatabaseController)
router.post('/clear-cache', authenticate, requireRole('system_admin'), clearCacheController)

export default router
