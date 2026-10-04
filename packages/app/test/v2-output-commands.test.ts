import { describe, expect, it } from 'vitest'
import { createEmptyProjectV2 } from '@ledmap/core'
import { ProjectDocumentController } from '../src/renderer/document.js'
import { addScreenV2, deleteScreensV2 } from '../src/renderer/v2-commands.js'
import {
  addMediaOutputV2, addOutputMappingV2, addOutputMaskPointV2, deleteMediaOutputV2, deleteOutputMappingV2,
  moveOutputMaskPointV2, removeOutputMaskPointV2, reorderOutputMappingV2, setOutputMappingMaskV2,
  splitOutputMappingIntoRowsV2,
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
    expect(output.content.mediaOutputs[0]).toMatchObject({ name: 'Main', resolution: { width: 1920, height: 1080 }, mappingOrder: [] })
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
    expect(mapping.outputRect.x).toBe(0)
    expect(mapping.outputRect.y).toBe(0)
    expect(withMapping.content.mediaOutputs[0]?.mappingOrder).toEqual([mapping.id])
    expect(() => deleteMediaOutputV2(withMapping, mediaOutputId)).toThrow(/PROJECT_MEDIA_OUTPUT_IN_USE/)
    expect(() => deleteScreensV2(withMapping, [screenId])).toThrow(/PROJECT_SCREEN_IN_USE/)
    const masked = { ...withMapping, content: { ...withMapping.content,
      outputMappings: [{ ...mapping, mask: { enabled: true, points: [{ x: 0, y: 0 }, { x: 4, y: 0 }, { x: 0, y: 4 }] } }] } }
    const moved = updateOutputMappingV2(masked, mapping.id, { position: { x: -1, y: 2 } })
    expect(moved.content.outputMappings[0]).toMatchObject({ id: mapping.id, outputRect: expect.objectContaining({ x: -1, y: 2 }) })
    expect(moved.content.outputMappings[0]?.mask?.points).toHaveLength(3)
    expect(updateOutputMappingV2(moved, mapping.id, { position: { x: -1, y: 2 } })).toBe(moved)
    expect(moved.content.mappingRegions).toBe(output.content.mappingRegions)
    expect(moved.hardware).toBe(output.hardware)
    expect(moved.operations.signalRoutes).toBe(output.operations.signalRoutes)
    const deleted = deleteOutputMappingV2(moved, mapping.id)
    expect(deleted.content.outputMappings).toEqual([])
    expect(deleted.content.mediaOutputs[0]?.mappingOrder).toEqual([])
  })

  it('honors no-op revisions, one grouped drag Undo step, V5 Save/Open and recovery-ready snapshots', () => {
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
    expect(document.session.project.content.outputMappings[0]?.outputRect).toMatchObject({ x: 8, y: 9 })
    expect(document.undo()).toBe(true)
    expect(document.session.project.content.outputMappings[0]?.outputRect).toMatchObject({ x: 0, y: 0 })
    expect(document.redo()).toBe(true)
    expect(document.session.project.content.outputMappings[0]?.outputRect).toMatchObject({ x: 8, y: 9 })
    const text = serializeProjectSession(document.session)
    expect(JSON.parse(text).schemaVersion).toBe(5)
    expect(loadProjectSession(text, 'output.ledmap', 'document-2').project.content.outputMappings[0]?.outputRect)
      .toMatchObject({ x: 8, y: 9 })
  })

  it('edits rects, rotations, flips and names atomically', () => {
    const { output, screenId, mediaOutputId } = fixture()
    const base = addOutputMappingV2(output, screenId, mediaOutputId, { x: 0, y: 0 })
    const id = base.content.outputMappings[0]!.id
    const screen = base.design.screens[0]!
    const rotated = updateOutputMappingV2(base, id, { inputRotation: 90, outputRotation: 0, flipX: true, name: 'Slice A' })
    expect(rotated.content.outputMappings[0]).toMatchObject({ inputRotation: 90, flipY: false, name: 'Slice A' })
    expect(() => updateOutputMappingV2(base, id, { inputRotation: 45 as never })).toThrow(/PROJECT_INVALID_GEOMETRY/)
    expect(() => updateOutputMappingV2(base, id,
      { screenRect: { x: 0, y: 0, width: screen.resolution.width + 1, height: 1 } })).toThrow(/exceeds Screen/)
    expect(() => updateOutputMappingV2(base, id, { name: '' })).toThrow(/PROJECT_INVALID_NAME/)
  })

  it('rejects a patch with one invalid field without partial application', () => {
    const { output, screenId, mediaOutputId } = fixture()
    const base = addOutputMappingV2(output, screenId, mediaOutputId, { x: 5, y: 5 })
    const id = base.content.outputMappings[0]!.id
    expect(() => updateOutputMappingV2(base, id, { position: { x: 1, y: 1 }, inputRotation: 45 as never }))
      .toThrow(/PROJECT_INVALID_GEOMETRY/)
    expect(base.content.outputMappings[0]?.outputRect).toMatchObject({ x: 5, y: 5 })
  })

  it('manages polygon masks with a 3-point minimum for enabled masks', () => {
    const { output, screenId, mediaOutputId } = fixture()
    const base = addOutputMappingV2(output, screenId, mediaOutputId, { x: 0, y: 0 })
    const id = base.content.outputMappings[0]!.id
    const triangle = [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 0, y: 10 }]
    const masked = setOutputMappingMaskV2(base, id, { enabled: true, points: triangle })
    expect(masked.content.outputMappings[0]?.mask?.points).toHaveLength(3)
    expect(() => setOutputMappingMaskV2(base, id, { enabled: true, points: [{ x: 0, y: 0 }] })).toThrow(/at least 3/)
    const moved = moveOutputMaskPointV2(masked, id, 0, { x: 1, y: 1 })
    expect(moved.content.outputMappings[0]?.mask?.points[0]).toEqual({ x: 1, y: 1 })
    const added = addOutputMaskPointV2(moved, id, { x: 5, y: 5 })
    expect(added.content.outputMappings[0]?.mask?.points).toHaveLength(4)
    const removed = removeOutputMaskPointV2(added, id, 0)
    expect(removed.content.outputMappings[0]?.mask?.points).toHaveLength(3)
    expect(() => removeOutputMaskPointV2(removed, id, 0)).toThrow(/at least 3/)
  })

  it('reorders mappings explicitly inside one Media Output', () => {
    const { output, screenId, mediaOutputId } = fixture()
    const one = addOutputMappingV2(output, screenId, mediaOutputId, { x: 0, y: 0 })
    const two = addOutputMappingV2(one, screenId, mediaOutputId, { x: 10, y: 0 })
    const ids = two.content.outputMappings.map(value => value.id)
    const reordered = reorderOutputMappingV2(two, mediaOutputId, ids[0]!, 1)
    expect(reordered.content.mediaOutputs[0]?.mappingOrder).toEqual([ids[1], ids[0]])
    expect(reorderOutputMappingV2(two, mediaOutputId, ids[0]!, 0)).toBe(two)
    expect(() => reorderOutputMappingV2(two, mediaOutputId, ids[0]!, 5)).toThrow(/out of range/)
  })

  it('splits one mapping into rows with proportional screen parts stacked in output', () => {
    const { output, screenId, mediaOutputId } = fixture()
    const screen = output.design.screens[0]!
    const base = addOutputMappingV2(output, screenId, mediaOutputId, { x: 0, y: 0 })
    const id = base.content.outputMappings[0]!.id
    const split = splitOutputMappingIntoRowsV2(base, id, 3)
    expect(split.content.outputMappings).toHaveLength(3)
    expect(split.content.mediaOutputs[0]?.mappingOrder).toHaveLength(3)
    const widths = split.content.outputMappings.map(value => value.screenRect.width)
    expect(widths.reduce((a, b) => a + b, 0)).toBe(screen.resolution.width)
    expect(new Set(widths).size).toBeLessThanOrEqual(2)
    const ys = split.content.outputMappings.map(value => value.outputRect.y)
    expect(ys[1]).toBe(ys[0]! + split.content.outputMappings[0]!.outputRect.height)
    expect(split.content.outputMappings.every(value => value.mask === undefined)).toBe(true)
  })
})
