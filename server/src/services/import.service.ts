import { parse } from 'csv-parse/sync'
import { Role } from '@prisma/client'
import { prisma } from '../config/db'
import { ApiError } from '../utils/apiResponse'
import { hashPassword } from '../utils/password'
import { getDefaultUserPasswordHash, getCurrentPeriod } from './settings.service'
import { isValidCampusCode } from '../constants/campuses'
import { getCurriculumUnitIds } from './enrollment.service'

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
    bom: true, // Excel/Zeevarsity exports may start with a UTF-8 BOM
  }) as Row[]
  return records
}

/** Parse an uploaded CSV, reporting a malformed file as a 400. */
function readRows(buffer: Buffer): Row[] {
  try {
    return parseCsv(buffer)
  } catch (error) {
    throw new ApiError(`Could not parse CSV: ${(error as Error).message}`, 400)
  }
}

/**
 * Run `handleRow` for every CSV row, counting successes and collecting
 * per-row failures against the spreadsheet line number (header is row 1).
 */
async function importRows(
  rows: Row[],
  handleRow: (row: Row) => Promise<void>
): Promise<ImportResult> {
  const result: ImportResult = { imported: 0, failed: 0, errors: [] }
  for (let i = 0; i < rows.length; i++) {
    try {
      await handleRow(rows[i])
      result.imported++
    } catch (error) {
      result.failed++
      result.errors.push({ row: i + 2, message: (error as Error).message })
    }
  }
  return result
}

/** Faculty referenced by a CSV `facultyCode` column. */
async function facultyByCode(facultyCode: string, activeOnly = false) {
  const faculty = await prisma.faculty.findFirst({
    where: { code: facultyCode, ...(activeOnly ? { isActive: true } : {}) },
  })
  if (!faculty) {
    throw new Error(`${activeOnly ? 'Active faculty' : 'Faculty'} "${facultyCode}" not found`)
  }
  return faculty
}

function normalizeCode(value: string | undefined): string | undefined {
  return value?.trim().toUpperCase()
}

/**
 * Map common CSV header spellings (including Zeevarsity exports) onto a
 * canonical student-import key. Header names are matched case-insensitively
 * with spaces/underscores removed, so "First Name" === "firstname".
 */
const HEADER_ALIASES: Record<string, string> = {
  name: 'name',
  fullname: 'name',
  studentname: 'name',
  email: 'email',
  password: 'password',
  firstname: 'firstName',
  lastname: 'lastName',
  registrationno: 'regNumber',
  registrationnumber: 'regNumber',
  regno: 'regNumber',
  regnumber: 'regNumber',
  programcode: 'programmeCode',
  programmecode: 'programmeCode',
  program: 'programmeCode',
  programme: 'programmeCode',
  facultycode: 'facultyCode',
  yearofstudy: 'yearOfStudy',
  academicyear: 'academicYear',
}

function normalizeRow(row: Row): Row {
  const out: Row = {}
  for (const [key, value] of Object.entries(row)) {
    const alias = HEADER_ALIASES[key.trim().toLowerCase().replace(/[\s_]+/g, '')]
    if (alias) out[alias] = value?.trim()
  }
  return out
}

/**
 * Import academic structure from CSV (FR-03.5).
 * Columns per type:
 *   faculties:    name, code, campusCode
 *   programmes:   name, code, facultyCode
 *   course_units: name, code, facultyCode
 *   curriculum:   courseUnitCode, programmeCode, year, semester
 */
export async function importStructure(
  buffer: Buffer,
  type: StructureImportType
): Promise<ImportResult> {
  const rowImporters: Record<StructureImportType, (row: Row) => Promise<void>> = {
    faculties: importFacultyRow,
    programmes: importProgrammeRow,
    course_units: importCourseUnitRow,
    curriculum: importCurriculumRow,
  }
  return importRows(readRows(buffer), rowImporters[type])
}

