import { parse } from 'csv-parse/sync'
import { Role } from '@prisma/client'
import { prisma } from '../config/db'
import { ApiError } from '../utils/apiResponse'
import { hashPassword } from '../utils/password'
import { getDefaultUserPasswordHash, getCurrentPeriod } from './settings.service'
import { isValidCampusCode } from '../constants/campuses'

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
  const faculty = await prisma.faculty.findFirst({ where: { code: facultyCode } })
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
  const faculty = await prisma.faculty.findFirst({ where: { code: facultyCode } })
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

  const courseUnit = await prisma.courseUnit.findFirst({ where: { code: courseUnitCode } })
  if (!courseUnit) throw new Error(`Course unit "${courseUnitCode}" not found`)
  const programme = await prisma.programme.findFirst({ where: { code: programmeCode } })
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
 * Columns: name, email, role (lecturer | faculty_admin), facultyCode, password (optional).
 * Staff are linked to the faculty named by facultyCode. Lecturers receive no
 * course-unit assignments during import; those remain the Faculty Admin's job.
 * Each faculty may have only one Faculty Admin.
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
      const facultyCode = normalizeCode(row['facultyCode'])
      const plainPassword = row['password']?.trim()

      if (!name || !email || !facultyCode) throw new Error('Missing name, email or facultyCode')
      if (!email.endsWith('@umu.ac.ug')) {
        throw new Error(`Email must be @umu.ac.ug`)
      }
      if (plainPassword && plainPassword.length < 6) {
        throw new Error('Password must be at least 6 characters')
      }

      const role = roleRaw === 'FACULTY_ADMIN' ? Role.faculty_admin : roleRaw === 'LECTURER' ? Role.lecturer : null
      if (!role) throw new Error('Role must be "lecturer" or "faculty_admin"')

      const faculty = await prisma.faculty.findFirst({ where: { code: facultyCode, isActive: true } })
      if (!faculty) throw new Error(`Active faculty "${facultyCode}" not found`)

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
            fullName: name,
            role,
            facultyId: faculty.id,
            profileComplete: true,
            isActive: true,
            ...(plainPassword
              ? { password: await hashPassword(plainPassword), mustChangePassword: true }
              : {}),
          },
        })
      } else {
        const password = plainPassword
          ? await hashPassword(plainPassword)
          : await getDefaultUserPasswordHash()
        await prisma.user.create({
          data: {
            email,
            password,
            mustChangePassword: true,
            fullName: name,
            role,
            facultyId: faculty.id,
            profileComplete: true,
            isActive: true,
          },
        })
      }
      result.imported++
    } catch (error) {
      result.failed++
      result.errors.push({ row: line, message: (error as Error).message })
    }
  }

  return result
}

/**
 * Import student accounts from CSV with full academic provisioning.
 *
 * Columns: name, email, facultyCode, programmeCode, year, regNumber,
 *          semester (optional, defaults to 1), academicYear (optional, derived
 *          from the current period minus the student's year of study),
 *          password (optional, defaults to the system default).
 *
 * Students are fully provisioned at import time: linked to their faculty and
 * programme, stamped with year/semester/academicYear/regNumber, marked
 * profileComplete, and auto-enrolled in every course unit from the curriculum
 * mapping for their programme/year/semester/academicYear. This is optimised
 * for bulk uploads (thousands of rows): reference data and existing users are
 * preloaded once, and users/enrollments are written with createMany batches.
 */
