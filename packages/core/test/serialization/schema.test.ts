import { describe, expect, it } from 'vitest'
import { migrateProjectDocument, parseProject } from '../../src/index.js'
import { cloneDocument, deletePath, expectSerializationError, minimalDocument, setPath } from './fixtures.js'

type Segment = string | number

function freshDocument(): Record<string, unknown> {
  return cloneDocument(minimalDocument())
}

function documentWith(path: readonly Segment[], value: unknown): Record<string, unknown> {
  const document = freshDocument()
  setPath(document, value, ...path)
  return document
}

function documentWithout(path: readonly Segment[]): Record<string, unknown> {
  const document = freshDocument()
  deletePath(document, ...path)
  return document
}

function topologyPath(collection: string, index = 0): Segment[] {
  return ['project', 'mapping', 'hardwareTopology', collection, index]
}

const unknownFieldCases: readonly (readonly [readonly Segment[], string])[] = [
  [[], 'zzz'],
  [['project'], 'extra'],
  [['project', 'mapping'], 'extra'],
  [['project', 'mapping', 'inputCanvas'], 'extra'],
  [['project', 'mapping', 'inputCanvas', 'resolution'], 'extra'],
  [['project', 'mapping', 'screen'], 'extra'],
  [['project', 'mapping', 'grid'], 'extra'],
  [['project', 'mapping', 'grid', 'ordering'], 'extra'],
  [['project', 'mapping', 'region'], 'extra'],
  [['project', 'mapping', 'region', 'inputRect'], 'extra'],
  [['project', 'mapping', 'region', 'screenRect'], 'extra'],
  [['project', 'mapping', 'region', 'transform'], 'extra'],
  [topologyPath('processors'), 'unused'],
  [topologyPath('ports'), 'unused'],
  [topologyPath('receivers'), 'unused'],
  [topologyPath('cabinets'), 'unused'],
  [topologyPath('modules'), 'unused'],
  [['project', 'mapping', 'hardwareTopology', 'receiverOrder', 0], 'unused'],
]

const wrongKindCases: readonly (readonly [readonly Segment[], unknown])[] = [
  [['project', 'mapping', 'inputCanvas', 'id'], 5],
  [['project', 'mapping', 'inputCanvas', 'resolution'], [2, 3]],
  [['project', 'mapping', 'inputCanvas', 'resolution', 'width'], '2'],
  [['project', 'mapping', 'screen', 'mappingRegions'], 'region'],
  [['project', 'mapping', 'screen', 'mappingRegions', 0], 1],
  [['project', 'mapping', 'grid', 'ordering', 'snake'], 'true'],
  [['project', 'mapping', 'grid', 'ordering', 'snake'], 1],
  [['project', 'mapping', 'region', 'inputRect', 'x'], '0'],
  [['project', 'mapping', 'region', 'transform', 'flipX'], 0],
  [['project', 'mapping', 'hardwareTopology', 'processors', 0, 'portCount'], '1'],
  [['project', 'mapping', 'hardwareTopology', 'receivers', 0, 'cabinets', 0], 1],
  [['project', 'mapping', 'hardwareTopology', 'cabinets', 0, 'flipH'], 0],
  [['project', 'mapping', 'hardwareTopology', 'cabinets', 0, 'origin', 'x'], '0'],
  [['project', 'mapping', 'hardwareTopology', 'modules', 0, 'pixelWidth'], '2'],
  [['project', 'mapping', 'hardwareTopology', 'processorOrder'], 'P'],
  [['project', 'mapping', 'hardwareTopology', 'receiverOrder'], 'ports'],
  [['project', 'mapping', 'hardwareTopology', 'receiverOrder', 0, 'receivers', 0], 1],
  [['project', 'rules'], {}],
  [['extensions'], []],
  [['extensions'], 'meta'],
  [['extensions'], null],
]

