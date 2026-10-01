import {
  addressPixel,
  asSignalRouteId,
  convertEditableProjectToV2,
  projectV2AsEditableReadModel,
  resolveHardware,
  type LedMapProjectV2,
} from '@ledmap/core'
import { describe, expect, it } from 'vitest'
import {
  addPort, addProcessor, addReceiver, applyHardwareAllocation, assignCabinets, deletePort, deleteProcessor, deleteReceiver,
  hardwareCabinetOrder, moveProcessor, moveReceiver, previewHardwareAllocation, renameProcessor,
  setProcessorPortCount, unassignCabinets, updatePort, updateReceiver,
} from '../src/renderer/hardware-project.js'
import {
  addPortV2, addProcessorV2, addReceiverV2, applyHardwareAllocationV2, assignCabinetsV2,
  deletePortV2, deleteProcessorV2, deleteReceiverV2, moveProcessorV2, moveReceiverV2,
  orderedSelectedCabinetsV2, previewHardwareAllocationV2, renameProcessorV2,
  requireCurrentHardwarePreview, setProcessorPortCountV2, unassignCabinetsV2,
  updatePortV2, updateReceiverV2,
} from '../src/renderer/v2-hardware-commands.js'
import {
  commitProjectV2, createProjectSession, loadProjectSession, serializeProjectSession,
} from '../src/renderer/project-session.js'
import { createTestProject } from './project-fixtures.js'

function initial() {
  const legacy = createTestProject()
  return { legacy, v2: convertEditableProjectToV2(legacy.source) }
}

function expectTopologyParity(legacy: ReturnType<typeof createTestProject>, v2: LedMapProjectV2): void {
  expect(projectV2AsEditableReadModel(v2).hardwareTopology).toEqual(legacy.source.hardwareTopology)
}

function withReceivers(count: number): LedMapProjectV2 {
  let v2 = addProcessorV2(initial().v2)
  for (let port = 0; port < Math.ceil(count / 2); port += 1) {
    v2 = addPortV2(v2, 'processor-1')
    for (let receiver = 0; receiver < Math.min(2, count - port * 2); receiver += 1) {
      v2 = addReceiverV2(v2, `port-${port + 1}`)
    }
  }
  return v2
}

function expectRoutesMatchAssignments(project: LedMapProjectV2): void {
  for (const receiver of project.hardware.receivers) {
    const assigned = project.hardware.assignments.filter(value => value.receiverId === receiver.id).map(value => value.target.cabinetId)
    const routes = project.operations.signalRoutes.filter(value => value.receiverId === receiver.id)
    expect(routes).toHaveLength(assigned.length === 0 ? 0 : 1)
    expect(new Set(routes[0]?.orderedCabinetIds ?? [])).toEqual(new Set(assigned))
  }
}

