import { parse } from 'csv-parse/sync'
import { Role } from '@prisma/client'
import { prisma } from '../config/db'
import { ApiError } from '../utils/apiResponse'
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

function normalizeCode(value: string | undefined): string | undefined {
  return value?.trim().toUpperCase()
}

/**
 * Import FACULTY ADMIN accounts from CSV (FR-03.6).
 * Columns: email, facultyCode. Each admin is bound to exactly one faculty and
 * each faculty may only have one Faculty Admin. Admins do NOT choose their
 * faculty themselves — the System Admin assigns it via this upload.
 */
export async function importFacultyAdmins(buffer: Buffer): Promise<ImportResult> {
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
      const email = row['email']?.trim().toLowerCase()
      const facultyCode = normalizeCode(row['facultyCode'])
      if (!email || !facultyCode) throw new Error('Missing email or facultyCode')
      if (!email.endsWith('@umu.ac.ug')) {
        throw new Error('Email must be @umu.ac.ug')
      }

      const faculty = await prisma.faculty.findFirst({ where: { code: facultyCode, isActive: true } })
      if (!faculty) throw new Error(`Active faculty "${facultyCode}" not found`)

      const existing = await prisma.user.findUnique({ where: { email } })
      const otherAdmin = await prisma.user.findFirst({
        where: {
          role: Role.faculty_admin,
          facultyId: faculty.id,
          ...(existing ? { id: { not: existing.id } } : {}),
        },
        select: { fullName: true },
      })
      if (otherAdmin) {
        throw new Error(`Faculty "${facultyCode}" already has a Faculty Admin (${otherAdmin.fullName})`)
      }

      // Placeholder display name until Google provides the real one.
      const fullName = email.split('@')[0]

      await prisma.user.upsert({
        where: { email },
        update: { role: Role.faculty_admin, facultyId: faculty.id, profileComplete: true, isActive: true },
        create: {
          email,
          demoManaged: true,
          fullName,
          role: Role.faculty_admin,
          facultyId: faculty.id,
          profileComplete: true,
          isActive: true,
        },
      })
      result.imported++
    } catch (error) {
      result.failed++
      result.errors.push({ row: line, message: (error as Error).message })
    }
  }

  return result
}
