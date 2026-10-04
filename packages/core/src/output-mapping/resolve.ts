import { DomainError } from '../model/errors.js'
import type { OutputMappingId } from '../project-model/ids.js'
import type { LedMapProjectV2, OutputMapping } from '../project-model/types.js'
import { intersectRect, isScreenPixelMaskedOut, outputPointToScreen, screenPointToOutput } from './geometry.js'

export type OutputMappingDiagnosticCode =
  | 'OUTPUT_MAPPING_PARTIALLY_CLIPPED'
  | 'OUTPUT_MAPPING_OUTSIDE'
  | 'OUTPUT_MAPPING_OVERLAP'

export interface OutputMappingDiagnostic {
  readonly code: OutputMappingDiagnosticCode
  readonly mappingIds: readonly string[]
  readonly severity: 'warning' | 'error'
}

export interface VisibleOutputRect {
  readonly x: number
  readonly y: number
  readonly width: number
  readonly height: number
}

export interface OutputMappingPlacement {
  readonly mappingId: string
  readonly screenId: string
  readonly name: string
  readonly enabled: boolean
  readonly screenRect: OutputMapping['screenRect']
  readonly outputRect: OutputMapping['outputRect']
  readonly visibleRect: VisibleOutputRect | null
  readonly coverage: 'inside' | 'partially-clipped' | 'outside' | 'disabled'
}

export interface MediaOutputMappingInspection {
  readonly mediaOutputId: string
  readonly resolution: { readonly width: number; readonly height: number }
  readonly placements: readonly OutputMappingPlacement[]
  readonly diagnostics: readonly OutputMappingDiagnostic[]
}

export type MediaOutputPixel =
  | { readonly status: 'resolved'; readonly mappingId: string; readonly screenId: string; readonly screenX: number; readonly screenY: number }
  | { readonly status: 'empty' }
  | { readonly status: 'blocked'; readonly code: 'OUTPUT_MAPPING_OVERLAP' }

function coverageOf(outputRect: OutputMapping['outputRect'], width: number, height: number): Pick<OutputMappingPlacement, 'visibleRect' | 'coverage'> {
  const visible = intersectRect(outputRect, { x: 0, y: 0, width, height })
  if (!visible) return { visibleRect: null, coverage: 'outside' }
  const inside = outputRect.x >= 0 && outputRect.y >= 0 &&
    BigInt(outputRect.x) + BigInt(outputRect.width) <= BigInt(width) &&
    BigInt(outputRect.y) + BigInt(outputRect.height) <= BigInt(height)
  return { visibleRect: visible, coverage: inside ? 'inside' : 'partially-clipped' }
}

function overlap(a: VisibleOutputRect, b: VisibleOutputRect): boolean {
  return a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height
}