async function importFacultyRow(row: Row): Promise<void> {
  const name = row['name']
  const code = normalizeCode(row['code'])
  const campusCode = normalizeCode(row['campusCode'])

  if (!name || !code || !campusCode) {
    throw new Error('Missing name, code or campusCode')
  }
  if (!isValidCampusCode(campusCode)) {
    throw new Error(`Campus "${campusCode}" not found`)
  }

  await prisma.faculty.upsert({
    where: { campusCode_code: { campusCode, code } },
    create: { campusCode, name, code },
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
  const faculty = await facultyByCode(facultyCode)

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
  const faculty = await facultyByCode(facultyCode)

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

  if (!courseUnitCode || !programmeCode || !Number.isInteger(year) || !Number.isInteger(semester)) {
    throw new Error('Missing courseUnitCode, programmeCode, year or semester')
  }
  if (year < 1 || year > 6) throw new Error(`Invalid year "${year}"`)
  if (semester < 1 || semester > 2) throw new Error(`Invalid semester "${semester}"`)

  const programme = await prisma.programme.findFirst({ where: { code: programmeCode } })
  if (!programme) throw new Error(`Programme "${programmeCode}" not found`)

  // Resolve the unit within the programme's faculty first, then any faculty —
  // cross-faculty units like Ethics are mapped by code, not ownership.
  let courseUnit = await prisma.courseUnit.findFirst({
    where: { code: courseUnitCode, facultyId: programme.facultyId },
  })
  if (!courseUnit) {
    courseUnit = await prisma.courseUnit.findFirst({ where: { code: courseUnitCode } })
  }
  if (!courseUnit) throw new Error(`Course unit "${courseUnitCode}" not found`)

  await prisma.curriculumUnit.upsert({
    where: {
      courseUnitId_programmeId_year_semester: {
        courseUnitId: courseUnit.id,
        programmeId: programme.id,
        year,
        semester,
      },
    },
    create: { courseUnitId: courseUnit.id, programmeId: programme.id, year, semester },
    update: {},
  })
}

/**
 * Import staff accounts from CSV (FR-03.6).
 * Columns: email, role (lecturer | faculty_admin), facultyCode.
 * Names are filled in from the staff member's Google profile at first sign-in;
 * a placeholder derived from the email is used until then. Accounts start with
 * the system default password and must change it at first login. Lecturers
 * receive no course-unit assignments during import; those remain the Faculty
 * Admin's job. Each faculty may have only one Faculty Admin.
 */
export async function importStaff(buffer: Buffer): Promise<ImportResult> {
  return importRows(readRows(buffer), importStaffRow)
}

async function importStaffRow(row: Row): Promise<void> {
  const email = row['email']?.trim().toLowerCase()
  const roleRaw = normalizeCode(row['role'])
  const facultyCode = normalizeCode(row['facultyCode'])

  if (!email || !facultyCode) throw new Error('Missing email or facultyCode')
  if (!email.endsWith('@umu.ac.ug')) {
    throw new Error(`Email must be @umu.ac.ug`)
  }

  const role = roleRaw === 'FACULTY_ADMIN' ? Role.faculty_admin : roleRaw === 'LECTURER' ? Role.lecturer : null
  if (!role) throw new Error('Role must be "lecturer" or "faculty_admin"')

  const faculty = await facultyByCode(facultyCode, true)

  const existing = await prisma.user.findUnique({ where: { email } })

  if (role === Role.faculty_admin) {
    const facultyAdmin = await prisma.user.findFirst({
      where: {
        role: Role.faculty_admin,
        facultyId: faculty.id,
        ...(existing ? { id: { not: existing.id } } : {}),
      },
      select: { fullName: true },
    })
    if (facultyAdmin) {
      throw new Error(`Faculty "${facultyCode}" already has a Faculty Admin (${facultyAdmin.fullName})`)
    }
  }

  if (existing) {
    await prisma.user.update({
      where: { email },
      data: {
        role,
        facultyId: faculty.id,
        profileComplete: true,
        isActive: true,
      },
    })
    return
  }

  await prisma.user.create({
    data: {
      email,
      password: await getDefaultUserPasswordHash(),
      mustChangePassword: true,
      // Placeholder display name until Google provides the real one.
      fullName: email.split('@')[0],
      role,
      facultyId: faculty.id,
      profileComplete: true,
      isActive: true,
    },
  })
}

/**
 * Import student accounts from CSV — email only.
 * Columns: email. Names are filled in automatically from the student's Google
 * profile the first time they sign in; until then a placeholder derived from
 * the email is shown. Accounts start with the system default password and are
 * flagged to change it at first login. Each student then completes their own
 * academic profile on the Welcome screen (campus, faculty, programme, year,
 * reg number, student number), which auto-enrolls them from the curriculum.
 */
export async function importStudents(buffer: Buffer): Promise<ImportResult> {
  const result: ImportResult = { imported: 0, failed: 0, errors: [] }

  const rows = readRows(buffer)
  if (rows.length === 0) return result

  // Preload existing users once so duplicate emails don't mean per-row lookups.
  const existingUsers = await prisma.user.findMany({ select: { id: true, email: true, role: true } })
  const existingByEmail = new Map(existingUsers.map((u) => [u.email.toLowerCase(), u]))

  const defaultPasswordHash = await getDefaultUserPasswordHash()

  const seenEmails = new Set<string>()
  interface NewStudent { email: string; fullName: string }
  const newStudents: NewStudent[] = []
  const reactivations: string[] = []

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i]
    const line = i + 2 // header is row 1
    try {
      const r = normalizeRow(row)
      const email = r['email']?.toLowerCase()

      if (!email) throw new Error('Missing email')
      if (!email.endsWith('@stud.umu.ac.ug')) throw new Error('Email must end in @stud.umu.ac.ug')
      if (seenEmails.has(email)) throw new Error('Duplicate email within the file')
      seenEmails.add(email)

      const existing = existingByEmail.get(email)
      if (existing && existing.role !== Role.student) {
        throw new Error('Email is already used by a non-student account')
      }

      if (existing) {
        reactivations.push(existing.id)
        result.imported++
      } else {
        // Placeholder display name until Google provides the real one.
        newStudents.push({ email, fullName: email.split('@')[0] })
      }
    } catch (error) {
      result.failed++
      result.errors.push({ row: line, message: (error as Error).message })
    }
  }

  // Bulk-create accounts; names arrive via Google, profiles completed at login.
  for (let i = 0; i < newStudents.length; i += 200) {
    await prisma.user.createMany({
      data: newStudents.slice(i, i + 200).map((s) => ({
        email: s.email,
        password: defaultPasswordHash,
        mustChangePassword: true,
        fullName: s.fullName,
        role: Role.student,
        profileComplete: false,
        isActive: true,
      })),
      skipDuplicates: true,
    })
    result.imported += Math.min(200, newStudents.length - i)
  }

  // Existing students: make sure the account is usable.
  if (reactivations.length > 0) {
    await prisma.user.updateMany({
      where: { id: { in: reactivations } },
      data: { isActive: true },
    })
  }

  return result
}
