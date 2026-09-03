/**
 * Moodle → Attendance academic hierarchy synchronisation.
 *
 * Mirrors the Moodle category tree into Attendance as:
 *   Faculty → AcademicLevel → AcademicYear → Programme → ProgrammeYear → Semester
 *   CourseUnit (keyed by moodleCourseId, linked to a Semester)
 *   SemesterCourseUnit (Moodle-sourced curriculum join)
 *
 * Design invariants (same as moodle-sync.service.ts):
 *   1. IDEMPOTENT — running twice produces the same result.
 *   2. NON-DESTRUCTIVE — soft-deactivates invisible nodes; never deletes.
 *   3. OBSERVABLE — returns stats and warnings for SyncRun logging.
 *
 * Faculty mapping:
 *   The Moodle tree root is "CAMPUSES". Its children (depth 1) are campuses.
 *   Each campus node's children (depth 2) are faculties.
 *   Faculty.campusCode is resolved by name-matching Moodle campus nodes
 *   against the hardcoded CAMPUSES constant.
 *   Faculty.code is derived from the Moodle faculty category name.
 *
 * Identity:
 *   Every hierarchy node is keyed by its Moodle category id (BigInt). The same
 *   Moodle id is never mapped to two different Attendance records.
 */

import type { CategoryNode, CategoryTree } from '../integrations/moodle/moodle-category-tree'
import type { MoodleCourse } from '../integrations/moodle/moodle.types'
import type { ResolvedMoodlePeriod } from '../integrations/moodle/moodle-period-resolver'
import { fetchCategories } from '../integrations/moodle/moodle.categories'
import { fetchAllCourses } from '../integrations/moodle/moodle.courses'
import { parseCategoryTree } from '../integrations/moodle/moodle-category-tree'
import { resolveMoodleCurrentPeriod } from '../integrations/moodle/moodle-period-resolver'
import { getMoodleCurrentPeriodConfig } from './settings.service'
import { prisma } from '../config/db'
import { CAMPUSES } from '../constants/campuses'
import type { SyncStats } from './moodle-sync.service'

// ─── Helpers ─────────────────────────────────────────────────────────────────

function emptySyncStats(): SyncStats {
  return { fetched: 0, created: 0, updated: 0, unchanged: 0, skipped: 0, conflicts: 0, errors: 0 }
}

const CODE_MAX = 20

/** Derive a Faculty/Programme code from a Moodle category name. */
function deriveCode(name: string): string {
  return name
    .trim()
    .replace(/[^a-zA-Z0-9\s]/g, '')
    .replace(/\s+/g, ' ')
    .toUpperCase()
    .slice(0, CODE_MAX)
}

/**
 * Match a Moodle campus category name to one of the hardcoded CAMPUSES.
 * Returns the campus code, or null if no match.
 */
function matchCampusCode(moodleCampusName: string): string | null {
  const normalised = moodleCampusName.trim().toLowerCase()
  for (const c of CAMPUSES) {
    if (c.name.toLowerCase() === normalised) return c.code
  }
  for (const c of CAMPUSES) {
    if (normalised.includes(c.name.toLowerCase().replace(' campus', '').trim())) return c.code
  }
  return null
}

/** Parse a year number from a programme-year name like "Year 1" → 1.
 * Returns null when the name contains no digit or the digit is outside the
 * valid UMU academic-year range (1–6 inclusive).
 */
function parseYearNumber(name: string): number | null {
  const m = name.match(/\b(\d)\b/)
  if (!m) return null
  const n = Number(m[1])
  if (n < 1 || n > 6) return null
  return n
}

/** Parse a semester number from a semester name like "SEM 1" or "Semester 2" → 1 or 2. */
function parseSemesterNumber(name: string): number | null {
  const m = name.match(/\b(1|2)\b/)
  return m ? Number(m[1]) : null
}

/** Find a node in the tree by id (depth-first search). */
function findNodeInTree(root: CategoryNode, id: bigint): CategoryNode | null {
  if (root.id === id) return root
  for (const child of root.children) {
    const found = findNodeInTree(child, id)
    if (found) return found
  }
  return null
}

