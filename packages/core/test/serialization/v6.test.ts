import { describe, expect, it } from 'vitest'
import { createProjectV2, loadLedMapProject, loadProjectV3, loadProjectV5, loadProjectV6,
  serializeProjectV3, serializeProjectV4, serializeProjectV5, serializeProjectV6 } from '../../src/index.js'
import fullV3 from './fixtures/full-v3.ledmap?raw'

function fixture() {
  const legacy = loadProjectV3(fullV3)
  const mode = { frameRateHz: 60, bitDepth: 8 as const, linkRateGbps: 1 as const }
  return createProjectV2({ ...legacy.project, hardware: { ...legacy.project.hardware,
    processors: legacy.project.hardware.processors.map(value => ({ ...value, capacityProfile: { name: 'Own test profile',
      source: { kind: 'manual' as const, reference: 'Synthetic limits', revision: '1' }, mode, portPixelCapacity: 1000000, processorPixelCapacity: 2000000 } })),
    ports: legacy.project.hardware.ports.map(value => ({ ...value, pixelCapacityOverride: { pixelCapacity: 900000, reason: 'Reserved bandwidth', mode } })),
  } })
}

describe('schema-v6 capacity persistence', () => {
  it('round-trips only intent with stable bytes and immutable independent copies', () => {
    const project = fixture()
    const text = serializeProjectV6({ project, extensions: { untouched: { value: 7 } } })
    const loaded = loadLedMapProject(text)
    expect(loaded.sourceSchemaVersion).toBe(6)
    expect(loaded.project).toEqual(project)
    expect(serializeProjectV6({ project: loaded.project, extensions: loaded.extensions })).toBe(text)
    expect(text).not.toMatch(/headroom|assignedPixels|unpatchedPixels|derivedPixels/)
    expect(Object.isFrozen(loaded.project.hardware.ports[0]!.pixelCapacityOverride!.mode)).toBe(true)
    expect(loaded.project).not.toBe(project)
  })

  it.each([serializeProjectV3, serializeProjectV4, serializeProjectV5])('refuses silent downgrade through an older writer', write => {
    expect(() => write({ project: fixture() })).toThrow(/capacityProfile/)
  })

  it('still loads older projects and supports v6 without configured profiles', () => {
    const old = loadLedMapProject(fullV3)
    const v5 = serializeProjectV5({ project: old.project, extensions: old.extensions })
    expect(loadLedMapProject(v5).project).toEqual(old.project)
    expect(loadProjectV6(serializeProjectV6({ project: old.project })).project).toEqual(old.project)
    expect(() => loadProjectV5(serializeProjectV6({ project: fixture() }))).toThrow(/unsupported/)
  })

  it.each(['headroom', '__proto__', 'constructor', 'toString', 'unknown'])('rejects unknown or derived profile fields %s', key => {
    const doc = JSON.parse(serializeProjectV6({ project: fixture() }))
    Object.defineProperty(doc.project.hardware.processors[0].capacityProfile, key, { value: 42, enumerable: true })
    expect(() => loadProjectV6(JSON.stringify(doc))).toThrow(/unknown fields/)
  })

  it.each([3, 5])('also rejects prototype-like unknown fields in the v%s payload', version => {
    const original = loadProjectV3(fullV3)
    const doc = JSON.parse(version === 3 ? fullV3 : serializeProjectV5({ project: original.project }))
    Object.defineProperty(doc.project.hardware.processors[0], '__proto__', { value: {}, enumerable: true })
    expect(() => loadLedMapProject(JSON.stringify(doc))).toThrow(/unknown fields/)
  })

  it.each([null, 0, -1, 0.1])('rejects invalid saved pixel limits %s', value => {
    const doc = JSON.parse(serializeProjectV6({ project: fixture() }))
    doc.project.hardware.processors[0].capacityProfile.portPixelCapacity = value
    expect(() => loadLedMapProject(JSON.stringify(doc))).toThrow()
  })

  it('rejects invalid domain modes and runtime accessors', () => {
    const project = fixture()
    const doc = JSON.parse(serializeProjectV6({ project }))
    doc.project.hardware.processors[0].capacityProfile.mode.bitDepth = 9
    expect(() => loadProjectV6(JSON.stringify(doc))).toThrow(/Capacity mode/)
    let calls = 0
    const input = { project }
    Object.defineProperty(input, 'extensions', { enumerable: true, get: () => { calls += 1; return {} } })
    expect(() => serializeProjectV6(input)).toThrow()
    expect(calls).toBe(0)
  })
})
