import { moduleIndex, type CabinetPixelLayoutConfig } from '../cabinet-engine/index.js'
import type { Cabinet } from '../model/cabinet.js'
import type { Module } from '../model/module.js'
import type { GeometryCabinetCell, ResolvedGeometryMapping, ResolveGeometryMappingInput } from './types.js'
import { assertContains, assertCoordinate, assertReference, assertSafeInteger, assertSize, fail, safeResult } from './validation.js'

function resolveModuleLayout(cabinet: Cabinet, modules: readonly Module[]): Pick<GeometryCabinetCell, 'layout' | 'moduleIds'> {
  const label = `Cabinet ${cabinet.id}`
  for (const field of ['pixelWidth', 'pixelHeight', 'moduleColumns', 'moduleRows', 'width', 'height'] as const) {
    assertSafeInteger(`${label}.${field}`, cabinet[field], 1)
  }
  if (cabinet.rotation !== 0 || cabinet.flipH || cabinet.flipV) {
    fail('UNSUPPORTED_PROFILE', `${label}: rotation and flip are not supported`)
  }
  if (cabinet.pixelWidth % cabinet.moduleColumns !== 0 || cabinet.pixelHeight % cabinet.moduleRows !== 0) {
    fail('SIZE_MISMATCH', `${label}: Module pixel grid does not tile Cabinet pixels`)
  }
  const layout: CabinetPixelLayoutConfig = Object.freeze({
    moduleColumns: cabinet.moduleColumns,
    moduleRows: cabinet.moduleRows,
    modulePixelWidth: cabinet.pixelWidth / cabinet.moduleColumns,
    modulePixelHeight: cabinet.pixelHeight / cabinet.moduleRows,
  })
  assertSize(`${label} Module pixel size`, { width: layout.modulePixelWidth, height: layout.modulePixelHeight })
  const count = safeResult(`${label} Module count`, layout.moduleColumns * layout.moduleRows)
  if (modules.length !== count) fail('INCOMPLETE', `${label}: expected ${count} Modules, got ${modules.length}`)
  const moduleIds = [] as Module['id'][]
  const positions = new Set<number>()
  const ids = new Set<string>()
  for (const module of modules) {
    assertReference(`Module ${module.id}.cabinet`, module.cabinet, cabinet.id)
    if (ids.has(module.id)) fail('DUPLICATE', `${label}: duplicate Module id ${module.id}`)
    ids.add(module.id)
    assertSafeInteger(`Module ${module.id}.column`, module.column)
    assertSafeInteger(`Module ${module.id}.row`, module.row)
    if (module.column >= layout.moduleColumns || module.row >= layout.moduleRows) {
      fail('OUT_OF_RANGE', `Module ${module.id}: physical cell is outside ${label}`)
    }
    const index = moduleIndex(layout, module)
    if (positions.has(index)) fail('DUPLICATE', `${label}: occupied Module cell ${module.column},${module.row}`)
    positions.add(index)
    for (const field of ['width', 'height', 'pixelWidth', 'pixelHeight'] as const) {
      assertSafeInteger(`Module ${module.id}.${field}`, module[field], 1)
    }
    assertSafeInteger(`Module ${module.id}.localX`, module.localX)
    assertSafeInteger(`Module ${module.id}.localY`, module.localY)
    if (
      module.pixelWidth !== layout.modulePixelWidth || module.pixelHeight !== layout.modulePixelHeight ||
      safeResult(`Module ${module.id} grid width`, module.width * layout.moduleColumns) !== cabinet.width ||
      safeResult(`Module ${module.id} grid height`, module.height * layout.moduleRows) !== cabinet.height ||
      module.localX !== module.column * module.width || module.localY !== module.row * module.height
    ) fail('SIZE_MISMATCH', `${label}: inconsistent Module ${module.id}`)
    moduleIds[index] = module.id
  }
  return Object.freeze({ layout, moduleIds: Object.freeze(moduleIds) })
}

