import fs from 'fs'
import path from 'path'
import { spawnSync } from 'child_process'
import { Role } from '@prisma/client'
import { prisma } from '../config/db'
import { hashPassword } from '../utils/password'

/**
 * Idempotent demo-data bootstrap.
 *
 * If the users table is EMPTY (e.g. after a full database wipe), the API
 * automatically rebuilds the whole demo dataset from docs/demo-data/*.csv
 * on startup — faculties, programmes, course units, the curriculum matrix,
 * and every account (password Umu@2026). Existing databases are untouched,
 * so this is a no-op in normal operation.
 *
 * Disable with SEED_ON_EMPTY=false.
 */

const DEMO_PASSWORD = 'Umu@2026'
const SYSTEM_ADMIN_EMAIL = process.env.SEED_ADMIN_EMAIL || 'edward@umu.ac.ug'

type Row = Record<string, string>

function readCsv(name: string): Row[] {
  const file = path.resolve(process.cwd(), '..', 'docs', 'demo-data', name)
  if (!fs.existsSync(file)) return []
  const [headerLine, ...lines] = fs.readFileSync(file, 'utf8').split(/\r?\n/).filter(Boolean)
  const headers = headerLine.split(',').map((h) => h.trim())
  return lines.map((line) => {
    const cells = line.split(',')
    const row: Row = {}
    headers.forEach((h, i) => (row[h] = (cells[i] ?? '').trim()))
    return row
  })
}

export async function seedDemoData(): Promise<Record<string, number>> {
  const counts = { faculties: 0, programmes: 0, units: 0, curriculum: 0, students: 0, lecturers: 0, admins: 0 }
  const passwordHash = await hashPassword(DEMO_PASSWORD)

  // Faculties -------------------------------------------------------------
  const facultyIds = new Map<string, string>()
  for (const r of readCsv('faculties.csv')) {
    const campusCode = r.campusCode || 'NKZ'
    const existing = await prisma.faculty.findFirst({ where: { campusCode, code: r.code } })
    const faculty =
      existing ??
      (await prisma.faculty.create({ data: { name: r.name, code: r.code, campusCode } }))
    facultyIds.set(r.code, faculty.id)
    counts.faculties++
  }

  // Programmes --------------------------------------------------------------
  for (const r of readCsv('programmes.csv')) {
    const facultyId = facultyIds.get(r.facultyCode)
    if (!facultyId) continue
    const existing = await prisma.programme.findFirst({ where: { facultyId, code: r.code } })
    if (!existing) {
      await prisma.programme.create({ data: { name: r.name, code: r.code, facultyId } })
      counts.programmes++
    }
  }

  // Course units (+ owning-faculty link) -------------------------------------
  for (const r of readCsv('course_units.csv')) {
    const facultyId = facultyIds.get(r.facultyCode)
    if (!facultyId) continue
    const existing = await prisma.courseUnit.findFirst({ where: { facultyId, code: r.code } })
    if (!existing) {
      const unit = await prisma.courseUnit.create({ data: { name: r.name, code: r.code, facultyId } })
      await prisma.courseUnitFaculty.create({ data: { courseUnitId: unit.id, facultyId } })
      counts.units++
    }
  }

  // Curriculum matrix ---------------------------------------------------------
  const programmeByCode = new Map<string, { id: string }>()
  for (const p of await prisma.programme.findMany({ select: { id: true, code: true } })) {
    programmeByCode.set(p.code, { id: p.id })
  }
  for (const r of readCsv('curriculum.csv')) {
    const programme = programmeByCode.get(r.programmeCode)
    const unit = await prisma.courseUnit.findFirst({ where: { code: r.courseUnitCode } })
    if (!programme || !unit) continue
    const exists = await prisma.curriculumUnit.findFirst({
      where: { programmeId: programme.id, courseUnitId: unit.id, year: Number(r.year), semester: Number(r.semester) },
    })
    if (!exists) {
      await prisma.curriculumUnit.create({
        data: { programmeId: programme.id, courseUnitId: unit.id, year: Number(r.year), semester: Number(r.semester) },
      })
      counts.curriculum++
    }
  }

  // Accounts ------------------------------------------------------------------
  for (const r of readCsv('students.csv')) {
    const existing = await prisma.user.findUnique({ where: { email: r.email.toLowerCase() } })
    if (!existing) {
      await prisma.user.create({
        data: {
          email: r.email.toLowerCase(),
          password: passwordHash,
          fullName: r.email.split('@')[0].replace(/[._]/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()),
          role: Role.student,
                  },
      })
      counts.students++
    }
  }

  for (const r of readCsv('staff.csv')) {
    const existing = await prisma.user.findUnique({ where: { email: r.email.toLowerCase() } })
    if (!existing) {
      await prisma.user.create({
        data: {
          email: r.email.toLowerCase(),
          password: passwordHash,
          fullName: r.email.split('@')[0].replace(/[._]/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()),
          role: Role.lecturer,
        },
      })
      counts.lecturers++
    }
  }

  for (const r of readCsv('faculty_admins.csv')) {
    const facultyId = facultyIds.get(r.facultyCode)
    if (!facultyId) continue
    await prisma.user.upsert({
      where: { email: r.email.toLowerCase() },
      update: { role: Role.faculty_admin, facultyId },
      create: {
        email: r.email.toLowerCase(),
        password: passwordHash,
        fullName: r.email.split('@')[0].replace(/[._]/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()),
        role: Role.faculty_admin,
        facultyId,
        profileComplete: true,
              },
    })
    counts.admins++
  }

  await prisma.user.upsert({
    where: { email: SYSTEM_ADMIN_EMAIL.toLowerCase() },
    update: { role: Role.system_admin, profileComplete: true, isActive: true },
    create: {
      email: SYSTEM_ADMIN_EMAIL.toLowerCase(),
      password: passwordHash,
      fullName: 'System Administrator',
      role: Role.system_admin,
      profileComplete: true,
          },
  })

  return counts
}

/** Runs the seeder only when the database has no users at all.
 *  If the schema itself is missing (full database wipe), migrations are
 *  applied first — so restarting the API alone fully rebuilds the system. */
export async function ensureDemoData(): Promise<void> {
  if (process.env.SEED_ON_EMPTY === 'false') return

  let userCount: number
  try {
    userCount = await prisma.user.count()
  } catch (e) {
    // P2021 = table does not exist → apply pending migrations and retry once.
    if ((e as { code?: string })?.code !== 'P2021') throw e
    console.log('[bootstrap] database schema missing — running prisma migrate deploy …')
    const migrated = spawnSync('npx', ['prisma', 'migrate', 'deploy'], {
      stdio: 'inherit',
      env: process.env,
    })
    if (migrated.status !== 0) throw e
    userCount = await prisma.user.count()
  }
  if (userCount > 0) return

  console.log('[bootstrap] empty database detected — seeding demo data …')
  const counts = await seedDemoData()
  console.log(
    `[bootstrap] seeded ${counts.faculties} faculties, ${counts.programmes} programmes, ` +
      `${counts.units} units, ${counts.curriculum} curriculum rows, ` +
      `${counts.students} students, ${counts.lecturers} lecturers, ${counts.admins} faculty admins`
  )
}
