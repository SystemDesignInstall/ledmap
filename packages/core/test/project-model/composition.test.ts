import { describe, expect, it } from 'vitest'
import {
  asCabinetGridId,
  asScreenId,
  createEmptyProjectV2,
  selectCompositionGeometry,
  type LedMapProjectV2,
  type ProjectCabinetGrid,
  type ProjectScreen,
} from '../../src/index.js'

interface GridSpec {
  readonly columns: number
  readonly rows: number
  readonly cabinetWidth: number
  readonly cabinetHeight: number
}

interface Entry {
  readonly screen: string
  readonly grid?: GridSpec
  readonly placement?: { readonly x: number; readonly y: number }
}

function buildProject(entries: readonly Entry[]): LedMapProjectV2 {
  const empty = createEmptyProjectV2()
  const screens: ProjectScreen[] = []
  const grids: ProjectCabinetGrid[] = []
  const placements: { readonly screenId: ReturnType<typeof asScreenId>; readonly x: number; readonly y: number; readonly locked: boolean }[] = []
  for (const entry of entries) {
    const screenId = asScreenId(entry.screen)
    const gridId = asCabinetGridId(`grid-${entry.screen}`)
    screens.push({
      id: screenId,
      name: entry.screen,
      resolution: { width: 64, height: 64 },
      cabinetGridOrder: entry.grid ? [gridId] : [],
      mappingRegionOrder: [],
    })
    if (entry.grid) {
      grids.push({
        id: gridId,
        screenId,
        name: 'Grid',
        columns: entry.grid.columns,
        rows: entry.grid.rows,
        cabinetWidth: entry.grid.cabinetWidth,
        cabinetHeight: entry.grid.cabinetHeight,
        ordering: { numbering: 'row', direction: 'left-to-right', snake: true, startCorner: 'top-left' },
      })
    }
    if (entry.placement) {
      placements.push({ screenId, x: entry.placement.x, y: entry.placement.y, locked: false })
    }
  }
  return {
    ...empty,
    design: { ...empty.design, screens, cabinetGrids: grids, composition: { placements } },
  }
}

function assertDeepFrozen(value: unknown): void {
  if (value !== null && typeof value === 'object') {
    expect(Object.isFrozen(value)).toBe(true)
    for (const child of Object.values(value)) assertDeepFrozen(child)
  }
}