// ─── Types ───────────────────────────────────────────────────────────────────

export interface HierarchySyncResult {
  stats: {
    hierarchy: SyncStats
    courses: SyncStats
  }
  moodleCourseIds: number[]
  warnings: string[]
}

// ─── Main entry point ────────────────────────────────────────────────────────

export async function syncAcademicHierarchy(): Promise<HierarchySyncResult> {
  const warnings: string[] = []
  const hierarchyStats = emptySyncStats()
  const courseStats = emptySyncStats()
  const moodleCourseIds: number[] = []

  let rawCategories
  try {
    rawCategories = await fetchCategories()
  } catch (err) {
    throw new Error(`Failed to fetch Moodle categories: ${(err as Error).message}`)
  }
  hierarchyStats.fetched = rawCategories.length

  let tree: CategoryTree
  try {
    tree = parseCategoryTree({ categories: rawCategories })
  } catch (err) {
    throw new Error(`Failed to parse Moodle category tree: ${(err as Error).message}`)
  }
  if (tree.anomalies.length > 0) {
    warnings.push(...tree.anomalies.map((a) => `[hierarchy] ${a}`))
  }

  const periodConfig = await getMoodleCurrentPeriodConfig()
  const periodResult = resolveMoodleCurrentPeriod(tree, periodConfig)
  if (!periodResult.ok) {
    throw new Error(`Cannot resolve current period: ${periodResult.error}`)
  }

  await syncFaculties(tree, hierarchyStats, warnings)
  await syncLevelsAndYears(tree, hierarchyStats, warnings)
  await syncProgrammesAndSemesters(tree, hierarchyStats, warnings)

  try {
    const moodleCourses = await fetchAllCourses()
    await syncCourseUnits(moodleCourses, tree, courseStats, warnings, moodleCourseIds)
  } catch (err) {
    throw new Error(`Failed to sync course units: ${(err as Error).message}`)
  }

  return {
    stats: { hierarchy: hierarchyStats, courses: courseStats },
    moodleCourseIds,
    warnings,
  }
}

// ─── Faculty sync (depth 2) ─────────────────────────────────────────────────

async function syncFaculties(
  tree: CategoryTree,
  stats: SyncStats,
  warnings: string[]
): Promise<void> {
  const activeFacultyMoodleIds = new Set<bigint>()

  for (const campusNode of tree.campuses) {
    const campusCode = matchCampusCode(campusNode.name)
    if (campusCode === null) {
      warnings.push(
        `[hierarchy] Moodle campus "${campusNode.name}" (id=${campusNode.id}) does not match any Attendance campus code. All faculties under it are skipped.`
      )
      continue
    }

    for (const facultyNode of campusNode.children) {
      if (facultyNode.role !== 'faculty') continue
      activeFacultyMoodleIds.add(facultyNode.id)

      try {
        const code = deriveCode(facultyNode.name)
        const existing = await prisma.faculty.findFirst({
          where: { moodleCategoryId: facultyNode.id },
        })

        if (existing) {
          const needsUpdate = existing.name !== facultyNode.name || existing.campusCode !== campusCode
          if (needsUpdate) {
            await prisma.faculty.update({
              where: { id: existing.id },
              data: { name: facultyNode.name, campusCode, isActive: true },
            })
            stats.updated++
          } else if (!existing.isActive) {
            await prisma.faculty.update({ where: { id: existing.id }, data: { isActive: true } })
            stats.updated++
          } else {
            stats.unchanged++
          }
        } else {
          const conflict = await prisma.faculty.findFirst({
            where: { campusCode, code },
          })
          if (conflict) {
            warnings.push(
              `[hierarchy] Moodle faculty "${facultyNode.name}" (id=${facultyNode.id}) would create code "${code}" but Faculty "${conflict.name}" (${conflict.id}) already owns that code at campus ${campusCode}.`
            )
            if (conflict.moodleCategoryId === null) {
              await prisma.faculty.update({
                where: { id: conflict.id },
                data: { moodleCategoryId: facultyNode.id, name: facultyNode.name, isActive: true },
              })
              stats.updated++
            } else {
              stats.conflicts++
            }
          } else {
            await prisma.faculty.create({
              data: { campusCode, name: facultyNode.name, code, moodleCategoryId: facultyNode.id, isActive: true },
            })
            stats.created++
          }
        }
      } catch (err) {
        stats.errors++
        console.error(`[hierarchy] Faculty sync error for "${facultyNode.name}" (id=${facultyNode.id}):`, (err as Error).message)
      }
    }
  }

  await prisma.faculty.updateMany({
    where: { moodleCategoryId: { not: null, notIn: [...activeFacultyMoodleIds] }, isActive: true },
    data: { isActive: false },
  })
}

