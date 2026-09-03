import fs from 'fs'
import path from 'path'
import { spawnSync } from 'child_process'
import { Role } from '@prisma/client'
import { prisma } from '../config/db'

/**
 * Idempotent demo-data bootstrap.
 *
 * If the users table is EMPTY (e.g. after a full database wipe), the API
 * automatically rebuilds the whole demo dataset from docs/demo-data/*.csv
 * on startup — faculties, programmes, course units, the curriculum matrix,
 * and every account. Existing databases are untouched, so this is a no-op
 * in normal operation.
 *
 * All accounts sign in via Google OAuth — no passwords are set.
 * Disable with SEED_ON_EMPTY=false.
 */

const SYSTEM_ADMIN_EMAIL = process.env.SEED_ADMIN_EMAIL || 'edward@umu.ac.ug'

type Row = Record<string, string>

function readCsv(name: string): Row[] {
  // Inside the Docker image the CSVs live at /app/demo-data; in development
  // they are in <repo>/docs/demo-data relative to server/.
  const candidates = [
    path.resolve(process.cwd(), 'demo-data', name),
    path.resolve(process.cwd(), '..', 'docs', 'demo-data', name),
    path.resolve(process.cwd(), 'docs', 'demo-data', name),
  ]
  const file = candidates.find((f) => fs.existsSync(f))
  if (!file) {
    console.warn(`[bootstrap] ${name} not found — looked in: ${candidates.join(', ')}`)
    return []
  }
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
  const counts = { faculties: 0, programmes: 0, units: 0, students: 0, lecturers: 0, admins: 0 }

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
  const unitRows = readCsv('course_units.csv')
    .map((r) => ({ name: r.name, code: r.code, facultyCode: r.facultyCode }))
    .filter((r) => facultyIds.has(r.facultyCode))
  const knownUnits = await prisma.courseUnit.findMany({
    where: { code: { in: unitRows.map((r) => r.code) } },
    select: { id: true, code: true, facultyId: true },
  })
  const knownUnitKeys = new Set(knownUnits.map((u) => `${u.facultyId}:${u.code}`))
  const newUnitRows = unitRows
    .filter((r) => !knownUnitKeys.has(`${facultyIds.get(r.facultyCode)}:${r.code}`))
    .map((r) => ({ name: r.name, code: r.code, facultyId: facultyIds.get(r.facultyCode)! }))
  if (newUnitRows.length > 0) {
    await prisma.courseUnit.createMany({ data: newUnitRows })
    counts.units = newUnitRows.length
  }
  // Refresh the id map, then link every unit to its owning faculty
  const unitByCode = new Map<string, { id: string; facultyId: string }>()
  for (const u of await prisma.courseUnit.findMany({
    where: { code: { in: unitRows.map((r) => r.code) } },
    select: { id: true, code: true, facultyId: true },
  })) {
    unitByCode.set(u.code, { id: u.id, facultyId: u.facultyId })
  }
  const unitLinks = [...unitByCode.values()].filter((u) => facultyIds.has(u.facultyId) || true)
  await prisma.courseUnitFaculty.createMany({
    data: unitLinks.map((u) => ({ courseUnitId: u.id, facultyId: u.facultyId })),
    skipDuplicates: true,
  })

  // Accounts ------------------------------------------------------------------
  async function seedRoleAccounts(csvName: string, role: Role): Promise<number> {
    const rows = readCsv(csvName)
      .map((r) => r.email.toLowerCase())
      .filter(Boolean)
    const existing = new Set(
      (
        await prisma.user.findMany({
          where: { email: { in: rows }, role },
          select: { email: true },
        })
      ).map((u) => u.email)
    )
    const creates = [...new Set(rows)]
      .filter((email) => !existing.has(email))
      .map((email) => ({
        email,
        fullName: email.split('@')[0].replace(/[._]/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()),
        role,
        demoManaged: true,
      }))
    if (creates.length > 0) await prisma.user.createMany({ data: creates })
    return creates.length
  }

  counts.students = await seedRoleAccounts('students.csv', Role.student)
  counts.lecturers = await seedRoleAccounts('staff.csv', Role.lecturer)

  for (const r of readCsv('faculty_admins.csv')) {
    const facultyId = facultyIds.get(r.facultyCode)
    if (!facultyId) continue
    await prisma.user.upsert({
      where: { email: r.email.toLowerCase() },
      update: { role: Role.faculty_admin, facultyId },
      create: {
        email: r.email.toLowerCase(),
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
      fullName: 'System Administrator',
      role: Role.system_admin,
      profileComplete: true,
      demoManaged: true,
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
  if (userCount === 0) {
    console.log('[bootstrap] empty database detected — seeding demo data …')
    const counts = await seedDemoData()
    console.log(
      `[bootstrap] seeded ${counts.faculties} faculties, ${counts.programmes} programmes, ` +
        `${counts.units} units, ${counts.students} students, ${counts.lecturers} lecturers, ${counts.admins} faculty admins`
    )
  }
}
