import fs from 'fs'
import path from 'path'
import { spawnSync } from 'child_process'
import { Role } from '@prisma/client'
import { prisma } from '../config/db'
import { hashPassword } from '../utils/password'
import { getSetting, setSetting } from './settings.service'

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
const ADOPT_MARKER_KEY = 'bootstrap.demoAdopted'

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

  // Curriculum matrix ---------------------------------------------------------
  const programmeByCode = new Map<string, string>()
  for (const p of await prisma.programme.findMany({ select: { id: true, code: true } })) {
    programmeByCode.set(p.code, p.id)
  }
  const curriculaCsv = readCsv('curriculum.csv')
  const existingCurriculum = new Set(
    (
      await prisma.curriculumUnit.findMany({
        where: {
          programmeId: { in: [...new Set(curriculaCsv.map((r) => programmeByCode.get(r.programmeCode)).filter(Boolean))] as string[] },
        },
        select: { programmeId: true, courseUnitId: true, year: true, semester: true },
      })
    ).map((c) => `${c.programmeId}:${c.courseUnitId}:${c.year}:${c.semester}`)
  )
  const curriculumCreates = curriculaCsv
    .map((r) => ({
      programmeId: programmeByCode.get(r.programmeCode),
      courseUnitId: unitByCode.get(r.courseUnitCode)?.id,
      year: Number(r.year),
      semester: Number(r.semester),
    }))
    .filter(
      (c): c is { programmeId: string; courseUnitId: string; year: number; semester: number } =>
        Boolean(c.programmeId && c.courseUnitId) &&
        !existingCurriculum.has(`${c.programmeId}:${c.courseUnitId}:${c.year}:${c.semester}`)
    )
  if (curriculumCreates.length > 0) {
    await prisma.curriculumUnit.createMany({ data: curriculumCreates, skipDuplicates: true })
    counts.curriculum = curriculumCreates.length
  }

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
        password: passwordHash,
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
      demoManaged: true,
    },
  })

  return counts
}

/**
 * Keeps every demo-managed account usable with the known demo password.
 * Runs on every boot:
 *  1. Accounts listed in the demo CSVs but created before the flag existed
 *     are adopted (flagged) so future syncs cover them.
 *  2. Any flagged account whose stored hash differs from the demo password
 *     is reset (single bulk UPDATE; users who changed their own password
 *     cleared the flag, so their choice is never overwritten).
 */
export async function reconcileDemoPasswords(): Promise<void> {
  const passwordHash = await hashPassword(DEMO_PASSWORD)

  const csvEmails = [...new Set(
    ['students.csv', 'staff.csv', 'faculty_admins.csv']
      .flatMap((f) => readCsv(f).map((r) => r.email.toLowerCase()))
      .filter(Boolean)
      .concat(SYSTEM_ADMIN_EMAIL.toLowerCase())
  )]

  // Adopt accounts created before this flag existed.
  // First boot after deployment: adopt ALL demo-listed accounts so every
  // seeded/imported address becomes usable again (this is a one-time
  // migration — afterwards users who pick their own password keep it,
  // because changing a password clears the flag).
  // Later boots only adopt rows that have no local password at all.
  const adoptedAll = await getSetting(ADOPT_MARKER_KEY, '')
  const adopted = await prisma.user.updateMany({
    where: {
      email: { in: csvEmails },
      demoManaged: false,
      ...(adoptedAll ? { password: null } : {}),
    },
    data: { demoManaged: true },
  })
  if (!adoptedAll && adopted.count > 0) {
    console.log(`[bootstrap] adopted ${adopted.count} existing demo account(s)`)
  }
  if (!adoptedAll) await setSetting(ADOPT_MARKER_KEY, new Date().toISOString())

  // Reset any managed account whose password drifted from the demo value,
  // and clear stale forced-password-change flags so imported users are
  // never locked out of the demo flow.
  const reset = await prisma.user.updateMany({
    where: { demoManaged: true, NOT: { password: passwordHash } },
    data: { password: passwordHash, mustChangePassword: false },
  })
  await prisma.user.updateMany({
    where: { demoManaged: true, mustChangePassword: true },
    data: { mustChangePassword: false },
  })
  if (adopted.count > 0 || reset.count > 0) {
    console.log(`[bootstrap] reconciled demo passwords — adopted ${adopted.count}, reset ${reset.count}`)
  }
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
        `${counts.units} units, ${counts.curriculum} curriculum rows, ` +
        `${counts.students} students, ${counts.lecturers} lecturers, ${counts.admins} faculty admins`
    )
  }

  // Every boot: make sure demo accounts are usable with the demo password.
  await reconcileDemoPasswords()
}
