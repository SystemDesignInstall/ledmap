import { describe, expect, it } from 'vitest'
import {
  convertEditableProjectToV2, createProjectV2, editableProjectFromValidatedProject, planProjectHardware,
  selectProjectHardwareLoad, validateProject, validateCapacityProfile, type HardwareCapacityProfile,
} from '../../src/index.js'
import { referenceMapping } from '../mapping-engine/fixtures.js'

const profile: HardwareCapacityProfile = { name: 'Declared test mode',
  source: { kind: 'manual', reference: 'Synthetic acceptance fixture', revision: '1' },
  mode: { frameRateHz: 59.94, bitDepth: 10, linkRateGbps: 5 }, portPixelCapacity: 150000, processorPixelCapacity: 250000 }

function base(value: HardwareCapacityProfile = profile) {
  const project = convertEditableProjectToV2(editableProjectFromValidatedProject({ mapping: referenceMapping(), rules: [] }))
  return createProjectV2({ ...project, hardware: { ...project.hardware,
    receivers: project.hardware.receivers.map(receiver => ({ ...receiver, pixelCapacity: 65536 })),
    processors: project.hardware.processors.map(processor => ({ ...processor, capacityProfile: value })),
  } })
}

describe('project capacity profile intent and loads', () => {
  it('rolls up actual REF-001 assignments independently from signal mode metadata', () => {
    const project = base()
    const load = selectProjectHardwareLoad(project)
    expect(load.processors[0]).toMatchObject({ used: 196608, capacity: 250000, headroom: 53392 })
    expect(load.ports.map(port => [port.used, port.capacity, port.headroom])).toEqual([
      [131072, 150000, 18928], [65536, 150000, 84464], [0, 150000, 150000], [0, 150000, 150000],
    ])
    expect(validateProject({ project }).diagnostics.some(issue => issue.code === 'HARDWARE_TRANSPORT_CAPACITY_UNKNOWN')).toBe(false)
    expect(project.hardware.processors[0]!.capacityProfile).not.toBe(profile)
    expect(Object.isFrozen(project.hardware.processors[0]!.capacityProfile!.mode)).toBe(true)
    expect(Object.isFrozen(profile.mode)).toBe(false)
  })

  it('retains independently overloaded Port and Processor assignments with negative headroom', () => {
    const project = base({ ...profile, portPixelCapacity: 100000, processorPixelCapacity: 150000 })
    const load = selectProjectHardwareLoad(project)
    expect(load.ports[0]!.headroom).toBe(-31072)
    expect(load.processors[0]!.headroom).toBe(-46608)
    const codes = validateProject({ project }).diagnostics.map(issue => issue.code)
    expect(codes).toContain('HARDWARE_PORT_PIXEL_OVER_CAPACITY')
    expect(codes).toContain('HARDWARE_PROCESSOR_PIXEL_OVER_CAPACITY')
    expect(project.hardware.assignments).toHaveLength(12)
    expect(planProjectHardware(project).project).toBe(project)
  })

  it('fills only whole Cabinets within both cumulative limits and preserves manual intent', () => {
    const original = base({ ...profile, portPixelCapacity: 32768, processorPixelCapacity: 49152 })
    const first = original.hardware.assignments[0]!
    const project = createProjectV2({ ...original, hardware: { ...original.hardware, assignments: [{ ...first, locked: true, origin: 'manual' }] },
      operations: { ...original.operations, signalRoutes: [{ ...original.operations.signalRoutes[0]!, orderedCabinetIds: [first.target.cabinetId] }] } })
    const result = planProjectHardware(project)
    expect(result.project.hardware.assignments).toHaveLength(3)
    expect(result.project.hardware.assignments[0]).toEqual(project.hardware.assignments[0])
    expect(result.project.operations.signalRoutes[0]!.orderedCabinetIds.slice(0, 1)).toEqual([first.target.cabinetId])
    expect(result.unpatched).toHaveLength(9)
    expect(result.load.processors[0]).toMatchObject({ used: 49152, headroom: 0 })
    expect(result.load.ports.map(port => port.used)).toEqual([32768, 16384, 0, 0])
    expect(result.unpatched.every(id => !result.project.hardware.assignments.some(value => value.target.cabinetId === id))).toBe(true)
  })

  it('does not infer a configured unknown limit or interpolate other modes', () => {
    const partial = { name: profile.name, source: profile.source, mode: profile.mode, processorPixelCapacity: profile.processorPixelCapacity! }
    const original = base(partial)
    const project = createProjectV2({ ...original, hardware: { ...original.hardware, assignments: [] },
      operations: { ...original.operations, signalRoutes: [] } })
    const plan = planProjectHardware(project)
    expect(plan.unpatched).toHaveLength(12)
    expect(plan.load.ports.every(port => port.capacity === null)).toBe(true)
    expect(validateProject({ project: original }).diagnostics).toContainEqual(expect.objectContaining({ code: 'HARDWARE_TRANSPORT_CAPACITY_UNKNOWN' }))
  })

  it('uses an explicit override only in its recorded mode and retains inactive data', () => {
    const original = base()
    const withOverride = createProjectV2({ ...original, hardware: { ...original.hardware,
      ports: original.hardware.ports.map((port, index) => index === 0 ? { ...port,
        pixelCapacityOverride: { pixelCapacity: 140000, reason: 'Operator reservation', mode: profile.mode } } : port),
    } })
    expect(selectProjectHardwareLoad(withOverride).ports[0]!.capacity).toBe(140000)
    const changed = createProjectV2({ ...withOverride, hardware: { ...withOverride.hardware,
      processors: withOverride.hardware.processors.map(processor => ({ ...processor,
        capacityProfile: { ...profile, mode: { ...profile.mode, frameRateHz: 60 } } })),
    } })
    expect(selectProjectHardwareLoad(changed).ports[0]!.capacity).toBe(150000)
    expect(changed.hardware.ports[0]!.pixelCapacityOverride).toEqual(withOverride.hardware.ports[0]!.pixelCapacityOverride)
    expect(validateProject({ project: changed }).diagnostics).toContainEqual(expect.objectContaining({ code: 'HARDWARE_CAPACITY_OVERRIDE_INACTIVE' }))
  })

  it.each([0, -1, 1.5, Infinity, Number.MAX_SAFE_INTEGER + 1])('rejects invalid pixel limits %s', value => {
    expect(() => validateCapacityProfile({ ...profile, portPixelCapacity: value })).toThrow(/positive safe integer/)
  })

  it.each([{ frameRateHz: 0 }, { frameRateHz: NaN }, { frameRateHz: 1001 }, { bitDepth: 9 }, { linkRateGbps: 2 }])('rejects invalid modes %j', patch => {
    expect(() => validateCapacityProfile({ ...profile, mode: { ...profile.mode, ...patch } } as HardwareCapacityProfile)).toThrow(/Capacity mode/)
  })

  it('rejects unknown fields and getters without executing them', () => {
    let calls = 0
    const mode = { ...profile.mode }
    Object.defineProperty(mode, 'derivedPixels', { enumerable: true, get: () => { calls += 1; return 100 } })
    expect(() => validateCapacityProfile({ ...profile, mode })).toThrow(/unsupported field/)
    expect(calls).toBe(0)
    expect(() => validateCapacityProfile({ ...profile, source: { ...profile.source, kind: 'manufacturer', reference: 'javascript:alert(1)' } })).toThrow(/HTTPS/)
  })
})
