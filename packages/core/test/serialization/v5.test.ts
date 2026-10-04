import { describe, expect, it } from 'vitest'
import {
  loadLedMapProject, loadProjectV3, loadProjectV5, parseProjectV5Document, serializeProjectV5,
} from '../../src/index.js'
import fullV3 from './fixtures/full-v3.ledmap?raw'

describe('native schema-v5 persistence', () => {
  it('round-trips migrated v5 with rotations, flips, sub-rects and masks', () => {
    const legacy = loadProjectV3(fullV3)
    const base = legacy.project.content.outputMappings[0]!
    const project = { ...legacy.project, content: { ...legacy.project.content,
      outputMappings: [{ ...base,
        name: 'Slice A', enabled: true,
        screenRect: { x: 1, y: 0, width: 2, height: 2 },
        outputRect: { x: 3, y: 1, width: 2, height: 2 },
        inputRotation: 0 as const, outputRotation: 90 as const, flipX: true, flipY: false,
        mask: { enabled: true, points: [{ x: 0, y: 0 }, { x: 4, y: 0 }, { x: 0, y: 2 }] },
      }] } }
    const first = serializeProjectV5({ project, extensions: legacy.extensions })
    expect(parseProjectV5Document(first).schemaVersion).toBe(5)
    expect(loadLedMapProject(first).sourceSchemaVersion).toBe(5)
    const reopened = loadProjectV5(first)
    expect(reopened.project.content.outputMappings[0]).toEqual(project.content.outputMappings[0])
    expect(serializeProjectV5({ project: reopened.project, extensions: reopened.extensions })).toBe(first)
  })

  it('rejects invalid rotations, rects and unknown v5 fields', () => {
    const legacy = loadProjectV3(fullV3)
    const text = serializeProjectV5({ project: legacy.project })
    const document = JSON.parse(text) as {
      project: { content: { outputMappings: [{ inputRotation: number; outputRect: { width: number }; future?: boolean }] } }
    }
    document.project.content.outputMappings[0].inputRotation = 45
    expect(() => loadProjectV5(JSON.stringify(document))).toThrow(/SERIALIZATION_INVALID_SCHEMA/)
    document.project.content.outputMappings[0].inputRotation = 0
    document.project.content.outputMappings[0].outputRect.width = 0
    expect(() => loadProjectV5(JSON.stringify(document))).toThrow(/SERIALIZATION_INVALID_SCHEMA/)
  })
})
