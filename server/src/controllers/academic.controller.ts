import { Request, Response, NextFunction } from 'express'
import { ok } from '../utils/apiResponse'
import {
  listCampuses,
  listFaculties,
  listProgrammes,
  listCourseUnits,
  listCurriculum,
  getProfileOptions,
} from '../services/academic.service'
import {
  importFacultyAdmins as importFacultyAdminsCsv,
} from '../services/import.service'
import { writeAuditLog } from '../utils/audit'

// ─── Profile cascade options (authenticated users) ───

export async function getCampuses(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    ok(res, { campuses: listCampuses() })
  } catch (e) {
    next(e)
  }
}

// ─── Faculties (read-only — created by Moodle hierarchy sync) ───

export async function getFaculties(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const campusCode = (req.query.campusCode as string) || undefined
    const includeInactive = req.query.includeInactive === 'true'
    ok(res, { faculties: await listFaculties(campusCode, includeInactive) })
  } catch (e) {
    next(e)
  }
}

// ─── Programmes (read-only — created by Moodle hierarchy sync) ───

export async function getProgrammes(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const facultyId = (req.query.facultyId as string) || undefined
    const includeInactive = req.query.includeInactive === 'true'
    ok(res, { programmes: await listProgrammes(facultyId, includeInactive) })
  } catch (e) {
    next(e)
  }
}

// ─── Course units (read-only — created by Moodle hierarchy sync) ───

export async function getCourseUnits(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const facultyId = (req.query.facultyId as string) || undefined
    const includeInactive = req.query.includeInactive === 'true'
    ok(res, { courseUnits: await listCourseUnits(facultyId, includeInactive) })
  } catch (e) {
    next(e)
  }
}

// ─── Curriculum mapping (read-only — managed by Moodle hierarchy sync) ───

export async function getCurriculum(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const programmeId = (req.query.programmeId as string) || undefined
    ok(res, { curriculum: await listCurriculum({ programmeId }) })
  } catch (e) {
    next(e)
  }
}

// ─── Profile cascade options (authenticated users) ───

export async function getOptions(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    ok(res, { campuses: await getProfileOptions() })
  } catch (e) {
    next(e)
  }
}

// ─── CSV imports — only Faculty Admin import remains ───

export async function importFacultyAdmins(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    if (!req.file) {
      res.status(400).json({ error: 'CSV file is required (field name: file)' })
      return
    }
    const result = await importFacultyAdminsCsv(req.file.buffer)
    await writeAuditLog(req.user!.id, 'IMPORT', 'import', 'faculty_admins', {
      imported: result.imported,
      failed: result.failed,
    })
    ok(res, { result })
  } catch (e) {
    next(e)
  }
}