// ─── Level + AcademicYear sync (depths 3–4) ─────────────────────────────────

async function syncLevelsAndYears(
  tree: CategoryTree,
  stats: SyncStats,
  warnings: string[]
): Promise<void> {
  const activeLevelIds = new Set<bigint>()
  const activeYearIds = new Set<bigint>()

  for (const campusNode of tree.campuses) {
    for (const facultyNode of campusNode.children) {
      if (facultyNode.role !== 'faculty') continue

      const attendanceFaculty = await prisma.faculty.findFirst({
        where: { moodleCategoryId: facultyNode.id },
      })
      if (!attendanceFaculty) {
        warnings.push(
          `[hierarchy] Moodle faculty "${facultyNode.name}" (id=${facultyNode.id}) not linked to any Attendance faculty. Levels/years underneath are skipped.`
        )
        continue
      }

      for (const levelNode of facultyNode.children) {
        if (levelNode.role !== 'level') continue
        activeLevelIds.add(levelNode.id)

        try {
          const existing = await prisma.academicLevel.findFirst({
            where: { moodleCategoryId: levelNode.id },
          })

          let levelId: string | null = existing?.id ?? null

          if (existing) {
            const needsUpdate = existing.name !== levelNode.name || existing.facultyId !== attendanceFaculty.id
            if (needsUpdate) {
              await prisma.academicLevel.update({
                where: { id: existing.id },
                data: { name: levelNode.name, facultyId: attendanceFaculty.id, isActive: true },
              })
              stats.updated++
            } else if (!existing.isActive) {
              await prisma.academicLevel.update({ where: { id: existing.id }, data: { isActive: true } })
              stats.updated++
            } else {
              stats.unchanged++
            }
          } else {
            const created = await prisma.academicLevel.create({
              data: { facultyId: attendanceFaculty.id, name: levelNode.name, moodleCategoryId: levelNode.id, isActive: true },
            })
            levelId = created.id
            stats.created++
          }

          for (const yearNode of levelNode.children) {
            if (yearNode.role !== 'academic-year') continue
            activeYearIds.add(yearNode.id)

            try {
              const existingYear = await prisma.academicYear.findFirst({
                where: { moodleCategoryId: yearNode.id },
              })

              if (!levelId) {
                warnings.push(`[hierarchy] Academic year "${yearNode.name}" (id=${yearNode.id}) level not found. Skipped.`)
                continue
              }

              if (existingYear) {
                const needsUpdate = existingYear.name !== yearNode.name || existingYear.levelId !== levelId
                if (needsUpdate) {
                  await prisma.academicYear.update({
                    where: { id: existingYear.id },
                    data: { name: yearNode.name, isActive: true },
                  })
                  stats.updated++
                } else if (!existingYear.isActive) {
                  await prisma.academicYear.update({ where: { id: existingYear.id }, data: { isActive: true } })
                  stats.updated++
                } else {
                  stats.unchanged++
                }
              } else {
                await prisma.academicYear.create({
                  data: { levelId, name: yearNode.name, moodleCategoryId: yearNode.id, isActive: true },
                })
                stats.created++
              }
            } catch (err) {
              stats.errors++
              console.error(`[hierarchy] AcademicYear sync error for "${yearNode.name}" (id=${yearNode.id}):`, (err as Error).message)
            }
          }
        } catch (err) {
          stats.errors++
          console.error(`[hierarchy] Level sync error for "${levelNode.name}" (id=${levelNode.id}):`, (err as Error).message)
        }
      }
    }
  }

  await prisma.academicLevel.updateMany({
    where: { moodleCategoryId: { not: null, notIn: [...activeLevelIds] }, isActive: true },
    data: { isActive: false },
  })
  await prisma.academicYear.updateMany({
    where: { moodleCategoryId: { not: null, notIn: [...activeYearIds] }, isActive: true },
    data: { isActive: false },
  })
}

