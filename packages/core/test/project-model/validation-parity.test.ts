import { describe, expect, it } from 'vitest'
import {
  asCabinetGridId,
  convertEditableProjectToV2,
  inspectEditableProject,
  inspectProjectV2,
  type EditableProject,
  type LedMapProjectV2,
} from '../../src/index.js'
import { multiScreenEditableProject } from '../serialization/editor-fixtures.js'

type Mutable<T> = T extends string | number | boolean | null | undefined
  ? T
  : { -readonly [K in keyof T]: Mutable<T[K]> }

function mutableClone<T>(value: T): Mutable<T> {
  return JSON.parse(JSON.stringify(value)) as Mutable<T>
}
type Scenario = {
  readonly name: string
  readonly oldCode: string
  readonly newCode: string
  readonly change: (old: Mutable<EditableProject>, next: Mutable<LedMapProjectV2>) => void
}

const scenarios: readonly Scenario[] = [
  {
    name: 'duplicate entity id', oldCode: 'EDITOR_DUPLICATE_ID', newCode: 'PROJECT_DUPLICATE_ID',
    change: (old, next) => {
      old.screens.push(mutableClone(old.screens[0]!))
      next.design.screens.push(mutableClone(next.design.screens[0]!))
    },
  },
  {
    name: 'unknown reference', oldCode: 'EDITOR_UNKNOWN_REFERENCE', newCode: 'PROJECT_GRID_ORDER_PARENT_MISMATCH',
    change: (old, next) => {
      old.screens[0]!.cabinetGrids[0] = asCabinetGridId('unknown')
      next.design.screens[0]!.cabinetGridOrder[0] = asCabinetGridId('unknown')
    },
  },
  {
    name: 'parent mismatch', oldCode: 'EDITOR_PARENT_MISMATCH', newCode: 'PROJECT_GRID_ORDER_PARENT_MISMATCH',
    change: (old, next) => {
      old.cabinetGrids[0]!.screen = old.screens[1]!.id
      next.design.cabinetGrids[0]!.screenId = next.design.screens[1]!.id
    },
  },
  {
    name: 'duplicate order reference', oldCode: 'EDITOR_DUPLICATE_REFERENCE', newCode: 'PROJECT_DUPLICATE_GRID_ORDER',
    change: (old, next) => {
      old.screens[0]!.cabinetGrids.push(old.screens[0]!.cabinetGrids[0]!)
      next.design.screens[0]!.cabinetGridOrder.push(next.design.screens[0]!.cabinetGridOrder[0]!)
    },
  },
  {
    name: 'invalid number', oldCode: 'EDITOR_INVALID_NUMBER', newCode: 'EDITOR_INVALID_NUMBER',
    change: (old, next) => {
      old.screens[0]!.resolution.width = 0
      next.design.screens[0]!.resolution.width = 0
    },
  },
  {
    name: 'out of range Cabinet', oldCode: 'EDITOR_OUT_OF_RANGE', newCode: 'EDITOR_OUT_OF_RANGE',
    change: (old, next) => {
      old.hardwareTopology.cabinets[0]!.column = 1
      next.design.cabinets[0]!.column = 1
    },
  },
  {
    name: 'duplicate Cabinet cell', oldCode: 'EDITOR_DUPLICATE_CELL', newCode: 'EDITOR_DUPLICATE_CELL',
    change: (old, next) => {
      old.hardwareTopology.cabinets[1]!.grid = old.hardwareTopology.cabinets[0]!.grid
      next.design.cabinets[1]!.gridId = next.design.cabinets[0]!.gridId
    },
  },
  {
    name: 'duplicate placement', oldCode: 'EDITOR_DUPLICATE_PLACEMENT', newCode: 'EDITOR_DUPLICATE_PLACEMENT',
    change: (old, next) => {
      old.editorLayout.screenPositions.push(mutableClone(old.editorLayout.screenPositions[0]!))
      next.design.composition.placements.push(mutableClone(next.design.composition.placements[0]!))
    },
  },
  {
    name: 'missing placement', oldCode: 'EDITOR_MISSING_PLACEMENT', newCode: 'EDITOR_MISSING_PLACEMENT',
    change: (old, next) => {
      old.editorLayout.screenPositions.pop()
      next.design.composition.placements.pop()
    },
  },
]

describe('Project Model v2 integrity validation parity', () => {
  it.each(scenarios)('$name blocks in both read models', ({ oldCode, newCode, change }) => {
    const source = multiScreenEditableProject()
    const canonical = convertEditableProjectToV2(source)
    const old = mutableClone(source)
    const next = mutableClone(canonical)
    change(old, next)
    const oldCodes = inspectEditableProject(old).map(value => value.code)
    const newCodes = inspectProjectV2(next).map(value => value.code)
    expect(oldCodes).toContain(oldCode)
    expect(newCodes).toContain(newCode)
    expect(newCodes).not.toContain('Missing')
  })
})