describe('selectCompositionGeometry', () => {
  it('returns null bounds for an empty project', () => {
    const geometry = selectCompositionGeometry(createEmptyProjectV2())
    expect(geometry.bounds).toBeNull()
    expect(geometry.screens).toEqual([])
    expect(geometry.screenCount).toBe(0)
    expect(geometry.placedCount).toBe(0)
    expect(geometry.totalOutputPixels).toBe(0)
    expect(geometry.boundingArea).toBe(0)
    expect(geometry.overlaps).toEqual([])
    assertDeepFrozen(geometry)
  })

  it('measures a single REF-001 sized screen', () => {
    const geometry = selectCompositionGeometry(buildProject([
      { screen: 'screen-1', grid: { columns: 4, rows: 3, cabinetWidth: 128, cabinetHeight: 128 }, placement: { x: 0, y: 0 } },
    ]))
    expect(geometry.screens).toEqual([
      { screenId: 'screen-1', x: 0, y: 0, width: 512, height: 384, right: 512, bottom: 384 },
    ])
    expect(geometry.bounds).toEqual({ left: 0, top: 0, right: 512, bottom: 384, width: 512, height: 384 })
    expect(geometry.totalOutputPixels).toBe(196608)
    expect(geometry.boundingArea).toBe(196608)
    expect(geometry.overlaps).toEqual([])
    assertDeepFrozen(geometry)
  })

  it('unions disjoint screens without overlaps', () => {
    const geometry = selectCompositionGeometry(buildProject([
      { screen: 'screen-1', grid: { columns: 4, rows: 3, cabinetWidth: 128, cabinetHeight: 128 }, placement: { x: 0, y: 0 } },
      { screen: 'screen-2', grid: { columns: 2, rows: 1, cabinetWidth: 128, cabinetHeight: 128 }, placement: { x: 600, y: 0 } },
    ]))
    expect(geometry.bounds).toEqual({ left: 0, top: 0, right: 856, bottom: 384, width: 856, height: 384 })
    expect(geometry.totalOutputPixels).toBe(196608 + 32768)
    expect(geometry.boundingArea).toBe(856 * 384)
    expect(geometry.overlaps).toEqual([])
  })

  it('reports the exact intersection rect of overlapping screens', () => {
    const geometry = selectCompositionGeometry(buildProject([
      { screen: 'screen-1', grid: { columns: 4, rows: 3, cabinetWidth: 128, cabinetHeight: 128 }, placement: { x: 0, y: 0 } },
      { screen: 'screen-2', grid: { columns: 2, rows: 2, cabinetWidth: 128, cabinetHeight: 128 }, placement: { x: 400, y: 100 } },
    ]))
    expect(geometry.overlaps).toEqual([
      {
        a: 'screen-1',
        b: 'screen-2',
        rect: { x: 400, y: 100, width: 112, height: 256, right: 512, bottom: 356 },
      },
    ])
    expect(geometry.bounds).toEqual({ left: 0, top: 0, right: 656, bottom: 384, width: 656, height: 384 })
    assertDeepFrozen(geometry)
  })

  it('treats edge-touching screens as non-overlapping', () => {
    const geometry = selectCompositionGeometry(buildProject([
      { screen: 'screen-1', grid: { columns: 4, rows: 3, cabinetWidth: 128, cabinetHeight: 128 }, placement: { x: 0, y: 0 } },
      { screen: 'screen-2', grid: { columns: 2, rows: 1, cabinetWidth: 128, cabinetHeight: 128 }, placement: { x: 512, y: 0 } },
    ]))
    expect(geometry.overlaps).toEqual([])
    expect(geometry.bounds).toEqual({ left: 0, top: 0, right: 768, bottom: 384, width: 768, height: 384 })
  })

  it('lists screens without placement instead of dropping them silently', () => {
    const geometry = selectCompositionGeometry(buildProject([
      { screen: 'screen-1', grid: { columns: 1, rows: 1, cabinetWidth: 64, cabinetHeight: 64 }, placement: { x: 10, y: 20 } },
      { screen: 'screen-2', grid: { columns: 1, rows: 1, cabinetWidth: 64, cabinetHeight: 64 } },
    ]))
    expect(geometry.screenCount).toBe(2)
    expect(geometry.placedCount).toBe(1)
    expect(geometry.unplacedScreenIds).toEqual(['screen-2'])
    expect(geometry.bounds).toEqual({ left: 10, top: 20, right: 74, bottom: 84, width: 64, height: 64 })
  })

  it('lists placed screens without a resolvable grid as skipped', () => {
    const geometry = selectCompositionGeometry(buildProject([
      { screen: 'screen-1', placement: { x: 0, y: 0 } },
    ]))
    expect(geometry.placedCount).toBe(0)
    expect(geometry.skippedScreenIds).toEqual(['screen-1'])
    expect(geometry.bounds).toBeNull()
  })

  it('rejects duplicate placements', () => {
    const base = buildProject([
      { screen: 'screen-1', grid: { columns: 1, rows: 1, cabinetWidth: 64, cabinetHeight: 64 }, placement: { x: 0, y: 0 } },
    ])
    const duplicated: LedMapProjectV2 = {
      ...base,
      design: {
        ...base.design,
        composition: {
          placements: [
            ...base.design.composition.placements,
            { screenId: asScreenId('screen-1'), x: 10, y: 10, locked: false },
          ],
        },
      },
    }
    expect(() => selectCompositionGeometry(duplicated)).toThrowError(/PROJECT_DUPLICATE_COMPOSITION_PLACEMENT/)
  })

  it('rejects placements referencing an unknown screen', () => {
    const base = buildProject([
      { screen: 'screen-1', grid: { columns: 1, rows: 1, cabinetWidth: 64, cabinetHeight: 64 }, placement: { x: 0, y: 0 } },
    ])
    const broken: LedMapProjectV2 = {
      ...base,
      design: {
        ...base.design,
        composition: {
          placements: [
            ...base.design.composition.placements,
            { screenId: asScreenId('screen-ghost'), x: 0, y: 0, locked: false },
          ],
        },
      },
    }
    expect(() => selectCompositionGeometry(broken)).toThrowError(/PROJECT_UNKNOWN_SCREEN/)
  })

  it('rejects negative composition coordinates for the Composition tab contract', () => {
    const project = buildProject([
      { screen: 'screen-1', grid: { columns: 1, rows: 1, cabinetWidth: 64, cabinetHeight: 64 }, placement: { x: -5, y: 0 } },
    ])
    expect(() => selectCompositionGeometry(project)).toThrowError(/PROJECT_INVALID_GEOMETRY/)
  })

  it('rejects degenerate grid geometry', () => {
    const project = buildProject([
      { screen: 'screen-1', grid: { columns: 0, rows: 1, cabinetWidth: 64, cabinetHeight: 64 }, placement: { x: 0, y: 0 } },
    ])
    expect(() => selectCompositionGeometry(project)).toThrowError(/PROJECT_INVALID_GEOMETRY/)
  })

  it('is deterministic and never mutates its input', () => {
    const project = buildProject([
      { screen: 'screen-1', grid: { columns: 4, rows: 3, cabinetWidth: 128, cabinetHeight: 128 }, placement: { x: 0, y: 0 } },
      { screen: 'screen-2', grid: { columns: 2, rows: 2, cabinetWidth: 128, cabinetHeight: 128 }, placement: { x: 400, y: 100 } },
    ])
    const before = JSON.stringify(project)
    const first = selectCompositionGeometry(project)
    const second = selectCompositionGeometry(project)
    expect(second).toEqual(first)
    expect(second).not.toBe(first)
    expect(JSON.stringify(project)).toBe(before)
  })
})
