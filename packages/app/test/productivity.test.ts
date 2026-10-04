import { describe, expect, it } from 'vitest'
import {
  addGuide, alignScreens, distributeScreens, guideHit, moveGuide, nextGuideIndex,
  removeGuide, screenSnapTargets, setGuideLocked, snapAxis, snapDelta, snapGrid,
  GRID_STEP,
} from '../src/renderer/productivity.js'
import {
  addScreen, createDemoProject, findScreen, moveScreens,
} from '../src/renderer/project.js'

describe('grid rounding (SNAP-01–SNAP-02)', () => {
  it('SNAP-01: snaps to multiples of 8 with -0 normalized to 0', () => {
    expect(snapGrid(514)).toBe(512)
    expect(snapGrid(516)).toBe(520)
    expect(snapGrid(0)).toBe(0)
    expect(Object.is(snapGrid(-0.4), 0)).toBe(true)
    expect(GRID_STEP).toBe(8)
  })

  it('SNAP-02: documents the exact-half asymmetry (positive rounds away, negative toward zero)', () => {
    expect(snapGrid(4)).toBe(8)
    expect(snapGrid(-4)).toBe(0)
    expect(snapGrid(12)).toBe(16)
    expect(snapGrid(-12)).toBe(-8)
  })
})

describe('snap scoring (SNAP-05–SNAP-08)', () => {
  it('SNAP-05: grid category off leaves only explicit targets', () => {
    expect(snapAxis([10, 20, 30], [], 1, false)).toBeNull()
    expect(snapAxis([10, 20, 30], [], 1, true)).toEqual({ delta: -2, target: 8, kind: 'grid' })
  })

  it('SNAP-06: same-distance tie breaks by Guides > Edges > Centers > Grid', () => {
    const hit = snapAxis([100, 200, 300], [
      { position: 96, kind: 'edge', rank: 0 },
      { position: 104, kind: 'guide', rank: 5 },
    ], 1, false)
    expect(hit).toEqual({ delta: 4, target: 104, kind: 'guide' })
  })

  it('SNAP-06: equal distance and kind breaks by moving line left/top > center > right/bottom', () => {
    expect(snapAxis([2, 10, 18], [], 1)).toEqual({ delta: -2, target: 0, kind: 'grid' })
  })

  it('SNAP-06: same kind and line breaks by stable target order', () => {
    const hit = snapAxis([100, 200, 300], [
      { position: 108, kind: 'edge', rank: 7 },
      { position: 92, kind: 'edge', rank: 2 },
    ], 1, false)
    expect(hit).toEqual({ delta: -8, target: 92, kind: 'edge' })
  })

  it('SNAP-07: tolerance is measured in screen pixels', () => {
    expect(snapAxis([0, 50, 90], [{ position: 190, kind: 'edge', rank: 0 }], 1, false)).toBeNull()
    expect(snapAxis([0, 50, 90], [{ position: 190, kind: 'edge', rank: 0 }], 0.05, false))
      .toEqual({ delta: 100, target: 190, kind: 'edge' })
  })

  it('SNAP-08: X and Y choose target classes independently from the primary box', () => {
    const result = snapDelta(
      { left: 13, top: 20, right: 525, bottom: 404, width: 512, height: 384 },
      [{ position: 14, kind: 'guide', rank: 0 }],
      [],
      1,
    )
    expect(result.dx).toBe(1)
    expect(result.lines.x).toEqual([14])
    expect(result.dy).toBe(4)
    expect(result.lines.y).toEqual([24])
  })
})

describe('snap targets (SNAP-09–SNAP-10)', () => {
  it('SNAP-09: moving set members are excluded from targets', () => {
    const project = createDemoProject()
    const targets = screenSnapTargets(project.screens, new Set(['screen-1']))
    expect(targets.vertical.map(t => t.position)).not.toContain(0)
    expect(targets.vertical.map(t => t.position)).not.toContain(512)
    expect(targets.vertical.map(t => t.position)).toContain(700)
  })

  it('SNAP-10: every screen contributes edges and center regardless of lock', () => {
    const project = createDemoProject()
    const targets = screenSnapTargets(project.screens, new Set())
    expect(targets.vertical).toHaveLength(9)
    expect(targets.horizontal).toHaveLength(9)
  })
})

describe('move precision (SNAP-11)', () => {
  it('SNAP-11: moveScreens preserves fractions without rounding', () => {
    const project = moveScreens(createDemoProject(), ['screen-1'], 0.5, 0.25)
    expect(findScreen(project, 'screen-1')!.x).toBe(0.5)
    const next = moveScreens(project, ['screen-1'], 1, 0)
    expect(findScreen(next, 'screen-1')!.x).toBe(1.5)
  })
})

