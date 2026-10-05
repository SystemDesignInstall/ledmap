import type { LedMapProjectV2 } from '@ledmap/core'

function xmlEscape(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}

function csvCell(value: string | number | boolean): string {
  const text = String(value)
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text
}

export interface ResolumeSlice {
  readonly screenName: string
  readonly sliceName: string
  readonly enabled: boolean
  readonly inputRect: { readonly x: number; readonly y: number; readonly width: number; readonly height: number }
  readonly inputRotation: number
  readonly outputRect: { readonly x: number; readonly y: number; readonly width: number; readonly height: number }
  readonly outputRotation: number
  readonly flipH: boolean
  readonly flipV: boolean
  readonly maskEnabled: boolean
  readonly maskPoints: readonly { readonly x: number; readonly y: number }[]
}

export function selectResolumeSlices(project: LedMapProjectV2, mediaOutputId?: string): readonly ResolumeSlice[] {
  const outputs = mediaOutputId
    ? project.content.mediaOutputs.filter(output => output.id === mediaOutputId)
    : project.content.mediaOutputs
  const mappings = new Map(project.content.outputMappings.map(mapping => [mapping.id, mapping]))
  return outputs.flatMap(output => output.mappingOrder
    .map(id => mappings.get(id))
    .filter(mapping => mapping !== undefined && mapping.mediaOutputId === output.id)
    .map(mapping => ({
      screenName: output.name,
      sliceName: mapping!.name,
      enabled: mapping!.enabled,
      inputRect: { ...mapping!.screenRect },
      inputRotation: mapping!.inputRotation,
      outputRect: { ...mapping!.outputRect },
      outputRotation: mapping!.outputRotation,
      flipH: mapping!.flipX,
      flipV: mapping!.flipY,
      maskEnabled: mapping!.mask?.enabled ?? false,
      maskPoints: mapping!.mask?.points.map(point => ({ ...point })) ?? [],
    })))
}

export function buildResolumeXml(project: LedMapProjectV2, mediaOutputId?: string): string {
  const outputs = mediaOutputId
    ? project.content.mediaOutputs.filter(output => output.id === mediaOutputId)
    : project.content.mediaOutputs
  if (mediaOutputId && outputs.length === 0) throw new Error(`Unknown Media Output: ${mediaOutputId}`)
  const lines = ['<?xml version="1.0" encoding="UTF-8"?>', '<LedMapResolume version="1">']
  for (const output of outputs) {
    lines.push(`  <Screen name="${xmlEscape(output.name)}" width="${output.resolution.width}" height="${output.resolution.height}">`)
    for (const slice of selectResolumeSlices(project, output.id)) {
      lines.push(`    <Slice name="${xmlEscape(slice.sliceName)}" enabled="${slice.enabled}">`)
      lines.push(`      <InputRect x="${slice.inputRect.x}" y="${slice.inputRect.y}" width="${slice.inputRect.width}" height="${slice.inputRect.height}" orientation="${slice.inputRotation}" flipH="${slice.flipH}" flipV="${slice.flipV}" />`)
      lines.push(`      <OutputRect x="${slice.outputRect.x}" y="${slice.outputRect.y}" width="${slice.outputRect.width}" height="${slice.outputRect.height}" orientation="${slice.outputRotation}" />`)
      if (slice.maskEnabled) {
        lines.push('      <SliceMask enabled="true">')
        for (const point of slice.maskPoints) lines.push(`        <Point x="${point.x}" y="${point.y}" />`)
        lines.push('      </SliceMask>')
      } else {
        lines.push('      <SliceMask enabled="false" />')
      }
      lines.push('    </Slice>')
    }
    lines.push('  </Screen>')
  }
  lines.push('</LedMapResolume>')
  return lines.join('\n') + '\n'
}

export const HIPPO_CSV_COLUMNS = [
  'block', 'screen', 'slice', 'enabled',
  'srcX', 'srcY', 'srcW', 'srcH', 'srcRot',
  'dstX', 'dstY', 'dstW', 'dstH', 'dstRot',
  'flipH', 'flipV', 'maskPoints',
] as const

export function buildHippoCsv(project: LedMapProjectV2, mediaOutputId?: string): string {
  const slices = selectResolumeSlices(project, mediaOutputId)
  const rows = [HIPPO_CSV_COLUMNS.join(',')]
  slices.forEach((slice, block) => {
    rows.push([
      block, slice.screenName, slice.sliceName, slice.enabled,
      slice.inputRect.x, slice.inputRect.y, slice.inputRect.width, slice.inputRect.height, slice.inputRotation,
      slice.outputRect.x, slice.outputRect.y, slice.outputRect.width, slice.outputRect.height, slice.outputRotation,
      slice.flipH, slice.flipV, slice.maskEnabled ? slice.maskPoints.length : 0,
    ].map(csvCell).join(','))
  })
  return rows.join('\n') + '\n'
}
