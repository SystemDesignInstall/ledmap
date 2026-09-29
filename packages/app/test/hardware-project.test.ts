import { addressPixel, resolveHardware } from '@ledmap/core'
import { describe, expect, it } from 'vitest'
import {
  addPort,
  addProcessor,
  addReceiver,
  applyHardwareAllocation,
  assignCabinets,
  deletePort,
  deleteProcessor,
  deleteReceiver,
  genericHardwareDefaults,
  hardwareCabinetOrder,
  moveProcessor,
  moveReceiver,
  previewHardwareAllocation,
  receiverPixelUsage,
  renameProcessor,
  setProcessorPortCount,
  unassignCabinets,
  unassignedCabinetIds,
  updatePort,
  updateReceiver,
} from '../src/renderer/hardware-project.js'
import { createTestProject } from './project-fixtures.js'

function genericTopology() {
  let project = createTestProject()
  project = addProcessor(project)
  for (let port = 0; port < 4; port += 1) {
    project = addPort(project, 'processor-1')
    for (let receiver = 0; receiver < 2; receiver += 1) project = addReceiver(project, `port-${port + 1}`)
  }
  return project
}

describe('Hardware workspace source mutations', () => {
  it('creates Generic Hardware entities and maintains explicit ordering', () => {
    let project = addProcessor(createTestProject())
    expect(project.source.hardwareTopology.processors[0]).toMatchObject({ name: 'Processor 1', portCount: 4 })
    project = addPort(project, 'processor-1')
    project = addReceiver(project, 'port-1')
    project = addReceiver(project, 'port-1')
    expect(project.source.hardwareTopology.ports[0]).toMatchObject({ index: 0, receiverCapacity: 2 })
    expect(project.source.hardwareTopology.receivers.map(receiver => receiver.pixelCapacity)).toEqual([65536, 65536])
    expect(project.source.hardwareTopology.receiverOrder[0]?.receivers).toEqual(['receiver-1', 'receiver-2'])
    project = moveReceiver(project, 'receiver-2', -1)
    expect(project.source.hardwareTopology.receiverOrder[0]?.receivers).toEqual(['receiver-2', 'receiver-1'])
    expect(genericHardwareDefaults).toEqual({ processorPorts: 4, portReceivers: 2, receiverPixels: 65536 })
  })

  it('edits and cascades Generic Hardware CRUD without deleting physical Cabinets', () => {
    let project = addProcessor(createTestProject(), 'Main')
    project = addProcessor(project, 'Backup')
    project = moveProcessor(project, 'processor-2', -1)
    expect(project.source.hardwareTopology.processorOrder).toEqual(['processor-2', 'processor-1'])
    project = renameProcessor(project, 'processor-1', 'Main Processor')
    project = addPort(project, 'processor-1')
    project = updatePort(project, 'port-1', { index: 2, receiverCapacity: 2 })
    project = addReceiver(project, 'port-1')
    project = updateReceiver(project, 'receiver-1', { index: 7, pixelCapacity: 131072 })
    expect(project.source.hardwareTopology.processors.find(processor => processor.id === 'processor-1')?.name).toBe('Main Processor')
    expect(project.source.hardwareTopology.ports[0]).toMatchObject({ index: 2, receiverCapacity: 2 })
    expect(project.source.hardwareTopology.receivers[0]).toMatchObject({ index: 7, pixelCapacity: 131072 })

    const cabinetCount = project.source.hardwareTopology.cabinets.length
    const cabinet = hardwareCabinetOrder(project)[0]!
    project = assignCabinets(project, 'receiver-1', [cabinet])
    project = unassignCabinets(project, 'receiver-1', [cabinet])
    expect(unassignedCabinetIds(project)).toContain(cabinet)
    project = deleteReceiver(project, 'receiver-1')
    expect(project.source.hardwareTopology.receiverOrder[0]?.receivers).toEqual([])
    project = deleteProcessor(project, 'processor-1')
    expect(project.source.hardwareTopology.ports).toEqual([])
    expect(project.source.hardwareTopology.processorOrder).toEqual(['processor-2'])
    expect(project.source.hardwareTopology.cabinets).toHaveLength(cabinetCount)
  })

  it('rejects capacity reductions and manual assignments that exceed Generic Hardware limits', () => {
    let project = addProcessor(createTestProject())
    project = addPort(project, 'processor-1')
    project = addReceiver(project, 'port-1')
    const order = hardwareCabinetOrder(project)
    expect(() => assignCabinets(project, 'receiver-1', order.slice(0, 5))).toThrow(/65,536 Receiver pixels/)
    project = assignCabinets(project, 'receiver-1', order.slice(0, 4))
    expect(() => updateReceiver(project, 'receiver-1', { pixelCapacity: 16384 })).toThrow(/cannot be below 65,536/)
    project = updatePort(project, 'port-1', { index: 3 })
    expect(() => setProcessorPortCount(project, 'processor-1', 3)).toThrow(/at least 4 Ports/)
  })

  it('orders Cabinets by Screens, Screen grids and Cabinet Engine logical order', () => {
    const project = createTestProject()
    expect(hardwareCabinetOrder(project).slice(0, 12)).toEqual([
      'screen-1/C01', 'screen-1/C02', 'screen-1/C03', 'screen-1/C04',
      'screen-1/C08', 'screen-1/C07', 'screen-1/C06', 'screen-1/C05',
      'screen-1/C09', 'screen-1/C10', 'screen-1/C11', 'screen-1/C12',
    ])
    expect(hardwareCabinetOrder(project)[12]).toBe('screen-2/C01')
  })

  it('keeps manual assignments fixed and previews allocation without mutating source', () => {
    let project = genericTopology()
    const order = hardwareCabinetOrder(project)
    project = assignCabinets(project, 'receiver-1', order.slice(0, 2))
    const before = project.source.hardwareTopology
    const proposal = previewHardwareAllocation(project)
    expect(project.source.hardwareTopology).toBe(before)
    expect(project.source.hardwareTopology.receivers[0]!.cabinets).toEqual(order.slice(0, 2))
    expect(proposal.topology.receivers[0]!.cabinets.slice(0, 2)).toEqual(order.slice(0, 2))
    expect(unassignedCabinetIds(project)).toHaveLength(order.length - 2)

    project = applyHardwareAllocation(project, proposal)
    expect(unassignedCabinetIds(project)).toEqual([])
    expect(resolveHardware(project.source.hardwareTopology).pixelCount).toBe(
      project.source.hardwareTopology.cabinets.reduce((total, cabinet) => total + cabinet.pixelWidth * cabinet.pixelHeight, 0),
    )
  })

  it('keeps shared-Port dataIndex global across Screens', () => {
    let project = genericTopology()
    const order = hardwareCabinetOrder(project)
    project = assignCabinets(project, 'receiver-1', order.slice(0, 4))
    project = assignCabinets(project, 'receiver-2', order.slice(12, 16))
    const proposal = previewHardwareAllocation(project)
    project = applyHardwareAllocation(project, proposal)
    const resolved = resolveHardware(project.source.hardwareTopology)
    const first = addressPixel(resolved, { cabinet: order[0]!, coordinate: { x: 0, y: 0 } })
    const secondScreen = addressPixel(resolved, { cabinet: order[12]!, coordinate: { x: 0, y: 0 } })
    expect(first.hardware.port).toBe(secondScreen.hardware.port)
    expect(secondScreen.dataIndex).toBeGreaterThan(first.dataIndex)
  })

  it('reports derived usage and cascades deleted Port entities without deleting Cabinets', () => {
    let project = genericTopology()
    const cabinets = hardwareCabinetOrder(project).slice(0, 4)
    project = assignCabinets(project, 'receiver-1', cabinets)
    expect(receiverPixelUsage(project, 'receiver-1')).toMatchObject({ used: 65536, capacity: 65536 })
    const cabinetCount = project.source.hardwareTopology.cabinets.length
    project = updatePort(project, 'port-1', { receiverCapacity: 2 })
    project = deletePort(project, 'port-1')
    expect(project.source.hardwareTopology.receivers.some(receiver => receiver.port === 'port-1')).toBe(false)
    expect(project.source.hardwareTopology.cabinets).toHaveLength(cabinetCount)
  })
})