// ─── Programme + ProgrammeYear + Semester sync (depths 5–7) ──────────────────

async function syncProgrammesAndSemesters(
  tree: CategoryTree,
  stats: SyncStats,
  warnings: string[]
): Promise<void> {
  const activeProgrammeIds = new Set<bigint>()
  const activePYIds = new Set<bigint>()
  const activeSemesterIds = new Set<bigint>()

  for (const campusNode of tree.campuses) {
    for (const facultyNode of campusNode.children) {
      if (facultyNode.role !== 'faculty') continue

      const attendanceFaculty = await prisma.faculty.findFirst({
        where: { moodleCategoryId: facultyNode.id },
      })
      if (!attendanceFaculty) continue

      for (const levelNode of facultyNode.children) {
        if (levelNode.role !== 'level') continue

        for (const yearNode of levelNode.children) {
          if (yearNode.role !== 'academic-year') continue

          const attendanceYear = await prisma.academicYear.findFirst({
            where: { moodleCategoryId: yearNode.id },
          })

          for (const programmeNode of yearNode.children) {
            if (programmeNode.role !== 'programme') continue
            activeProgrammeIds.add(programmeNode.id)

            try {
              const code = deriveCode(programmeNode.name)
              const existingProgramme = await prisma.programme.findFirst({
                where: { moodleCategoryId: programmeNode.id },
              })

              let attendanceProgrammeId: string | null = existingProgramme?.id ?? null

              if (existingProgramme) {
                const needsUpdate =
                  existingProgramme.name !== programmeNode.name ||
                  existingProgramme.facultyId !== attendanceFaculty.id ||
                  existingProgramme.academicYearId !== (attendanceYear?.id ?? null)
                if (needsUpdate) {
                  await prisma.programme.update({
                    where: { id: existingProgramme.id },
                    data: { name: programmeNode.name, facultyId: attendanceFaculty.id, academicYearId: attendanceYear?.id ?? null, isActive: true },
                  })
                  stats.updated++
                } else if (!existingProgramme.isActive) {
                  await prisma.programme.update({ where: { id: existingProgramme.id }, data: { isActive: true } })
                  stats.updated++
                } else {
                  stats.unchanged++
                }
              } else {
                const created = await prisma.programme.create({
                  data: { facultyId: attendanceFaculty.id, name: programmeNode.name, code, moodleCategoryId: programmeNode.id, academicYearId: attendanceYear?.id ?? null, isActive: true },
                })
                attendanceProgrammeId = created.id
                stats.created++
              }

              if (!attendanceProgrammeId) {
                warnings.push(`[hierarchy] Programme "${programmeNode.name}" (id=${programmeNode.id}) could not be linked. Years underneath are skipped.`)
                continue
              }

              for (const pyNode of programmeNode.children) {
                if (pyNode.role !== 'programme-year') continue
                activePYIds.add(pyNode.id)

                try {
                  const yearNumber = parseYearNumber(pyNode.name)
                  if (yearNumber === null) {
                    warnings.push(
                      `[hierarchy] Programme year "${pyNode.name}" (id=${pyNode.id}) does not contain a valid year number (1–6). Skipped.`
                    )
                    stats.skipped++
                    continue
                  }

                  const existingPY = await prisma.programmeYear.findFirst({
                    where: { moodleCategoryId: pyNode.id },
                  })

                  let attendancePYId: string | null = existingPY?.id ?? null

                  if (existingPY) {
                    const needsUpdate = existingPY.year !== yearNumber || existingPY.programmeId !== attendanceProgrammeId
                    if (needsUpdate) {
                      await prisma.programmeYear.update({
                        where: { id: existingPY.id },
                        data: { year: yearNumber, programmeId: attendanceProgrammeId, isActive: true },
                      })
                      stats.updated++
                    } else if (!existingPY.isActive) {
                      await prisma.programmeYear.update({ where: { id: existingPY.id }, data: { isActive: true } })
                      stats.updated++
                    } else {
                      stats.unchanged++
                    }
                  } else {
                    const created = await prisma.programmeYear.create({
                      data: { programmeId: attendanceProgrammeId, year: yearNumber, moodleCategoryId: pyNode.id, isActive: true },
                    })
                    attendancePYId = created.id
                    stats.created++
                  }

                  if (!attendancePYId) {
                    warnings.push(`[hierarchy] Programme year "${pyNode.name}" (id=${pyNode.id}) could not be linked. Semesters underneath are skipped.`)
                    continue
                  }

                  for (const semNode of pyNode.children) {
                    if (semNode.role !== 'semester') continue
                    activeSemesterIds.add(semNode.id)

                    try {
                      const semNumber = parseSemesterNumber(semNode.name)
                      if (semNumber === null) {
                        warnings.push(`[hierarchy] Semester "${semNode.name}" (id=${semNode.id}) could not parse a semester number (1 or 2). Skipped.`)
                        stats.skipped++
                        continue
                      }

                      const existingSem = await prisma.semester.findFirst({
                        where: { moodleCategoryId: semNode.id },
                      })

                      if (existingSem) {
                        const needsUpdate =
                          existingSem.number !== semNumber ||
                          existingSem.name !== semNode.name ||
                          existingSem.programmeYearId !== attendancePYId
                        if (needsUpdate) {
                          await prisma.semester.update({
                            where: { id: existingSem.id },
                            data: { number: semNumber, name: semNode.name, programmeYearId: attendancePYId, isActive: true },
                          })
                          stats.updated++
                        } else if (!existingSem.isActive) {
                          await prisma.semester.update({ where: { id: existingSem.id }, data: { isActive: true } })
                          stats.updated++
                        } else {
                          stats.unchanged++
                        }
                      } else {
                        await prisma.semester.create({
                          data: { programmeYearId: attendancePYId, number: semNumber, name: semNode.name, moodleCategoryId: semNode.id, isActive: true },
                        })
                        stats.created++
                      }
                    } catch (err) {
                      stats.errors++
                      console.error(`[hierarchy] Semester sync error for "${semNode.name}" (id=${semNode.id}):`, (err as Error).message)
                    }
                  }
                } catch (err) {
                  stats.errors++
                  console.error(`[hierarchy] ProgrammeYear sync error for "${pyNode.name}" (id=${pyNode.id}):`, (err as Error).message)
                }
              }
            } catch (err) {
              stats.errors++
              console.error(`[hierarchy] Programme sync error for "${programmeNode.name}" (id=${programmeNode.id}):`, (err as Error).message)
            }
          }
        }
      }
    }
  }

  await prisma.programme.updateMany({
    where: { moodleCategoryId: { not: null, notIn: [...activeProgrammeIds] }, isActive: true },
    data: { isActive: false },
  })
  await prisma.programmeYear.updateMany({
    where: { moodleCategoryId: { not: null, notIn: [...activePYIds] }, isActive: true },
    data: { isActive: false },
  })
  await prisma.semester.updateMany({
    where: { moodleCategoryId: { not: null, notIn: [...activeSemesterIds] }, isActive: true },
    data: { isActive: false },
  })
}