export function resolveGeometryMapping(input: ResolveGeometryMappingInput): ResolvedGeometryMapping {
  const { inputCanvas, screen, grid, region, cabinets, modules } = input
  assertSize('InputCanvas.resolution', inputCanvas.resolution)
  assertSize('Screen.resolution', screen.resolution)
  assertSize('MappingRegion.size', region.size)
  assertCoordinate('MappingRegion.position', region.position)
  assertSafeInteger('Grid.columns', grid.columns, 1)
  assertSafeInteger('Grid.rows', grid.rows, 1)
  safeResult('Grid cell count', grid.columns * grid.rows)
  assertReference('MappingRegion.inputCanvas', region.inputCanvas, inputCanvas.id)
  assertReference('MappingRegion.screen', region.screen, screen.id)
  assertReference('MappingRegion.grid', region.grid, grid.id)
  assertReference('Grid.screen', grid.screen, screen.id)
  assertContains('Screen.mappingRegions', screen.mappingRegions, region.id)
  assertContains('Screen.cabinetGrids', screen.cabinetGrids, grid.id)
  const right = safeResult('Source right boundary', region.position.x + region.size.width)
  const bottom = safeResult('Source bottom boundary', region.position.y + region.size.height)
  if (right > inputCanvas.resolution.width || bottom > inputCanvas.resolution.height) {
    fail('OUT_OF_RANGE', 'MappingRegion source rect is outside InputCanvas')
  }
  const first = cabinets[0]
  if (first === undefined) fail('INCOMPLETE', 'Grid has no Cabinets')
  const cabinetPixelSize = { width: first.pixelWidth, height: first.pixelHeight }
  assertSize('Cabinet pixel size', cabinetPixelSize)
  const gridPixelSize = {
    width: safeResult('Grid pixel width', grid.columns * cabinetPixelSize.width),
    height: safeResult('Grid pixel height', grid.rows * cabinetPixelSize.height),
  }
  safeResult('Grid pixel count', gridPixelSize.width * gridPixelSize.height)
  const cabinetIds = new Set<string>()
  for (const cabinet of cabinets) {
    if (cabinetIds.has(cabinet.id)) fail('DUPLICATE', `Duplicate Cabinet id ${cabinet.id}`)
    cabinetIds.add(cabinet.id)
  }
  const modulesByCabinet = new Map<string, Module[]>()
  const moduleIds = new Set<string>()
  for (const module of modules) {
    if (moduleIds.has(module.id)) fail('DUPLICATE', `Duplicate Module id ${module.id}`)
    moduleIds.add(module.id)
    if (!cabinetIds.has(module.cabinet)) fail('UNKNOWN_REFERENCE', `Module ${module.id}: unknown Cabinet ${module.cabinet}`)
    const siblings = modulesByCabinet.get(module.cabinet) ?? []
    siblings.push(module)
    modulesByCabinet.set(module.cabinet, siblings)
  }
  const cells = new Map<number, GeometryCabinetCell>()
  for (const cabinet of cabinets) {
    assertReference(`Cabinet ${cabinet.id}.grid`, cabinet.grid, grid.id)
    assertSafeInteger(`Cabinet ${cabinet.id}.column`, cabinet.column)
    assertSafeInteger(`Cabinet ${cabinet.id}.row`, cabinet.row)
    if (cabinet.column >= grid.columns || cabinet.row >= grid.rows) {
      fail('OUT_OF_RANGE', `Cabinet ${cabinet.id}: physical cell is outside Grid`)
    }
    if (cabinet.pixelWidth !== cabinetPixelSize.width || cabinet.pixelHeight !== cabinetPixelSize.height) {
      fail('SIZE_MISMATCH', `Cabinet ${cabinet.id}: inconsistent pixel size`)
    }
    const index = safeResult('Physical cell index', cabinet.row * grid.columns + cabinet.column)
    if (cells.has(index)) fail('DUPLICATE', `Cabinet ${cabinet.id}: occupied physical cell ${cabinet.column},${cabinet.row}`)
    const moduleLayout = resolveModuleLayout(cabinet, modulesByCabinet.get(cabinet.id) ?? [])
    cells.set(index, Object.freeze({
      cabinet: cabinet.id,
      column: cabinet.column,
      row: cabinet.row,
      layout: moduleLayout.layout,
      moduleIds: moduleLayout.moduleIds,
    }))
  }
  for (const size of [region.size, screen.resolution]) {
    if (size.width !== gridPixelSize.width || size.height !== gridPixelSize.height) {
      fail('SIZE_MISMATCH', 'MappingRegion and Screen dimensions must equal Grid pixel dimensions')
    }
  }
  return Object.freeze({
    inputCanvas: Object.freeze({ ...inputCanvas, resolution: Object.freeze({ ...inputCanvas.resolution }) }),
    screen: Object.freeze({
      ...screen,
      resolution: Object.freeze({ ...screen.resolution }),
      mappingRegions: Object.freeze([...screen.mappingRegions]),
      cabinetGrids: Object.freeze([...screen.cabinetGrids]),
    }),
    grid: Object.freeze({ ...grid, ordering: Object.freeze({ ...grid.ordering }) }),
    region: Object.freeze({ ...region, position: Object.freeze({ ...region.position }), size: Object.freeze({ ...region.size }) }),
    gridPixelSize: Object.freeze(gridPixelSize),
    cabinetPixelSize: Object.freeze(cabinetPixelSize),
    cells: Object.freeze([...cells.values()].sort((a, b) => a.row - b.row || a.column - b.column)),
  })
}
