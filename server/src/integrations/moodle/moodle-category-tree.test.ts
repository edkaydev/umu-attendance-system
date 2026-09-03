/**
 * moodle-category-tree tests — defensive academic-hierarchy parsing.
 */
import { describe, it, expect } from 'vitest'
import {
  moodleCategoryFixture,
  findNodeById,
  buildFixtureTree,
} from './__fixtures__/moodle-categories.fixture'
import { parseCategoryTree } from './moodle-category-tree'

describe('parseCategoryTree', () => {
  it('resolves the configured root and its campuses', () => {
    const tree = buildFixtureTree()
    expect(tree.root.name).toBe('CAMPUSES')
    expect(tree.root.id).toBe(2n)
    expect(tree.campuses.map((c) => c.name)).toEqual(['NKOZI'])
  })

  it('assigns academic roles by relative depth', () => {
    const tree = buildFixtureTree()
    expect(findNodeById(tree, 3)?.role).toBe('campus')
    expect(findNodeById(tree, 21)?.role).toBe('faculty')
    expect(findNodeById(tree, 31)?.role).toBe('level')
    expect(findNodeById(tree, 42)?.role).toBe('academic-year')
    expect(findNodeById(tree, 52)?.role).toBe('programme')
    expect(findNodeById(tree, 62)?.role).toBe('programme-year')
    expect(findNodeById(tree, 71)?.role).toBe('semester')
  })

  it('never merges duplicate names — distinct IDs are kept separate', () => {
    const tree = buildFixtureTree()
    const facultiesNamedComputing = tree.campuses[0].children.filter(
      (c) => c.name === 'Faculty of Computing'
    )
    expect(facultiesNamedComputing.map((c) => c.id)).toEqual([21n, 22n])
    expect(facultiesNamedComputing.length).toBe(2)
  })

  it('keeps hidden (visible=0) historical nodes distinct from the active tree', () => {
    const tree = buildFixtureTree()
    const hiddenProgramme = findNodeById(tree, 51)
    const activeProgramme = findNodeById(tree, 52)
    // Both are named "Bachelor of Science in Computer Science" but are distinct.
    expect(hiddenProgramme?.id).not.toBe(activeProgramme?.id)
    expect(hiddenProgramme?.visible).toBe(false)
    expect(activeProgramme?.visible).toBe(true)
  })

  it('flags a collapsed year+semester node as an anomaly', () => {
    const tree = buildFixtureTree()
    const messages = tree.anomalies.join('\n')
    expect(messages).toContain('Year 3 Semester 1')
    expect(messages).toContain('collapsed')
  })

  it('reports unreachable orphan categories instead of fabricating them', () => {
    const tree = buildFixtureTree()
    const messages = tree.anomalies.join('\n')
    expect(messages).toContain('Orphaned Faculty')
    expect(messages).toContain('999')
  })

  it('reports a parent with an unexpected absolute depth as an anomaly', () => {
    // Build a tree where a child sits at an impossible absolute depth jump.
    const list = moodleCategoryFixture()
    list.push({ id: 1200, name: 'SEM 1', parent: 62, depth: 999, visible: 1, path: '/x' })
    const tree = parseCategoryTree({ categories: list })
    const messages = tree.anomalies.join('\n')
    expect(messages).toContain('1200')
    expect(messages).toContain('999')
  })

  it('throws a clear error when the configured root is absent', () => {
    const list = moodleCategoryFixture().filter((c) => c.name !== 'CAMPUSES')
    expect(() => parseCategoryTree({ categories: list })).toThrow(/CAMPUSES/)
  })

  it('is robust to the root sitting at an absolute depth other than 1', () => {
    // Re-root the fixture under a synthetic parent so CAMPUSES is depth 2,
    // and renumber depths +1 for everything below it.
    const list = moodleCategoryFixture().map((c) => ({
      ...c,
      depth: c.depth + 1,
      parent: c.id === 2 ? 1000 : c.parent, // CAMPUSES now child of 1000
    }))
    list.push({ id: 1000, name: 'Site Root', parent: 0, depth: 1, visible: 1, path: '/1000' })
    const tree = parseCategoryTree({ categories: list })
    expect(tree.root.id).toBe(2n)
    expect(tree.campuses[0].name).toBe('NKOZI')
    // Roles are still correct because they are relative to the root.
    expect(findNodeById(tree, 71)?.role).toBe('semester')
  })
})
