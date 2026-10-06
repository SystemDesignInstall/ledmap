import {
  addressPixel,
  asSignalRouteId,
  convertEditableProjectToV2,
  projectV2AsEditableReadModel,
  resolveHardware,
  selectV2HardwareEngineInput,
  type LedMapProjectV2,
} from '@ledmap/core'
import { describe, expect, it } from 'vitest'
import { ProjectDocumentController } from '../src/renderer/document.js'
import {
  addPort, addProcessor, addReceiver, applyHardwareAllocation, assignCabinets, deletePort, deleteProcessor, deleteReceiver,
  hardwareCabinetOrder, moveProcessor, moveReceiver, previewHardwareAllocation, renameProcessor,
  setProcessorPortCount, unassignCabinets, updatePort, updateReceiver,
} from '../src/renderer/hardware-project.js'
import {
  addPortV2, addProcessorV2, addReceiverV2, applyHardwareAllocationV2, assignCabinetsV2,
  deletePortV2, deleteProcessorV2, deleteReceiverV2, moveProcessorV2, moveReceiverV2,
  moveCabinetToReceiverV2, orderedSelectedCabinetsV2, previewHardwareAllocationV2, renameProcessorV2,
  reorderSignalRouteV2,
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
    expect(v2.hardware.assignments.every(value => value.locked && value.origin === 'manual')).toBe(true)
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
    expect(v2Preview.topology).toEqual(legacyPreview.topology)
    expect(v2Preview.diagnostics).toEqual(legacyPreview.diagnostics)
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

  it('reorders exactly one SignalRoute without changing assignment metadata or other domains', () => {
    let v2 = withReceivers(2)
    const [first, second, third] = v2.design.cabinets.map(value => value.id)
    v2 = assignCabinetsV2(v2, 'receiver-1', [first!, second!, third!])
    v2 = assignCabinetsV2(v2, 'receiver-2', v2.design.cabinets.slice(3).map(value => value.id))
    const route = v2.operations.signalRoutes[0]!
    const assignments = v2.hardware.assignments
    const reordered = reorderSignalRouteV2(v2, 'receiver-1', [third!, first!, second!])
    expect(chainFor(reordered, 'receiver-1')).toEqual([third, first, second])
    expect(reordered.operations.signalRoutes[0]?.id).toBe(route.id)
    expect(reordered.hardware).toBe(v2.hardware)
    expect(reordered.design).toBe(v2.design)
    expect(reordered.content).toBe(v2.content)
    expect(reordered.hardware.assignments).toBe(assignments)
    expect(reorderSignalRouteV2(reordered, 'receiver-1', [third!, first!, second!])).toBe(reordered)
    expectRoutesMatchAssignments(reordered)
    const before = resolveHardware(selectV2HardwareEngineInput(v2))
    const after = resolveHardware(selectV2HardwareEngineInput(reordered))
    expect(addressPixel(before, { cabinet: first!, coordinate: { x: 0, y: 0 } }).dataIndex).toBe(0)
    expect(addressPixel(after, { cabinet: third!, coordinate: { x: 0, y: 0 } }).dataIndex).toBe(0)
    expect(addressPixel(after, { cabinet: first!, coordinate: { x: 0, y: 0 } }).dataIndex).toBe(
      v2.design.cabinets[2]!.pixelWidth * v2.design.cabinets[2]!.pixelHeight,
    )
  })

  it('rejects missing, extra, duplicate and foreign Cabinets in reorder without mutation', () => {
    let v2 = withReceivers(2)
    const [first, second, third, foreign] = v2.design.cabinets.map(value => value.id)
    v2 = assignCabinetsV2(v2, 'receiver-1', [first!, second!, third!])
    v2 = assignCabinetsV2(v2, 'receiver-2', [foreign!])
    for (const invalid of [
      [first!, second!],
      [first!, second!, third!, foreign!],
      [first!, first!, third!],
      [first!, second!, foreign!],
    ]) expect(() => reorderSignalRouteV2(v2, 'receiver-1', invalid)).toThrow(/exact permutation/)
    expect(() => reorderSignalRouteV2(v2, 'missing', [first!, second!, third!])).toThrow(/Unknown Receiver/)
    expect(v2.operations.signalRoutes[0]?.orderedCabinetIds).toEqual([first, second, third])
    expectRoutesMatchAssignments(v2)
  })

  it('requires one valid route whose Cabinet set equals the Receiver assignment set', () => {
    let v2 = withReceivers(2)
    const cabinet = v2.design.cabinets[0]!.id
    v2 = assignCabinetsV2(v2, 'receiver-1', [cabinet])
    const route = v2.operations.signalRoutes[0]!
    const withoutRoute = { ...v2, operations: { ...v2.operations, signalRoutes: [] } }
    expect(() => reorderSignalRouteV2(withoutRoute, 'receiver-1', [cabinet])).toThrow(/exactly one SignalRoute/)
    const duplicateRoute = { ...v2, operations: { ...v2.operations, signalRoutes: [route, { ...route, id: asSignalRouteId('other') }] } }
    expect(() => reorderSignalRouteV2(duplicateRoute, 'receiver-1', [cabinet])).toThrow(/exactly one SignalRoute/)
    const mismatched = { ...v2, operations: { ...v2.operations,
      signalRoutes: [{ ...route, orderedCabinetIds: [cabinet, v2.design.cabinets[1]!.id] }],
    } }
    expect(() => reorderSignalRouteV2(mismatched, 'receiver-1', [cabinet, v2.design.cabinets[1]!.id])).toThrow(/exact permutation/)
    const emptyRoute = { ...v2, hardware: { ...v2.hardware, assignments: [] }, operations: { ...v2.operations,
      signalRoutes: [{ ...route, orderedCabinetIds: [] }],
    } }
    expect(() => reorderSignalRouteV2(emptyRoute, 'receiver-1', [])).toThrow(/exact permutation/)
  })

  it('does not advance revision or history for an identical route', () => {
    let v2 = withReceivers(1)
    const cabinet = v2.design.cabinets[0]!.id
    v2 = assignCabinetsV2(v2, 'receiver-1', [cabinet])
    const controller = new ProjectDocumentController(() => 'document-1')
    controller.replace({ ...createProjectSession('document-1'), project: v2 })
    const previous = controller.session
    controller.transactV2(source => reorderSignalRouteV2(source, 'receiver-1', [cabinet]))
    expect(controller.session).toBe(previous)
    expect(controller.session.revision).toBe(0)
    expect(controller.canUndo).toBe(false)
  })

  it('transfers one Cabinet atomically, preserving assignment metadata and route identities', () => {
    let v2 = withReceivers(2)
    const [first, second, third] = v2.design.cabinets.map(value => value.id)
    v2 = assignCabinetsV2(v2, 'receiver-1', [first!, second!])
    v2 = assignCabinetsV2(v2, 'receiver-2', [third!])
    v2 = { ...v2, hardware: { ...v2.hardware, assignments: v2.hardware.assignments.map(value =>
      value.target.cabinetId === first ? { ...value, locked: false, origin: 'manual' as const } : value) } }
    const assignment = v2.hardware.assignments.find(value => value.target.cabinetId === first)!
    const sourceId = v2.operations.signalRoutes.find(value => value.receiverId === 'receiver-1')!.id
    const targetId = v2.operations.signalRoutes.find(value => value.receiverId === 'receiver-2')!.id
    expect(moveCabinetToReceiverV2(v2, first!, 'receiver-1')).toBe(v2)
    const moved = moveCabinetToReceiverV2(v2, first!, 'receiver-2')
    expect(moved.hardware.assignments.find(value => value.id === assignment.id)).toEqual({ ...assignment, receiverId: 'receiver-2' })
    expect(moved.operations.signalRoutes.find(value => value.receiverId === 'receiver-1')).toMatchObject({ id: sourceId, orderedCabinetIds: [second] })
    expect(moved.operations.signalRoutes.find(value => value.receiverId === 'receiver-2')).toMatchObject({ id: targetId, orderedCabinetIds: [third, first] })
    expect(moved.hardware.processorOrder).toBe(v2.hardware.processorOrder)
    expect(moved.hardware.receiverOrder).toBe(v2.hardware.receiverOrder)
    expect(moved.design).toBe(v2.design)
    expectRoutesMatchAssignments(moved)
    const back = moveCabinetToReceiverV2(moved, first!, 'receiver-1')
    expect(chainFor(back, 'receiver-1')).toEqual([second, first])
    expect(chainFor(back, 'receiver-2')).toEqual([third])
    expect(back.hardware.assignments.find(value => value.id === assignment.id)).toEqual(assignment)
  })

  it('removes an empty source route and creates a canonical target route for first assignment', () => {
    let v2 = withReceivers(2)
    const cabinet = v2.design.cabinets[0]!.id
    v2 = assignCabinetsV2(v2, 'receiver-1', [cabinet])
    const moved = moveCabinetToReceiverV2(v2, cabinet, 'receiver-2')
    expect(moved.operations.signalRoutes).toHaveLength(1)
    expect(moved.operations.signalRoutes[0]).toMatchObject({
      id: asSignalRouteId('route:10:receiver-2'), receiverId: 'receiver-2', orderedCabinetIds: [cabinet],
    })
    expectRoutesMatchAssignments(moved)
  })

  it('rejects an over-capacity or invalid transfer without source removal or partial assignment change', () => {
    let v2 = withReceivers(2)
    const [first, second] = v2.design.cabinets.map(value => value.id)
    v2 = assignCabinetsV2(v2, 'receiver-1', [first!])
    v2 = assignCabinetsV2(v2, 'receiver-2', [second!])
    const pixels = v2.design.cabinets[1]!.pixelWidth * v2.design.cabinets[1]!.pixelHeight
    v2 = updateReceiverV2(v2, 'receiver-2', { pixelCapacity: pixels })
    const session = { ...createProjectSession('document-1'), project: v2 }
    expect(() => commitProjectV2(session, source => moveCabinetToReceiverV2(source, first!, 'receiver-2'))).toThrow(/Receiver pixels/)
    expect(() => commitProjectV2(session, source => moveCabinetToReceiverV2(source, first!, 'missing'))).toThrow(/Unknown Receiver/)
    expect(session.project).toBe(v2)
    expect(session.revision).toBe(0)
    expect(chainFor(v2, 'receiver-1')).toEqual([first])
    expectRoutesMatchAssignments(v2)
  })

  it('preserves manually reordered fixed prefix through Auto Allocate, including unlocked assignments', () => {
    let v2 = withReceivers(8)
    const [first, fourth, seventh] = [v2.design.cabinets[0]!.id, v2.design.cabinets[3]!.id, v2.design.cabinets[6]!.id]
    v2 = assignCabinetsV2(v2, 'receiver-1', [fourth, first, seventh])
    v2 = { ...v2, hardware: { ...v2.hardware, assignments: v2.hardware.assignments.map(value =>
      value.target.cabinetId === first ? { ...value, locked: false, origin: 'manual' as const } : value) } }
    const assignment = v2.hardware.assignments.find(value => value.target.cabinetId === first)!
    const preview = previewHardwareAllocationV2(v2)
    expect(preview.topology.receivers[0]?.cabinets.slice(0, 3)).toEqual([fourth, first, seventh])
    const allocated = applyHardwareAllocationV2(v2, preview)
    expect(chainFor(allocated, 'receiver-1').slice(0, 3)).toEqual([fourth, first, seventh])
    expect(allocated.hardware.assignments.find(value => value.target.cabinetId === first)).toEqual(assignment)
    expectRoutesMatchAssignments(allocated)
  })

  it('applies partial allocation as one undoable transaction and retains it through save/load', () => {
    const original = withReceivers(1)
    const cabinet = original.design.cabinets[0]!
    const project = updateReceiverV2(original, 'receiver-1', { pixelCapacity: cabinet.pixelWidth * cabinet.pixelHeight })
    const plan = previewHardwareAllocationV2(project)
    expect(plan.unpatched.length).toBeGreaterThan(0)
    expect(plan.project.hardware.assignments.length).toBeGreaterThan(0)
    const document = new ProjectDocumentController(() => 'partial-document')
    document.replace({ ...createProjectSession('partial-document'), project })
    document.transactV2(source => applyHardwareAllocationV2(source, plan))
    expect(document.historyDepth).toBe(1)
    const allocated = document.session.project
    expectRoutesMatchAssignments(allocated)
    expect(allocated.hardware.assignments.every(value => value.origin === 'auto' && !value.locked)).toBe(true)
    const reopened = loadProjectSession(serializeProjectSession(document.session), 'partial.ledmap', 'reopened')
    expect(reopened.project).toEqual(allocated)
    expect(previewHardwareAllocationV2(reopened.project).unpatched).toEqual(plan.unpatched)
    expect(document.undo()).toBe(true)
    expect(document.session.project).toEqual(project)
    expect(document.redo()).toBe(true)
    expect(document.session.project).toEqual(allocated)
  })

  it('rejects tampered allocation intent and unpatched lists without publishing a transaction', () => {
    const original = withReceivers(1)
    const cabinet = original.design.cabinets[0]!
    const project = updateReceiverV2(original, 'receiver-1', { pixelCapacity: cabinet.pixelWidth * cabinet.pixelHeight })
    const plan = previewHardwareAllocationV2(project)
    const session = { ...createProjectSession('tampered'), project }
    const changedIntent = { ...plan, project: { ...plan.project, hardware: { ...plan.project.hardware,
      assignments: plan.project.hardware.assignments.map(value => ({ ...value, locked: true })),
    } } }
    expect(() => commitProjectV2(session, source => applyHardwareAllocationV2(source, changedIntent))).toThrow(/stale/)
    expect(() => commitProjectV2(session, source => applyHardwareAllocationV2(source, { ...plan, unpatched: [] }))).toThrow(/stale/)
    expect(session.project).toBe(project)
    expect(session.revision).toBe(0)
  })

  it('blocks applying a preserved overloaded manual assignment while keeping it assigned', () => {
    let project = withReceivers(1)
    const id = project.design.cabinets[0]!.id
    project = assignCabinetsV2(project, 'receiver-1', [id])
    project = { ...project, hardware: { ...project.hardware,
      receivers: project.hardware.receivers.map(receiver => ({ ...receiver, pixelCapacity: 1 })),
    } }
    const plan = previewHardwareAllocationV2(project)
    expect(plan.project.hardware.assignments).toEqual(project.hardware.assignments)
    expect(plan.unpatched).not.toContain(id)
    expect(() => applyHardwareAllocationV2(project, plan)).toThrow(/uses .* of 1 pixels/)
  })

  it('marks explicit reassignment of auto intent as manual while preserving its identity', () => {
    let project = withReceivers(2)
    project = applyHardwareAllocationV2(project, previewHardwareAllocationV2(project))
    const assignment = project.hardware.assignments[0]!
    const manual = assignCabinetsV2(project, assignment.receiverId, [assignment.target.cabinetId])
    expect(manual.hardware.assignments.find(value => value.id === assignment.id)).toMatchObject({
      locked: true, origin: 'manual', receiverId: assignment.receiverId,
    })
    const planned = previewHardwareAllocationV2(manual)
    expect(planned.project.hardware.assignments.find(value => value.id === assignment.id)).toEqual(
      manual.hardware.assignments.find(value => value.id === assignment.id),
    )
  })
})

function chainFor(project: LedMapProjectV2, receiverId: string): readonly string[] {
  return project.operations.signalRoutes.find(route => route.receiverId === receiverId)?.orderedCabinetIds ?? []
}