const enumCases: readonly (readonly [readonly Segment[], unknown])[] = [
  [['project', 'mapping', 'grid', 'ordering', 'numbering'], 'Row'],
  [['project', 'mapping', 'grid', 'ordering', 'numbering'], 'ROW'],
  [['project', 'mapping', 'grid', 'ordering', 'numbering'], 0],
  [['project', 'mapping', 'grid', 'ordering', 'direction'], 'LTR'],
  [['project', 'mapping', 'grid', 'ordering', 'direction'], 'left_to_right'],
  [['project', 'mapping', 'grid', 'ordering', 'startCorner'], 'Top Left'],
  [['project', 'mapping', 'grid', 'ordering', 'startCorner'], 'topLeft'],
  [['project', 'mapping', 'region', 'transform', 'inputRotation'], 45],
  [['project', 'mapping', 'region', 'transform', 'screenRotation'], 360],
]

const requiredFieldPaths: readonly (readonly Segment[])[] = [
  ['format'],
  ['schemaVersion'],
  ['project'],
  ['extensions'],
  ['project', 'mapping'],
  ['project', 'mapping', 'inputCanvas'],
  ['project', 'mapping', 'inputCanvas', 'id'],
  ['project', 'mapping', 'inputCanvas', 'resolution'],
  ['project', 'mapping', 'inputCanvas', 'resolution', 'height'],
  ['project', 'mapping', 'screen'],
  ['project', 'mapping', 'screen', 'cabinetGrids'],
  ['project', 'mapping', 'grid'],
  ['project', 'mapping', 'grid', 'ordering'],
  ['project', 'mapping', 'grid', 'ordering', 'numbering'],
  ['project', 'mapping', 'region'],
  ['project', 'mapping', 'region', 'inputRect'],
  ['project', 'mapping', 'region', 'screenRect'],
  ['project', 'mapping', 'region', 'transform'],
  ['project', 'mapping', 'hardwareTopology'],
  ['project', 'mapping', 'hardwareTopology', 'processors'],
  ['project', 'mapping', 'hardwareTopology', 'processors', 0, 'name'],
  ['project', 'mapping', 'hardwareTopology', 'ports', 0, 'receiverCapacity'],
  ['project', 'mapping', 'hardwareTopology', 'receivers'],
  ['project', 'mapping', 'hardwareTopology', 'receivers', 0, 'port'],
  ['project', 'mapping', 'hardwareTopology', 'cabinets'],
  ['project', 'mapping', 'hardwareTopology', 'cabinets', 0, 'rotation'],
  ['project', 'mapping', 'hardwareTopology', 'modules'],
  ['project', 'mapping', 'hardwareTopology', 'modules', 0, 'pixelHeight'],
  ['project', 'mapping', 'hardwareTopology', 'processorOrder'],
  ['project', 'mapping', 'hardwareTopology', 'receiverOrder'],
  ['project', 'mapping', 'hardwareTopology', 'receiverOrder', 0, 'port'],
  ['project', 'rules'],
]

