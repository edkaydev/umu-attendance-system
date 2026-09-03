/**
 * Moodle category tree builder + academic-hierarchy parser.
 *
 * Pure logic — no DB, no network. Turns the flat `core_course_get_categories`
 * list into a tree keyed by Moodle category ID, resolves the configured root
 * ("CAMPUSES"), and assigns academic meaning to each node.
 *
 * Identity rules:
 *   - Moodle category IDs are the ONLY authoritative identity. Names are
 *     duplicated and messy, so they are display metadata only.
 *   - Never merge two nodes because they share a name, shortname, or path
 *     fragment.
 *
 * Defensiveness:
 *   - The parser computes RELATIVE depth from the resolved root, not Moodle's
 *     absolute `depth`, so it is robust to the root sitting at any absolute
 *     depth.
 *   - Campuses/faculties/levels/years/programmes/years/semesters are
 *     classified by their position (relative depth) below the root.
 *   - Any node that does not fit the expected shape is reported as an
 *     ANOMALY instead of silently fabricating records.
 *   - Hidden (visible=0) historical trees are kept separate from the active
 *     tree so callers can soft-deactivate rather than delete.
 *
 * Relative-depth roles (relative to the resolved root):
 *   +1 campus, +2 faculty, +3 level, +4 academic year, +5 programme,
 *   +6 programme year, +7 semester.
 */

import type { MoodleCategory } from './moodle.types'

// ─── Types ───────────────────────────────────────────────────────────────────

export type CategoryRole =
  | 'campus'
  | 'faculty'
  | 'level'
  | 'academic-year'
  | 'programme'
  | 'programme-year'
  | 'semester'
  | 'unknown'

export interface CategoryNode {
  id: bigint
  parent: bigint
  /** Absolute Moodle depth (from mdl_course_categories.depth). */
  depth: number
  /** Depth relative to the resolved root: root = 0, its child = 1, … */
  relativeDepth: number
  name: string
  path: string
  visible: boolean
  role: CategoryRole
  children: CategoryNode[]
}

export interface CategoryTreeInput {
  categories: MoodleCategory[]
  /** Name of the root category that holds all campuses. Default: "CAMPUSES". */
  rootName?: string
}

export interface CategoryTree {
  /** The resolved root node (e.g. "CAMPUSES"). */
  root: CategoryNode
  /** Direct campus children of the root. */
  campuses: CategoryNode[]
  /** Human-readable anomalies encountered while interpreting the tree. */
  anomalies: string[]
}

// ─── Role lookup by relative depth ────────────────────────────────────────────

const ROLE_BY_RELATIVE_DEPTH: Record<number, CategoryRole> = {
  1: 'campus',
  2: 'faculty',
  3: 'level',
  4: 'academic-year',
  5: 'programme',
  6: 'programme-year',
  7: 'semester',
}

function relativeDepthRole(relativeDepth: number): CategoryRole {
  return ROLE_BY_RELATIVE_DEPTH[relativeDepth] ?? 'unknown'
}

// ─── Tree builder ─────────────────────────────────────────────────────────────

/**
 * Build an ordered node tree from a flat category list, keyed by id.
 * Nodes whose parent id is unknown are attached to a synthetic root so no
 * category is lost; the caller rejects the tree if the configured root is
 * not found.
 */
function buildTree(categories: MoodleCategory[]): {
  nodesById: Map<bigint, CategoryNode>
  orphans: CategoryNode[]
} {
  const nodesById = new Map<bigint, CategoryNode>()
  const byParent = new Map<bigint, CategoryNode[]>()

  for (const c of categories) {
    const id = BigInt(c.id)
    const parent = BigInt(c.parent)
    const node: CategoryNode = {
      id,
      parent,
      depth: c.depth,
      relativeDepth: 0, // assigned during traversal
      name: c.name,
      path: c.path,
      visible: c.visible === 1,
      role: 'unknown',
      children: [],
    }
    nodesById.set(id, node)
    const siblings = byParent.get(parent) ?? []
    siblings.push(node)
    byParent.set(parent, siblings)
  }

  // Attach children in stable sort order (by absolute depth, then name).
  for (const node of nodesById.values()) {
    const children = byParent.get(node.id) ?? []
    children.sort((a, b) => a.depth - b.depth || a.name.localeCompare(b.name))
    node.children = children
  }

  // Orphans: nodes whose parent is not present (excluding parent === 0 which
  // is Moodle's implicit top-level root). These can only be reached via the
  // byParent map from parent 0, or detected as unreachable.
  const orphans: CategoryNode[] = []
  const reachable = new Set<bigint>()
  const stack = [...(byParent.get(0n) ?? [])]
  for (const n of stack) reachable.add(n.id)
  while (stack.length > 0) {
    const n = stack.pop()!
    for (const child of n.children) {
      if (!reachable.has(child.id)) {
        reachable.add(child.id)
        stack.push(child)
      }
    }
  }
  for (const node of nodesById.values()) {
    if (!reachable.has(node.id) && node.parent !== 0n) orphans.push(node)
  }

  return { nodesById, orphans }
}

