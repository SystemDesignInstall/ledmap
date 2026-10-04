import { DomainError } from '../model/errors.js'
import type { LedMapProjectV2, OutputMapping, ProjectScreen } from '../project-model/types.js'

export type OutputMappingDiagnosticCode =
  | 'OUTPUT_MAPPING_UNPLACED'
  | 'OUTPUT_MAPPING_PARTIALLY_CLIPPED'
  | 'OUTPUT_MAPPING_OUTSIDE'
  | 'OUTPUT_MAPPING_OVERLAP'
  | 'OUTPUT_MASK_UNSUPPORTED'

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
  readonly position: OutputMapping['position']
  readonly visibleRect: VisibleOutputRect | null
  readonly coverage: 'unplaced' | 'inside' | 'partially-clipped' | 'outside'
  readonly maskUnsupported: boolean
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
  | { readonly status: 'blocked'; readonly code: 'OUTPUT_MAPPING_UNPLACED' | 'OUTPUT_MAPPING_OVERLAP' | 'OUTPUT_MASK_UNSUPPORTED' }

function clipped(mapping: OutputMapping, screen: ProjectScreen, width: number, height: number): Pick<OutputMappingPlacement, 'visibleRect' | 'coverage'> {
  if (mapping.position === undefined) return { visibleRect: null, coverage: 'unplaced' }
  const left = BigInt(mapping.position.x)
  const top = BigInt(mapping.position.y)
  const right = left + BigInt(screen.resolution.width)
  const bottom = top + BigInt(screen.resolution.height)
  const x0 = left > 0n ? left : 0n
  const y0 = top > 0n ? top : 0n
  const x1 = right < BigInt(width) ? right : BigInt(width)
  const y1 = bottom < BigInt(height) ? bottom : BigInt(height)
  if (x0 >= x1 || y0 >= y1) return { visibleRect: null, coverage: 'outside' }
  return {
    visibleRect: Object.freeze({ x: Number(x0), y: Number(y0), width: Number(x1 - x0), height: Number(y1 - y0) }),
    coverage: left >= 0n && top >= 0n && right <= BigInt(width) && bottom <= BigInt(height)
      ? 'inside' : 'partially-clipped',
  }
}

function overlap(a: VisibleOutputRect, b: VisibleOutputRect): boolean {
  return a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height
}

export function inspectMediaOutputMapping(project: LedMapProjectV2, mediaOutputId: string): MediaOutputMappingInspection {
  const output = project.content.mediaOutputs.find(value => value.id === mediaOutputId)
  if (!output) throw new DomainError('PROJECT_UNKNOWN_MEDIA_OUTPUT', `Unknown Media Output: ${mediaOutputId}`)
  const screens = new Map(project.design.screens.map(screen => [screen.id, screen]))
  const diagnostics: OutputMappingDiagnostic[] = []
  const placements = project.content.outputMappings.filter(mapping => mapping.mediaOutputId === mediaOutputId).map(mapping => {
    const screen = screens.get(mapping.screenId)
    if (!screen) throw new DomainError('PROJECT_UNKNOWN_SCREEN', `Unknown Screen: ${mapping.screenId}`)
    const visible = clipped(mapping, screen, output.resolution.width, output.resolution.height)
    if (visible.coverage === 'unplaced') diagnostics.push({ code: 'OUTPUT_MAPPING_UNPLACED', mappingIds: [mapping.id], severity: 'error' })
    if (visible.coverage === 'partially-clipped') diagnostics.push({ code: 'OUTPUT_MAPPING_PARTIALLY_CLIPPED', mappingIds: [mapping.id], severity: 'warning' })
    if (visible.coverage === 'outside') diagnostics.push({ code: 'OUTPUT_MAPPING_OUTSIDE', mappingIds: [mapping.id], severity: 'warning' })
    if (mapping.mask !== undefined) diagnostics.push({ code: 'OUTPUT_MASK_UNSUPPORTED', mappingIds: [mapping.id], severity: 'error' })
    return Object.freeze({ mappingId: mapping.id, screenId: mapping.screenId, position: mapping.position,
      visibleRect: visible.visibleRect, coverage: visible.coverage, maskUnsupported: mapping.mask !== undefined })
  })
  for (let i = 0; i < placements.length; i += 1) {
    for (let j = i + 1; j < placements.length; j += 1) {
      const a = placements[i]!
      const b = placements[j]!
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
  const unplaced = inspection.placements.some(value => value.coverage === 'unplaced')
  return (x, y) => {
    if (!Number.isSafeInteger(x) || !Number.isSafeInteger(y)) {
      throw new DomainError('OUTPUT_PIXEL_INVALID', 'Media Output pixel coordinates must be safe integers')
    }
    if (x < 0 || y < 0 || x >= inspection.resolution.width || y >= inspection.resolution.height) return { status: 'empty' }
    if (unplaced) return { status: 'blocked', code: 'OUTPUT_MAPPING_UNPLACED' }
    const hits = inspection.placements.filter(value => value.visibleRect &&
      x >= value.visibleRect.x && x < value.visibleRect.x + value.visibleRect.width &&
      y >= value.visibleRect.y && y < value.visibleRect.y + value.visibleRect.height)
    if (hits.length > 1) return { status: 'blocked', code: 'OUTPUT_MAPPING_OVERLAP' }
    const hit = hits[0]
    if (!hit) return { status: 'empty' }
    if (hit.maskUnsupported) return { status: 'blocked', code: 'OUTPUT_MASK_UNSUPPORTED' }
    return { status: 'resolved', mappingId: hit.mappingId, screenId: hit.screenId,
      screenX: Number(BigInt(x) - BigInt(hit.position!.x)), screenY: Number(BigInt(y) - BigInt(hit.position!.y)) }
  }
}

export function resolveMediaOutputPixel(project: LedMapProjectV2, mediaOutputId: string, x: number, y: number): MediaOutputPixel {
  return createMediaOutputPixelResolver(project, mediaOutputId)(x, y)
}
