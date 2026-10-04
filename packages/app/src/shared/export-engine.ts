import {
  cabinetPixelCoordinate,
  inspectEditableProject,
  projectEditableGeometryMapping,
  projectEditableHardwareMapping,
  unmapGeometryCabinetPixel,
  type EditableProject,
  type ResolvedGeometryMapping,
  type ResolvedHardwareMapping,
} from '@ledmap/core'

export const GENERIC_MAPPING_FORMAT = 'ledmap-generic-mapping'
export const GENERIC_MAPPING_VERSION = 1
export const GENERIC_MAPPING_COLUMNS = [
  'inputCanvas', 'inputX', 'inputY', 'screen', 'screenX', 'screenY',
  'cabinet', 'cabinetX', 'cabinetY', 'module', 'moduleX', 'moduleY',
  'processor', 'port', 'receiver', 'dataIndex',
] as const

export type GenericMappingFormat = 'json' | 'csv'
export type GenericMappingScope =
  | { readonly kind: 'composition' }
  | { readonly kind: 'screen'; readonly screenId: string }

export type ExportPreflightStageId = 'integrity' | 'mapping' | 'hardware' | 'remap'

export interface ExportPreflightDiagnostic {
  readonly code: string
  readonly message: string
  readonly path: readonly (string | number)[]
}

export interface ExportPreflightStage {
  readonly id: ExportPreflightStageId
  readonly status: 'ready' | 'blocked'
  readonly diagnostics: readonly ExportPreflightDiagnostic[]
}

export interface GenericMappingPreflight {
  readonly ready: boolean
  readonly pixelCount: number
  readonly stages: readonly ExportPreflightStage[]
}

export interface GenericMappingRow {
  readonly inputCanvas: string
  readonly inputX: number
  readonly inputY: number
  readonly screen: string
  readonly screenX: number
  readonly screenY: number
  readonly cabinet: string
  readonly cabinetX: number
  readonly cabinetY: number
  readonly module: string
  readonly moduleX: number
  readonly moduleY: number
  readonly processor: string
  readonly port: string
  readonly receiver: string
  readonly dataIndex: number
}

interface PreparedGenericMapping {
  readonly hardware: ResolvedHardwareMapping
  readonly mappings: ReadonlyMap<string, ResolvedGeometryMapping>
  readonly cabinetIds: ReadonlySet<string>
  readonly pixelCount: number
}

export class ExportPreflightError extends Error {
  readonly preflight: GenericMappingPreflight

  constructor(preflight: GenericMappingPreflight) {
    super('Generic Mapping export is blocked by preflight diagnostics.')
    this.name = 'ExportPreflightError'
    this.preflight = preflight
  }
}

function diagnostic(code: string, message: string, path: readonly (string | number)[] = []): ExportPreflightDiagnostic {
  return Object.freeze({ code, message, path: Object.freeze([...path]) })
}

function stage(id: ExportPreflightStageId, diagnostics: readonly ExportPreflightDiagnostic[]): ExportPreflightStage {
  return Object.freeze({ id, status: diagnostics.length === 0 ? 'ready' : 'blocked', diagnostics: Object.freeze([...diagnostics]) })
}

function scopedScreenIds(project: EditableProject, scope: GenericMappingScope): Set<string> {
  return new Set(scope.kind === 'composition' ? project.screens.map(screen => screen.id) : [scope.screenId])
}

function scopedCabinetIds(project: EditableProject, scope: GenericMappingScope): Set<string> {
  const screens = scopedScreenIds(project, scope)
  const grids = new Set(project.cabinetGrids.filter(grid => screens.has(grid.screen)).map(grid => grid.id))
  return new Set(project.hardwareTopology.cabinets.filter(cabinet => grids.has(cabinet.grid)).map(cabinet => cabinet.id))
}