describe('direct V2 Hardware commands', () => {
  it('matches legacy CRUD, field edits, explicit orders and empty deletes', () => {
    let { legacy, v2 } = initial()
    legacy = addProcessor(legacy)
    v2 = addProcessorV2(v2)
    legacy = addProcessor(legacy)
    v2 = addProcessorV2(v2)
    legacy = renameProcessor(legacy, 'processor-1', 'Main')
    v2 = renameProcessorV2(v2, 'processor-1', 'Main')
    legacy = addPort(legacy, 'processor-1')
    v2 = addPortV2(v2, 'processor-1')
    legacy = updatePort(legacy, 'port-1', { index: 2, receiverCapacity: 2 })
    v2 = updatePortV2(v2, 'port-1', { index: 2, receiverCapacity: 2 })
    legacy = setProcessorPortCount(legacy, 'processor-1', 3)
    v2 = setProcessorPortCountV2(v2, 'processor-1', 3)
    legacy = addReceiver(legacy, 'port-1')
    v2 = addReceiverV2(v2, 'port-1')
    legacy = addReceiver(legacy, 'port-1')
    v2 = addReceiverV2(v2, 'port-1')
    legacy = updateReceiver(legacy, 'receiver-1', { index: 7, pixelCapacity: 131072 })
    v2 = updateReceiverV2(v2, 'receiver-1', { index: 7, pixelCapacity: 131072 })
    legacy = moveReceiver(legacy, 'receiver-2', -1)
    v2 = moveReceiverV2(v2, 'receiver-2', -1)
    legacy = moveProcessor(legacy, 'processor-2', -1)
    v2 = moveProcessorV2(v2, 'processor-2', -1)
    expectTopologyParity(legacy, v2)
    expect(v2.hardware.receiverOrder[0]?.receiverIds).toEqual(['receiver-2', 'receiver-1'])
    expect(v2.hardware.receivers[0]?.legacyIndex).toBe(7)

    legacy = deleteReceiver(legacy, 'receiver-2')
    v2 = deleteReceiverV2(v2, 'receiver-2')
    legacy = deleteReceiver(legacy, 'receiver-1')
    v2 = deleteReceiverV2(v2, 'receiver-1')
    legacy = deletePort(legacy, 'port-1')
    v2 = deletePortV2(v2, 'port-1')
    legacy = deleteProcessor(legacy, 'processor-1')
    v2 = deleteProcessorV2(v2, 'processor-1')
    expectTopologyParity(legacy, v2)
  })

  it('keeps assignment membership and signal routes atomic with legacy chain parity', () => {
    let { legacy, v2 } = initial()
    legacy = addProcessor(legacy)
    v2 = addProcessorV2(v2)
    legacy = addPort(legacy, 'processor-1')
    v2 = addPortV2(v2, 'processor-1')
    for (let index = 0; index < 2; index += 1) {
      legacy = addReceiver(legacy, 'port-1')
      v2 = addReceiverV2(v2, 'port-1')
    }
    const cabinets = hardwareCabinetOrder(legacy)
    for (const [receiverId, selected] of [
      ['receiver-1', cabinets.slice(0, 2)],
      ['receiver-2', cabinets.slice(2, 3)],
      ['receiver-1', cabinets.slice(0, 1)],
      ['receiver-2', cabinets.slice(1, 2)],
    ] as const) {
      legacy = assignCabinets(legacy, receiverId, selected)
      v2 = assignCabinetsV2(v2, receiverId, orderedSelectedCabinetsV2(v2, selected))
      expectTopologyParity(legacy, v2)
      expectRoutesMatchAssignments(v2)
    }
    legacy = unassignCabinets(legacy, 'receiver-2', cabinets.slice(1, 2))
    v2 = unassignCabinetsV2(v2, 'receiver-2', cabinets.slice(1, 2))
    expectTopologyParity(legacy, v2)
    expectRoutesMatchAssignments(v2)
    expect(v2.hardware.assignments.every(value => value.locked && value.origin === undefined)).toBe(true)
  })

  it('blocks dependent deletes without publishing a partial session and deletes empty entities', () => {
    let v2 = withReceivers(1)
    expect(() => deleteProcessorV2(v2, 'processor-1')).toThrow(/dependent/)
    expect(() => deletePortV2(v2, 'port-1')).toThrow(/dependent/)
    const cabinet = orderedSelectedCabinetsV2(v2, [v2.design.cabinets[0]!.id])[0]!
    v2 = assignCabinetsV2(v2, 'receiver-1', [cabinet])
    expect(() => deleteReceiverV2(v2, 'receiver-1')).toThrow(/assignments/)
    const malformed = { ...v2, hardware: { ...v2.hardware, assignments: [] }, operations: {
      ...v2.operations, signalRoutes: [{ id: asSignalRouteId('route-only'), receiverId: v2.hardware.receivers[0]!.id, orderedCabinetIds: [] }],
    } }
    expect(() => deleteReceiverV2(malformed, 'receiver-1')).toThrow(/SignalRoute/)
    const session = { ...createProjectSession('document-1'), project: v2 }
    expect(() => commitProjectV2(session, source => deleteReceiverV2(source, 'receiver-1'))).toThrow()
    expect(session.revision).toBe(0)
    expectRoutesMatchAssignments(v2)
  })

  it('preserves locked assignments under auto allocation but permits explicit manual move', () => {
    let v2 = withReceivers(8)
    const cabinet = v2.design.cabinets[0]!.id
    v2 = assignCabinetsV2(v2, 'receiver-1', [cabinet])
    const assignment = v2.hardware.assignments.find(value => value.target.cabinetId === cabinet)!
    const preview = previewHardwareAllocationV2(v2)
    expect(preview.topology.receivers[0]!.cabinets).toContain(cabinet)
    const allocated = applyHardwareAllocationV2(v2, preview)
    expect(allocated.hardware.assignments.find(value => value.target.cabinetId === cabinet)).toEqual(assignment)
    expectRoutesMatchAssignments(allocated)
    const moved = assignCabinetsV2(v2, 'receiver-2', [cabinet])
    expect(moved.hardware.assignments.find(value => value.target.cabinetId === cabinet)).toMatchObject({
      id: assignment.id, receiverId: 'receiver-2', locked: true,
    })
    expect(chainFor(moved, 'receiver-1')).not.toContain(cabinet)
    expect(chainFor(moved, 'receiver-2')).toContain(cabinet)
  })

  it('matches legacy allocation diagnostics and resolved PixelAddress across the complete topology', () => {
    let { legacy, v2 } = initial()
    legacy = addProcessor(legacy)
    v2 = addProcessorV2(v2)
    for (let port = 0; port < 4; port += 1) {
      legacy = addPort(legacy, 'processor-1')
      v2 = addPortV2(v2, 'processor-1')
      for (let receiver = 0; receiver < 2; receiver += 1) {
        legacy = addReceiver(legacy, `port-${port + 1}`)
        v2 = addReceiverV2(v2, `port-${port + 1}`)
      }
    }
    const ordered = hardwareCabinetOrder(legacy)
    legacy = assignCabinets(legacy, 'receiver-1', ordered.slice(0, 2))
    v2 = assignCabinetsV2(v2, 'receiver-1', orderedSelectedCabinetsV2(v2, ordered.slice(0, 2)))
    const legacyPreview = previewHardwareAllocation(legacy)
    const v2Preview = previewHardwareAllocationV2(v2)
    expect(v2Preview).toEqual(legacyPreview)
    legacy = applyHardwareAllocation(legacy, legacyPreview)
    v2 = applyHardwareAllocationV2(v2, v2Preview)
    expectTopologyParity(legacy, v2)
    const oldResolved = resolveHardware(legacy.source.hardwareTopology)
    const newResolved = resolveHardware(projectV2AsEditableReadModel(v2).hardwareTopology)
    expect(newResolved.pixelCount).toBe(oldResolved.pixelCount)
    for (const cabinet of [ordered[0]!, ordered.at(-1)!]) {
      const physical = legacy.source.hardwareTopology.cabinets.find(value => value.id === cabinet)!
      for (const coordinate of [{ x: 0, y: 0 }, { x: physical.pixelWidth - 1, y: physical.pixelHeight - 1 }]) {
        expect(addressPixel(newResolved, { cabinet, coordinate })).toEqual(addressPixel(oldResolved, { cabinet, coordinate }))
      }
    }
    expectRoutesMatchAssignments(v2)
  })

  it('rejects capacity violations just as the legacy commands do', () => {
    let { legacy, v2 } = initial()
    legacy = addProcessor(legacy)
    v2 = addProcessorV2(v2)
    legacy = addPort(legacy, 'processor-1')
    v2 = addPortV2(v2, 'processor-1')
    legacy = addReceiver(legacy, 'port-1')
    v2 = addReceiverV2(v2, 'port-1')
    const ordered = hardwareCabinetOrder(legacy)
    const pixelCount = legacy.source.hardwareTopology.cabinets[0]!.pixelWidth * legacy.source.hardwareTopology.cabinets[0]!.pixelHeight
    legacy = updateReceiver(legacy, 'receiver-1', { pixelCapacity: pixelCount * 2 })
    v2 = updateReceiverV2(v2, 'receiver-1', { pixelCapacity: pixelCount * 2 })
    const overCapacity = ordered.slice(0, 3)
    expect(() => assignCabinets(legacy, 'receiver-1', overCapacity)).toThrow()
    expect(() => assignCabinetsV2(v2, 'receiver-1', orderedSelectedCabinetsV2(v2, overCapacity))).toThrow()
    legacy = assignCabinets(legacy, 'receiver-1', ordered.slice(0, 2))
    v2 = assignCabinetsV2(v2, 'receiver-1', orderedSelectedCabinetsV2(v2, ordered.slice(0, 2)))
    expect(() => updateReceiver(legacy, 'receiver-1', { pixelCapacity: pixelCount })).toThrow()
    expect(() => updateReceiverV2(v2, 'receiver-1', { pixelCapacity: pixelCount })).toThrow()
    legacy = updatePort(legacy, 'port-1', { index: 3 })
    v2 = updatePortV2(v2, 'port-1', { index: 3 })
    expect(() => setProcessorPortCount(legacy, 'processor-1', 3)).toThrow()
    expect(() => setProcessorPortCountV2(v2, 'processor-1', 3)).toThrow()
    expectTopologyParity(legacy, v2)
  })

  it('keeps compatibility IDs stable through Save and Reopen', () => {
    let v2 = withReceivers(8)
    const cabinet = v2.design.cabinets[0]!.id
    v2 = assignCabinetsV2(v2, 'receiver-1', [cabinet])
    v2 = applyHardwareAllocationV2(v2, previewHardwareAllocationV2(v2))
    const session = { ...createProjectSession('document-1'), project: v2 }
    const reopened = loadProjectSession(serializeProjectSession(session), 'test.ledmap', 'document-2')
    expect(reopened.project).toEqual(v2)
    expect(reopened.project.hardware.assignments.find(value => value.target.cabinetId === cabinet)?.id).toBe(`assignment:${cabinet.length}:${cabinet}`)
    for (const route of reopened.project.operations.signalRoutes) {
      expect(route.id).toBe(`route:${route.receiverId.length}:${route.receiverId}`)
    }
  })

  it('rejects stale previews and keeps no-op revisions unchanged', () => {
    const v2 = withReceivers(8)
    const session = { ...createProjectSession('document-1'), project: v2 }
    const stamp = { documentId: session.documentId, revision: session.revision }
    expect(() => requireCurrentHardwarePreview(stamp, { ...stamp, revision: 1 })).toThrow(/stale/)
    expect(() => requireCurrentHardwarePreview(stamp, { documentId: 'other', revision: 0 })).toThrow(/stale/)
    requireCurrentHardwarePreview(stamp, stamp)
    const preview = previewHardwareAllocationV2(v2)
    expect(() => applyHardwareAllocationV2(addProcessorV2(v2), preview)).toThrow(/stale/)
    expect(commitProjectV2(session, source => renameProcessorV2(source, 'processor-1', 'Processor 1'))).toBe(session)
    expect(commitProjectV2(session, source => moveReceiverV2(source, 'receiver-1', -1))).toBe(session)
    expect(commitProjectV2(session, source => unassignCabinetsV2(source, 'receiver-1', ['missing']))).toBe(session)
    expect(commitProjectV2(session, source => assignCabinetsV2(source, 'receiver-1', []))).toBe(session)
  })

  it('changes the hardware stream on Receiver reorder without changing geometry or routes', () => {
    let v2 = withReceivers(8)
    const first = v2.design.cabinets[0]!.id
    const second = v2.design.cabinets[1]!.id
    v2 = assignCabinetsV2(v2, 'receiver-1', [first])
    v2 = assignCabinetsV2(v2, 'receiver-2', [second])
    v2 = applyHardwareAllocationV2(v2, previewHardwareAllocationV2(v2))
    const before = addressPixel(resolveHardware(projectV2AsEditableReadModel(v2).hardwareTopology), {
      cabinet: second, coordinate: { x: 0, y: 0 },
    })
    const after = moveReceiverV2(v2, 'receiver-2', -1)
    const mapped = addressPixel(resolveHardware(projectV2AsEditableReadModel(after).hardwareTopology), {
      cabinet: second, coordinate: { x: 0, y: 0 },
    })
    expect(mapped.dataIndex).not.toBe(before.dataIndex)
    expect(after.design).toEqual(v2.design)
    expect(after.operations.signalRoutes).toEqual(v2.operations.signalRoutes)
    expect(after.hardware.receivers).toEqual(v2.hardware.receivers)
  })

  it('does not reroute existing Cabinets when GridOrdering changes', () => {
    let v2 = withReceivers(1)
    const cabinet = v2.design.cabinets[0]!.id
    v2 = assignCabinetsV2(v2, 'receiver-1', [cabinet])
    const changed: LedMapProjectV2 = { ...v2, design: { ...v2.design,
      cabinetGrids: v2.design.cabinetGrids.map((grid, index) => index === 0
        ? { ...grid, ordering: { ...grid.ordering, direction: 'right-to-left' } }
        : grid),
    } }
    expect(changed.operations.signalRoutes).toEqual(v2.operations.signalRoutes)
    expect(changed.hardware).toEqual(v2.hardware)
    expect(orderedSelectedCabinetsV2(changed, v2.design.cabinets.map(value => value.id))).not.toEqual(
      orderedSelectedCabinetsV2(v2, v2.design.cabinets.map(value => value.id)),
    )
  })
})

function chainFor(project: LedMapProjectV2, receiverId: string): readonly string[] {
  return project.operations.signalRoutes.find(route => route.receiverId === receiverId)?.orderedCabinetIds ?? []
}
