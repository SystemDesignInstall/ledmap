import { resolveHardware, type ResolvedHardwareMapping } from '../hardware-engine/index.js'
import {
  addressGeometryPixel,
  mapGeometryInputPixel,
  resolveGeometryMapping,
  type GeometryMappedPixel,
  type InputPixel,
  type ResolvedGeometryMapping,
} from '../mapping-engine/index.js'
import { DomainError } from '../model/errors.js'
import type { MappingRegionId } from '../model/ids.js'
import type { PixelAddress } from '../model/signal-path.js'
import type { EditableProject } from './types.js'

type Path = readonly (string | number)[]

export interface EditableProjectionDiagnostic {
  readonly severity: 'error'
  readonly code: string
  readonly path: Path
  readonly message: string
}

export type EditableGeometryMappingProjection =
  | {
    readonly status: 'ready'
    readonly mapping: ResolvedGeometryMapping
    readonly diagnostics: readonly EditableProjectionDiagnostic[]
  }
  | {
    readonly status: 'incomplete'
    readonly mapping: null
    readonly diagnostics: readonly EditableProjectionDiagnostic[]
  }

export type EditableHardwareMappingProjection =
  | {
    readonly status: 'ready'
    readonly hardware: ResolvedHardwareMapping
    readonly diagnostics: readonly EditableProjectionDiagnostic[]
  }
  | {
    readonly status: 'incomplete'
    readonly hardware: null
    readonly diagnostics: readonly EditableProjectionDiagnostic[]
  }

export interface EditablePixelInspection {
  readonly geometry: GeometryMappedPixel
  readonly hardware:
    | { readonly status: 'ready'; readonly address: PixelAddress; readonly diagnostics: readonly EditableProjectionDiagnostic[] }
    | { readonly status: 'incomplete'; readonly address: null; readonly diagnostics: readonly EditableProjectionDiagnostic[] }
}

function diagnostic(code: string, path: Path, message: string): EditableProjectionDiagnostic {
  return Object.freeze({ severity: 'error', code, path: Object.freeze([...path]), message })
}

function incompleteGeometry(value: EditableProjectionDiagnostic): EditableGeometryMappingProjection {
  return Object.freeze({ status: 'incomplete', mapping: null, diagnostics: Object.freeze([value]) })
}

function projectionDiagnostic(error: unknown, path: Path): EditableProjectionDiagnostic {
  if (error instanceof DomainError) return diagnostic(error.code, path, error.message)
  throw error
}

function uniqueById<T extends { readonly id: string }>(
  records: readonly T[],
  id: string,
  path: Path,
  label: string,
): T | EditableProjectionDiagnostic {
  const matches = records.filter(record => record.id === id)
  if (matches.length === 0) return diagnostic('MAPPING_UNKNOWN_REFERENCE', path, `Unknown ${label}: ${id}`)
  if (matches.length > 1) return diagnostic('MAPPING_DUPLICATE', path, `Duplicate ${label}: ${id}`)
  return matches[0]!
}

export function projectEditableGeometryMapping(
  project: EditableProject,
  regionId: MappingRegionId,
): EditableGeometryMappingProjection {
  const region = uniqueById(project.mappingRegions, regionId, ['mappingRegions'], 'MappingRegion')
  if ('severity' in region) return incompleteGeometry(region)
  const regionIndex = project.mappingRegions.indexOf(region)
  if (project.inputCanvas === null) {
    return incompleteGeometry(diagnostic('MAPPING_INCOMPLETE', ['inputCanvas'], 'InputCanvas is not configured'))
  }
  if (region.inputCanvas !== project.inputCanvas.id) {
    return incompleteGeometry(diagnostic(
      'MAPPING_UNKNOWN_REFERENCE',
      ['mappingRegions', regionIndex, 'inputCanvas'],
      `MappingRegion ${region.id} references unknown InputCanvas ${region.inputCanvas}`,
    ))
  }
  const screen = uniqueById(project.screens, region.screen, ['mappingRegions', regionIndex, 'screen'], 'Screen')
  if ('severity' in screen) return incompleteGeometry(screen)
  const grid = uniqueById(project.cabinetGrids, region.grid, ['mappingRegions', regionIndex, 'grid'], 'CabinetGrid')
  if ('severity' in grid) return incompleteGeometry(grid)
  const cabinets = project.hardwareTopology.cabinets.filter(cabinet => cabinet.grid === grid.id)
  const cabinetIds = new Set(cabinets.map(cabinet => cabinet.id))
  const modules = project.hardwareTopology.modules.filter(module => cabinetIds.has(module.cabinet))
  try {
    const mapping = resolveGeometryMapping({ inputCanvas: project.inputCanvas, screen, grid, region, cabinets, modules })
    return Object.freeze({ status: 'ready', mapping, diagnostics: Object.freeze([]) })
  } catch (error) {
    return incompleteGeometry(projectionDiagnostic(error, ['mappingRegions', regionIndex]))
  }
}

export function projectEditableHardwareMapping(project: EditableProject): EditableHardwareMappingProjection {
  try {
    const hardware = resolveHardware(project.hardwareTopology)
    return Object.freeze({ status: 'ready', hardware, diagnostics: Object.freeze([]) })
  } catch (error) {
    return Object.freeze({
      status: 'incomplete',
      hardware: null,
      diagnostics: Object.freeze([projectionDiagnostic(error, ['hardwareTopology'])]),
    })
  }
}

export function inspectGeometryInputPixel(
  mapping: ResolvedGeometryMapping,
  inputPixel: InputPixel,
  hardware: EditableHardwareMappingProjection,
): EditablePixelInspection {
  const geometry = mapGeometryInputPixel(mapping, inputPixel)
  if (hardware.status === 'incomplete') {
    return Object.freeze({
      geometry,
      hardware: Object.freeze({ status: 'incomplete', address: null, diagnostics: hardware.diagnostics }),
    })
  }
  return Object.freeze({
    geometry,
    hardware: Object.freeze({
      status: 'ready',
      address: addressGeometryPixel(hardware.hardware, geometry).address,
      diagnostics: Object.freeze([]),
    }),
  })
}
