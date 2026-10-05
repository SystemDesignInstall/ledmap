import { describe, expect, it } from 'vitest'
import { createEmptyProjectV2 } from '@ledmap/core'
import { addScreenV2 } from '../src/renderer/v2-commands.js'
import { addMediaOutputV2, addOutputMappingV2, setOutputMappingMaskV2, updateOutputMappingV2 } from '../src/renderer/v2-output-commands.js'
import { buildHippoCsv, buildResolumeXml, HIPPO_CSV_COLUMNS } from '../src/shared/media-output-adapters.js'

function fixture() {
  const base = addScreenV2(createEmptyProjectV2())
  const withOutput = addMediaOutputV2(base, 800, 600, 'FOH')
  const screenId = withOutput.design.screens[0]!.id
  const mediaId = withOutput.content.mediaOutputs[0]!.id
  const one = addOutputMappingV2(withOutput, screenId, mediaId, { x: 10, y: 20 })
  const mappingId = one.content.outputMappings[0]!.id
  const rotated = updateOutputMappingV2(one, mappingId, { name: 'Slice A', inputRotation: 0, outputRotation: 90, flipX: true })
  const masked = setOutputMappingMaskV2(rotated, mappingId,
    { enabled: true, points: [{ x: 0, y: 0 }, { x: 8, y: 0 }, { x: 0, y: 6 }] })
  return { project: masked, mediaId, mappingId }
}

describe('media server adapters', () => {
  it('exports Resolume XML with input/output rects, orientations, flip and mask', () => {
    const { project } = fixture()
    const xml = buildResolumeXml(project)
    expect(xml).toContain('<Screen name="FOH" width="800" height="600">')
    expect(xml).toContain('<Slice name="Slice A" enabled="true">')
    expect(xml).toContain('orientation="90"')
    expect(xml).toContain('flipH="true"')
    expect(xml).toContain('<SliceMask enabled="true">')
    expect(xml).toContain('<Point x="8" y="0" />')
  })

  it('exports Hippo CSV with block order, rects, rotations and mask counts', () => {
    const { project, mediaId } = fixture()
    const csv = buildHippoCsv(project, mediaId)
    const [header, row] = csv.trim().split('\n')
    expect(header).toBe(HIPPO_CSV_COLUMNS.join(','))
    expect(row).toContain('Slice A')
    expect(row).toContain(',90,')
    expect(row).toContain(',true,')
    expect(row?.split(',').length).toBe(HIPPO_CSV_COLUMNS.length)
  })

  it('keeps adapter order identical to mappingOrder', () => {
    const { project, mediaId } = fixture()
    const screenId = project.design.screens[0]!.id
    const two = addOutputMappingV2(project, screenId, mediaId, { x: 100, y: 0 })
    const csv = buildHippoCsv(two, mediaId)
    const rows = csv.trim().split('\n').slice(1)
    expect(rows).toHaveLength(2)
    expect(rows[0]).toContain('Slice A')
  })
})