// ─── CourseUnit sync ─────────────────────────────────────────────────────────

async function syncCourseUnits(
  moodleCourses: MoodleCourse[],
  tree: CategoryTree,
  stats: SyncStats,
  warnings: string[],
  moodleCourseIds: number[]
): Promise<void> {
  stats.fetched = moodleCourses.length

  const semesterCache = new Map<string, string>()
  const facultyCache = new Map<string, string>()

  for (const mc of moodleCourses) {
    if (!mc.categoryid) {
      stats.skipped++
      continue
    }

    const courseCategoryId = BigInt(mc.categoryid)
    const semester = await resolveCourseSemester(courseCategoryId, tree, semesterCache)
    if (!semester) {
      stats.skipped++
      continue
    }

    const facultyId = await resolveCourseFaculty(courseCategoryId, tree, facultyCache)
    if (!facultyId) {
      stats.skipped++
      continue
    }

    const moodleCourseIdBig = BigInt(mc.id)

    try {
      const existing = await prisma.courseUnit.findFirst({
        where: { moodleCourseId: moodleCourseIdBig },
      })

      if (existing) {
        const needsUpdate =
          existing.semesterId !== semester.id ||
          existing.facultyId !== facultyId ||
          existing.name !== mc.fullname ||
          existing.code !== mc.shortname.slice(0, CODE_MAX)
        if (needsUpdate) {
          await prisma.courseUnit.update({
            where: { id: existing.id },
            data: { semesterId: semester.id, facultyId, name: mc.fullname, code: mc.shortname.slice(0, CODE_MAX), isActive: true },
          })
          stats.updated++
        } else if (!existing.isActive) {
          await prisma.courseUnit.update({ where: { id: existing.id }, data: { isActive: true } })
          stats.updated++
        } else {
          stats.unchanged++
        }
        moodleCourseIds.push(mc.id)
      } else {
        const code = mc.shortname.slice(0, CODE_MAX)
        const newUnit = await prisma.courseUnit.create({
          data: {
            facultyId,
            code,
            name: mc.fullname,
            moodleCourseId: moodleCourseIdBig,
            moodleCategoryId: courseCategoryId,
            semesterId: semester.id,
            isActive: true,
          },
        })

        await prisma.semesterCourseUnit.create({
          data: { semesterId: semester.id, courseUnitId: newUnit.id },
        })
        stats.created++
        moodleCourseIds.push(mc.id)
      }
    } catch (err) {
      stats.errors++
      console.error(`[hierarchy] CourseUnit sync error for "${mc.shortname}" (id=${mc.id}):`, (err as Error).message)
    }
  }
}

