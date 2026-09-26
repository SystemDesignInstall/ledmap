import { describe, expect, it } from 'vitest'
import { migrateProjectDocument, parseProject } from '../../src/index.js'
import { assertFrozen } from '../mapping-engine/fixtures.js'
import { cloneDocument, expectSerializationError, minimalDocument, minimalDocumentV1, minimalGoldenText, setPath } from './fixtures.js'

function documentWith(path: readonly (string | number)[], value: unknown): Record<string, unknown> {
  const document = cloneDocument(minimalDocument())
  setPath(document, value, ...path)
  return document
}

describe('7D envelope discriminator and version dispatch', () => {
  it('accepts current v2 and returns a detached immutable document', () => {
    const document = cloneDocument(minimalDocument())
    const migrated = migrateProjectDocument(document)
    expect(migrated).toEqual(document)
    expect(migrated).not.toBe(document)
    expect(migrated.project).not.toBe(document['project'])
    assertFrozen(migrated)
    expect(Object.isFrozen(document)).toBe(false)
    setPath(document, 'mutated', 'project', 'mapping', 'grid', 'name')
    expect(migrated.project.mapping.grid.name).toBe('Grid')
  })

  it('migrates v1 position and size into the v2 spatial mapping contract', () => {
    const legacy = minimalDocumentV1()
    const migrated = migrateProjectDocument(legacy)
    expect(migrated.schemaVersion).toBe(2)
    expect(migrated.project.mapping.region).toEqual({
      id: 'region', inputCanvas: 'input', screen: 'screen', grid: 'grid',
      inputRect: { x: 0, y: 0, width: 2, height: 3 },
      screenRect: { x: 0, y: 0, width: 2, height: 3 },
      transform: { inputRotation: 0, screenRotation: 0, flipX: false, flipY: false },
    })
    expect(loadableLegacy(legacy)).toEqual(minimalDocument())
  })

  it.each([
    ['LEDMap'],
    ['LedMap'],
    [''],
    [1],
    [null],
    [true],
    [['ledmap']],
  ])('rejects format %s', format => {
    const document = documentWith(['format'], format)
    expectSerializationError(() => migrateProjectDocument(document), 'SERIALIZATION_INVALID_SCHEMA', ['format'])
  })

  it('requires the format field', () => {
    const document = cloneDocument(minimalDocument())
    delete document['format']
    expectSerializationError(() => migrateProjectDocument(document), 'SERIALIZATION_INVALID_SCHEMA', ['format'])
  })

  it.each([
    ['1'],
    [1.5],
    [-1],
    [Number.MAX_SAFE_INTEGER + 2],
    [true],
    [null],
    [['1']],
  ])('rejects schemaVersion %s', version => {
    const document = documentWith(['schemaVersion'], version)
    expectSerializationError(() => migrateProjectDocument(document), 'SERIALIZATION_INVALID_SCHEMA', ['schemaVersion'])
  })

  it('requires the schemaVersion field', () => {
    const document = cloneDocument(minimalDocument())
    delete document['schemaVersion']
    expectSerializationError(() => migrateProjectDocument(document), 'SERIALIZATION_INVALID_SCHEMA', ['schemaVersion'])
  })

  it('rejects a parsed overflow version', () => {
    expectSerializationError(
      () => parseProject(minimalGoldenText.replace('"schemaVersion": 2,', '"schemaVersion": 1e400,')),
      'SERIALIZATION_INVALID_SCHEMA', ['schemaVersion'],
    )
  })

  it.each([0, 3, 99, Number.MAX_SAFE_INTEGER])('rejects unsupported schemaVersion %s', version => {
    const document = documentWith(['schemaVersion'], version)
    expectSerializationError(() => migrateProjectDocument(document), 'SERIALIZATION_UNSUPPORTED_VERSION', ['schemaVersion'])
    expectSerializationError(() => parseProject(JSON.stringify(document)), 'SERIALIZATION_UNSUPPORTED_VERSION', ['schemaVersion'])
  })

  it('does not interpret a project payload of an unsupported version', () => {
    const document = documentWith(['schemaVersion'], 3)
    setPath(document, null, 'project')
    setPath(document, 'not an object', 'extensions')
    expectSerializationError(() => migrateProjectDocument(document), 'SERIALIZATION_UNSUPPORTED_VERSION', ['schemaVersion'])
  })

  it('checks the format before the version and the version before the payload', () => {
    const badFormat = documentWith(['format'], 'other')
    setPath(badFormat, 3, 'schemaVersion')
    expectSerializationError(() => migrateProjectDocument(badFormat), 'SERIALIZATION_INVALID_SCHEMA', ['format'])

    const badVersion = documentWith(['schemaVersion'], 3)
    setPath(badVersion, 'not a project', 'project')
    expectSerializationError(() => migrateProjectDocument(badVersion), 'SERIALIZATION_UNSUPPORTED_VERSION', ['schemaVersion'])
  })

  it('reports unknown root fields only after the known envelope', () => {
    const document = documentWith(['format'], 'other')
    setPath(document, 1, 'aaa')
    expectSerializationError(() => migrateProjectDocument(document), 'SERIALIZATION_INVALID_SCHEMA', ['format'])
  })

  it.each([
    [Number.NaN, ['schemaVersion']],
    [Number.POSITIVE_INFINITY, ['schemaVersion']],
    [Number.NEGATIVE_INFINITY, ['schemaVersion']],
  ])('rejects a non-finite runtime version %s as invalid input', (version, path) => {
    const document = documentWith(['schemaVersion'], version)
    expectSerializationError(() => migrateProjectDocument(document), 'SERIALIZATION_INVALID_INPUT', path)
  })

  it('rejects a non-finite runtime number in the payload as invalid input', () => {
    for (const value of [Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY]) {
      const document = documentWith(['project', 'mapping', 'region', 'inputRect', 'x'], value)
      expectSerializationError(
        () => migrateProjectDocument(document),
        'SERIALIZATION_INVALID_INPUT',
        ['project', 'mapping', 'region', 'inputRect', 'x'],
      )
    }
  })

  it('rejects non-JSON runtime roots without masking them as schema errors', () => {
    for (const value of [undefined, () => 1, Symbol('x'), 1n]) {
      expectSerializationError(() => migrateProjectDocument(value), 'SERIALIZATION_INVALID_INPUT', [])
    }
    class Document { readonly format = 'ledmap' }
    expectSerializationError(() => migrateProjectDocument(new Document()), 'SERIALIZATION_INVALID_INPUT', [])

    const withAccessor = cloneDocument(minimalDocument())
    Object.defineProperty(withAccessor, 'format', { get: () => 'ledmap', enumerable: true, configurable: true })
    expectSerializationError(() => migrateProjectDocument(withAccessor), 'SERIALIZATION_INVALID_INPUT', ['format'])

    const withSymbol = cloneDocument(minimalDocument())
    Object.defineProperty(withSymbol, Symbol('meta'), { value: 1, enumerable: true, configurable: true })
    expectSerializationError(() => migrateProjectDocument(withSymbol), 'SERIALIZATION_INVALID_INPUT', ['meta'])
  })

  it('does not sort or regenerate anything during identity migration', () => {
    const document = cloneDocument(minimalDocument())
    const topology = (document['project'] as Record<string, unknown>)['mapping'] as Record<string, unknown>
    const hardware = topology['hardwareTopology'] as Record<string, unknown>
    setPath(document, ['P-second', 'P-first'], 'project', 'mapping', 'hardwareTopology', 'processorOrder')
    const migrated = migrateProjectDocument(document)
    expect([...migrated.project.mapping.hardwareTopology.processorOrder]).toEqual(['P-second', 'P-first'])
    expect(hardware['processorOrder']).toEqual(['P-second', 'P-first'])
  })
})

function loadableLegacy(document: Record<string, unknown>): unknown {
  return migrateProjectDocument(JSON.parse(JSON.stringify(document)) as unknown)
}