describe('closed v2 schema', () => {
  it('accepts the minimal document and returns an equal value', () => {
    const document = freshDocument()
    expect(migrateProjectDocument(document)).toEqual(document)
  })

  it.each(unknownFieldCases)('rejects an unknown field at %s', (path, name) => {
    const document = freshDocument()
    setPath(document, 1, ...path, name)
    expectSerializationError(() => migrateProjectDocument(document), 'SERIALIZATION_INVALID_SCHEMA', [...path, name])
  })

  it('rejects unknown fields in UTF-16 order regardless of insertion order', () => {
    const document = freshDocument()
    for (const key of ['zzz', 'B', 'a', '10', '2']) setPath(document, 1, key)
    expectSerializationError(() => migrateProjectDocument(document), 'SERIALIZATION_INVALID_SCHEMA', ['10'])
  })

  it('checks known fields before unknown fields at the same level', () => {
    const document = documentWith(['project', 'mapping', 'grid', 'ordering', 'snake'], 'true')
    setPath(document, 1, 'project', 'mapping', 'grid', 'ordering', 'zzz')
    expectSerializationError(
      () => migrateProjectDocument(document),
      'SERIALIZATION_INVALID_SCHEMA',
      ['project', 'mapping', 'grid', 'ordering', 'snake'],
    )
  })

  it('walks known fields in schema order and arrays by increasing index', () => {
    const document = documentWith(['project', 'mapping', 'grid', 'columns'], 'four')
    setPath(document, 0, 'project', 'mapping', 'inputCanvas', 'id')
    expectSerializationError(
      () => migrateProjectDocument(document),
      'SERIALIZATION_INVALID_SCHEMA',
      ['project', 'mapping', 'inputCanvas', 'id'],
    )

    const second = documentWith([...topologyPath('processors'), 'id'], 0)
    setPath(second, 1, ...topologyPath('ports'), 'id')
    expectSerializationError(
      () => migrateProjectDocument(second),
      'SERIALIZATION_INVALID_SCHEMA',
      ['project', 'mapping', 'hardwareTopology', 'processors', 0, 'id'],
    )
  })

  it('rejects derived engine data outside extensions', () => {
    const cases: readonly (readonly Segment[])[] = [
      [...topologyPath('modules'), 'localX'],
      [...topologyPath('modules'), 'localY'],
      [...topologyPath('cabinets'), 'dataIndex'],
      [...topologyPath('receivers'), 'pixelOffset'],
      ['project', 'mapping', 'cells'],
      ['project', 'mapping', 'hardwareTopology', 'spans'],
      ['project', 'mapping', 'hardwareTopology', 'globalPixelCount'],
    ]
    for (const path of cases) {
      const document = freshDocument()
      setPath(document, 1, ...path)
      expectSerializationError(() => migrateProjectDocument(document), 'SERIALIZATION_INVALID_SCHEMA', path)
    }
  })

  it.each(wrongKindCases)('rejects a wrong field kind at %s', (path, value) => {
    const document = documentWith(path, value)
    expectSerializationError(() => migrateProjectDocument(document), 'SERIALIZATION_INVALID_SCHEMA', path)
    expectSerializationError(() => parseProject(JSON.stringify(document)), 'SERIALIZATION_INVALID_SCHEMA', path)
  })

  it.each(enumCases)('rejects an enum alias at %s', (path, value) => {
    const document = documentWith(path, value)
    expectSerializationError(() => migrateProjectDocument(document), 'SERIALIZATION_INVALID_SCHEMA', path)
  })

  it.each(requiredFieldPaths)('rejects the missing required field %s', (...path: Segment[]) => {
    const document = documentWithout(path)
    expectSerializationError(() => migrateProjectDocument(document), 'SERIALIZATION_INVALID_SCHEMA', path)
  })

  it('treats receiver pixelCapacity as optional', () => {
    const document = freshDocument()
    const topology = (document['project'] as Record<string, unknown>)['mapping'] as Record<string, unknown>
    const receivers = (topology['hardwareTopology'] as Record<string, unknown>)['receivers'] as Record<string, unknown>[]
    delete receivers[0]!['pixelCapacity']
    expect(migrateProjectDocument(document)).toEqual(document)
  })

  it('accepts empty arrays and arbitrary rule descriptors at schema level', () => {
    const document = freshDocument()
    setPath(document, [], 'project', 'mapping', 'hardwareTopology', 'receiverOrder')
    setPath(document, [], 'project', 'mapping', 'hardwareTopology', 'processorOrder')
    setPath(document, [{}], 'project', 'rules')
    expect(migrateProjectDocument(document)).toEqual(document)
  })

  it('accepts opaque extensions payloads of any JSON shape', () => {
    const document = freshDocument()
    setPath(document, {
      plugin: { enabled: true, weights: [1, 2.5, null], nested: { '10': 'ten', '2': 'two' } },
      note: 'no interpretation',
    }, 'extensions')
    expect(migrateProjectDocument(document)).toEqual(document)
  })

  it('rejects a non-object document root', () => {
    for (const value of [[], 'text', 5, true, null]) {
      expectSerializationError(() => migrateProjectDocument(value), 'SERIALIZATION_INVALID_SCHEMA', [])
    }
  })
})
