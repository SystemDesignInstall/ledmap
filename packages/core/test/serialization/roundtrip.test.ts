import { describe, expect, it } from 'vitest'
import { loadProject, parseProject, serializeProject, type ValidateProjectInput } from '../../src/index.js'
import { assertFrozen } from '../mapping-engine/fixtures.js'
import { minimalDocument, minimalGoldenText, minimalProject, multiProcessorProject, mutable } from './fixtures.js'

function normalized(value: unknown): unknown {
  return JSON.parse(JSON.stringify(value)) as unknown
}

describe('7D round-trip invariants', () => {
  it('returns byte-identical output for repeated saves of equal source values', () => {
    const first = serializeProject({ project: minimalProject() })
    const loaded = loadProject(first)
    const second = serializeProject({ project: loaded.project, extensions: loaded.extensions })
    const reloaded = loadProject(second)
    expect(second).toBe(first)
    expect(serializeProject({ project: reloaded.project, extensions: reloaded.extensions })).toBe(first)
  })

  it('preserves every source field, reference and explicit order', () => {
    for (const project of [minimalProject(), multiProcessorProject()]) {
      const text = serializeProject({ project })
      const loaded = loadProject(text)
      expect(loaded.project).toEqual(project)
      expect(normalized(loaded.project)).toEqual(normalized(project))
    }
  })

  it('restores module local coordinates instead of reading them from the file', () => {
    const project = minimalProject()
    mutable(project.mapping.hardwareTopology.modules[0]!).localX = 0
    mutable(project.mapping.hardwareTopology.modules[0]!).localY = 0
    const text = serializeProject({ project })
    expect(text).not.toContain('localX')
    const loaded = loadProject(text)
    expect(loaded.project.mapping.hardwareTopology.modules[0]!.localX).toBe(0)
    expect(loaded.project.mapping.hardwareTopology.modules[0]!.localY).toBe(0)
  })

  it('normalizes negative zero to zero without changing geometry', () => {
    const project = minimalProject()
    mutable(project.mapping.region.inputRect).x = -0
    const text = serializeProject({ project })
    expect(text).toContain('"x": 0')
    expect(text).not.toContain('-0')
    const loaded = loadProject(text)
    expect(Object.is(loaded.project.mapping.region.inputRect.x, 0)).toBe(true)
    expect(loaded.validation.valid).toBe(true)
  })

  it('does not mutate caller-owned input while saving', () => {
    const project = multiProcessorProject()
    const extensions = { z: 1, a: 2 }
    const before = { project: normalized(project), extensions: normalized(extensions) }
    serializeProject({ project, extensions })
    expect(normalized(project)).toEqual(before.project)
    expect(normalized(extensions)).toEqual(before.extensions)
    expect(Object.isFrozen(project)).toBe(false)
  })

  it('keeps loaded values deeply immutable', () => {
    const loaded = loadProject(minimalGoldenText)
    assertFrozen(loaded.project.mapping.hardwareTopology.cabinets[0])
    assertFrozen(loaded.project.rules)
    assertFrozen(loaded.extensions)
    expect(Object.isFrozen(loaded.validation.diagnostics)).toBe(true)
    expect(Object.isFrozen(parseProject(minimalGoldenText))).toBe(true)
  })

  it('canonicalizes any equivalent v2 text to the same bytes', () => {
    const compact = JSON.stringify(minimalDocument())
    const loaded = loadProject(compact)
    expect(serializeProject({ project: loaded.project, extensions: loaded.extensions })).toBe(minimalGoldenText)
  })

  it('parses its own output back into the same document value', () => {
    const text = serializeProject({ project: minimalProject() })
    expect(parseProject(text)).toEqual(minimalDocument())
  })

  it('keeps receiver pixelCapacity absence stable across a round-trip', () => {
    const base = minimalProject()
    const receiver = base.mapping.hardwareTopology.receivers[0]!
    const project: ValidateProjectInput = {
      ...base,
      mapping: {
        ...base.mapping,
        hardwareTopology: {
          ...base.mapping.hardwareTopology,
          receivers: [{ id: receiver.id, processor: receiver.processor, port: receiver.port, index: receiver.index, cabinets: receiver.cabinets }],
        },
      },
    }
    const text = serializeProject({ project })
    expect(text).not.toContain('pixelCapacity')
    const loaded = loadProject(text)
    expect(loaded.project.mapping.hardwareTopology.receivers[0]!.pixelCapacity).toBeUndefined()
    expect(serializeProject({ project: loaded.project, extensions: loaded.extensions })).toBe(text)
  })

  it('preserves spatial transforms and polygon masks semantically', () => {
    const base = minimalProject()
    const project: ValidateProjectInput = {
      ...base,
      mapping: {
        ...base.mapping,
        region: {
          ...base.mapping.region,
          transform: {
            inputRotation: 180,
            screenRotation: 180,
            flipX: true,
            flipY: true,
            mask: {
              enabled: true,
              points: [{ x: 0, y: 0 }, { x: 2, y: 0 }, { x: 2, y: 3 }, { x: 0, y: 3 }],
            },
          },
        },
      },
    }
    const text = serializeProject({ project })
    const loaded = loadProject(text)
    expect(loaded.project).toEqual(project)
    expect(serializeProject({ project: loaded.project, extensions: loaded.extensions })).toBe(text)
  })
})
