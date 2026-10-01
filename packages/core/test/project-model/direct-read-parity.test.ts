import { describe, expect, it } from 'vitest'
import {
  addressPixel,
  cabinetOrder,
  convertEditableProjectToV2,
  editableProjectFromValidatedProject,
  globalRemapIndex,
  locatePixel,
  mapInputPixelWithHardware,
  projectEditableGeometryMapping,
  projectEditableHardwareMapping,
  selectV2GeometryRead,
  selectV2HardwareRead,
  selectV2HardwareEngineInput,
} from '../../src/index.js'
import { referenceMapping } from '../mapping-engine/fixtures.js'

describe('direct V2 engine reads', () => {
  it('preserves all 196608 REF-001 addresses, round-trips and port-local indices without EditableProject', () => {
    const source = editableProjectFromValidatedProject({ mapping: referenceMapping(), rules: [] })
    const project = convertEditableProjectToV2(source)
    const legacy = projectEditableHardwareMapping(source)
    const direct = selectV2HardwareRead(project)
    expect(direct).toEqual(legacy)
    if (legacy.status !== 'ready' || direct.status !== 'ready') throw new Error('Expected ready Hardware')
    expect(direct.hardware.pixelCount).toBe(196608)
    const visited = new Set<string>()
    let global = 0
    for (const port of direct.hardware.ports) {
      for (let dataIndex = 0; dataIndex < port.pixelCount; dataIndex += 1) {
        const key = { processor: port.processor, port: port.port, dataIndex }
        const pixel = locatePixel(direct.hardware, key)
        const expectedPixel = locatePixel(legacy.hardware, key)
        if (JSON.stringify(pixel) !== JSON.stringify(expectedPixel)) throw new Error(`Pixel mismatch: ${port.port}:${dataIndex}`)
        const address = addressPixel(direct.hardware, { cabinet: pixel.cabinet, coordinate: pixel.cabinetCoordinate })
        const expectedAddress = addressPixel(legacy.hardware, { cabinet: pixel.cabinet, coordinate: pixel.cabinetCoordinate })
        if (JSON.stringify(address) !== JSON.stringify(expectedAddress) || address.dataIndex !== dataIndex ||
            address.hardware.port !== port.port || address.hardware.processor !== port.processor) {
          throw new Error(`Address mismatch: ${port.port}:${dataIndex}`)
        }
        if (globalRemapIndex(direct.hardware, key) !== global) throw new Error(`Global index mismatch: ${global}`)
        visited.add(`${pixel.cabinet}:${pixel.cabinetCoordinate.x}:${pixel.cabinetCoordinate.y}`)
        global += 1
      }
    }
    expect(global).toBe(196608)
    expect(visited.size).toBe(global)

    const regionId = source.mappingRegions[0]!.id
    const oldGeometry = projectEditableGeometryMapping(source, regionId)
    const newGeometry = selectV2GeometryRead(project, regionId)
    expect(newGeometry).toEqual(oldGeometry)
    if (oldGeometry.status !== 'ready' || newGeometry.status !== 'ready') throw new Error('Expected ready Mapping')
    for (const [x, y] of [[0, 0], [31, 31], [128, 0], [0, 128], [384, 128], [127, 255], [0, 256], [511, 383]] as const) {
      const input = { inputCanvas: source.inputCanvas!.id, inputCoordinate: { x, y } }
      expect(mapInputPixelWithHardware(newGeometry.mapping, direct.hardware, input)).toEqual(
        mapInputPixelWithHardware(oldGeometry.mapping, legacy.hardware, input),
      )
    }
  }, 120000)

  it('keeps GridOrdering independent of Receiver and Cabinet signal routes', () => {
    const source = editableProjectFromValidatedProject({ mapping: referenceMapping(), rules: [] })
    const project = convertEditableProjectToV2(source)
    const grid = project.design.cabinetGrids[0]!
    const changed = {
      ...project,
      design: { ...project.design, cabinetGrids: project.design.cabinetGrids.map(value => value.id === grid.id
        ? { ...value, ordering: { ...value.ordering, direction: 'right-to-left' as const } } : value) },
    }
    const logical = (ordering: typeof grid.ordering) => cabinetOrder({ columns: grid.columns, rows: grid.rows, ordering })
    expect(logical(changed.design.cabinetGrids[0]!.ordering)).not.toEqual(logical(grid.ordering))
    expect(changed.hardware.assignments).toBe(project.hardware.assignments)
    expect(changed.hardware.receiverOrder).toBe(project.hardware.receiverOrder)
    expect(changed.operations.signalRoutes).toBe(project.operations.signalRoutes)
    expect(selectV2HardwareEngineInput(changed)).toEqual(selectV2HardwareEngineInput(project))
    expect(selectV2HardwareRead(changed)).toEqual(selectV2HardwareRead(project))
  })
})
