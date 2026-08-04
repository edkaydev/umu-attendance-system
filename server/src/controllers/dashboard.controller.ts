import { Request, Response, NextFunction } from 'express'
import { ok } from '../utils/apiResponse'
import {
  getStudentDashboard,
  getLecturerDashboard,
  getFacultyAdminDashboard,
  getSystemAdminDashboard,
} from '../services/dashboard.service'

export async function studentDashboardController(req: Request, res: Response, next: NextFunction) {
  try {
    const data = await getStudentDashboard(req.user!.id)
    ok(res, data)
  } catch (e) {
    next(e)
  }
}

export async function lecturerDashboardController(req: Request, res: Response, next: NextFunction) {
  try {
    const data = await getLecturerDashboard(req.user!.id)
    ok(res, data)
  } catch (e) {
    next(e)
  }
}

export async function facultyAdminDashboardController(req: Request, res: Response, next: NextFunction) {
  try {
    const data = await getFacultyAdminDashboard(req.user!.id)
    ok(res, data)
  } catch (e) {
    next(e)
  }
}

export async function systemAdminDashboardController(req: Request, res: Response, next: NextFunction) {
  try {
    const data = await getSystemAdminDashboard()
    ok(res, data)
  } catch (e) {
    next(e)
  }
}
