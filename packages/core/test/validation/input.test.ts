import { afterEach, describe, expect, it, vi } from 'vitest'
import { validateProject, type ValidateProjectInput } from '../../src/index.js'
import * as mappingEngine from '../../src/mapping-engine/index.js'
import * as remapEngine from '../../src/remap-engine/index.js'
import { inputFailed, parentAt, projectFixture, setAt } from './fixtures.js'

afterEach(() => vi.restoreAllMocks())

function expectShapeError(input: unknown, paths: readonly (readonly (string | number)[])[]): void {
  const mapping = vi.spyOn(mappingEngine, 'resolveMapping')
  const remap = vi.spyOn(remapEngine, 'resolveRemap')
  const result = validateProject(input as ValidateProjectInput)
  expect(result.valid).toBe(false)
  expect(result.checks).toEqual(inputFailed)
  expect(result.diagnostics.map(d => ({ stage: d.stage, severity: d.severity, code: d.code, path: d.path })))
    .toEqual(paths.map(path => ({ stage: 'input', severity: 'error', code: 'PROJECT_INVALID_INPUT', path })))
  expect(result.diagnostics.every(d => d.message.length > 0)).toBe(true)
  expect(mapping).not.toHaveBeenCalled()
  expect(remap).not.toHaveBeenCalled()
}

function requiredPaths(value: unknown, prefix: readonly (string | number)[] = []): (readonly (string | number)[])[] {
  if (value === null || typeof value !== 'object') return []
  return Object.entries(value).flatMap(([key, child]) => {
    const path = [...prefix, Array.isArray(value) ? Number(key) : key]
    return [path, ...requiredPaths(child, path)]
  })
}

describe('Project input structure', () => {
  it.each([undefined, null, 1, true, '', [], new Map(), new Set(), new Date(), () => undefined, new (class Input {})()])
    ('rejects a non-record root %s', input => expectShapeError(input, [[]]))

  it.each(requiredPaths(projectFixture()).map(path => ({ label: path.join('.'), path })))
    ('detects missing required field/element $label without descendant noise', ({ path }) => {
      const input = projectFixture()
      const { parent, key } = parentAt(input, path)
      delete parent[key]
      expectShapeError(input, [path])
    })

  it.each([
    { path: ['mapping'], value: [] },
    { path: ['mapping', 'screen'], value: new Map() },
    { path: ['mapping', 'grid'], value: new (class Grid {})() },
    { path: ['mapping', 'region', 'size'], value: null },
    { path: ['mapping', 'inputCanvas', 'id'], value: 42 },
    { path: ['mapping', 'grid', 'rows'], value: '1' },
    { path: ['mapping', 'grid', 'ordering', 'snake'], value: 0 },
    { path: ['mapping', 'screen', 'cabinetGrids'], value: {} },
    { path: ['mapping', 'hardwareTopology', 'modules', 0], value: null },
    { path: ['mapping', 'hardwareTopology', 'processorOrder', 0], value: {} },
    { path: ['mapping', 'hardwareTopology', 'receiverOrder', 0, 'receivers', 0], value: false },
    { path: ['rules'], value: undefined },
    { path: ['rules'], value: null },
    { path: ['rules'], value: {} },
    { path: ['rules'], value: new (class Rules extends Array {})() },
  ])('rejects wrong kind at $path', ({ path, value }) => expectShapeError(setAt(projectFixture(), path, value), [path]))

  it.each(['numbering', 'startCorner', 'direction'])('rejects unknown %s tokens', field => {
    const path = ['mapping', 'grid', 'ordering', field]
    expectShapeError(setAt(projectFixture(), path, 'unknown'), [path])
  })

  it.each([null, '100', false, {}])('rejects optional pixelCapacity of wrong kind %s', value => {
    const path = ['mapping', 'hardwareTopology', 'receivers', 0, 'pixelCapacity']
    expectShapeError(setAt(projectFixture(), path, value), [path])
  })

  it.each([undefined, 100])('accepts optional pixelCapacity %s', value => {
    expect(validateProject(setAt(projectFixture(), ['mapping', 'hardwareTopology', 'receivers', 0, 'pixelCapacity'], value)).valid).toBe(true)
  })

  it('collects independent errors in schema depth-first order rather than property insertion order', () => {
    const input = projectFixture()
    setAt(input, ['rules'], null)
    setAt(input, ['mapping', 'hardwareTopology', 'modules', 0, 'pixelWidth'], 'bad')
    setAt(input, ['mapping', 'region', 'size'], undefined)
    setAt(input, ['mapping', 'inputCanvas', 'resolution', 'height'], null)
    setAt(input, ['mapping', 'inputCanvas', 'resolution', 'width'], null)
    expectShapeError(input, [
      ['mapping', 'inputCanvas', 'resolution', 'width'],
      ['mapping', 'inputCanvas', 'resolution', 'height'],
      ['mapping', 'region', 'size'],
      ['mapping', 'hardwareTopology', 'modules', 0, 'pixelWidth'],
      ['rules'],
    ])
  })

  it('orders array defects by index and rejects holes in reference arrays', () => {
    const input = setAt(projectFixture(), ['mapping', 'hardwareTopology', 'processorOrder'], new Array(3))
    expectShapeError(input, [0, 1, 2].map(i => ['mapping', 'hardwareTopology', 'processorOrder', i]))
  })

  it.each([
    ['mapping'], ['rules'], ['mapping', 'inputCanvas', 'id'], ['mapping', 'region', 'size'],
    ['mapping', 'hardwareTopology', 'modules', 0], ['mapping', 'hardwareTopology', 'processorOrder', 0],
    ['mapping', 'hardwareTopology', 'receivers', 0, 'pixelCapacity'],
  ])('does not invoke an accessor at %j', (...path) => {
    const input = projectFixture()
    const { parent, key } = parentAt(input, path)
    const getter = vi.fn(() => { throw new Error('Must not read accessor') })
    Object.defineProperty(parent, key, { get: getter, enumerable: true })
    expectShapeError(input, [path])
    expect(getter).not.toHaveBeenCalled()
  })

  it('does not use inherited required properties', () => {
    const input = projectFixture()
    const fake = Object.create({ width: 2, height: 3 }) as object
    expectShapeError(setAt(input, ['mapping', 'region', 'size'], fake), [['mapping', 'region', 'size']])
  })

  it('accepts own non-enumerable data fields on the wrapper and null-prototype records', () => {
    const input = projectFixture()
    Object.setPrototypeOf(input, null)
    Object.defineProperty(input, 'mapping', { value: input.mapping, enumerable: false })
    expect(validateProject(input).valid).toBe(true)
  })

  it('ignores unknown fields without traversing them', () => {
    const input = projectFixture()
    const getter = vi.fn(() => { throw new Error('Unknown property must not be read by shape check') })
    Object.defineProperty(input, 'unknown', { get: getter })
    Object.defineProperty(input, Symbol('unknown'), { value: input })
    expect(validateProject(input).valid).toBe(true)
    expect(getter).not.toHaveBeenCalled()
  })
})
