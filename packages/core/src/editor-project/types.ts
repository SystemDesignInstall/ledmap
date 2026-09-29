import type { HardwareTopologyInput } from '../hardware-engine/index.js'
import type { CabinetGrid } from '../model/cabinet-grid.js'
import type { InputCanvas } from '../model/input-canvas.js'
import type { MappingRegion } from '../model/mapping-region.js'
import type { ScreenId } from '../model/ids.js'
import type { Screen } from '../model/screen.js'
import type { RemapRuleDescriptor } from '../remap-engine/index.js'

export interface EditorPoint {
  readonly x: number
  readonly y: number
}

export interface ScreenPlacement {
  readonly screen: ScreenId
  readonly position: EditorPoint
}

export interface EditableProjectLayout {
  readonly screenPositions: readonly ScreenPlacement[]
}

export interface EditableProject {
  readonly inputCanvas: InputCanvas | null
  readonly screens: readonly Screen[]
  readonly cabinetGrids: readonly CabinetGrid[]
  readonly mappingRegions: readonly MappingRegion[]
  readonly hardwareTopology: HardwareTopologyInput
  readonly rules: readonly RemapRuleDescriptor[]
  readonly editorLayout: EditableProjectLayout
}

export type EditableProjectDiagnosticCode =
  | 'EDITOR_DUPLICATE_ID'
  | 'EDITOR_UNKNOWN_REFERENCE'
  | 'EDITOR_PARENT_MISMATCH'
  | 'EDITOR_DUPLICATE_REFERENCE'
  | 'EDITOR_INVALID_NUMBER'
  | 'EDITOR_OUT_OF_RANGE'
  | 'EDITOR_DUPLICATE_CELL'
  | 'EDITOR_DUPLICATE_PLACEMENT'
  | 'EDITOR_MISSING_PLACEMENT'

export interface EditableProjectDiagnostic {
  readonly severity: 'error'
  readonly code: EditableProjectDiagnosticCode
  readonly path: readonly (string | number)[]
  readonly message: string
}
