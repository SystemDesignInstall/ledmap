import { describe, expect, it } from 'vitest'
import {
  loadLedMapProject, loadProjectV3, loadProjectV4, parseProjectV4Document,
  serializeProjectV3, serializeProjectV4,
} from '../../src/index.js'
import fullV3 from './fixtures/full-v3.ledmap?raw'

describe('native schema-v4 persistence', () => {
  it('preserves explicit placement and existing mask through exact round-trip', () => {
    const legacy = loadProjectV3(fullV3)
    expect(legacy.project.content.outputMappings[0]?.position).toBeUndefined()
    const mapping = legacy.project.content.outputMappings[0]!
    const project = { ...legacy.project, content: { ...legacy.project.content,
      outputMappings: [{ ...mapping, position: { x: -12, y: 24 } }] } }
    const first = serializeProjectV4({ project, extensions: legacy.extensions })
    const reopened = loadProjectV4(first)
    expect(reopened.project.content.outputMappings[0]).toEqual({ ...mapping, position: { x: -12, y: 24 } })
    expect(serializeProjectV4({ project: reopened.project, extensions: reopened.extensions })).toBe(first)
    expect(parseProjectV4Document(first).schemaVersion).toBe(4)
    expect(loadLedMapProject(first).sourceSchemaVersion).toBe(4)
  })

  it('upgrades a V3 mapping without inventing a placement and keeps the V3 reader strict', () => {
    const legacy = loadProjectV3(fullV3)
    const upgraded = serializeProjectV4({ project: legacy.project, extensions: legacy.extensions })
    expect(loadProjectV4(upgraded).project.content.outputMappings[0]?.position).toBeUndefined()
    expect(JSON.parse(upgraded).project.content.outputMappings[0]).not.toHaveProperty('position')
    const withPosition = JSON.parse(upgraded) as { schemaVersion: number; project: { content: { outputMappings: [{ position?: { x: number; y: number } }] } } }
    withPosition.schemaVersion = 3
    withPosition.project.content.outputMappings[0].position = { x: 0, y: 0 }
    expect(() => loadProjectV3(JSON.stringify(withPosition))).toThrow(/SERIALIZATION_INVALID_SCHEMA/)
    expect(() => serializeProjectV3({ project: { ...legacy.project, content: { ...legacy.project.content,
      outputMappings: [{ ...legacy.project.content.outputMappings[0]!, position: { x: 0, y: 0 } }] } } }))
      .toThrow(/SERIALIZATION_INVALID_INPUT/)
  })

  it('rejects invalid positions and unknown V4 fields', () => {
    const document = JSON.parse(serializeProjectV4({ project: loadProjectV3(fullV3).project })) as {
      project: { content: { outputMappings: [{ position?: { x: number; y: number }; future?: boolean }] } }
    }
    document.project.content.outputMappings[0].position = { x: 0.5, y: 0 }
    expect(() => loadProjectV4(JSON.stringify(document))).toThrow(/SERIALIZATION_INVALID_SCHEMA/)
    document.project.content.outputMappings[0].position = { x: 0, y: 0 }
    document.project.content.outputMappings[0].future = true
    expect(() => loadProjectV4(JSON.stringify(document))).toThrow(/SERIALIZATION_INVALID_SCHEMA/)
  })
})