function prepareGenericMapping(project: EditableProject, scope: GenericMappingScope): {
  readonly preflight: GenericMappingPreflight
  readonly prepared: PreparedGenericMapping | null
} {
  const integrityDiagnostics = inspectEditableProject(project).map(value => diagnostic(value.code, value.message, value.path))
  const mappingDiagnostics: ExportPreflightDiagnostic[] = []
  const hardwareDiagnostics: ExportPreflightDiagnostic[] = []
  const remapDiagnostics: ExportPreflightDiagnostic[] = []
  const screenIds = scopedScreenIds(project, scope)
  const cabinetIds = scopedCabinetIds(project, scope)
  const mappings = new Map<string, ResolvedGeometryMapping>()

  if (scope.kind === 'screen' && !project.screens.some(screen => screen.id === scope.screenId)) {
    mappingDiagnostics.push(diagnostic('EXPORT_UNKNOWN_SCREEN', `Unknown export Screen: ${scope.screenId}`, ['scope', 'screenId']))
  }
  if (project.inputCanvas === null) {
    mappingDiagnostics.push(diagnostic('EXPORT_MAPPING_INCOMPLETE', 'Input Canvas is not configured.', ['inputCanvas']))
  }
  if (screenIds.size === 0) {
    mappingDiagnostics.push(diagnostic('EXPORT_MAPPING_INCOMPLETE', 'No Screens are available for export.', ['screens']))
  }
  if (cabinetIds.size === 0) {
    mappingDiagnostics.push(diagnostic('EXPORT_MAPPING_INCOMPLETE', 'No Cabinets are available in the export scope.', ['hardwareTopology', 'cabinets']))
  }

  const scopedGrids = project.cabinetGrids.filter(grid => screenIds.has(grid.screen))
  const scopedRegions = project.mappingRegions.filter(region => screenIds.has(region.screen))
  for (const region of scopedRegions) {
    const projection = projectEditableGeometryMapping(project, region.id)
    if (projection.status === 'incomplete') {
      mappingDiagnostics.push(...projection.diagnostics.map(value => diagnostic(value.code, value.message, value.path)))
      continue
    }
    for (const cabinet of projection.mapping.cells) mappings.set(cabinet.cabinet, projection.mapping)
  }
  for (const grid of scopedGrids) {
    const gridCabinets = project.hardwareTopology.cabinets.filter(cabinet => cabinet.grid === grid.id)
    if (gridCabinets.length === 0) continue
    const regions = scopedRegions.filter(region => region.grid === grid.id && region.screen === grid.screen)
    if (regions.length !== 1) {
      mappingDiagnostics.push(diagnostic(
        regions.length === 0 ? 'EXPORT_MAPPING_INCOMPLETE' : 'EXPORT_MAPPING_AMBIGUOUS',
        regions.length === 0
          ? `Cabinet Grid ${grid.id} has no Mapping Region.`
          : `Cabinet Grid ${grid.id} has more than one Mapping Region.`,
        ['mappingRegions'],
      ))
    }
  }
  for (const cabinetId of cabinetIds) {
    if (!mappings.has(cabinetId)) {
      mappingDiagnostics.push(diagnostic('EXPORT_MAPPING_INCOMPLETE', `Cabinet ${cabinetId} has no complete geometry projection.`, ['mappingRegions']))
    }
  }

  const hardwareProjection = projectEditableHardwareMapping(project)
  let hardware: ResolvedHardwareMapping | null = null
  let pixelCount = 0
  if (hardwareProjection.status === 'incomplete') {
    hardwareDiagnostics.push(...hardwareProjection.diagnostics.map(value => diagnostic(value.code, value.message, value.path)))
  } else {
    hardware = hardwareProjection.hardware
    const assignments = new Map<string, number>()
    for (const port of hardware.ports) {
      for (const receiver of port.receivers) {
        for (const cabinet of receiver.cabinets) {
          assignments.set(cabinet.cabinet, (assignments.get(cabinet.cabinet) ?? 0) + 1)
          if (cabinetIds.has(cabinet.cabinet)) pixelCount += cabinet.pixelCount
        }
      }
    }
    for (const cabinetId of cabinetIds) {
      const count = assignments.get(cabinetId) ?? 0
      if (count !== 1) {
        hardwareDiagnostics.push(diagnostic(
          count === 0 ? 'EXPORT_HARDWARE_INCOMPLETE' : 'EXPORT_HARDWARE_AMBIGUOUS',
          count === 0
            ? `Cabinet ${cabinetId} is not assigned to a Receiver.`
            : `Cabinet ${cabinetId} is assigned more than once.`,
          ['hardwareTopology', 'receivers'],
        ))
      }
    }
  }

  if (project.rules.length > 0) {
    remapDiagnostics.push(diagnostic(
      'REMAP_UNSUPPORTED_RULE',
      'Only the empty identity Remap rule set is supported.',
      ['rules'],
    ))
  }

  const stages = Object.freeze([
    stage('integrity', integrityDiagnostics),
    stage('mapping', mappingDiagnostics),
    stage('hardware', hardwareDiagnostics),
    stage('remap', remapDiagnostics),
  ])
  const ready = stages.every(value => value.status === 'ready')
  const preflight = Object.freeze({ ready, pixelCount: ready ? pixelCount : 0, stages })
  return {
    preflight,
    prepared: ready && hardware
      ? { hardware, mappings, cabinetIds, pixelCount }
      : null,
  }
}

