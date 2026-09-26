import { describe, expect, it } from 'vitest'
import { serializeProject, type SerializeProjectInput, type ValidateProjectInput } from '../../src/index.js'
import { deepFreeze } from '../hardware-engine/fixtures.js'
import { expectSerializationError, minimalProject, mutable } from './fixtures.js'

function loose(value: unknown): Record<string, unknown> {
  return value as unknown as Record<string, unknown>
}

function wrapper(project: ValidateProjectInput, extensions?: unknown): Record<string, unknown> {
  return extensions === undefined ? { project } : { project, extensions }
}

function save(value: Record<string, unknown>): string {
  return serializeProject(value as unknown as SerializeProjectInput)
}

function expectInputError(value: Record<string, unknown>, path: readonly (string | number)[]): void {
  expectSerializationError(() => save(value), 'SERIALIZATION_INVALID_INPUT', path)
}

describe('7D save boundary', () => {
  it('accepts mutable and deeply frozen runtime input', () => {
    const expected = serializeProject({ project: minimalProject() })
    expect(serializeProject({ project: deepFreeze(minimalProject()) })).toBe(expected)
  })

  it('does not freeze, mutate or retain caller-owned objects', () => {
    const project = minimalProject()
    const extensions = { note: 'caller' }
    const text = serializeProject({ project, extensions })
    expect(Object.isFrozen(project)).toBe(false)
    expect(Object.isFrozen(project.mapping)).toBe(false)
    expect(Object.isFrozen(project.mapping.hardwareTopology.modules[0])).toBe(false)
    expect(extensions).toEqual({ note: 'caller' })
    expect(text).toContain('"note": "caller"')
    expect(project.mapping.hardwareTopology.modules[0]!.localX).toBe(0)
  })

  it.each([
    ['null', null],
    ['array', []],
    ['string', 'project'],
    ['number', 7],
    ['boolean', true],
  ])('rejects a %s wrapper argument', (_label, value) => {
    expectSerializationError(
      () => serializeProject(value as unknown as SerializeProjectInput),
      'SERIALIZATION_INVALID_INPUT', [],
    )
  })

  it('rejects a class instance wrapper', () => {
    class Wrapper {
      readonly project = minimalProject()
    }
    expectSerializationError(
      () => serializeProject(new Wrapper() as unknown as SerializeProjectInput),
      'SERIALIZATION_INVALID_INPUT', [],
    )
  })

  it('rejects symbol keys on the wrapper without reading values', () => {
    const input = wrapper(minimalProject())
    Object.defineProperty(input, Symbol('meta'), { value: 1, enumerable: true, configurable: true })
    expectInputError(input, ['meta'])
  })

  it('rejects an accessor on the wrapper without invoking it', () => {
    let calls = 0
    const input: Record<string, unknown> = {}
    Object.defineProperty(input, 'project', {
      get: () => { calls += 1; return minimalProject() },
      enumerable: true,
      configurable: true,
    })
    expectInputError(input, ['project'])
    expect(calls).toBe(0)
  })

  it('requires a defined project field', () => {
    expectInputError({}, ['project'])
    expectInputError({ project: undefined }, ['project'])
  })

  it('rejects unknown wrapper fields in UTF-16 order', () => {
    const input = wrapper(minimalProject())
    input['zeta'] = 1
    input['Alpha'] = 2
    input['alpha'] = 3
    expectInputError(input, ['Alpha'])
  })

  it('normalizes an undefined extensions value to an empty object', () => {
    const input: Record<string, unknown> = { project: minimalProject(), extensions: undefined }
    expect(save(input)).toContain('"extensions": {}')
  })

  it.each([
    ['null', null],
    ['array', []],
    ['string', 'meta'],
    ['number', 1],
    ['boolean', false],
  ])('rejects %s extensions', (_label, extensions) => {
    expectInputError(wrapper(minimalProject(), extensions), ['extensions'])
  })

  it('rejects a class instance inside extensions', () => {
    class Plugin { readonly enabled = true }
    expectInputError(wrapper(minimalProject(), { plugin: new Plugin() }), ['extensions', 'plugin'])
  })

  it.each([
    ['NaN', Number.NaN],
    ['positive infinity', Number.POSITIVE_INFINITY],
    ['negative infinity', Number.NEGATIVE_INFINITY],
  ])('rejects %s as a wire number in project geometry', (_label, value) => {
    const project = minimalProject()
    mutable(project.mapping.region.inputRect).x = value
    expectInputError(wrapper(project), ['project', 'mapping', 'region', 'inputRect', 'x'])
  })

  it('rejects non-finite receiver capacity without changing validation semantics', () => {
    const project = minimalProject()
    mutable(project.mapping.hardwareTopology.receivers[0]!).pixelCapacity = Number.NaN
    expectInputError(wrapper(project), ['project', 'mapping', 'hardwareTopology', 'receivers', 0, 'pixelCapacity'])
  })

  it.each([
    ['undefined', undefined],
    ['function', () => 1],
    ['symbol', Symbol('x')],
    ['bigint', 1n],
  ])('rejects a %s value in a required project string field', (_label, value) => {
    const project = minimalProject()
    loose(project.mapping.grid).name = value
    expectInputError(wrapper(project), ['project', 'mapping', 'grid', 'name'])
  })

  it.each([
    ['undefined', undefined],
    ['function', () => 1],
    ['symbol', Symbol('x')],
    ['bigint', 1n],
  ])('rejects a %s value in extensions', (_label, value) => {
    expectInputError(wrapper(minimalProject(), { meta: { nested: [value] } }), ['extensions', 'meta', 'nested', 0])
  })

  it('rejects cyclic runtime values in extensions', () => {
    const cycle: Record<string, unknown> = { name: 'root' }
    cycle['self'] = cycle
    expectInputError(wrapper(minimalProject(), { plugin: cycle }), ['extensions', 'plugin', 'self'])
  })

  it('accepts shared acyclic references and writes them twice', () => {
    const shared = { value: 1 }
    const text = save(wrapper(minimalProject(), { first: shared, second: shared }))
    expect(text.match(/"value": 1/g)).toHaveLength(2)
    const loaded = JSON.parse(text) as { extensions: Record<string, unknown> }
    expect(loaded.extensions['first']).toEqual({ value: 1 })
    expect(loaded.extensions['first']).not.toBe(loaded.extensions['second'])
  })

  it('rejects sparse arrays in extensions and in project data', () => {
    const sparse: unknown[] = []
    sparse[1] = 'value'
    expectInputError(wrapper(minimalProject(), { list: sparse }), ['extensions', 'list'])
    const project = minimalProject()
    loose(project.mapping.screen).cabinetGrids = sparse
    expectInputError(wrapper(project), ['project', 'mapping', 'screen', 'cabinetGrids'])
  })

  it('rejects extra own properties on arrays', () => {
    const list = ['a', 'b'] as unknown[] & { extra?: string }
    list.extra = 'value'
    expectInputError(wrapper(minimalProject(), { list }), ['extensions', 'list', 'extra'])
  })

  it('rejects array subclasses', () => {
    class List extends Array<string> {}
    const list = List.from(['a'])
    expectInputError(wrapper(minimalProject(), { list }), ['extensions', 'list'])
  })

  it('rejects accessors inside extensions without invoking them', () => {
    let calls = 0
    const extensions: Record<string, unknown> = {}
    Object.defineProperty(extensions, 'lazy', {
      get: () => { calls += 1; return 'value' },
      enumerable: true,
      configurable: true,
    })
    expectInputError(wrapper(minimalProject(), extensions), ['extensions', 'lazy'])
    expect(calls).toBe(0)
  })

  it('never calls toJSON while writing', () => {
    let calls = 0
    const extensions = {
      toJSON: () => { calls += 1; return 'shortcut' },
    }
    expectInputError(wrapper(minimalProject(), extensions), ['extensions', 'toJSON'])
    expect(calls).toBe(0)
  })

  it('keeps __proto__ as an ordinary own key without touching prototypes', () => {
    const extensions: Record<string, unknown> = {}
    Object.defineProperty(extensions, '__proto__', { value: { safe: true }, enumerable: true, writable: true, configurable: true })
    Object.defineProperty(extensions, 'constructor', { value: 'text', enumerable: true, writable: true, configurable: true })
    const text = save(wrapper(minimalProject(), extensions))
    expect(text).toContain('"__proto__": {')
    const parsed = JSON.parse(text) as { extensions: Record<string, unknown> }
    expect(Object.keys(parsed.extensions)).toEqual(['__proto__', 'constructor'])
    expect(Object.getPrototypeOf(parsed.extensions)).toBe(Object.prototype)
    expect(({} as Record<string, unknown>)['safe']).toBeUndefined()
  })

  it('requires localX and localY on runtime modules and never drops them silently', () => {
    const missingLocalX = minimalProject()
    delete (missingLocalX.mapping.hardwareTopology.modules[0] as { localX?: number }).localX
    expectInputError(
      wrapper(missingLocalX), ['project', 'mapping', 'hardwareTopology', 'modules', 0, 'localX'],
    )

    const undefinedLocalY = minimalProject()
    mutable(undefinedLocalY.mapping.hardwareTopology.modules[0]!).localY = undefined as unknown as number
    expectInputError(
      wrapper(undefinedLocalY), ['project', 'mapping', 'hardwareTopology', 'modules', 0, 'localY'],
    )
  })

  it('rejects derived and unknown fields on the runtime project', () => {
    const withDerived = minimalProject()
    loose(withDerived.mapping.hardwareTopology.cabinets[0])['dataIndex'] = 0
    expectInputError(
      wrapper(withDerived), ['project', 'mapping', 'hardwareTopology', 'cabinets', 0, 'dataIndex'],
    )

    const withUnknown = minimalProject()
    loose(withUnknown.mapping)['cells'] = []
    expectInputError(wrapper(withUnknown), ['project', 'mapping', 'cells'])
  })

  it('rejects a class instance in place of a project record', () => {
    class Region { readonly id = 'region' }
    const project = minimalProject()
    loose(project.mapping).region = new Region()
    expectInputError(wrapper(project), ['project', 'mapping', 'region'])
  })
})
