import { describe, expect, it } from 'vitest'
import {
  loadLedMapProject, loadProjectV3, loadProjectV4, parseProjectV4Document,
  serializeProjectV4, serializeProjectV5,
} from '../../src/index.js'
import fullV3 from './fixtures/full-v3.ledmap?raw'

describe('v4 legacy migration to v5', () => {
  it('migrates a V3 mapping to full-screen rects with explicit order', () => {
    const legacy = loadProjectV3(fullV3)
    const mapping = legacy.project.content.outputMappings[0]!
    expect(mapping.screenRect).toEqual({ x: 0, y: 0, width: 4, height: 2 })
    expect(mapping.outputRect).toEqual({ x: 0, y: 0, width: 4, height: 2 })
    expect(mapping.name).toBe(mapping.id)
    expect(mapping.enabled).toBe(true)
    expect(mapping.inputRotation).toBe(0)
    expect(mapping.mask?.enabled).toBe(true)
    expect(legacy.project.content.mediaOutputs[0]?.mappingOrder).toEqual([mapping.id])
  })

  it('preserves explicit v4 placement through v5 round-trip and v4 downgrade', () => {
    const legacy = loadProjectV3(fullV3)
    const mapping = legacy.project.content.outputMappings[0]!
    const moved = { ...mapping, outputRect: { ...mapping.outputRect, x: -12, y: 24 } }
    const project = { ...legacy.project, content: { ...legacy.project.content, outputMappings: [moved] } }
    const first = serializeProjectV5({ project, extensions: legacy.extensions })
    const reopened = loadLedMapProject(first)
    expect(reopened.sourceSchemaVersion).toBe(5)
    expect(reopened.project.content.outputMappings[0]?.outputRect).toEqual({ x: -12, y: 24, width: 4, height: 2 })
    const downgraded = serializeProjectV4({ project: reopened.project, extensions: reopened.extensions })
    expect(parseProjectV4Document(downgraded).schemaVersion).toBe(4)
    expect(JSON.parse(downgraded).project.content.outputMappings[0].position).toEqual({ x: -12, y: 24 })
    const reupgraded = loadProjectV4(downgraded)
    expect(reupgraded.sourceSchemaVersion).toBe(4)
    expect(reupgraded.project.content.outputMappings[0]?.outputRect).toEqual({ x: -12, y: 24, width: 4, height: 2 })
  })

  it('rejects invalid v4 positions and unknown v4 fields', () => {
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
