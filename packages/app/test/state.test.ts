import { afterEach, describe, expect, it, vi } from 'vitest'
import * as core from '@ledmap/core'
import { applyDraft, changeNumbering, initialDraft, type Draft } from '../src/renderer/state.js'

afterEach(() => vi.restoreAllMocks())

describe('Alpha state adapter', () => {
  it('creates a consistent Screen/Grid and the REF-001 preview', () => {
    const { snapshot, errors } = applyDraft(null, initialDraft)
    expect(errors).toEqual({})
    expect(snapshot?.screen.cabinetGrids).toEqual([snapshot?.grid.id])
    expect(snapshot?.grid.screen).toBe(snapshot?.screen.id)
    expect(snapshot?.screen.mappingRegions).toEqual([])
    expect(snapshot?.screen.resolution).toEqual({ width: 512, height: 384 })
    expect(snapshot?.pixelCount).toBe(196608)
    expect(snapshot?.cabinets.map(c => c.index + 1)).toEqual([1, 2, 3, 4, 8, 7, 6, 5, 9, 10, 11, 12])
  })

  it.each([
    ['left-to-right', 'column', 'top-to-bottom'], ['right-to-left', 'column', 'bottom-to-top'],
    ['top-to-bottom', 'row', 'left-to-right'], ['bottom-to-top', 'row', 'right-to-left'],
  ] as const)('translates %s when switching to %s', (direction, numbering, expected) => {
    const ordering = Object.freeze({ ...initialDraft.ordering, direction })
    expect(changeNumbering(ordering, numbering)).toEqual({ ...ordering, numbering, direction: expected })
  })

  it('uses the core for all supported modes while preserving physical IDs and inputs', () => {
    const original = applyDraft(null, initialDraft).snapshot!
    for (const numbering of ['row', 'column'] as const) {
      const directions = numbering === 'row' ? ['left-to-right', 'right-to-left'] as const : ['top-to-bottom', 'bottom-to-top'] as const
      for (const direction of directions) {
        for (const snake of [false, true]) {
          const draft = Object.freeze({ ...initialDraft, ordering: Object.freeze({ ...initialDraft.ordering, numbering, direction, snake }) })
          const { snapshot } = applyDraft(original, draft)
          expect(snapshot?.path).toEqual(core.cabinetOrder(snapshot!.config))
          expect(snapshot?.cabinets.map(c => c.id)).toEqual(original.cabinets.map(c => c.id))
          for (const cabinet of snapshot!.cabinets) expect(cabinet.index).toBe(core.cabinetIndex(snapshot!.config, cabinet))
        }
      }
    }
    expect(original.cabinets.map(c => c.index + 1)).toEqual([1, 2, 3, 4, 8, 7, 6, 5, 9, 10, 11, 12])
  })

  it('passes rectangular module geometry through the generalized core API', () => {
    const layout = vi.spyOn(core, 'decomposeCabinetPixel')
    const { snapshot } = applyDraft(null, { ...initialDraft, moduleColumns: '3', moduleRows: '2', modulePixelWidth: '5', modulePixelHeight: '7' })
    expect(layout).toHaveBeenCalledWith(expect.objectContaining({ moduleColumns: 3, moduleRows: 2, modulePixelWidth: 5, modulePixelHeight: 7 }), { x: 0, y: 0 })
    expect(snapshot?.grid.cabinetWidth).toBe(15)
    expect(snapshot?.grid.cabinetHeight).toBe(14)
    expect(snapshot?.screen.resolution).toEqual({ width: 60, height: 42 })
    expect(snapshot?.pixelCount).toBe(2520)
  })

  it.each(['', ' ', '0', '-1', '1.5', 'NaN', 'Infinity', '9007199254740992'])('rejects invalid input %j atomically and recovers', columns => {
    const previous = applyDraft(null, initialDraft).snapshot!
    const result = applyDraft(previous, { ...initialDraft, columns })
    expect(result.snapshot).toBe(previous)
    expect(result.errors.columns).toBeTruthy()
    const repaired = applyDraft(result.snapshot, { ...initialDraft, columns: '2' })
    expect(repaired.errors).toEqual({})
    expect(repaired.snapshot?.cabinets).toHaveLength(6)
  })

  it.each([
    { columns: '1025', rows: '1' },
    { columns: '1', rows: '1', moduleColumns: '65537', moduleRows: '1' },
    { columns: '9007199254740991', rows: '2' },
    { moduleColumns: '9007199254740991', moduleRows: '2' },
    { columns: '2', rows: '1', moduleColumns: '1', moduleRows: '1', modulePixelWidth: '9007199254740991', modulePixelHeight: '1' },
    { columns: '1', rows: '2', moduleColumns: '1', moduleRows: '1', modulePixelWidth: '1', modulePixelHeight: '9007199254740991' },
    { columns: '2', rows: '2', moduleColumns: '1', moduleRows: '1', modulePixelWidth: '4503599627370495', modulePixelHeight: '1' },
  ])('rejects excessive counts and unsafe products before building the order: %j', fields => {
    const order = vi.spyOn(core, 'cabinetOrder')
    const result = applyDraft(null, { ...initialDraft, ...fields })
    expect(result.snapshot).toBeNull()
    expect(result.errors.form).toBeTruthy()
    expect(order).not.toHaveBeenCalled()
  })

  it('surfaces unsupported ordering as a recoverable DomainError', () => {
    const draft: Draft = { ...initialDraft, ordering: { ...initialDraft.ordering, startCorner: 'bottom-right' } }
    expect(applyDraft(null, draft).errors.form).toContain('UNSUPPORTED_ORDERING')
  })

  it.each([['1', '1'], ['1', '8'], ['8', '1'], ['32', '32']])('supports preview grid %s by %s', (columns, rows) => {
    const result = applyDraft(null, { ...initialDraft, columns, rows })
    expect(result.errors).toEqual({})
    expect(result.snapshot?.cabinets).toHaveLength(Number(columns) * Number(rows))
  })
})
