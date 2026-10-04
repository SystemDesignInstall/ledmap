import { describe, expect, it } from 'vitest'
import {
  addressPixel,
  convertEditableProjectToV2,
  editableProjectFromValidatedProject,
  globalRemapIndex,
  locatePixel,
  mapInputPixelWithHardware,
  projectEditableGeometryMapping,
  projectEditableHardwareMapping,
  projectV2GeometryMapping,
  projectV2HardwareMapping,
  projectV2AsEditableReadModel,
  selectReceiverCabinetChain,
  selectReceiversForPort,
} from '../../src/index.js'
import { referenceMapping } from '../mapping-engine/fixtures.js'

describe('Project Model v2 REF-001 read parity', () => {
  it('preserves every port-local and global pixel address, coverage and round-trip', () => {
    const source = editableProjectFromValidatedProject({ mapping: referenceMapping(), rules: [] })
    const project = convertEditableProjectToV2(source)
    const oldHardware = projectEditableHardwareMapping(source)
    const newHardware = projectV2HardwareMapping(project)
    expect(newHardware).toEqual(oldHardware)
    if (oldHardware.status !== 'ready' || newHardware.status !== 'ready') throw new Error('Expected ready Hardware')

    const old = oldHardware.hardware
    const next = newHardware.hardware
    expect(next.pixelCount).toBe(196608)
    expect(next.ports.map(port => [port.port, port.globalBase, port.pixelCount])).toEqual(
      old.ports.map(port => [port.port, port.globalBase, port.pixelCount]),
    )
    const visited = new Set<string>()
    let count = 0
    for (const port of old.ports) {
      for (let dataIndex = 0; dataIndex < port.pixelCount; dataIndex += 1) {
        const key = { processor: port.processor, port: port.port, dataIndex }
        const oldPixel = locatePixel(old, key)
        const nextPixel = locatePixel(next, key)
        if (JSON.stringify(nextPixel) !== JSON.stringify(oldPixel)) throw new Error(`Pixel mismatch at ${port.port}:${dataIndex}`)
        const oldAddress = addressPixel(old, { cabinet: oldPixel.cabinet, coordinate: oldPixel.cabinetCoordinate })
        const nextAddress = addressPixel(next, { cabinet: nextPixel.cabinet, coordinate: nextPixel.cabinetCoordinate })
        if (JSON.stringify(nextAddress) !== JSON.stringify(oldAddress)) throw new Error(`Address mismatch at ${port.port}:${dataIndex}`)
        if (nextAddress.dataIndex !== dataIndex || nextAddress.hardware.port !== port.port ||
            nextAddress.hardware.processor !== port.processor) throw new Error(`Round-trip mismatch at ${port.port}:${dataIndex}`)
        const global = globalRemapIndex(next, key)
        if (global !== port.globalBase + dataIndex || global !== globalRemapIndex(old, key)) {
          throw new Error(`Global index mismatch at ${port.port}:${dataIndex}`)
        }
        visited.add(`${nextPixel.cabinet}:${nextPixel.cabinetCoordinate.x}:${nextPixel.cabinetCoordinate.y}`)
        count += 1
      }
      expect(() => locatePixel(next, { processor: port.processor, port: port.port, dataIndex: port.pixelCount })).toThrow()
    }
    expect(count).toBe(196608)
    expect(visited.size).toBe(count)

    const regionId = source.mappingRegions[0]!.id
    const oldGeometry = projectEditableGeometryMapping(source, regionId)
    const newGeometry = projectV2GeometryMapping(project, regionId)
    expect(newGeometry).toEqual(oldGeometry)
    if (oldGeometry.status !== 'ready' || newGeometry.status !== 'ready') throw new Error('Expected ready Mapping')
    for (const [x, y] of [[0, 0], [31, 31], [128, 0], [0, 128], [384, 128], [127, 255], [0, 256], [511, 383]] as const) {
      const input = { inputCanvas: source.inputCanvas!.id, inputCoordinate: { x, y } }
      expect(mapInputPixelWithHardware(newGeometry.mapping, next, input)).toEqual(
        mapInputPixelWithHardware(oldGeometry.mapping, old, input),
      )
    }
  }, 120000)

  it('keeps reversed Receiver and Cabinet chains independent of legacy index and assignment order', () => {
    const base = editableProjectFromValidatedProject({ mapping: referenceMapping(), rules: [] })
    const firstOrder = base.hardwareTopology.receiverOrder[0]!
    const firstPort = firstOrder.port
    const reversedReceiverIds = [...firstOrder.receivers].reverse()
    const reversedReceiver = reversedReceiverIds[0]!
    const source = {
      ...base,
      hardwareTopology: {
        ...base.hardwareTopology,
        receivers: base.hardwareTopology.receivers.map(receiver => receiver.id === reversedReceiver
          ? { ...receiver, index: 42, cabinets: [...receiver.cabinets].reverse() }
          : receiver),
        receiverOrder: base.hardwareTopology.receiverOrder.map(order => order.port === firstPort
          ? { ...order, receivers: reversedReceiverIds }
          : order),
      },
    }
    const project = convertEditableProjectToV2(source)
    const shuffled = {
      ...project,
      hardware: { ...project.hardware, assignments: [...project.hardware.assignments].reverse() },
    }
    expect(selectReceiversForPort(shuffled, firstPort).map(receiver => receiver.id)).toEqual(reversedReceiverIds)
    expect(selectReceiversForPort(shuffled, firstPort)[0]!.legacyIndex).toBe(42)
    expect(selectReceiverCabinetChain(shuffled, reversedReceiver).map(cabinet => cabinet.id)).toEqual(
      source.hardwareTopology.receivers.find(receiver => receiver.id === reversedReceiver)!.cabinets,
    )
    expect(shuffled.hardware.assignments.every(assignment => assignment.locked && assignment.origin === undefined)).toBe(true)
    expect(projectV2AsEditableReadModel(shuffled)).toEqual(source)
    expect(projectV2HardwareMapping(shuffled)).toEqual(projectEditableHardwareMapping(source))
    const projection = projectV2HardwareMapping(shuffled)
    if (projection.status !== 'ready') throw new Error('Expected ready Hardware')
    expect(projection.hardware.ports.find(port => port.port === firstPort)!.receivers.map(receiver => receiver.receiver))
      .toEqual(reversedReceiverIds)
  })
})