export function inspectMediaOutputMapping(project: LedMapProjectV2, mediaOutputId: string): MediaOutputMappingInspection {
  const output = project.content.mediaOutputs.find(value => value.id === mediaOutputId)
  if (!output) throw new DomainError('PROJECT_UNKNOWN_MEDIA_OUTPUT', `Unknown Media Output: ${mediaOutputId}`)
  const screens = new Map(project.design.screens.map(screen => [screen.id, screen]))
  const mappingsById = new Map(project.content.outputMappings.map(mapping => [mapping.id, mapping]))
  const orderedIds = output.mappingOrder.length > 0
    ? output.mappingOrder
    : project.content.outputMappings.filter(mapping => mapping.mediaOutputId === mediaOutputId).map(mapping => mapping.id)
  const diagnostics: OutputMappingDiagnostic[] = []
  const placements = orderedIds.map(mappingId => {
    const mapping = mappingsById.get(mappingId)
    if (!mapping || mapping.mediaOutputId !== mediaOutputId) {
      throw new DomainError('PROJECT_UNKNOWN_OUTPUT_MAPPING', `Unknown Output Mapping: ${mappingId}`)
    }
    const screen = screens.get(mapping.screenId)
    if (!screen) throw new DomainError('PROJECT_UNKNOWN_SCREEN', `Unknown Screen: ${mapping.screenId}`)
    if (!mapping.enabled) {
      return Object.freeze({ mappingId: mapping.id, screenId: mapping.screenId, name: mapping.name,
        enabled: false, screenRect: mapping.screenRect, outputRect: mapping.outputRect,
        visibleRect: null, coverage: 'disabled' as const })
    }
    const visible = coverageOf(mapping.outputRect, output.resolution.width, output.resolution.height)
    if (visible.coverage === 'partially-clipped') diagnostics.push({ code: 'OUTPUT_MAPPING_PARTIALLY_CLIPPED', mappingIds: [mapping.id], severity: 'warning' })
    if (visible.coverage === 'outside') diagnostics.push({ code: 'OUTPUT_MAPPING_OUTSIDE', mappingIds: [mapping.id], severity: 'warning' })
    return Object.freeze({ mappingId: mapping.id, screenId: mapping.screenId, name: mapping.name,
      enabled: true, screenRect: mapping.screenRect, outputRect: mapping.outputRect,
      visibleRect: visible.visibleRect, coverage: visible.coverage })
  })
  const enabled = placements.filter(value => value.enabled && value.visibleRect)
  for (let i = 0; i < enabled.length; i += 1) {
    for (let j = i + 1; j < enabled.length; j += 1) {
      const a = enabled[i]!
      const b = enabled[j]!
      if (a.visibleRect && b.visibleRect && overlap(a.visibleRect, b.visibleRect)) {
        diagnostics.push({ code: 'OUTPUT_MAPPING_OVERLAP', mappingIds: [a.mappingId, b.mappingId], severity: 'error' })
      }
    }
  }
  return Object.freeze({ mediaOutputId, resolution: output.resolution,
    placements: Object.freeze(placements), diagnostics: Object.freeze(diagnostics.map(value => Object.freeze({
      ...value, mappingIds: Object.freeze(value.mappingIds),
    }))) })
}

export function createMediaOutputPixelResolver(project: LedMapProjectV2, mediaOutputId: string): (x: number, y: number) => MediaOutputPixel {
  const inspection = inspectMediaOutputMapping(project, mediaOutputId)
  const mappingsById = new Map(project.content.outputMappings.map(mapping => [mapping.id, mapping]))
  return (x, y) => {
    if (!Number.isSafeInteger(x) || !Number.isSafeInteger(y)) {
      throw new DomainError('OUTPUT_PIXEL_INVALID', 'Media Output pixel coordinates must be safe integers')
    }
    if (x < 0 || y < 0 || x >= inspection.resolution.width || y >= inspection.resolution.height) return { status: 'empty' }
    const hits = inspection.placements.filter(value => value.enabled && value.visibleRect &&
      x >= value.visibleRect.x && x < value.visibleRect.x + value.visibleRect.width &&
      y >= value.visibleRect.y && y < value.visibleRect.y + value.visibleRect.height)
    if (hits.length > 1) return { status: 'blocked', code: 'OUTPUT_MAPPING_OVERLAP' }
    const hit = hits[0]
    if (!hit) return { status: 'empty' }
    const mapping = mappingsById.get(hit.mappingId as OutputMappingId)!
    const screen = outputPointToScreen(mapping, x, y)
    if (!screen) return { status: 'empty' }
    if (isScreenPixelMaskedOut(screen.x, screen.y, mapping.mask)) return { status: 'empty' }
    return { status: 'resolved', mappingId: hit.mappingId, screenId: hit.screenId, screenX: screen.x, screenY: screen.y }
  }
}

export function resolveMediaOutputPixel(project: LedMapProjectV2, mediaOutputId: string, x: number, y: number): MediaOutputPixel {
  return createMediaOutputPixelResolver(project, mediaOutputId)(x, y)
}

export function resolveScreenPixelToOutput(project: LedMapProjectV2, mappingId: string, screenX: number, screenY: number): { readonly x: number; readonly y: number } | null {
  const mapping = project.content.outputMappings.find(value => value.id === mappingId)
  if (!mapping) throw new DomainError('PROJECT_UNKNOWN_OUTPUT_MAPPING', `Unknown Output Mapping: ${mappingId}`)
  if (!mapping.enabled) return null
  if (!Number.isSafeInteger(screenX) || !Number.isSafeInteger(screenY)) {
    throw new DomainError('OUTPUT_PIXEL_INVALID', 'Screen pixel coordinates must be safe integers')
  }
  if (isScreenPixelMaskedOut(screenX, screenY, mapping.mask)) return null
  return screenPointToOutput(mapping, screenX, screenY)
}
