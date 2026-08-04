import { Request, Response, NextFunction } from 'express'
import { z } from 'zod'
import { ok, created, noContent } from '../utils/apiResponse'
import {
  listCampuses,
  createCampus,
  updateCampus,
  listFaculties,
  createFaculty,
  updateFaculty,
  listProgrammes,
  createProgramme,
  updateProgramme,
  listCourseUnits,
  createCourseUnit,
  updateCourseUnit,
  createCurriculumMapping,
  removeCurriculumMapping,
  listCurriculum,
  getProfileOptions,
} from '../services/academic.service'

export const campusSchema = z.object({
  name: z.string().min(1).max(100),
  code: z.string().min(1).max(20),
})

export const facultySchema = z.object({
  campusId: z.string().uuid(),
  name: z.string().min(1).max(100),
  code: z.string().min(1).max(20),
})

export const programmeSchema = z.object({
  facultyId: z.string().uuid(),
  name: z.string().min(1).max(150),
  code: z.string().min(1).max(20),
})

export const courseUnitSchema = z.object({
  facultyId: z.string().uuid(),
  code: z.string().min(1).max(20),
  name: z.string().min(1).max(150),
})

export const curriculumSchema = z.object({
  courseUnitId: z.string().uuid(),
  programmeId: z.string().uuid(),
  year: z.number().int().min(1).max(6),
  semester: z.number().int().min(1).max(2),
  academicYear: z.string().regex(/^\d{4}\/\d{4}$/, 'Academic year must be like 2025/2026'),
})

export const updateCampusSchema = campusSchema.partial().extend({ isActive: z.boolean().optional() })
export const updateFacultySchema = facultySchema.partial().extend({ isActive: z.boolean().optional() })
export const updateProgrammeSchema = programmeSchema.partial().extend({ isActive: z.boolean().optional() })
export const updateCourseUnitSchema = courseUnitSchema.partial().extend({ isActive: z.boolean().optional() })

// ─── Campuses ───

export async function getCampuses(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const includeInactive = req.query.includeInactive === 'true'
    ok(res, { campuses: await listCampuses(includeInactive) })
  } catch (e) {
    next(e)
  }
}

export async function postCampus(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    created(res, { campus: await createCampus(req.body) })
  } catch (e) {
    next(e)
  }
}

export async function putCampus(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    ok(res, { campus: await updateCampus(req.params.id, req.body) })
  } catch (e) {
    next(e)
  }
}

// ─── Faculties ───

export async function getFaculties(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const campusId = (req.query.campusId as string) || undefined
    const includeInactive = req.query.includeInactive === 'true'
    ok(res, { faculties: await listFaculties(campusId, includeInactive) })
  } catch (e) {
    next(e)
  }
}

export async function postFaculty(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    created(res, { faculty: await createFaculty(req.body) })
  } catch (e) {
    next(e)
  }
}

export async function putFaculty(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    ok(res, { faculty: await updateFaculty(req.params.id, req.body) })
  } catch (e) {
    next(e)
  }
}

// ─── Programmes ───

export async function getProgrammes(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const facultyId = (req.query.facultyId as string) || undefined
    const includeInactive = req.query.includeInactive === 'true'
    ok(res, { programmes: await listProgrammes(facultyId, includeInactive) })
  } catch (e) {
    next(e)
  }
}

export async function postProgramme(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    created(res, { programme: await createProgramme(req.body) })
  } catch (e) {
    next(e)
  }
}

export async function putProgramme(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    ok(res, { programme: await updateProgramme(req.params.id, req.body) })
  } catch (e) {
    next(e)
  }
}

// ─── Course units ───

export async function getCourseUnits(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const facultyId = (req.query.facultyId as string) || undefined
    const includeInactive = req.query.includeInactive === 'true'
    ok(res, { courseUnits: await listCourseUnits(facultyId, includeInactive) })
  } catch (e) {
    next(e)
  }
}

export async function postCourseUnit(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    created(res, { courseUnit: await createCourseUnit(req.body) })
  } catch (e) {
    next(e)
  }
}

export async function putCourseUnit(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    ok(res, { courseUnit: await updateCourseUnit(req.params.id, req.body) })
  } catch (e) {
    next(e)
  }
}

// ─── Curriculum mapping ───

export async function getCurriculum(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const programmeId = (req.query.programmeId as string) || undefined
    const academicYear = (req.query.academicYear as string) || undefined
    ok(res, { curriculum: await listCurriculum({ programmeId, academicYear }) })
  } catch (e) {
    next(e)
  }
}

export async function postCurriculum(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    created(res, { curriculumUnit: await createCurriculumMapping(req.body) })
  } catch (e) {
    next(e)
  }
}

export async function deleteCurriculum(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    await removeCurriculumMapping(req.params.id)
    noContent(res)
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