// ─── Tree ancestry resolution helpers ────────────────────────────────────────

async function resolveCourseSemester(
  categoryId: bigint,
  tree: CategoryTree,
  cache: Map<string, string>
): Promise<{ id: string } | null> {
  const cacheKey = String(categoryId)
  if (cache.has(cacheKey)) return { id: cache.get(cacheKey)! }

  let current = findNodeInTree(tree.root, categoryId)
  while (current) {
    if (current.role === 'semester') {
      const semester = await prisma.semester.findFirst({
        where: { moodleCategoryId: current.id },
      })
      if (semester) {
        cache.set(cacheKey, semester.id)
        return { id: semester.id }
      }
      return null
    }
    current = findNodeInTree(tree.root, current.parent)
  }
  return null
}

async function resolveCourseFaculty(
  categoryId: bigint,
  tree: CategoryTree,
  cache: Map<string, string>
): Promise<string | null> {
  const cacheKey = String(categoryId)
  if (cache.has(cacheKey)) return cache.get(cacheKey)!

  let current = findNodeInTree(tree.root, categoryId)
  while (current) {
    if (current.role === 'faculty') {
      const faculty = await prisma.faculty.findFirst({
        where: { moodleCategoryId: current.id },
      })
      if (faculty) {
        cache.set(cacheKey, faculty.id)
        return faculty.id
      }
      return null
    }
    current = findNodeInTree(tree.root, current.parent)
  }
  return null
}
