import { describe, expect, it } from 'vitest'
import { loadProject, serializeProject, type JsonObject } from '../../src/index.js'
import { minimalGoldenText, minimalProject } from './fixtures.js'

function save(extensions: Record<string, unknown>): string {
  return serializeProject({ project: minimalProject(), extensions: extensions as JsonObject })
}

function keysOf(text: string): string[] {
  const tail = text.slice(text.indexOf('"extensions": {'))
  return [...tail.matchAll(/^ {4}"([^"\\]*)":/gm)].map(match => match[1]!)
}

function nestedKeysOf(text: string): string[] {
  const tail = text.slice(text.indexOf('"extensions": {'))
  return [...tail.matchAll(/^ {6}"([^"\\]*)":/gm)].map(match => match[1]!)
}

describe('7D extensions payload', () => {
  it('preserves deep values, scalars and nested nulls', () => {
    const extensions = {
      plugin: {
        enabled: true,
        threshold: 0.25,
        label: 'x',
        empty: null,
        list: [1, 'two', false, null, { deep: ['value'] }],
        matrix: [[0, 1], [2, 3]],
      },
      negative: -12.5,
      unicode: 'ключ 𝒳',
    }
    const text = save(extensions)
    const loaded = loadProject(text)
    expect(loaded.extensions).toEqual(extensions)
    expect(loaded.validation.valid).toBe(true)
    expect(serializeProject({ project: loaded.project, extensions: loaded.extensions })).toBe(text)
  })

  it('sorts object keys recursively by UTF-16 code units including numeric-looking and Unicode keys', () => {
    const extensions: Record<string, unknown> = {}
    for (const key of ['b', 'ä', '10', '2', 'A', 'a', '_x', 'Z', 'é']) extensions[key] = key
    extensions['nested'] = { b: 1, a: 2, '2': 3, '10': 4, 'é': 5, Z: 6 }
    const text = save(extensions)
    expect(keysOf(text)).toEqual(['10', '2', 'A', 'Z', '_x', 'a', 'b', 'nested', 'ä', 'é'])
    expect(nestedKeysOf(text)).toEqual(['10', '2', 'Z', 'a', 'b', 'é'])
    expect(Object.keys(loadProject(text).extensions)).toEqual(['2', '10', 'A', 'Z', '_x', 'a', 'b', 'nested', 'ä', 'é'])
  })

  it('never sorts arrays inside extensions', () => {
    const text = save({ list: [3, 1, 2, 'b', 'a'] })
    const parsed = JSON.parse(text) as { extensions: { list: unknown[] } }
    expect(parsed.extensions.list).toEqual([3, 1, 2, 'b', 'a'])
  })

  it('keeps __proto__ and constructor keys opaque through a full round-trip', () => {
    const extensions: Record<string, unknown> = {}
    Object.defineProperty(extensions, '__proto__', {
      value: { nested: [1, 2] }, enumerable: true, writable: true, configurable: true,
    })
    Object.defineProperty(extensions, 'constructor', { value: { name: 'meta' }, enumerable: true, writable: true, configurable: true })
    const text = save(extensions)
    const loaded = loadProject(text)
    expect(Object.getPrototypeOf(loaded.extensions)).toBe(Object.prototype)
    expect(Object.keys(loaded.extensions)).toEqual(['__proto__', 'constructor'])
    expect((loaded.extensions as Record<string, unknown>)['__proto__']).toEqual({ nested: [1, 2] })
    expect(({} as Record<string, unknown>)['nested']).toBeUndefined()
  })

  it('keeps extensions out of project validation and reconstruction', () => {
    const text = save({
      mapping: { fake: true },
      hardwareTopology: { cabinets: ['injected'] },
      rules: [{ type: 'permutation' }],
      localX: 5,
    })
    const loaded = loadProject(text)
    expect(loaded.project).toEqual(minimalProject())
    expect(loaded.validation.valid).toBe(true)
    expect(loaded.validation.diagnostics).toEqual([])
  })

  it('produces byte-identical output for identical source values', () => {
    const extensions = { b: 1, a: { d: 2, c: [3, 4] } }
    expect(save(extensions)).toBe(save(extensions))
    expect(save(extensions)).toBe(save({ a: { c: [3, 4], d: 2 }, b: 1 }))
  })

  it('keeps an empty extensions object when nothing opaque is stored', () => {
    const text = save({})
    expect(text).toBe(minimalGoldenText)
    expect(loadProject(text).extensions).toEqual({})
  })

  it('does not interpret extension values by name', () => {
    const extensions = { diagnostics: [{ code: 'HARDWARE_INVALID_VALUE' }], cells: [], spans: { total: 1 } }
    const loaded = loadProject(save(extensions))
    expect(loaded.extensions).toEqual(extensions)
    expect(loaded.validation.valid).toBe(true)
    expect(loaded.project).toEqual(minimalProject())
  })

  it('reads a document whose extensions were written by hand', () => {
    const text = minimalGoldenText.replace('  "extensions": {}', '  "extensions": {\n    "authored": true,\n    "order": [\n      2,\n      1\n    ]\n  }')
    const loaded = loadProject(text)
    expect(loaded.extensions).toEqual({ authored: true, order: [2, 1] })
  })
})
