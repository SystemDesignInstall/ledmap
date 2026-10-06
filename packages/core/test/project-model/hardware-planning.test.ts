import { describe, expect, it } from 'vitest'
import {
  asCabinetId, asHardwareAssignmentId, asReceiverId, convertEditableProjectToV2, createProjectV2,
  editableProjectFromValidatedProject, loadProjectV5, planProjectHardware, selectProjectCabinetSignalOrder,
  selectProjectHardwareLoad, serializeProjectV5, validateProject, type LedMapProjectV2,
} from '../../src/index.js'
import { referenceMapping } from '../mapping-engine/fixtures.js'

function base(capacity = 65536): LedMapProjectV2 {
  const project = convertEditableProjectToV2(editableProjectFromValidatedProject({ mapping: referenceMapping(), rules: [] }))
  return createProjectV2({ ...project, hardware: { ...project.hardware,
    receivers: project.hardware.receivers.map(receiver => ({ ...receiver, pixelCapacity: capacity })) } })
}

function unpatched(capacity = 65536): LedMapProjectV2 {
  const project = base(capacity)
  return createProjectV2({ ...project, hardware: { ...project.hardware, assignments: [] },
    operations: { ...project.operations, signalRoutes: [] } })
}

describe('project-bound Hardware planning and validation', () => {
  it('uses REF-001 physical identities, snake order and actual assignments', () => {
    const project = base()
    expect(project.design.cabinets.map(cabinet => cabinet.id)).toEqual(Array.from({ length: 12 }, (_, index) => `C${String(index + 1).padStart(2, '0')}`))
    expect(selectProjectCabinetSignalOrder(project)).toEqual(['C01', 'C02', 'C03', 'C04', 'C08', 'C07', 'C06', 'C05', 'C09', 'C10', 'C11', 'C12'])
    const load = selectProjectHardwareLoad(project)
    expect(load).toMatchObject({ totalPixels: 196608, assignedPixels: 196608, unpatchedPixels: 0, unpatched: [] })
    expect(load.receivers.map(receiver => [receiver.used, receiver.capacity, receiver.headroom])).toEqual([
      [65536, 65536, 0], [65536, 65536, 0], [65536, 65536, 0],
    ])
    expect(load.ports.map(port => port.used)).toEqual([131072, 65536, 0, 0])
    expect(load.processors[0]).toMatchObject({ used: 196608, capacity: null, headroom: null, portsUsed: 4, portCapacity: 4 })
    expect(validateProject({ project }).valid).toBe(true)
    expect(validateProject({ project }).diagnostics).toContainEqual(expect.objectContaining({
      code: 'HARDWARE_TRANSPORT_CAPACITY_UNKNOWN', severity: 'warning',
    }))
  })

  it('fills REF-001 with deterministic routes and explicit auto intent without mutation', () => {
    const project = unpatched()
    const before = serializeProjectV5({ project })
    const plan = planProjectHardware(project)
    expect(plan.unpatched).toEqual([])
    expect(plan.project.operations.signalRoutes.map(route => route.orderedCabinetIds)).toEqual([
      ['C01', 'C02', 'C03', 'C04'], ['C08', 'C07', 'C06', 'C05'], ['C09', 'C10', 'C11', 'C12'],
    ])
    expect(plan.project.hardware.assignments.every(assignment => !assignment.locked && assignment.origin === 'auto')).toBe(true)
    expect(planProjectHardware(project)).toEqual(plan)
    expect(serializeProjectV5({ project })).toBe(before)
    expect(Object.isFrozen(plan.project.hardware.assignments)).toBe(true)
    expect(Object.isFrozen(plan.load.receivers[0]?.cabinetIds)).toBe(true)
  })

  it('leaves insufficient capacity unpatched and never places the same Cabinet in both sets', () => {
    const plan = planProjectHardware(unpatched(16384))
    const assigned = new Set(plan.project.hardware.assignments.map(assignment => assignment.target.cabinetId))
    expect(assigned.size).toBe(3)
    expect(plan.unpatched).toHaveLength(9)
    expect(plan.unpatched.every(id => !assigned.has(id))).toBe(true)
    expect(plan.load).toMatchObject({ assignedPixels: 49152, unpatchedPixels: 147456 })
    const issues = validateProject({ project: plan.project }).diagnostics
    expect(issues.filter(issue => issue.code === 'HARDWARE_UNPATCHED')).toHaveLength(9)
    expect(issues.some(issue => issue.code.includes('OVER_CAPACITY'))).toBe(false)
    expect(planProjectHardware(plan.project).project).toBe(plan.project)
  })

  it('skips an oversized Cabinet and still places later smaller Cabinets using their real pixel sizes', () => {
    const original = unpatched(16384)
    const id = original.design.cabinets[0]!.id
    const project = createProjectV2({ ...original, design: { ...original.design,
      cabinets: original.design.cabinets.map(cabinet => cabinet.id === id ? { ...cabinet, pixelWidth: 256 } : cabinet),
      modules: original.design.modules.map(module => module.cabinetId === id ? { ...module, pixelWidth: 64 } : module),
    } })
    const plan = planProjectHardware(project)
    expect(plan.unpatched).toContain(id)
    expect(plan.project.hardware.assignments.map(assignment => assignment.target.cabinetId)).toEqual(['C02', 'C03', 'C04'])
    expect(plan.load.totalPixels).toBe(212992)
    expect(plan.load.assignedPixels + plan.load.unpatchedPixels).toBe(plan.load.totalPixels)
  })

  it('keeps overloaded fixed assignments assigned and diagnoses each Receiver independently', () => {
    const project = base(1)
    const plan = planProjectHardware(project)
    expect(plan.project).toBe(project)
    expect(plan.unpatched).toEqual([])
    expect(plan.load.receivers.every(receiver => receiver.headroom === -65535)).toBe(true)
    const issues = validateProject({ project }).diagnostics
    expect(issues.filter(issue => issue.code === 'HARDWARE_RECEIVER_OVER_CAPACITY')).toHaveLength(3)
    expect(issues.some(issue => issue.code === 'HARDWARE_UNPATCHED')).toBe(false)
  })

  it('preserves unlocked manual metadata and manually ordered route prefixes through save/load and rerun', () => {
    const original = base()
    const retained = original.hardware.assignments.slice(0, 2).map(assignment => ({ ...assignment, locked: false, origin: 'manual' as const }))
    const route = original.operations.signalRoutes[0]!
    const project = createProjectV2({ ...original, hardware: { ...original.hardware, assignments: retained },
      operations: { ...original.operations, signalRoutes: [{ ...route, orderedCabinetIds: retained.map(assignment => assignment.target.cabinetId).reverse() }] } })
    const plan = planProjectHardware(project)
    expect(plan.project.hardware.assignments.slice(0, 2)).toEqual(retained)
    expect(plan.project.operations.signalRoutes[0]?.orderedCabinetIds.slice(0, 2)).toEqual(['C02', 'C01'])
    expect(plan.project.operations.signalRoutes[0]?.id).toBe(route.id)
    const text = serializeProjectV5({ project: plan.project })
    expect(text).not.toMatch(/headroom|unpatchedPixels|assignedPixels|diagnostics/)
    const reopened = loadProjectV5(text).project
    expect(reopened).toEqual(plan.project)
    expect(planProjectHardware(reopened).project).toBe(reopened)
  })

  it('keeps unknown Receiver capacity unknown and excludes it from automatic placement', () => {
    const original = unpatched()
    const receivers = original.hardware.receivers.map(receiver => ({ id: receiver.id, legacyIndex: receiver.legacyIndex,
      processorId: receiver.processorId, portId: receiver.portId }))
    const project = createProjectV2({ ...original, hardware: { ...original.hardware, receivers } })
    const plan = planProjectHardware(project)
    expect(plan.project.hardware.assignments).toEqual([])
    expect(plan.unpatched).toHaveLength(12)
    expect(plan.load.receivers.every(receiver => receiver.capacity === null && receiver.headroom === null)).toBe(true)
    expect(validateProject({ project }).diagnostics.filter(issue => issue.code === 'HARDWARE_CAPACITY_UNKNOWN')).toHaveLength(3)
  })

  it('uses non-positional Cabinet IDs and avoids generated intent ID collisions', () => {
    const original = unpatched()
    const renamed = asCabinetId('physical / cabinet : A')
    const oldId = original.design.cabinets[0]!.id
    const fixed = original.design.cabinets[1]!.id
    const receiverId = original.hardware.receivers[0]!.id
    const collision = asHardwareAssignmentId(`assignment:${renamed.length}:${renamed}`)
    const project = createProjectV2({ ...original, design: { ...original.design,
      cabinets: original.design.cabinets.map(cabinet => cabinet.id === oldId ? { ...cabinet, id: renamed } : cabinet),
      modules: original.design.modules.map(module => module.cabinetId === oldId ? { ...module, cabinetId: renamed } : module),
    }, hardware: { ...original.hardware, assignments: [{ id: collision, target: { kind: 'cabinet', cabinetId: fixed }, receiverId, locked: true }] },
    operations: { ...original.operations, signalRoutes: [{ ...base().operations.signalRoutes[0]!, orderedCabinetIds: [fixed] }] } })
    const assignments = planProjectHardware(project).project.hardware.assignments
    expect(assignments.find(assignment => assignment.target.cabinetId === renamed)?.id).toBe(`${collision}:1`)
    expect(assignments[0]?.id).toBe(collision)
    expect(new Set(assignments.map(assignment => assignment.id)).size).toBe(assignments.length)
  })

  it.each(['processor', 'receiver'] as const)('reports missing %s order and rejects allocation without it', kind => {
    const original = base()
    const project = { ...original, hardware: { ...original.hardware,
      ...(kind === 'processor' ? { processorOrder: [] } : { receiverOrder: [] }),
    } }
    expect(validateProject({ project }).diagnostics.some(issue => issue.code === 'HARDWARE_INCOMPLETE')).toBe(true)
    expect(() => planProjectHardware(project)).toThrow(/HARDWARE_INCOMPLETE/)
  })

  it.each(['duplicate', 'unknown'] as const)('blocks Hardware checks for %s assignments', kind => {
    const original = base()
    const assignment = original.hardware.assignments[0]!
    const project = { ...original, hardware: { ...original.hardware, assignments: kind === 'duplicate'
      ? [...original.hardware.assignments, { ...assignment, id: asHardwareAssignmentId('duplicate') }]
      : original.hardware.assignments.map(value => value === assignment ? { ...value, receiverId: asReceiverId('missing') } : value),
    } }
    const report = validateProject({ project })
    expect(report.valid).toBe(false)
    expect(report.diagnostics[0]?.code).toBe(kind === 'duplicate' ? 'PROJECT_DUPLICATE_CABINET_ASSIGNMENT' : 'PROJECT_UNKNOWN_RECEIVER')
    expect(report.checks).toContainEqual({ stage: 'hardware', status: 'blocked', blockedBy: 'input' })
  })

  it('reports simultaneous unpatched, Receiver overload and Port slot overload', () => {
    const original = base(1)
    const removed = original.hardware.assignments[0]!.target.cabinetId
    const project = { ...original, hardware: { ...original.hardware,
      ports: original.hardware.ports.map((port, index) => index === 0 ? { ...port, receiverCapacity: 1 } : port),
      assignments: original.hardware.assignments.filter(assignment => assignment.target.cabinetId !== removed),
    }, operations: { ...original.operations, signalRoutes: original.operations.signalRoutes.map(route => ({ ...route,
      orderedCabinetIds: route.orderedCabinetIds.filter(id => id !== removed),
    })) } }
    const issues = validateProject({ project }).diagnostics
    expect(issues.filter(issue => issue.code === 'HARDWARE_UNPATCHED')).toHaveLength(1)
    expect(issues.filter(issue => issue.code === 'HARDWARE_RECEIVER_OVER_CAPACITY')).toHaveLength(3)
    expect(issues.filter(issue => issue.code === 'HARDWARE_PORT_OVER_CAPACITY')).toHaveLength(1)
  })

  it('fails safe on aggregate pixel overflow instead of losing integer precision', () => {
    const original = base()
    const changed = new Set(original.design.cabinets.slice(0, 2).map(cabinet => cabinet.id))
    const project = { ...original, design: { ...original.design,
      cabinets: original.design.cabinets.map(cabinet => changed.has(cabinet.id)
        ? { ...cabinet, pixelWidth: Number.MAX_SAFE_INTEGER, pixelHeight: 1, moduleColumns: 1, moduleRows: 1 } : cabinet),
      modules: original.design.modules.flatMap(module => !changed.has(module.cabinetId) ? [module]
        : module.column === 0 && module.row === 0 ? [{ ...module, width: 128, height: 128, pixelWidth: Number.MAX_SAFE_INTEGER, pixelHeight: 1 }] : []),
    } }
    expect(() => selectProjectHardwareLoad(project)).toThrow(/HARDWARE_OVERFLOW/)
    expect(validateProject({ project }).diagnostics.some(issue => issue.code === 'HARDWARE_OVERFLOW')).toBe(true)
  })

  it('includes unsupported remap rules in the same V2 report', () => {
    const project = { ...base(), remap: { rules: [{ id: 'warp', version: '1', type: 'unsupported' }] } }
    expect(validateProject({ project }).diagnostics).toContainEqual(expect.objectContaining({ stage: 'remap', code: 'REMAP_UNSUPPORTED_RULE' }))
  })
})
