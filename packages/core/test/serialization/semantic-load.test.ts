import { describe, expect, it } from 'vitest'
import { loadProject, parseProject, serializeProject, validateProject, type ValidateProjectInput } from '../../src/index.js'
import { deepFreeze } from '../hardware-engine/fixtures.js'
import { assertFrozen } from '../mapping-engine/fixtures.js'
import { cloneDocument, expectSerializationError, minimalDocument, minimalGoldenText, minimalProject, mutable, setPath } from './fixtures.js'

function documentWith(path: readonly (string | number)[], value: unknown): Record<string, unknown> {
  const document = cloneDocument(minimalDocument())
  setPath(document, value, ...path)
  return document
}

function danglingReferenceDocument(): Record<string, unknown> {
  return documentWith(['project', 'mapping', 'hardwareTopology', 'receivers', 0, 'port'], 'P:missing')
}

function nonemptyRules(): unknown[] {
  return [{ id: 'r1', version: 1, type: 'permutation', source: '0', destination: '1' }]
}

describe('7D semantic load boundary', () => {
  it('returns a deeply immutable loaded project with a valid report', () => {
    const loaded = loadProject(minimalGoldenText)
    assertFrozen(loaded)
    assertFrozen(loaded.project)
    assertFrozen(loaded.extensions)
    assertFrozen(loaded.validation)
    expect(loaded.validation.valid).toBe(true)
    expect(loaded.project).toEqual(minimalProject())
    expect(loaded.project).not.toBe(minimalProject())
  })

  it('keeps the loaded validation report identical to a direct 7C run', () => {
    const loaded = loadProject(minimalGoldenText)
    expect(loaded.validation).toEqual(validateProject(loaded.project))
  })

  it('keeps the parsed document detached from the text and deeply immutable', () => {
    const document = parseProject(minimalGoldenText)
    assertFrozen(document)
    expect(Object.isFrozen(document.project.mapping.hardwareTopology.modules[0])).toBe(true)
  })

  it('parses a structurally valid document with semantic defects', () => {
    const document = parseProject(JSON.stringify(danglingReferenceDocument()))
    expect(document.project.mapping.hardwareTopology.receivers[0]!.port).toBe('P:missing')
  })

  it('rejects a semantically invalid document on load with the full 7C report', () => {
    const error = expectSerializationError(
      () => loadProject(JSON.stringify(danglingReferenceDocument())),
      'SERIALIZATION_PROJECT_INVALID', ['project'],
    )
    expect(error.validation?.valid).toBe(false)
    expect(error.validation?.diagnostics).toHaveLength(1)
    expect(error.validation?.diagnostics[0]).toMatchObject({
      severity: 'error', stage: 'mapping', code: 'HARDWARE_UNKNOWN_REFERENCE', path: ['mapping'],
    })
    expect(error.validation?.checks).toEqual([
      { stage: 'input', status: 'passed' },
      { stage: 'mapping', status: 'failed' },
      { stage: 'remap', status: 'blocked', blockedBy: 'mapping' },
    ])
    assertFrozen(error.validation)
    assertFrozen(error.path)
  })

  it('reports a nonempty rule set as an unsupported rule without touching mapping', () => {
    const document = documentWith(['project', 'rules'], nonemptyRules())
    const parsed = parseProject(JSON.stringify(document))
    expect(parsed.project.rules).toEqual(nonemptyRules())
    const error = expectSerializationError(
      () => loadProject(JSON.stringify(document)),
      'SERIALIZATION_PROJECT_INVALID', ['project'],
    )
    expect(error.validation?.diagnostics[0]).toMatchObject({
      stage: 'remap', code: 'REMAP_UNSUPPORTED_RULE', path: ['rules'],
    })
    expect(error.validation?.checks).toEqual([
      { stage: 'input', status: 'passed' },
      { stage: 'mapping', status: 'passed' },
      { stage: 'remap', status: 'failed' },
    ])
  })

  it('blocks the remap stage when the mapping stage fails', () => {
    const document = cloneDocument(danglingReferenceDocument())
    setPath(document, nonemptyRules(), 'project', 'rules')
    const error = expectSerializationError(
      () => loadProject(JSON.stringify(document)),
      'SERIALIZATION_PROJECT_INVALID', ['project'],
    )
    expect(error.validation?.diagnostics).toHaveLength(1)
    expect(error.validation?.diagnostics[0]!.stage).toBe('mapping')
    expect(error.validation?.checks[2]).toEqual({ stage: 'remap', status: 'blocked', blockedBy: 'mapping' })
  })

  it('rejects a finite but fractional geometry value through 7C', () => {
    const error = expectSerializationError(
      () => loadProject(JSON.stringify(documentWith(['project', 'mapping', 'hardwareTopology', 'modules', 0, 'width'], 100.5))),
      'SERIALIZATION_PROJECT_INVALID', ['project'],
    )
    expect(error.validation?.valid).toBe(false)
    expect(error.validation?.diagnostics[0]!.stage).toBe('mapping')
  })

  it('rejects an unsafe integer source value through 7C instead of silently rounding it', () => {
    const error = expectSerializationError(
      () => loadProject(JSON.stringify(documentWith(['project', 'mapping', 'grid', 'columns'], Number.MAX_SAFE_INTEGER + 2))),
      'SERIALIZATION_PROJECT_INVALID', ['project'],
    )
    expect(error.validation?.valid).toBe(false)
  })

  it('passes an extreme but finite module value to 7C without changing source values', () => {
    const document = documentWith(['project', 'mapping', 'hardwareTopology', 'modules', 0, 'width'], 1e308)
    const parsed = parseProject(JSON.stringify(document))
    expect(parsed.project.mapping.hardwareTopology.modules[0]!.width).toBe(1e308)
    const error = expectSerializationError(
      () => loadProject(JSON.stringify(document)),
      'SERIALIZATION_PROJECT_INVALID', ['project'],
    )
    expect(error.validation?.valid).toBe(false)
  })

  it('rejects inconsistent runtime local coordinates on save without repairing them', () => {
    const project = minimalProject()
    mutable(project.mapping.hardwareTopology.modules[0]!).localX = 999
    const error = expectSerializationError(
      () => serializeProject({ project }),
      'SERIALIZATION_PROJECT_INVALID', ['project'],
    )
    expect(error.validation?.diagnostics[0]).toMatchObject({ stage: 'mapping', code: 'HARDWARE_LAYOUT_MISMATCH' })
    expect(project.mapping.hardwareTopology.modules[0]!.localX).toBe(999)
  })

  it('rejects an incomplete explicit order on save before returning text', () => {
    const base = minimalProject()
    const project: ValidateProjectInput = {
      ...base,
      mapping: { ...base.mapping, hardwareTopology: { ...base.mapping.hardwareTopology, processorOrder: [] } },
    }
    const error = expectSerializationError(
      () => serializeProject({ project }),
      'SERIALIZATION_PROJECT_INVALID', ['project'],
    )
    expect(error.validation?.valid).toBe(false)
    expect(error.validation?.checks[1]).toEqual({ stage: 'mapping', status: 'failed' })
  })

  it('rejects a nonempty runtime rule set on save', () => {
    const project = { ...minimalProject(), rules: nonemptyRules() as ValidateProjectInput['rules'] }
    const error = expectSerializationError(
      () => serializeProject({ project }),
      'SERIALIZATION_PROJECT_INVALID', ['project'],
    )
    expect(error.validation?.diagnostics[0]).toMatchObject({ code: 'REMAP_UNSUPPORTED_RULE', path: ['rules'] })
  })

  it('accepts a deeply frozen runtime project', () => {
    const text = serializeProject({ project: deepFreeze(minimalProject()) })
    expect(loadProject(text).project).toEqual(minimalProject())
  })

  it('rejects accessors inside the runtime project without invoking them', () => {
    let calls = 0
    const project = minimalProject()
    Object.defineProperty(project, 'rules', {
      get: () => { calls += 1; return [] },
      enumerable: true,
      configurable: true,
    })
    expectSerializationError(
      () => serializeProject({ project }),
      'SERIALIZATION_INVALID_INPUT', ['project', 'rules'],
    )
    expect(calls).toBe(0)
  })
})
