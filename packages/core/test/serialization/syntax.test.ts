import { describe, expect, it } from 'vitest'
import { loadProject, parseProject, serializeProject } from '../../src/index.js'
import { expectSerializationError, minimalDocument, minimalGoldenText } from './fixtures.js'

function canonicalize(text: string): string {
  const loaded = loadProject(text)
  return serializeProject({ project: loaded.project, extensions: loaded.extensions })
}

function mappingOf(document: Record<string, unknown>): Record<string, unknown> {
  const project = document['project'] as Record<string, unknown>
  return project['mapping'] as Record<string, unknown>
}

describe('7D parse syntax boundary', () => {
  it('accepts compact JSON and canonicalizes it', () => {
    expect(canonicalize(JSON.stringify(minimalDocument()))).toBe(minimalGoldenText)
  })

  it('accepts unusual but legal whitespace including CRLF and tabs', () => {
    const spaced = `\t\r\n${minimalGoldenText.replace(/: /g, ':  ').replace(/\n/g, '\r\n')}\t\r\n`
    expect(canonicalize(spaced)).toBe(minimalGoldenText)
  })

  it('accepts shuffled root and record key order and canonicalizes it', () => {
    const document = minimalDocument()
    const project = document['project'] as Record<string, unknown>
    const mapping = mappingOf(document)
    const grid = mapping['grid'] as Record<string, unknown>
    const shuffledMapping = {
      hardwareTopology: mapping['hardwareTopology'],
      region: mapping['region'],
      grid: {
        ordering: { snake: false, direction: 'left-to-right', startCorner: 'top-left', numbering: 'row' },
        cabinetHeight: grid['cabinetHeight'],
        cabinetWidth: grid['cabinetWidth'],
        rows: grid['rows'],
        columns: grid['columns'],
        name: grid['name'],
        screen: grid['screen'],
        id: grid['id'],
      },
      screen: mapping['screen'],
      inputCanvas: mapping['inputCanvas'],
    }
    const shuffled = {
      extensions: document['extensions'],
      project: { rules: project['rules'], mapping: shuffledMapping },
      schemaVersion: document['schemaVersion'],
      format: document['format'],
    }
    expect(canonicalize(JSON.stringify(shuffled))).toBe(minimalGoldenText)
  })

  it('accepts escaped member names and escaped string values', () => {
    const escaped = minimalGoldenText
      .replace('"id": "screen"', '"\\u0069d": "screen"')
      .replace('"name": "Screen"', '"name": "\\u0053creen"')
    const loaded = loadProject(escaped)
    expect(loaded.project.mapping.screen.name).toBe('Screen')
    expect(loaded.project.mapping.screen.id).toBe('screen')
  })

  it('accepts surrogate pair escapes and preserves non-ASCII text without normalization', () => {
    const document = minimalDocument()
    const mapping = mappingOf(document)
    ;(mapping['screen'] as Record<string, unknown>)['name'] = 'Экран №1 𝒳 Ｉ'
    const loaded = loadProject(JSON.stringify(document))
    expect(loaded.project.mapping.screen.name).toBe('Экран №1 𝒳 Ｉ')
    const escaped = JSON.stringify(document).replace('Экран', '\\u042d\\u043a\\u0440\\u0430\\u043d')
    expect(loadProject(escaped).project.mapping.screen.name).toBe('Экран №1 𝒳 Ｉ')
  })

  it('accepts literal escapes for control characters', () => {
    const document = minimalDocument()
    const mapping = mappingOf(document)
    ;(mapping['screen'] as Record<string, unknown>)['name'] = 'A\tB\nC\\D"E'
    const text = JSON.stringify(document)
    expect(text).toContain('\\t')
    expect(loadProject(text).project.mapping.screen.name).toBe('A\tB\nC\\D"E')
  })

  it.each([
    ['empty text', ''],
    ['whitespace only', '   \n\t'],
    ['unterminated object', '{"format": "ledmap"'],
    ['unterminated string', '{"format": "ledma'],
    ['unterminated array', '[1, 2'],
    ['missing colon', '{"format" "ledmap"}'],
    ['missing comma', '{"format": "ledmap" "schemaVersion": 1}'],
    ['trailing comma in object', '{"format": "ledmap",}'],
    ['trailing comma in array', '{"a": [1, 2,]}'],
    ['single quotes', "{'format': 'ledmap'}"],
    ['unquoted member name', '{format: "ledmap"}'],
    ['leading zero', '{"schemaVersion": 01}'],
    ['bare plus sign', '{"a": +1}'],
    ['hex literal', '{"a": 0x1}'],
    ['single dot fraction', '{"a": .5}'],
    ['trailing fraction dot', '{"a": 1.}'],
    ['empty exponent', '{"a": 1e}'],
    ['lone minus', '{"a": -}'],
    ['lowercase nul', 'nul'],
    ['unclosed line comment', '// comment\n' + minimalGoldenText],
    ['unclosed block comment', minimalGoldenText + '\n/* comment'],
    ['escaped control character', '{"a": "line\nbreak"}'],
    ['short unicode escape', '{"a": "\\u12"}'],
    ['invalid escape', '{"a": "\\q"}'],
  ])('rejects %s as invalid JSON', (_label, text) => {
    expectSerializationError(() => parseProject(text), 'SERIALIZATION_INVALID_JSON', [])
  })

  it('rejects a byte order mark', () => {
    expectSerializationError(() => parseProject(`\uFEFF${minimalGoldenText}`), 'SERIALIZATION_INVALID_JSON', [])
  })

  it('rejects trailing non-whitespace text', () => {
    expectSerializationError(() => parseProject(`${minimalGoldenText}{}`), 'SERIALIZATION_INVALID_JSON', [])
    expectSerializationError(() => parseProject(`${minimalGoldenText}x`), 'SERIALIZATION_INVALID_JSON', [])
    expectSerializationError(() => parseProject(`${minimalGoldenText}null`), 'SERIALIZATION_INVALID_JSON', [])
  })

  it('rejects a non-string runtime argument', () => {
    for (const value of [undefined, null, 5, {}, [], true]) {
      expectSerializationError(() => parseProject(value as unknown as string), 'SERIALIZATION_INVALID_INPUT', [])
    }
  })

  it('rejects duplicate member names at the root and nested levels', () => {
    expectSerializationError(
      () => parseProject('{"format": "ledmap", "schemaVersion": 1, "format": "ledmap", "project": {}, "extensions": {}}'),
      'SERIALIZATION_DUPLICATE_KEY', ['format'],
    )
    expectSerializationError(
      () => parseProject(minimalGoldenText.replace('        "id": "input",\n', '        "id": "input",\n        "id": "input",\n')),
      'SERIALIZATION_DUPLICATE_KEY', ['project', 'mapping', 'inputCanvas', 'id'],
    )
    expectSerializationError(
      () => parseProject(minimalGoldenText.replace(
        '"width": 2,\n          "height": 3\n        }\n      },\n      "screen"',
        '"width": 2,\n          "width": 2,\n          "height": 3\n        }\n      },\n      "screen"',
      )),
      'SERIALIZATION_DUPLICATE_KEY', ['project', 'mapping', 'inputCanvas', 'resolution', 'width'],
    )
    expectSerializationError(
      () => parseProject(minimalGoldenText.replace('"rules": []', '"rules": [], "rules": []')),
      'SERIALIZATION_DUPLICATE_KEY', ['project', 'rules'],
    )
  })

  it('detects duplicates written with different escape spellings', () => {
    expectSerializationError(
      () => parseProject(minimalGoldenText.replace('"id": "input",\n', '"\\u0069d": "input",\n        "id": "input",\n')),
      'SERIALIZATION_DUPLICATE_KEY', ['project', 'mapping', 'inputCanvas', 'id'],
    )
  })

  it('reports only the first duplicate member name', () => {
    const error = expectSerializationError(
      () => parseProject('{"a": 1, "a": 2, "b": 3, "b": 4}'),
      'SERIALIZATION_DUPLICATE_KEY', ['a'],
    )
    expect(error.message).toContain('Duplicate object member name a')
  })

  it('keeps syntax errors ahead of duplicate member names', () => {
    expectSerializationError(() => parseProject('{"a": 1, "a": 2,}'), 'SERIALIZATION_INVALID_JSON', [])
  })

  it('rejects parsed numeric overflow at the number path', () => {
    expectSerializationError(
      () => parseProject(minimalGoldenText.replace('"columns": 1,', '"columns": 1e400,')),
      'SERIALIZATION_INVALID_SCHEMA', ['project', 'mapping', 'grid', 'columns'],
    )
    expectSerializationError(
      () => parseProject(minimalGoldenText.replace('"cabinetWidth": 100,', '"cabinetWidth": 1e999,')),
      'SERIALIZATION_INVALID_SCHEMA', ['project', 'mapping', 'grid', 'cabinetWidth'],
    )
  })

  it('reports only the first overflow path', () => {
    const error = expectSerializationError(
      () => parseProject(minimalGoldenText.replace('"width": 2,\n          "height": 3', '"width": 1e400,\n          "height": 1e400')),
      'SERIALIZATION_INVALID_SCHEMA', ['project', 'mapping', 'inputCanvas', 'resolution', 'width'],
    )
    expect(error.path).toHaveLength(5)
  })

  it('keeps syntax errors ahead of parsed numeric overflow', () => {
    expectSerializationError(() => parseProject('1e400 x'), 'SERIALIZATION_INVALID_JSON', [])
  })

  it('never executes user code while reading text', () => {
    let calls = 0
    const text = '{"__proto__": {"polluted": true}, "format": "ledmap"}'
    Object.defineProperty(Object.prototype, 'toJSON', {
      value: () => { calls += 1; return null },
      configurable: true,
      enumerable: false,
      writable: true,
    })
    try {
      expectSerializationError(() => parseProject(text), 'SERIALIZATION_INVALID_SCHEMA', ['schemaVersion'])
    } finally {
      Reflect.deleteProperty(Object.prototype, 'toJSON')
    }
    expect(calls).toBe(0)
    expect(({} as Record<string, unknown>)['polluted']).toBeUndefined()
  })
})