describe('guides (GUIDE-01–GUIDE-07)', () => {
  it('GUIDE: add/move/remove/locknote and deterministic indexing', () => {
    let guides = addGuide([], 'vertical', 100)
    expect(guides).toEqual([{ id: 'guide-1', orientation: 'vertical', position: 100, locked: false }])
    guides = addGuide(guides, 'horizontal', 200)
    expect(nextGuideIndex(guides)).toBe(3)
    guides = moveGuide(guides, 'guide-1', 120)
    expect(guides[0]).toEqual({ id: 'guide-1', orientation: 'vertical', position: 120, locked: false })
    guides = setGuideLocked(guides, 'guide-1', true)
    expect(guides[0]!.locked).toBe(true)
    guides = removeGuide(guides, 'guide-1')
    expect(guides.map(g => g.id)).toEqual(['guide-2'])
    expect(nextGuideIndex(guides)).toBe(3)
  })

  it('GUIDE: hit prefers the nearest line within tolerance, locked included', () => {
    const guides = [
      { id: 'guide-1', orientation: 'vertical' as const, position: 100, locked: true },
      { id: 'guide-2', orientation: 'vertical' as const, position: 108, locked: false },
    ]
    expect(guideHit(guides, { x: 107, y: 0 }, 1)!.id).toBe('guide-2')
    expect(guideHit(guides, { x: 500, y: 0 }, 1)).toBeNull()
    expect(guideHit(guides, { x: 100, y: 0 }, 1)!.id).toBe('guide-1')
  })
})

describe('align (ALIGN-01–ALIGN-11)', () => {
  const ids = ['screen-1', 'screen-2', 'screen-3']

  it('ALIGN left/top moves every member to the box edge', () => {
    const left = alignScreens(createDemoProject(), ids, 'left')
    expect(left.screens.map(s => s.x)).toEqual([0, 0, 0])
    expect(left.screens.map(s => s.y)).toEqual([0, 120, 620])
    const top = alignScreens(createDemoProject(), ids, 'top')
    expect(top.screens.map(s => s.y)).toEqual([0, 0, 0])
    expect(top.screens.map(s => s.x)).toEqual([0, 700, 320])
  })

  it('ALIGN right/bottom/centers follow the selection box, not the primary', () => {
    const right = alignScreens(createDemoProject(), ids, 'right')
    expect(right.screens.map(s => s.x)).toEqual([572, 700, 572])
    const centerX = alignScreens(createDemoProject(), ids, 'centerX')
    expect(centerX.screens.map(s => s.x)).toEqual([286, 350, 286])
    const middle = alignScreens(createDemoProject(), ids, 'middle')
    expect(middle.screens.map(s => s.y)).toEqual([246, 310, 310])
    const bottom = alignScreens(createDemoProject(), ids, 'bottom')
    expect(bottom.screens.map(s => s.y)).toEqual([492, 620, 620])
  })

  it('ALIGN-08: unselected screens keep references; ALIGN-09: fewer than 2 throws', () => {
    const project = addScreen(createDemoProject())
    const next = alignScreens(project, ids, 'left')
    expect(next.screens[3]).toBe(project.screens[3])
    expect(() => alignScreens(project, ['screen-1'], 'left')).toThrow(/at least 2/)
  })

  it('ALIGN-11: result is independent of id order (primary is not an anchor)', () => {
    const project = createDemoProject()
    const forward = alignScreens(project, ['screen-1', 'screen-3'], 'right')
    const backward = alignScreens(project, ['screen-3', 'screen-1'], 'right')
    expect(forward.screens.map(s => [s.x, s.y])).toEqual(backward.screens.map(s => [s.x, s.y]))
  })
})

describe('distribute (DIST-01–DIST-05)', () => {
  function quad() {
    return addScreen(createDemoProject())
  }

  it('DIST horizontal keeps outer bounds fixed with equal gaps', () => {
    const project = quad()
    const all = ['screen-1', 'screen-2', 'screen-3', 'screen-4']
    const next = distributeScreens(project, all, 'horizontal')
    const placed = all.map(id => findScreen(next, id)!)
    const ordered = [...placed].sort((a, b) => a.x - b.x)
    expect(ordered[0]!.x).toBe(0)
    const gaps = [0, 1, 2].map(i => ordered[i + 1]!.x - (ordered[i]!.x + ordered[i]!.screen.resolution.width))
    expect(gaps[0]).toBeCloseTo(gaps[1]!, 9)
    expect(gaps[1]).toBeCloseTo(gaps[2]!, 9)
    expect(ordered[3]!.x + ordered[3]!.screen.resolution.width).toBeCloseTo(1084, 9)
  })

  it('DIST vertical distributes by top with outer bounds fixed', () => {
    const project = quad()
    const all = ['screen-1', 'screen-2', 'screen-3', 'screen-4']
    const next = distributeScreens(project, all, 'vertical')
    const placed = all.map(id => findScreen(next, id)!)
    expect(placed[0]!.y).toBe(0)
    const gaps = [0, 1, 2].map(i => placed[i + 1]!.y - (placed[i]!.y + placed[i]!.screen.resolution.height))
    expect(gaps[0]).toBeCloseTo(gaps[1]!, 9)
    expect(gaps[1]).toBeCloseTo(gaps[2]!, 9)
    expect(placed[3]!.y + placed[3]!.screen.resolution.height).toBeCloseTo(1104, 9)
  })

  it('DIST-03: fewer than 3 throws; DIST-05: overlapping input stays deterministic', () => {
    const project = quad()
    expect(() => distributeScreens(project, ['screen-1', 'screen-2'], 'horizontal')).toThrow(/at least 3/)
    const first = distributeScreens(project, ['screen-1', 'screen-2', 'screen-3', 'screen-4'], 'horizontal')
    const second = distributeScreens(project, ['screen-1', 'screen-2', 'screen-3', 'screen-4'], 'horizontal')
    expect(first.screens.map(s => [s.x, s.y])).toEqual(second.screens.map(s => [s.x, s.y]))
  })
})