// ─── Traversal ────────────────────────────────────────────────────────────────

/**
 * Walk from the resolved root, assigning relative depths and roles, and
 * collecting anomalies.
 */
function walk(node: CategoryNode, relativeDepth: number, anomalies: string[]): void {
  node.relativeDepth = relativeDepth
  node.role = relativeDepthRole(relativeDepth)

  // Depth invariant check: each child should sit exactly one absolute depth
  // deeper than its parent. A gap or overlap in absolute depth indicates a
  // malformed tree worth reporting.
  for (const child of node.children) {
    if (child.depth !== node.depth + 1) {
      anomalies.push(
        `Category "${child.name}" (id=${child.id}) has absolute depth ${child.depth} ` +
        `but parent "${node.name}" (id=${node.id}) is depth ${node.depth} — expected ${node.depth + 1}.`
      )
    }
    walk(child, relativeDepth + 1, anomalies)
  }
}

// ─── Parser entrypoint ────────────────────────────────────────────────────────

/**
 * Parse the flat Moodle category list into an interpreted academic tree,
 * resolving the configured root by name.
 *
 * @throws Error if the configured root category cannot be found.
 */
export function parseCategoryTree(input: CategoryTreeInput): CategoryTree {
  const rootName = (input.rootName ?? 'CAMPUSES').trim()
  const { nodesById, orphans } = buildTree(input.categories)
  const anomalies: string[] = []

  // Resolve the configured root by name (case-insensitive). If more than one
  // candidate exists, that itself is an anomaly — but never guess.
  const candidates = [...nodesById.values()].filter(
    (n) => n.name.trim().toLowerCase() === rootName.toLowerCase() && n.parent === 0n
  )

  if (candidates.length === 0) {
    // Also accept a root whose parent is unknown/0 at the same name.
    const anyName = [...nodesById.values()].filter(
      (n) => n.name.trim().toLowerCase() === rootName.toLowerCase()
    )
    if (anyName.length === 1) {
      candidates.push(anyName[0])
    }
  }

  if (candidates.length === 0) {
    throw new Error(
      `Could not resolve Moodle category root "${rootName}". ` +
      'Set MOODLE/hierarchy configuration to the exact root category name, ' +
      'or verify the category exists.'
    )
  }
  if (candidates.length > 1) {
    anomalies.push(
      `Multiple top-level categories are named "${rootName}" (ids: ${candidates.map((c) => c.id).join(', ')}). ` +
      'Resolved the first; the others are NOT merged.'
    )
  }

  const root = candidates[0] as CategoryNode
  root.relativeDepth = 0
  root.role = 'unknown'
  walk(root, 0, anomalies)

  const campuses = root.children.slice()

  // Anomaly checks that need the full picture.
  for (const campus of campuses) {
    detectSemesterCollapse(campus, anomalies)
  }

  for (const orphan of orphans) {
    anomalies.push(
      `Category "${orphan.name}" (id=${orphan.id}, path=${orphan.path}) is unreachable from the root — its parent (id=${orphan.parent}) is missing from the data. Skipped.`
    )
  }

  return { root, campuses, anomalies }
}

/**
 * The parallel active trees fold "programme year" and "semester" into a single
 * node name (e.g. "Year 3 Semester 1") with no deeper semester child. Flag
 * these so the sync never mis-attributes a folded node as both year and term.
 */
function detectSemesterCollapse(campus: CategoryNode, anomalies: string[]): void {
  const visit = (node: CategoryNode): void => {
    // A programme-year node (relativeDepth 6) whose name suggests a term but
    // which has no semester (relativeDepth 7) children.
    if (node.role === 'programme-year') {
      const hasSemesterChildren = node.children.some((c) => c.role === 'semester')
      const nameSuggestsTerm = /\b(sem|semester|term)\b/i.test(node.name)
      if (!hasSemesterChildren && nameSuggestsTerm) {
        anomalies.push(
          `Programme year "${node.name}" (id=${node.id}) has a term marker in its name but no semester children — ` +
          'the semester appears collapsed into the year node. The current period mapping must reference an explicit verified category id.'
        )
      }
    }
    node.children.forEach(visit)
  }
  visit(campus)
}
