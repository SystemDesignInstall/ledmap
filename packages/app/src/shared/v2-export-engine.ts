import {
  assertProjectV2EditorStructure,
  cabinetPixelCoordinate,
  resolveGeometryMapping,
  resolveHardware,
  selectV2GeometryEngineInput,
  selectV2HardwareEngineInput,
  unmapGeometryCabinetPixel,
  DomainError,
  type HardwareTopologyInput,
  type LedMapProjectV2,
  type ResolveGeometryMappingInput,
  type ResolvedGeometryMapping,
  type ResolvedHardwareMapping,
} from '@ledmap/core'

export const V2_GENERIC_MAPPING_COLUMNS = [
  'inputCanvas', 'inputX', 'inputY', 'screen', 'screenX', 'screenY',
  'cabinet', 'cabinetX', 'cabinetY', 'module', 'moduleX', 'moduleY',
  'processor', 'port', 'receiver', 'dataIndex',
] as const

export type V2GenericMappingFormat = 'json' | 'csv'
export type V2GenericMappingScope =
  | { readonly kind: 'composition' }
  | { readonly kind: 'screen'; readonly screenId: string }

export interface GenericMappingExportInput {
  readonly screens: readonly string[]
  readonly grids: readonly { readonly id: string; readonly screenId: string }[]
  readonly regions: readonly {
    readonly id: string
    readonly screenId: string
    readonly gridId: string
    readonly geometry: ResolveGeometryMappingInput | null
  }[]
  readonly hasInputCanvas: boolean
  readonly hardware: HardwareTopologyInput
  readonly remapRuleCount: number
}

export interface V2ExportDiagnostic {
  readonly code: string
  readonly message: string
  readonly path: readonly (string | number)[]
}

export interface V2ExportStage {
  readonly id: 'integrity' | 'mapping' | 'hardware' | 'remap'
  readonly status: 'ready' | 'blocked'
  readonly diagnostics: readonly V2ExportDiagnostic[]
}

export interface V2GenericMappingPreflight {
  readonly ready: boolean
  readonly pixelCount: number
  readonly stages: readonly V2ExportStage[]
}

export interface V2GenericMappingRow {
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

interface PreparedExport {
  readonly preflight: V2GenericMappingPreflight
  readonly hardware: ResolvedHardwareMapping | null
  readonly mappings: ReadonlyMap<string, ResolvedGeometryMapping>
  readonly cabinetIds: ReadonlySet<string>
}

export class V2ExportPreflightError extends Error {
  readonly preflight: V2GenericMappingPreflight