export function preflightGenericMapping(project: EditableProject, scope: GenericMappingScope): GenericMappingPreflight {
  return prepareGenericMapping(project, scope).preflight
}

function preparedGenericMapping(project: EditableProject, scope: GenericMappingScope): PreparedGenericMapping {
  const result = prepareGenericMapping(project, scope)
  if (!result.prepared) throw new ExportPreflightError(result.preflight)
  return result.prepared
}

export function* genericMappingRows(project: EditableProject, scope: GenericMappingScope): Generator<GenericMappingRow> {
  const prepared = preparedGenericMapping(project, scope)
  for (const port of prepared.hardware.ports) {
    for (const receiver of port.receivers) {
      for (const cabinet of receiver.cabinets) {
        if (!prepared.cabinetIds.has(cabinet.cabinet)) continue
        const mapping = prepared.mappings.get(cabinet.cabinet)!
        for (let offset = 0; offset < cabinet.pixelCount; offset += 1) {
          const cabinetCoordinate = cabinetPixelCoordinate(cabinet.layout, offset)
          const geometry = unmapGeometryCabinetPixel(mapping, { cabinet: cabinet.cabinet, coordinate: cabinetCoordinate })
          yield {
            inputCanvas: mapping.inputCanvas.id,
            inputX: geometry.inputCoordinate.x,
            inputY: geometry.inputCoordinate.y,
            screen: mapping.screen.id,
            screenX: geometry.screenCoordinate.x,
            screenY: geometry.screenCoordinate.y,
            cabinet: geometry.cabinet,
            cabinetX: geometry.cabinetCoordinate.x,
            cabinetY: geometry.cabinetCoordinate.y,
            module: geometry.module,
            moduleX: geometry.moduleCoordinate.x,
            moduleY: geometry.moduleCoordinate.y,
            processor: port.processor,
            port: port.port,
            receiver: receiver.receiver,
            dataIndex: cabinet.portBase + offset,
          }
        }
      }
    }
  }
}

function csvValue(value: string | number): string {
  const text = String(value)
  return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text
}

export function genericMappingCsvRow(row: GenericMappingRow): string {
  return GENERIC_MAPPING_COLUMNS.map(column => csvValue(row[column])).join(',')
}

export function* genericMappingChunks(
  project: EditableProject,
  scope: GenericMappingScope,
  format: GenericMappingFormat,
): Generator<string> {
  if (format === 'csv') {
    yield `${GENERIC_MAPPING_COLUMNS.join(',')}\n`
    for (const row of genericMappingRows(project, scope)) yield `${genericMappingCsvRow(row)}\n`
    return
  }
  yield `{"format":"${GENERIC_MAPPING_FORMAT}","version":${GENERIC_MAPPING_VERSION},"rows":[`
  let first = true
  for (const row of genericMappingRows(project, scope)) {
    yield `${first ? '' : ','}${JSON.stringify(row)}`
    first = false
  }
  yield ']}\n'
}

export function serializeGenericMapping(
  project: EditableProject,
  scope: GenericMappingScope,
  format: GenericMappingFormat,
): string {
  return [...genericMappingChunks(project, scope, format)].join('')
}
