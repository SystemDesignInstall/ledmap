import { resolveHardware } from '../hardware-engine/index.js'
import { rotatedSize } from '../model/mapping-transform.js'
import type { MappingCabinetCell, ResolvedPixelMap, ResolveMappingInput } from './types.js'
import {
  assertCoordinate, assertMappingTransform, assertMembership, assertReference, assertSafeInteger, assertSize, fail, safeResult,
} from './validation.js'

export function resolveMapping(input: ResolveMappingInput): ResolvedPixelMap {
  const { inputCanvas, screen, grid, region, hardwareTopology } = input
  assertSize('InputCanvas.resolution', inputCanvas.resolution)
  assertSize('Screen.resolution', screen.resolution)
  assertSize('MappingRegion.inputRect', region.inputRect)
  assertCoordinate('MappingRegion.inputRect', region.inputRect)
  assertSize('MappingRegion.screenRect', region.screenRect)
  assertCoordinate('MappingRegion.screenRect', region.screenRect)
  assertMappingTransform(region.transform, region.inputRect)
  assertSafeInteger('Grid.columns', grid.columns, 1)
  assertSafeInteger('Grid.rows', grid.rows, 1)
  const cellCount = safeResult('Grid cell count', grid.columns * grid.rows)
  assertReference('MappingRegion.inputCanvas', region.inputCanvas, inputCanvas.id)
  assertReference('MappingRegion.screen', region.screen, screen.id)
  assertReference('MappingRegion.grid', region.grid, grid.id)
  assertReference('Grid.screen', grid.screen, screen.id)
  assertMembership('Screen.mappingRegions', screen.mappingRegions, region.id)
  assertMembership('Screen.cabinetGrids', screen.cabinetGrids, grid.id)
  const right = safeResult('Source right boundary', region.inputRect.x + region.inputRect.width)
  const bottom = safeResult('Source bottom boundary', region.inputRect.y + region.inputRect.height)
  if (right > inputCanvas.resolution.width || bottom > inputCanvas.resolution.height) {
    fail('OUT_OF_RANGE', 'MappingRegion source rect is outside InputCanvas')
  }
  const screenRight = safeResult('Screen right boundary', region.screenRect.x + region.screenRect.width)
  const screenBottom = safeResult('Screen bottom boundary', region.screenRect.y + region.screenRect.height)
  if (screenRight > screen.resolution.width || screenBottom > screen.resolution.height) {
    fail('OUT_OF_RANGE', 'MappingRegion destination rect is outside Screen')
  }
  const first = hardwareTopology.cabinets[0]
  if (first === undefined) fail('INCOMPLETE', 'Grid has no Cabinets')
  const cabinetPixelSize = { width: first.pixelWidth, height: first.pixelHeight }
  assertSize('Cabinet pixel size', cabinetPixelSize)
  const gridPixelSize = {
    width: safeResult('Grid pixel width', grid.columns * cabinetPixelSize.width),
    height: safeResult('Grid pixel height', grid.rows * cabinetPixelSize.height),
  }
  safeResult('Grid pixel count', gridPixelSize.width * gridPixelSize.height)
  const hardware = resolveHardware(hardwareTopology)
  const cells = new Map<number, MappingCabinetCell>()
  for (const cabinet of hardwareTopology.cabinets) {
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
    cells.set(index, Object.freeze({ cabinet: cabinet.id, column: cabinet.column, row: cabinet.row }))
  }
  if (cells.size !== cellCount) fail('INCOMPLETE', 'Grid has missing physical cells')
  const rotatedInputSize = rotatedSize(region.inputRect, region.transform.inputRotation)
  if (rotatedInputSize.width !== gridPixelSize.width || rotatedInputSize.height !== gridPixelSize.height) {
    fail('SIZE_MISMATCH', 'MappingRegion inputRect must rotate exactly into Grid pixel dimensions')
  }
  const rotatedScreenSize = rotatedSize(gridPixelSize, region.transform.screenRotation)
  if (region.screenRect.width !== rotatedScreenSize.width || region.screenRect.height !== rotatedScreenSize.height) {
    fail('SIZE_MISMATCH', 'MappingRegion screenRect must equal the rotated Grid pixel dimensions')
  }
  return Object.freeze({
    inputCanvas: Object.freeze({ ...inputCanvas, resolution: Object.freeze({ ...inputCanvas.resolution }) }),
    screen: Object.freeze({
      ...screen, resolution: Object.freeze({ ...screen.resolution }),
      mappingRegions: Object.freeze([...screen.mappingRegions]), cabinetGrids: Object.freeze([...screen.cabinetGrids]),
    }),
    grid: Object.freeze({ ...grid, ordering: Object.freeze({ ...grid.ordering }) }),
    region: Object.freeze({
      ...region,
      inputRect: Object.freeze({ ...region.inputRect }),
      screenRect: Object.freeze({ ...region.screenRect }),
      transform: Object.freeze({
        ...region.transform,
        ...(region.transform.mask === undefined ? {} : {
          mask: Object.freeze({
            ...region.transform.mask,
            points: Object.freeze(region.transform.mask.points.map(point => Object.freeze({ ...point }))),
          }),
        }),
      }),
    }),
    gridPixelSize: Object.freeze(gridPixelSize), cabinetPixelSize: Object.freeze(cabinetPixelSize),
    cells: Object.freeze([...cells.values()].sort((a, b) => a.row - b.row || a.column - b.column)),
    hardware,
  })
}
