import { describe, expect, it } from 'vitest'
import { createEmptyProjectV2 } from '@ledmap/core'
import { ProjectDocumentController } from '../src/renderer/document.js'
import { addScreenV2, deleteScreensV2 } from '../src/renderer/v2-commands.js'
import {
  addMediaOutputV2, addOutputMappingV2, deleteMediaOutputV2, deleteOutputMappingV2,
  updateMediaOutputV2, updateOutputMappingV2,
} from '../src/renderer/v2-output-commands.js'
import { loadProjectSession, serializeProjectSession } from '../src/renderer/project-session.js'

function fixture() {
  const base = addScreenV2(createEmptyProjectV2())
  const output = addMediaOutputV2(base, 1920, 1080, 'Main')
  const screenId = output.design.screens[0]!.id
  const mediaOutputId = output.content.mediaOutputs[0]!.id
  return { output, screenId, mediaOutputId }
}

describe('direct V2 Output Mapping commands', () => {
  it('creates, updates and deletes Media Outputs without changing unrelated domains', () => {
    const { output, mediaOutputId } = fixture()
    expect(output.content.mediaOutputs[0]).toMatchObject({ name: 'Main', resolution: { width: 1920, height: 1080 } })
    expect(updateMediaOutputV2(output, mediaOutputId, { name: 'Main', width: 1920 })).toBe(output)
    const changed = updateMediaOutputV2(output, mediaOutputId, { name: 'Wall', width: 1280 })
    expect(changed.content.mediaOutputs[0]).toMatchObject({ name: 'Wall', resolution: { width: 1280, height: 1080 } })
    expect(changed.design).toBe(output.design)
    expect(changed.hardware).toBe(output.hardware)
    expect(changed.operations).toBe(output.operations)
    expect(deleteMediaOutputV2(changed, mediaOutputId).content.mediaOutputs).toEqual([])
  })

  it('requires explicit position, blocks deletion dependencies, and preserves mask and ID on update', () => {
    const { output, screenId, mediaOutputId } = fixture()
    expect(() => addOutputMappingV2(output, screenId, mediaOutputId, { x: Number.NaN, y: 0 }))
      .toThrow(/PROJECT_INVALID_GEOMETRY/)
    const withMapping = addOutputMappingV2(output, screenId, mediaOutputId, { x: 0, y: 0 })
    const mapping = withMapping.content.outputMappings[0]!
    expect(mapping.position).toEqual({ x: 0, y: 0 })
    expect(() => deleteMediaOutputV2(withMapping, mediaOutputId)).toThrow(/PROJECT_MEDIA_OUTPUT_IN_USE/)
    expect(() => deleteScreensV2(withMapping, [screenId])).toThrow(/PROJECT_SCREEN_IN_USE/)
    const masked = { ...withMapping, content: { ...withMapping.content,
      outputMappings: [{ ...mapping, mask: { points: [{ x: 0.5, y: 1.5 }] } }] } }
    const moved = updateOutputMappingV2(masked, mapping.id, { position: { x: -1, y: 2 } })
    expect(moved.content.outputMappings[0]).toMatchObject({ id: mapping.id, position: { x: -1, y: 2 },
      mask: { points: [{ x: 0.5, y: 1.5 }] } })
    expect(updateOutputMappingV2(moved, mapping.id, { position: { x: -1, y: 2 } })).toBe(moved)
    expect(moved.content.mappingRegions).toBe(output.content.mappingRegions)
    expect(moved.hardware).toBe(output.hardware)
    expect(moved.operations.signalRoutes).toBe(output.operations.signalRoutes)
    expect(deleteOutputMappingV2(moved, mapping.id).content.outputMappings).toEqual([])
  })

  it('honors no-op revisions, one grouped drag Undo step, V4 Save/Open and recovery-ready snapshots', () => {
    const document = new ProjectDocumentController(() => 'document-1')
    document.transactV2(project => addScreenV2(project))
    document.transactV2(project => addMediaOutputV2(project, 1920, 1080))
    const screenId = document.session.project.design.screens[0]!.id
    const outputId = document.session.project.content.mediaOutputs[0]!.id
    document.transactV2(project => addOutputMappingV2(project, screenId, outputId, { x: 0, y: 0 }))
    const mappingId = document.session.project.content.outputMappings[0]!.id
    const revision = document.session.revision
    document.transactV2(project => updateOutputMappingV2(project, mappingId, { position: { x: 0, y: 0 } }))
    expect(document.session.revision).toBe(revision)
    const group = document.beginHistoryGroup()
    document.transactV2(project => updateOutputMappingV2(project, mappingId, { position: { x: 4, y: 5 } }), group)
    document.transactV2(project => updateOutputMappingV2(project, mappingId, { position: { x: 8, y: 9 } }), group)
    document.endHistoryGroup(group)
    expect(document.session.project.content.outputMappings[0]?.position).toEqual({ x: 8, y: 9 })
    expect(document.undo()).toBe(true)
    expect(document.session.project.content.outputMappings[0]?.position).toEqual({ x: 0, y: 0 })
    expect(document.redo()).toBe(true)
    expect(document.session.project.content.outputMappings[0]?.position).toEqual({ x: 8, y: 9 })
    const text = serializeProjectSession(document.session)
    expect(JSON.parse(text).schemaVersion).toBe(4)
    expect(loadProjectSession(text, 'output.ledmap', 'document-2').project.content.outputMappings[0]?.position)
      .toEqual({ x: 8, y: 9 })
  })
})