export async function importStudents(buffer: Buffer): Promise<ImportResult> {
  const result: ImportResult = { imported: 0, failed: 0, errors: [] }

  let rows: Row[]
  try {
    rows = parseCsv(buffer)
  } catch (error) {
    throw new ApiError(`Could not parse CSV: ${(error as Error).message}`, 400)
  }
  if (rows.length === 0) return result

  // Preload reference data + existing users once so 4000 rows don't mean 4000 lookups.
  const [faculties, programmes, existingUsers, currentPeriod] = await Promise.all([
    prisma.faculty.findMany(),
    prisma.programme.findMany(),
    prisma.user.findMany({ select: { id: true, email: true, role: true } }),
    getCurrentPeriod(),
  ])

  const facultyByCode = new Map(faculties.map((f) => [f.code.toUpperCase(), f]))
  const programmeByCode = new Map(programmes.map((p) => [p.code.toUpperCase(), p]))
  const existingByEmail = new Map(existingUsers.map((u) => [u.email.toLowerCase(), u]))

  const defaultPasswordHash = await getDefaultUserPasswordHash()

  interface StudentRow {
    line: number
    email: string
    fullName: string
    faculty: { id: string; campusCode: string }
    programmeId: string
    year: number
    semester: number
    academicYear: string
    regNumber: string
    passwordHash?: string
    courseUnitIds: string[]
  }

  const students: StudentRow[] = []
  const seenEmails = new Set<string>()

  // Phase 1 — parse + validate every row in memory.
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i]
    const line = i + 2 // header is row 1
    try {
      const fullName = row['name']?.trim()
      const email = row['email']?.trim().toLowerCase()
      const facultyCode = normalizeCode(row['facultyCode'])
      const programmeCode = normalizeCode(row['programmeCode'])
      const year = Number(row['year'])
      const semester = row['semester']?.trim() ? Number(row['semester']) : 1
      const academicYear = row['academicYear']?.trim()
      const regNumber = row['regNumber']?.trim()
      const plainPassword = row['password']?.trim()

      if (!fullName || !email) throw new Error('Missing name or email')
      if (!email.endsWith('@stud.umu.ac.ug')) throw new Error('Email must end in @stud.umu.ac.ug')
      if (plainPassword && plainPassword.length < 6) throw new Error('Password must be at least 6 characters')
      if (seenEmails.has(email)) throw new Error('Duplicate email within the file')
      seenEmails.add(email)

      const existing = existingByEmail.get(email)
      if (existing && existing.role !== Role.student) {
        throw new Error('Email is already used by a non-student account')
      }

      if (!facultyCode || !programmeCode) throw new Error('Missing facultyCode or programmeCode')
      const faculty = facultyByCode.get(facultyCode)
      if (!faculty) throw new Error(`Faculty "${facultyCode}" not found`)
      if (!faculty.isActive) throw new Error(`Faculty "${facultyCode}" is not active`)
      const programme = programmeByCode.get(programmeCode)
      if (!programme) throw new Error(`Programme "${programmeCode}" not found`)
      if (programme.facultyId !== faculty.id) {
        throw new Error(`Programme "${programmeCode}" does not belong to faculty "${facultyCode}"`)
      }
      if (!Number.isInteger(year) || year < 1 || year > 6) {
        throw new Error('year must be an integer between 1 and 6')
      }
      if (!Number.isInteger(semester) || semester < 1 || semester > 2) {
        throw new Error('semester must be 1 or 2')
      }

      let ay = academicYear
      if (ay) {
        if (!/^\d{4}\/\d{4}$/.test(ay)) throw new Error(`Invalid academicYear "${ay}"`)
      } else {
        // Derive from the current period minus the student's year of study:
        // a 3rd-year student in 2025/2026 is on the 2023/2024 academic year.
        const start = Number(currentPeriod.academicYear.split('/')[0])
        if (!Number.isFinite(start)) throw new Error('Cannot derive academicYear from current period')
        ay = `${start - (year - 1)}/${start - (year - 1) + 1}`
      }

      if (!regNumber) throw new Error('Missing regNumber')

      students.push({
        line,
        email,
        fullName,
        faculty: { id: faculty.id, campusCode: faculty.campusCode },
        programmeId: programme.id,
        year,
        semester,
        academicYear: ay,
        regNumber,
        ...(plainPassword ? { passwordHash: await hashPassword(plainPassword) } : {}),
        courseUnitIds: [],
      })
    } catch (error) {
      result.failed++
      result.errors.push({ row: line, message: (error as Error).message })
    }
  }

  // Phase 2 — resolve course units from the curriculum mapping, one query per
  // distinct (programme, year, semester, academicYear) combination.
  const combos = new Map<string, string[]>()
  for (const s of students) {
    const key = `${s.programmeId}|${s.year}|${s.semester}|${s.academicYear}`
    let unitIds = combos.get(key)
    if (!unitIds) {
      const curriculum = await prisma.curriculumUnit.findMany({
        where: {
          programmeId: s.programmeId,
          year: s.year,
          semester: s.semester,
          academicYear: s.academicYear,
        },
        select: { courseUnitId: true },
      })
      unitIds = curriculum.map((c) => c.courseUnitId)
      combos.set(key, unitIds)
    }
    s.courseUnitIds = unitIds
  }

  // Phase 3 — create new users in bulk, update existing ones.
  const newStudents = students.filter((s) => !existingByEmail.has(s.email))
  const updateStudents = students.filter((s) => existingByEmail.has(s.email))

  if (newStudents.length > 0) {
    const createData = newStudents.map((s) => ({
      email: s.email,
      password: s.passwordHash ?? defaultPasswordHash,
      mustChangePassword: true,
      fullName: s.fullName,
      role: Role.student,
      facultyId: s.faculty.id,
      programmeId: s.programmeId,
      year: s.year,
      semester: s.semester,
      academicYear: s.academicYear,
      regNumber: s.regNumber,
      profileComplete: true,
      isActive: true,
    }))
    for (let i = 0; i < createData.length; i += 200) {
      await prisma.user.createMany({
        data: createData.slice(i, i + 200),
        skipDuplicates: true,
      })
    }
  }

  // Re-fetch created users so we have their IDs for enrollments.
  const createdIds = new Map<string, string>()
  if (newStudents.length > 0) {
    const created = await prisma.user.findMany({
      where: { email: { in: newStudents.map((s) => s.email) } },
      select: { id: true, email: true },
    })
    for (const u of created) createdIds.set(u.email.toLowerCase(), u.id)
  }

  const enrolled: Array<{ studentId: string; line: number; academicYear: string; semester: number; courseUnitIds: string[] }> = []

  for (const s of newStudents) {
    const id = createdIds.get(s.email)
    if (!id) {
      result.failed++
      result.errors.push({ row: s.line, message: 'Could not create user' })
      continue
    }
    result.imported++
    enrolled.push({ studentId: id, line: s.line, academicYear: s.academicYear, semester: s.semester, courseUnitIds: s.courseUnitIds })
  }

  for (const s of updateStudents) {
    const existing = existingByEmail.get(s.email)!
    try {
      await prisma.user.update({
        where: { id: existing.id },
        data: {
          fullName: s.fullName,
          facultyId: s.faculty.id,
          programmeId: s.programmeId,
          year: s.year,
          semester: s.semester,
          academicYear: s.academicYear,
          regNumber: s.regNumber,
          profileComplete: true,
          isActive: true,
          ...(s.passwordHash ? { password: s.passwordHash, mustChangePassword: true } : {}),
        },
      })
      result.imported++
      enrolled.push({ studentId: existing.id, line: s.line, academicYear: s.academicYear, semester: s.semester, courseUnitIds: s.courseUnitIds })
    } catch (error) {
      result.failed++
      result.errors.push({ row: s.line, message: (error as Error).message })
    }
  }

  // Phase 4 — replace the imported period's enrollments, then bulk-insert.
  if (enrolled.length > 0) {
    const updateIds = updateStudents.map((s) => existingByEmail.get(s.email)!.id)
    const periodPairs = [
      ...new Set(enrolled.map((e) => `${e.academicYear}|${e.semester}`)),
    ].map((pair) => {
      const [academicYear, semester] = pair.split('|')
      return { academicYear, semester: Number(semester) }
    })
    await prisma.enrollment.deleteMany({
      where: {
        studentId: { in: updateIds },
        OR: periodPairs,
      },
    })

    const enrollmentData: Array<{
      studentId: string
      courseUnitId: string
      academicYear: string
      semester: number
    }> = []
    for (const e of enrolled) {
      for (const courseUnitId of e.courseUnitIds) {
        enrollmentData.push({
          studentId: e.studentId,
          courseUnitId,
          academicYear: e.academicYear,
          semester: e.semester,
        })
      }
    }
    for (let i = 0; i < enrollmentData.length; i += 1000) {
      await prisma.enrollment.createMany({
        data: enrollmentData.slice(i, i + 1000),
        skipDuplicates: true,
      })
    }
  }

  return result
}
