import { describe, expect, it } from 'vitest'
import {
  createEmptyProjectV2, inspectProjectV2Readiness, loadProjectV3, parseProjectV3Document,
  serializeProjectV3, type LedMapProjectV2,
} from '../../src/index.js'
import { deletePath, setPath } from './fixtures.js'
import fullText from './fixtures/full-v3.ledmap?raw'
import minimalText from './fixtures/minimal-v3.ledmap?raw'


function changed(path: readonly (string | number)[], value: unknown): string {
  const document = JSON.parse(fullText) as Record<string, unknown>
  setPath(document, value, ...path)
  return JSON.stringify(document)
}

describe('native schema-v3 persistence', () => {
  it('loads a hand-authored full-v3 fixture and preserves every field, identity and order', () => {
    const original = parseProjectV3Document(fullText)
    const loaded = loadProjectV3(fullText)
    expect(loaded.sourceSchemaVersion).toBe(3)
    expect(loaded.project.hardware.processorOrder).toEqual(['processor-b', 'processor-a'])
    expect(loaded.project.hardware.receiverOrder.map(value => value.portId)).toEqual(['port-b', 'port-a'])
    expect(loaded.project.operations.signalRoutes[0]?.orderedCabinetIds).toEqual(['cabinet-b', 'cabinet-a'])
    expect(loaded.project.hardware.assignments.map(value => value.id)).toEqual(['assignment-a', 'assignment-b'])
    expect(loaded.project.design.stage?.placements[0]?.positionMm.y).toBe(-2.25)
    expect(loaded.project.content.outputMappings[0]?.mask?.points).toHaveLength(3)
    const first = serializeProjectV3({ project: loaded.project, extensions: loaded.extensions })
    const reopened = loadProjectV3(first)
    const second = serializeProjectV3({ project: reopened.project, extensions: reopened.extensions })
    expect(second).toBe(first)
    expect(parseProjectV3Document(first).project).toEqual(original.project)
    expect(parseProjectV3Document(first).extensions).toEqual(original.extensions)
    expect(loadProjectV3(first).project).toEqual(loaded.project)
    expect(first.startsWith('\uFEFF')).toBe(false)
    expect(first).toMatch(/^\{\n  "format"/)
    expect(first).toMatch(/\n\}\n$/)
    expect(first.endsWith('\n\n')).toBe(false)
  })

  it('loads minimal v3 and serializes a new empty V2 document directly', () => {
    expect(loadProjectV3(minimalText).project).toEqual(createEmptyProjectV2())
    expect(loadProjectV3(serializeProjectV3({ project: createEmptyProjectV2() })).project).toEqual(createEmptyProjectV2())
  })

  it('rejects malformed wire fields, unknown fields and unsupported future versions', () => {
    expect(() => loadProjectV3(changed(['project', 'design', 'screens', 0, 'resolution', 'width'], 1.5)))
      .toThrow(/SERIALIZATION_INVALID_SCHEMA/)
    expect(() => loadProjectV3(changed(['project', 'content', 'outputMappings', 0, 'future'], true)))
      .toThrow(/SERIALIZATION_INVALID_SCHEMA/)
    expect(() => loadProjectV3(changed(['schemaVersion'], 4))).toThrow(/SERIALIZATION_UNSUPPORTED_VERSION/)
    expect(() => loadProjectV3(`\uFEFF${fullText}`)).toThrow(/SERIALIZATION_INVALID_JSON/)
    expect(() => loadProjectV3(fullText.replace('"schemaVersion": 3,', '"schemaVersion": 3, "schemaVersion": 3,')))
      .toThrow(/SERIALIZATION_DUPLICATE_KEY/)
    const withMissing = JSON.parse(fullText) as Record<string, unknown>
    deletePath(withMissing, 'project', 'hardware', 'assignments')
    expect(() => loadProjectV3(JSON.stringify(withMissing))).toThrow(/SERIALIZATION_INVALID_SCHEMA/)
  })

  it.each([
    [['project', 'design', 'stage', 'placements', 0, 'screenId'], 'missing-screen'],
    [['project', 'content', 'outputMappings', 0, 'mediaOutputId'], 'missing-output'],
    [['project', 'hardware', 'processorOrder', 0], 'missing-processor'],
    [['project', 'operations', 'backupRoutes', 0, 'id'], 'backup-a'],
  ] as const)('rejects broken engineering references or identities at %j', (path, value) => {
    const text = changed(path, value)
    if (path[1] === 'operations') {
      const document = JSON.parse(text) as Record<string, unknown>
      setPath(document, [{ id: 'backup-a' }, { id: 'backup-a' }], 'project', 'operations', 'backupRoutes')
      expect(() => loadProjectV3(JSON.stringify(document))).toThrow(/SERIALIZATION_PROJECT_INVALID/)
    } else {
      expect(() => loadProjectV3(text)).toThrow(/SERIALIZATION_PROJECT_INVALID/)
    }
  })

  it('accepts editable readiness-only Mapping and Hardware states', () => {
    const document = JSON.parse(fullText) as Record<string, unknown>
    setPath(document, { x: 1, y: 0 }, 'project', 'content', 'mappingRegions', 0, 'position')
    setPath(document, [], 'project', 'hardware', 'assignments')
    setPath(document, [], 'project', 'operations', 'signalRoutes')
    const loaded = loadProjectV3(JSON.stringify(document))
    const codes = inspectProjectV2Readiness(loaded.project).map(value => value.code)
    expect(codes).toContain('MAPPING_OUT_OF_RANGE')
    expect(codes.length).toBeGreaterThan(1)
  })

  it('rejects extra runtime Project fields instead of silently omitting source data', () => {
    const project = { ...createEmptyProjectV2(), future: { value: 1 } } as unknown as LedMapProjectV2
    expect(() => serializeProjectV3({ project })).toThrow(/SERIALIZATION_INVALID_INPUT/)
  })
})