  constructor(preflight: V2GenericMappingPreflight) {
    super('Generic Mapping export is blocked by preflight diagnostics.')
    this.name = 'V2ExportPreflightError'
    this.preflight = preflight
  }
}

export function selectGenericMappingExportInput(project: LedMapProjectV2): GenericMappingExportInput {
  assertProjectV2EditorStructure(project)
  return Object.freeze({
    screens: project.design.screens.map(screen => screen.id),
    grids: project.design.cabinetGrids.map(grid => ({ id: grid.id, screenId: grid.screenId })),
    regions: project.content.mappingRegions.map(region => ({
      id: region.id, screenId: region.screenId, gridId: region.gridId,
      geometry: project.content.inputCanvases.some(canvas => canvas.id === region.inputCanvasId)
        ? selectV2GeometryEngineInput(project, region.id) : null,
    })),
    hasInputCanvas: project.content.inputCanvases.length > 0,
    hardware: selectV2HardwareEngineInput(project),
    remapRuleCount: project.remap.rules.length,
  })
}

function diagnostic(code: string, message: string, path: readonly (string | number)[] = []): V2ExportDiagnostic {
  return Object.freeze({ code, message, path: Object.freeze([...path]) })
}

function stage(id: V2ExportStage['id'], diagnostics: readonly V2ExportDiagnostic[]): V2ExportStage {
  return Object.freeze({ id, status: diagnostics.length === 0 ? 'ready' : 'blocked', diagnostics: Object.freeze([...diagnostics]) })
}

function prepare(input: GenericMappingExportInput, scope: V2GenericMappingScope): PreparedExport {
  const integrityDiagnostics: V2ExportDiagnostic[] = []
  const mappingDiagnostics: V2ExportDiagnostic[] = []
  const hardwareDiagnostics: V2ExportDiagnostic[] = []
  const remapDiagnostics: V2ExportDiagnostic[] = []
  const screenIds = new Set(scope.kind === 'composition' ? input.screens : [scope.screenId])
  const gridIds = new Set(input.grids.filter(grid => screenIds.has(grid.screenId)).map(grid => grid.id))
  const cabinetIds = new Set(input.hardware.cabinets.filter(cabinet => gridIds.has(cabinet.grid)).map(cabinet => cabinet.id))
  const scopedRegions = input.regions.filter(region => screenIds.has(region.screenId))
  const mappings = new Map<string, ResolvedGeometryMapping>()

  if (scope.kind === 'screen' && !input.screens.includes(scope.screenId)) {
    mappingDiagnostics.push(diagnostic('EXPORT_UNKNOWN_SCREEN', `Unknown export Screen: ${scope.screenId}`, ['scope', 'screenId']))
  }
  if (!input.hasInputCanvas) mappingDiagnostics.push(diagnostic('EXPORT_MAPPING_INCOMPLETE', 'Input Canvas is not configured.', ['inputCanvas']))
  if (screenIds.size === 0) mappingDiagnostics.push(diagnostic('EXPORT_MAPPING_INCOMPLETE', 'No Screens are available for export.', ['screens']))
  if (cabinetIds.size === 0) mappingDiagnostics.push(diagnostic('EXPORT_MAPPING_INCOMPLETE', 'No Cabinets are available in the export scope.', ['hardwareTopology', 'cabinets']))

  for (const region of scopedRegions) {
    if (!region.geometry) {
      mappingDiagnostics.push(diagnostic('MAPPING_INCOMPLETE', 'InputCanvas is not configured', ['inputCanvas']))
      continue
    }
    try {
      const mapping = resolveGeometryMapping(region.geometry)
      for (const cabinet of mapping.cells) mappings.set(cabinet.cabinet, mapping)
    } catch (error) {
      if (!(error instanceof DomainError)) throw error
      const index = input.regions.findIndex(value => value.id === region.id)
      mappingDiagnostics.push(diagnostic(error.code, error.message, ['mappingRegions', index]))
    }
  }
  for (const grid of input.grids.filter(value => screenIds.has(value.screenId))) {
    if (!input.hardware.cabinets.some(cabinet => cabinet.grid === grid.id)) continue
    const regions = scopedRegions.filter(region => region.gridId === grid.id && region.screenId === grid.screenId)
    if (regions.length !== 1) mappingDiagnostics.push(diagnostic(
      regions.length === 0 ? 'EXPORT_MAPPING_INCOMPLETE' : 'EXPORT_MAPPING_AMBIGUOUS',
      regions.length === 0 ? `Cabinet Grid ${grid.id} has no Mapping Region.` : `Cabinet Grid ${grid.id} has more than one Mapping Region.`,
      ['mappingRegions'],
    ))
  }
  for (const cabinetId of cabinetIds) {
    if (!mappings.has(cabinetId)) mappingDiagnostics.push(diagnostic('EXPORT_MAPPING_INCOMPLETE',
      `Cabinet ${cabinetId} has no complete geometry projection.`, ['mappingRegions']))
  }

  let hardware: ResolvedHardwareMapping | null = null
  let pixelCount = 0
  try {
    hardware = resolveHardware(input.hardware)
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
      if (count !== 1) hardwareDiagnostics.push(diagnostic(
        count === 0 ? 'EXPORT_HARDWARE_INCOMPLETE' : 'EXPORT_HARDWARE_AMBIGUOUS',
        count === 0 ? `Cabinet ${cabinetId} is not assigned to a Receiver.` : `Cabinet ${cabinetId} is assigned more than once.`,
        ['hardwareTopology', 'receivers'],
      ))
    }
  } catch (error) {
    if (!(error instanceof DomainError)) throw error
    hardwareDiagnostics.push(diagnostic(error.code, error.message, ['hardwareTopology']))
  }
  if (input.remapRuleCount > 0) remapDiagnostics.push(diagnostic(
    'REMAP_UNSUPPORTED_RULE', 'Only the empty identity Remap rule set is supported.', ['rules'],
  ))
  const stages = Object.freeze([
    stage('integrity', integrityDiagnostics), stage('mapping', mappingDiagnostics),
    stage('hardware', hardwareDiagnostics), stage('remap', remapDiagnostics),
  ])
  const ready = stages.every(value => value.status === 'ready')
  return { preflight: Object.freeze({ ready, pixelCount: ready ? pixelCount : 0, stages }),
    hardware: ready ? hardware : null, mappings, cabinetIds }
}

