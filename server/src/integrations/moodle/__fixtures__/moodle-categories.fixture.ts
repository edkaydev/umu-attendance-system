/**
 * Test fixtures — a realistic, MESSY Moodle category hierarchy reflecting the
 * discovered UMU structure: multiple campuses, faculties with duplicate names,
 * parallel + historical trees, a collapsed year+semester active tree, and an
 * unreachable orphan. Used to prove the defensive parser.
 */

import type { MoodleCategory } from '../moodle.types'
import { parseCategoryTree } from '../moodle-category-tree'
import type { CategoryNode, CategoryTree } from '../moodle-category-tree'

/** Build a flat category row the way the API returns them. */
function cat(
  id: number,
  name: string,
  parent: number,
  depth: number,
  visible = 1,
  path?: string
): MoodleCategory {
  return {
    id,
    name,
    parent,
    depth,
    visible,
    path: path ?? `/2/${parent === 0 ? '' : parent}/${id}`.replace(/\/\//g, '/'),
  }
}

/**
 * The full messy fixture.
 *
 * IDs:
 *  2   CAMPUSES (root)
 *  3   NKOZI
 *  21  Faculty of Computing          (visible active)
 *  22  Faculty of Computing          (duplicate name, hidden old)
 *  31  Undergraduate
 *  32  Postgraduate
 *  41  Academic Year 2025/26         (historical)
 *  42  Academic Year 2026/27         (active, parallel)
 *  51  Bachelor of Science in Computer Science  (under year 41)
 *  52  Bachelor of Science in Computer Science  (duplicate name, under year 42)
 *  61  Year 1      (under 51)
 *  71  SEM 1       (under 61, active)
 *  72  SEM 2       (under 61, hidden)
 *  62  Year 3 Semester 1             (collapsed year+semester under 52, active)
 *  999 orphan (parent missing)
 */
export function moodleCategoryFixture(): MoodleCategory[] {
  return [
    cat(2, 'CAMPUSES', 0, 1, 1, '/2'),
    cat(3, 'NKOZI', 2, 2, 1, '/2/3'),
    cat(21, 'Faculty of Computing', 3, 3, 1, '/2/3/21'),
    cat(22, 'Faculty of Computing', 3, 3, 0, '/2/3/22'),
    cat(31, 'Undergraduate', 21, 4, 1, '/2/3/21/31'),
    cat(32, 'Postgraduate', 21, 4, 1, '/2/3/21/32'),
    cat(41, 'Academic Year 2025/26', 31, 5, 0, '/2/3/21/31/41'),
    cat(42, 'Academic Year 2026/27', 31, 5, 1, '/2/3/21/31/42'),
    cat(51, 'Bachelor of Science in Computer Science', 41, 6, 0, '/2/3/21/31/41/51'),
    cat(52, 'Bachelor of Science in Computer Science', 42, 6, 1, '/2/3/21/31/42/52'),
    cat(61, 'Year 1', 51, 7, 0, '/2/3/21/31/41/51/61'),
    cat(71, 'SEM 1', 61, 8, 1, '/2/3/21/31/41/51/61/71'),
    cat(72, 'SEM 2', 61, 8, 0, '/2/3/21/31/41/51/61/72'),
    cat(62, 'Year 3 Semester 1', 52, 7, 1, '/2/3/21/31/42/52/62'),
    cat(999, 'Orphaned Faculty', 888, 3, 1, '/2/3/999'),
  ]
}

/** Find a node by id in a tree (test helper). */
export function findNodeById(tree: CategoryTree, id: number | bigint): CategoryNode | null {
  const target = BigInt(id)
  const visit = (n: CategoryNode): CategoryNode | null => {
    if (n.id === target) return n
    for (const child of n.children) {
      const found = visit(child)
      if (found) return found
    }
    return null
  }
  return visit(tree.root)
}

/** Convenience: build a parsed tree from the fixture. */
export function buildFixtureTree(): CategoryTree {
  return parseCategoryTree({ categories: moodleCategoryFixture() })
}
