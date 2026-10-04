import { describe, expect, it } from 'vitest'
import {
  asCabinetGridId,
  asMappingRegionId,
  asScreenId,
  createCabinetGrid,
  createInputCanvas,
  createMappingRegion,
  createPort,
  createProcessor,
  createReceiver,
  createScreen,
  inspectGeometryInputPixel,
  mapGeometryInputPixel,
  mapInputPixelWithHardware,
  projectEditableGeometryMapping,
  projectEditableHardwareMapping,
  unmapHardwarePixelWithGeometry,
  type EditableProject,
} from '../../src/index.js'
import { cabinetFixture } from '../hardware-engine/fixtures.js'

function multiScreenProject(): EditableProject {
  const inputCanvas = createInputCanvas({ id: 'input', resolution: { width: 4, height: 1 } })
  const screenAId = asScreenId('screen-a')
  const screenBId = asScreenId('screen-b')
  const gridAId = asCabinetGridId('grid-a')
  const gridBId = asCabinetGridId('grid-b')
  const regionAId = asMappingRegionId('region-a')
  const regionBId = asMappingRegionId('region-b')
  const screens = [
    createScreen({ id: screenAId, name: 'A', resolution: { width: 2, height: 1 }, cabinetGrids: [gridAId], mappingRegions: [regionAId] }),
    createScreen({ id: screenBId, name: 'B', resolution: { width: 2, height: 1 }, cabinetGrids: [gridBId], mappingRegions: [regionBId] }),
  ]
  const cabinetGrids = [
    createCabinetGrid({ id: gridAId, screen: screenAId, name: 'A', columns: 1, rows: 1, cabinetWidth: 2, cabinetHeight: 1 }),
    createCabinetGrid({ id: gridBId, screen: screenBId, name: 'B', columns: 1, rows: 1, cabinetWidth: 2, cabinetHeight: 1 }),
  ]
  const mappingRegions = [
    createMappingRegion({ id: regionAId, inputCanvas: inputCanvas.id, screen: screenAId, grid: gridAId, position: { x: 0, y: 0 }, size: { width: 2, height: 1 } }),
    createMappingRegion({ id: regionBId, inputCanvas: inputCanvas.id, screen: screenBId, grid: gridBId, position: { x: 2, y: 0 }, size: { width: 2, height: 1 } }),
  ]
  const partA = cabinetFixture('A', 1, 1, 2, 1)
  const partB = cabinetFixture('B', 1, 1, 2, 1)
  const cabinets = [{ ...partA.cabinet, grid: gridAId }, { ...partB.cabinet, grid: gridBId }]
  const modules = [...partA.modules, ...partB.modules]
  const processor = createProcessor({ id: 'P', name: 'P', portCount: 1 })
  const port = createPort({ id: 'P:0', processor: processor.id, index: 0, receiverCapacity: 1 })
  const receiver = createReceiver({ id: 'R', processor: processor.id, port: port.id, index: 0, cabinets: cabinets.map(cabinet => cabinet.id) })
  return {
    inputCanvas,
    screens,
    cabinetGrids,
    mappingRegions,
    hardwareTopology: {
      processors: [processor],
      ports: [port],
      receivers: [receiver],
      cabinets,
      modules,
      processorOrder: [processor.id],
      receiverOrder: [{ port: port.id, receivers: [receiver.id] }],
    },
    rules: [],
    editorLayout: {
      screenPositions: [
        { screen: screenAId, position: { x: 0, y: 0 } },
        { screen: screenBId, position: { x: 100, y: -50 } },
      ],
    },
  }
}

describe('Editable Project geometry and hardware projections', () => {
  it('projects multiple Screens independently while preserving one global Port stream', () => {
    const project = multiScreenProject()
    const first = projectEditableGeometryMapping(project, asMappingRegionId('region-a'))
    const second = projectEditableGeometryMapping(project, asMappingRegionId('region-b'))
    const hardware = projectEditableHardwareMapping(project)
    expect(first.status).toBe('ready')
    expect(second.status).toBe('ready')
    expect(hardware.status).toBe('ready')
    if (first.status !== 'ready' || second.status !== 'ready' || hardware.status !== 'ready') return
    expect(first.mapping.cells.map(cell => cell.cabinet)).toEqual(['A'])
    expect(second.mapping.cells.map(cell => cell.cabinet)).toEqual(['B'])
    const mapped = mapInputPixelWithHardware(second.mapping, hardware.hardware, {
      inputCanvas: project.inputCanvas!.id,
      inputCoordinate: { x: 2, y: 0 },
    })
    expect(mapped.cabinet).toBe('B')
    expect(mapped.address.dataIndex).toBe(2)
    expect(unmapHardwarePixelWithGeometry(second.mapping, hardware.hardware, {
      processor: mapped.address.hardware.processor,
      port: mapped.address.hardware.port,
      dataIndex: 2,
    })).toEqual(mapped)
    expect(() => unmapHardwarePixelWithGeometry(second.mapping, hardware.hardware, {
      processor: mapped.address.hardware.processor,
      port: mapped.address.hardware.port,
      dataIndex: 0,
    })).toThrowError(/MAPPING_UNKNOWN_REFERENCE/)
  })

  it('keeps geometry ready and exposes an explicit incomplete hardware state', () => {
    const project = multiScreenProject()
    const partial: EditableProject = {
      ...project,
      hardwareTopology: {
        ...project.hardwareTopology,
        processors: [],
        ports: [],
        receivers: [],
        processorOrder: [],
        receiverOrder: [],
      },
    }
    const geometry = projectEditableGeometryMapping(partial, asMappingRegionId('region-b'))
    const hardware = projectEditableHardwareMapping(partial)
    expect(geometry.status).toBe('ready')
    expect(hardware.status).toBe('incomplete')
    if (geometry.status !== 'ready') return
    const inspection = inspectGeometryInputPixel(geometry.mapping, {
      inputCanvas: partial.inputCanvas!.id,
      inputCoordinate: { x: 3, y: 0 },
    }, hardware)
    expect(inspection.geometry).toEqual(mapGeometryInputPixel(geometry.mapping, {
      inputCanvas: partial.inputCanvas!.id,
      inputCoordinate: { x: 3, y: 0 },
    }))
    expect(inspection.hardware.status).toBe('incomplete')
    expect(inspection.hardware.diagnostics[0]?.code).toBe('HARDWARE_INCOMPLETE')
  })

  it('returns diagnosable incomplete geometry instead of requiring hardware placeholders', () => {
    const project = multiScreenProject()
    const missingCabinet: EditableProject = {
      ...project,
      hardwareTopology: {
        ...project.hardwareTopology,
        cabinets: project.hardwareTopology.cabinets.filter(cabinet => cabinet.grid !== asCabinetGridId('grid-b')),
        modules: project.hardwareTopology.modules.filter(module => module.cabinet !== 'B'),
      },
    }
    const projection = projectEditableGeometryMapping(missingCabinet, asMappingRegionId('region-b'))
    expect(projection.status).toBe('incomplete')
    expect(projection.diagnostics[0]?.code).toBe('MAPPING_INCOMPLETE')
    expect(projection.mapping).toBeNull()
  })
})