export function preflightV2GenericMapping(input: GenericMappingExportInput, scope: V2GenericMappingScope): V2GenericMappingPreflight {
  return prepare(input, scope).preflight
}

export function* genericMappingV2Rows(input: GenericMappingExportInput, scope: V2GenericMappingScope): Generator<V2GenericMappingRow> {
  const prepared = prepare(input, scope)
  if (!prepared.hardware) throw new V2ExportPreflightError(prepared.preflight)
  for (const port of prepared.hardware.ports) {
    for (const receiver of port.receivers) {
      for (const cabinet of receiver.cabinets) {
        if (!prepared.cabinetIds.has(cabinet.cabinet)) continue
        const mapping = prepared.mappings.get(cabinet.cabinet)!
        for (let offset = 0; offset < cabinet.pixelCount; offset += 1) {
          const coordinate = cabinetPixelCoordinate(cabinet.layout, offset)
          const geometry = unmapGeometryCabinetPixel(mapping, { cabinet: cabinet.cabinet, coordinate })
          yield {
            inputCanvas: mapping.inputCanvas.id, inputX: geometry.inputCoordinate.x, inputY: geometry.inputCoordinate.y,
            screen: mapping.screen.id, screenX: geometry.screenCoordinate.x, screenY: geometry.screenCoordinate.y,
            cabinet: geometry.cabinet, cabinetX: geometry.cabinetCoordinate.x, cabinetY: geometry.cabinetCoordinate.y,
            module: geometry.module, moduleX: geometry.moduleCoordinate.x, moduleY: geometry.moduleCoordinate.y,
            processor: port.processor, port: port.port, receiver: receiver.receiver, dataIndex: cabinet.portBase + offset,
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

export function* genericMappingV2Chunks(
  input: GenericMappingExportInput, scope: V2GenericMappingScope, format: V2GenericMappingFormat,
): Generator<string> {
  if (format === 'csv') {
    yield `${V2_GENERIC_MAPPING_COLUMNS.join(',')}\n`
    for (const row of genericMappingV2Rows(input, scope)) yield `${V2_GENERIC_MAPPING_COLUMNS.map(column => csvValue(row[column])).join(',')}\n`
    return
  }
  yield '{"format":"ledmap-generic-mapping","version":1,"rows":['
  let first = true
  for (const row of genericMappingV2Rows(input, scope)) {
    yield `${first ? '' : ','}${JSON.stringify(row)}`
    first = false
  }
  yield ']}\n'
}

export function serializeV2GenericMapping(input: GenericMappingExportInput, scope: V2GenericMappingScope, format: V2GenericMappingFormat): string {
  return [...genericMappingV2Chunks(input, scope, format)].join('')
}
