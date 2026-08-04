import { parse } from 'csv-parse/sync'
import { Role } from '@prisma/client'
import { prisma } from '../config/db'
import { ApiError } from '../utils/apiResponse'

export type StructureImportType = 'faculties' | 'programmes' | 'course_units' | 'curriculum'

export interface ImportResult {
  imported: number
  failed: number
  errors: { row: number; message: string }[]
}

type Row = Record<string, string>

function parseCsv(buffer: Buffer): Row[] {
  const records = parse(buffer, {
    columns: true,
    skip_empty_lines: true,
    trim: true,
    relax_column_count: true,
  }) as Row[]
  return records
}

function normalizeCode(value: string | undefined): string | undefined {
  return value?.trim().toUpperCase()
}

/**
 * Import academic structure from CSV (FR-03.5).
 * Columns per type:
 *   faculties:    name, code, campusCode
 *   programmes:   name, code, facultyCode
 *   course_units: name, code, facultyCode
 *   curriculum:   courseUnitCode, programmeCode, year, semester, academicYear
 */
export async function importStructure(
  buffer: Buffer,
  type: StructureImportType
): Promise<ImportResult> {
  const result: ImportResult = { imported: 0, failed: 0, errors: [] }

  let rows: Row[]
  try {
    rows = parseCsv(buffer)
  } catch (error) {
    throw new ApiError(`Could not parse CSV: ${(error as Error).message}`, 400)
  }

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i]
    const line = i + 2 // header is row 1
    try {
      switch (type) {
        case 'faculties':
          await importFacultyRow(row)
          break
        case 'programmes':
          await importProgrammeRow(row)
          break
        case 'course_units':
          await importCourseUnitRow(row)
          break
        case 'curriculum':
          await importCurriculumRow(row)
          break
      }
      result.imported++
    } catch (error) {
      result.failed++
      result.errors.push({ row: line, message: (error as Error).message })
    }
  }

  return result
}

async function importFacultyRow(row: Row): Promise<void> {
  const name = row['name']
  const code = normalizeCode(row['code'])
  const campusCode = normalizeCode(row['campusCode'])

  if (!name || !code || !campusCode) {
    throw new Error('Missing name, code or campusCode')
  }
  const campus = await prisma.campus.findUnique({ where: { code: campusCode } })
  if (!campus) throw new Error(`Campus "${campusCode}" not found`)

  await prisma.faculty.upsert({
    where: { campusId_code: { campusId: campus.id, code } },
    create: { campusId: campus.id, name, code },
    update: { name },
  })
}

async function importProgrammeRow(row: Row): Promise<void> {
  const name = row['name']
  const code = normalizeCode(row['code'])
  const facultyCode = normalizeCode(row['facultyCode'])

  if (!name || !code || !facultyCode) {
    throw new Error('Missing name, code or facultyCode')
  }
  const faculty = await prisma.faculty.findUnique({ where: { code: facultyCode } })
  if (!faculty) throw new Error(`Faculty "${facultyCode}" not found`)

  await prisma.programme.upsert({
    where: { facultyId_code: { facultyId: faculty.id, code } },
    create: { facultyId: faculty.id, name, code },
    update: { name },
  })
}

async function importCourseUnitRow(row: Row): Promise<void> {
  const name = row['name']
  const code = normalizeCode(row['code'])
  const facultyCode = normalizeCode(row['facultyCode'])

  if (!name || !code || !facultyCode) {
    throw new Error('Missing name, code or facultyCode')
  }
  const faculty = await prisma.faculty.findUnique({ where: { code: facultyCode } })
  if (!faculty) throw new Error(`Faculty "${facultyCode}" not found`)

  await prisma.courseUnit.upsert({
    where: { facultyId_code: { facultyId: faculty.id, code } },
    create: { facultyId: faculty.id, name, code },
    update: { name },
  })
}

async function importCurriculumRow(row: Row): Promise<void> {
  const courseUnitCode = normalizeCode(row['courseUnitCode'])
  const programmeCode = normalizeCode(row['programmeCode'])
  const year = Number(row['year'])
  const semester = Number(row['semester'])
  const academicYear = row['academicYear']?.trim()

  if (!courseUnitCode || !programmeCode || !Number.isInteger(year) || !Number.isInteger(semester)) {
    throw new Error('Missing courseUnitCode, programmeCode, year or semester')
  }
  if (!academicYear || !/^\d{4}\/\d{4}$/.test(academicYear)) {
    throw new Error(`Invalid academicYear "${academicYear}"`)
  }

  const courseUnit = await prisma.courseUnit.findUnique({ where: { code: courseUnitCode } })
  if (!courseUnit) throw new Error(`Course unit "${courseUnitCode}" not found`)
  const programme = await prisma.programme.findUnique({ where: { code: programmeCode } })
  if (!programme) throw new Error(`Programme "${programmeCode}" not found`)
  if (courseUnit.facultyId !== programme.facultyId) {
    throw new Error('Course unit and programme must belong to the same faculty')
  }

  await prisma.curriculumUnit.upsert({
    where: {
      courseUnitId_programmeId_year_semester_academicYear: {
        courseUnitId: courseUnit.id,
        programmeId: programme.id,
        year,
        semester,
        academicYear,
      },
    },
    create: { courseUnitId: courseUnit.id, programmeId: programme.id, year, semester, academicYear },
    update: {},
  })
}

/**
 * Import staff accounts from CSV (FR-03.6).
 * Columns: name, email, role (lecturer | faculty_admin)
 */
export async function importStaff(buffer: Buffer): Promise<ImportResult> {
  const result: ImportResult = { imported: 0, failed: 0, errors: [] }

  let rows: Row[]
  try {
    rows = parseCsv(buffer)
  } catch (error) {
    throw new ApiError(`Could not parse CSV: ${(error as Error).message}`, 400)
  }

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i]
    const line = i + 2
    try {
      const name = row['name']
      const email = row['email']?.trim().toLowerCase()
      const roleRaw = normalizeCode(row['role'])

      if (!name || !email) throw new Error('Missing name or email')
      if (!email.endsWith('@umu.ac.ug')) {
        throw new Error(`Email must be @umu.ac.ug`)
      }

      const role = roleRaw === 'FACULTY_ADMIN' ? Role.faculty_admin : roleRaw === 'LECTURER' ? Role.lecturer : null
      if (!role) throw new Error('Role must be "lecturer" or "faculty_admin"')

      await prisma.user.upsert({
        where: { email },
        create: {
          googleId: `import:${email}`,
          email,
          fullName: name,
          role,
          profileComplete: false,
          isActive: true,
        },
        update: { fullName: name, role, isActive: true },
      })
      result.imported++
    } catch (error) {
      result.failed++
      result.errors.push({ row: line, message: (error as Error).message })
    }
  }

  return result
}
