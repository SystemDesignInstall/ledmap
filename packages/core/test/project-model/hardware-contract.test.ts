import { describe, expect, it } from 'vitest'
import {
  asHardwareAssignmentId,
  asPortId,
  asReceiverId,
  asSignalRouteId,
  convertEditableProjectToV2,
  createProjectV2,
  type LedMapProjectV2,
} from '../../src/index.js'
import { fullEditableProject } from '../serialization/editor-fixtures.js'

function base(): LedMapProjectV2 {
  return convertEditableProjectToV2(fullEditableProject())
}

describe('Project Model v2 HardwareAssignment and SignalRoute contract', () => {
  it('rejects a Cabinet assigned to two Receivers', () => {
    const project = base()
    const receiver = project.hardware.receivers[0]!
    const secondId = asReceiverId('receiver-second')
    expect(() => createProjectV2({
      ...project,
      hardware: {
        ...project.hardware,
        receivers: [...project.hardware.receivers, { ...receiver, id: secondId }],
        assignments: [
          ...project.hardware.assignments,
          { ...project.hardware.assignments[0]!, id: asHardwareAssignmentId('assignment-second'), receiverId: secondId },
        ],
      },
    })).toThrow(/PROJECT_DUPLICATE_CABINET_ASSIGNMENT/)
  })

  it('rejects a duplicate Cabinet in a SignalRoute', () => {
    const project = base()
    const route = project.operations.signalRoutes[0]!
    expect(() => createProjectV2({
      ...project,
      operations: { ...project.operations, signalRoutes: [{
        ...route, orderedCabinetIds: [route.orderedCabinetIds[0]!, route.orderedCabinetIds[0]!],
      }] },
    })).toThrow(/PROJECT_DUPLICATE_ROUTE_CABINET/)
  })

  it('rejects a routed Cabinet without assignment to that Receiver', () => {
    const project = base()
    expect(() => createProjectV2({
      ...project,
      hardware: { ...project.hardware, assignments: [] },
    })).toThrow(/PROJECT_ROUTE_ASSIGNMENT_MISMATCH/)
  })

  it('rejects an assigned Cabinet missing from its route', () => {
    const project = base()
    const route = project.operations.signalRoutes[0]!
    expect(() => createProjectV2({
      ...project,
      operations: { ...project.operations, signalRoutes: [{ ...route, orderedCabinetIds: [] }] },
    })).toThrow(/PROJECT_ROUTE_ASSIGNMENT_MISMATCH/)
  })

  it('rejects two canonical routes for one Receiver', () => {
    const project = base()
    const route = project.operations.signalRoutes[0]!
    expect(() => createProjectV2({
      ...project,
      operations: { ...project.operations, signalRoutes: [
        route, { ...route, id: asSignalRouteId('second-route') },
      ] },
    })).toThrow(/PROJECT_DUPLICATE_RECEIVER_ROUTE/)
  })

  it('rejects a Receiver listed under another Port', () => {
    const project = base()
    const port = project.hardware.ports[0]!
    const anotherPort = { ...port, id: asPortId('another-port'), index: port.index + 1 }
    expect(() => createProjectV2({
      ...project,
      hardware: {
        ...project.hardware,
        ports: [...project.hardware.ports, anotherPort],
        receiverOrder: [{ portId: anotherPort.id, receiverIds: [project.hardware.receivers[0]!.id] }],
      },
    })).toThrow(/PROJECT_RECEIVER_ORDER_PARENT_MISMATCH/)
  })

  it.each(['same order', 'different orders'])('rejects a duplicate Receiver in %s', variant => {
    const project = base()
    const order = project.hardware.receiverOrder[0]!
    const receiverId = order.receiverIds[0]!
    const receiverOrder = variant === 'same order'
      ? [{ ...order, receiverIds: [receiverId, receiverId] }]
      : [order, { portId: asPortId('another-port'), receiverIds: [receiverId] }]
    const ports = variant === 'same order'
      ? project.hardware.ports
      : [...project.hardware.ports, { ...project.hardware.ports[0]!, id: asPortId('another-port'), index: 1 }]
    expect(() => createProjectV2({
      ...project,
      hardware: { ...project.hardware, ports, receiverOrder },
    })).toThrow(/PROJECT_DUPLICATE_ORDERED_RECEIVER/)
  })

  it('rejects an assignment without any route', () => {
    const project = base()
    expect(() => createProjectV2({
      ...project,
      operations: { ...project.operations, signalRoutes: [] },
    })).toThrow(/PROJECT_ROUTE_ASSIGNMENT_MISMATCH/)
  })

  it('keeps Receiver legacyIndex independent of Receiver order', () => {
    const project = base()
    const changed = createProjectV2({
      ...project,
      hardware: {
        ...project.hardware,
        receivers: project.hardware.receivers.map(receiver => ({ ...receiver, legacyIndex: 99 })),
      },
    })
    expect(changed.hardware.receiverOrder).toEqual(project.hardware.receiverOrder)
    expect(changed.hardware.receivers[0]?.legacyIndex).toBe(99)
  })
})
