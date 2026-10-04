import {
  asMediaOutputCanvasId, asOutputMappingId, DomainError,
  type LedMapProjectV2, type PixelRect, type Point, type QuarterTurn,
} from '@ledmap/core'

function nextId(records: readonly { readonly id: string }[], prefix: string): string {
  const ids = new Set(records.map(record => record.id))
  let serial = records.length + 1
  while (ids.has(`${prefix}${serial}`)) serial += 1
  return `${prefix}${serial}`
}

function positive(value: number, label: string): void {
  if (!Number.isSafeInteger(value) || value < 1) throw new DomainError('PROJECT_INVALID_GEOMETRY', `${label} must be a positive safe integer`)
}

function outputPosition(value: Point): void {
  if (!value || !Number.isSafeInteger(value.x) || !Number.isSafeInteger(value.y)) {
    throw new DomainError('PROJECT_INVALID_GEOMETRY', 'Output Mapping position must use signed safe integers')
  }
}

function mediaOutputOf(project: LedMapProjectV2, id: string) {
  const output = project.content.mediaOutputs.find(value => value.id === id)
  if (!output) throw new DomainError('PROJECT_UNKNOWN_MEDIA_OUTPUT', `Unknown Media Output: ${id}`)
  return output
}

function mappingOf(project: LedMapProjectV2, id: string) {
  const mapping = project.content.outputMappings.find(value => value.id === id)
  if (!mapping) throw new DomainError('PROJECT_UNKNOWN_OUTPUT_MAPPING', `Unknown Output Mapping: ${id}`)
  return mapping
}

function screenOf(project: LedMapProjectV2, id: string) {
  const screen = project.design.screens.find(value => value.id === id)
  if (!screen) throw new DomainError('PROJECT_UNKNOWN_SCREEN', `Unknown Screen: ${id}`)
  return screen
}

export function addMediaOutputV2(project: LedMapProjectV2, width: number, height: number, name?: string): LedMapProjectV2 {
  positive(width, 'Media Output width')
  positive(height, 'Media Output height')
  const id = asMediaOutputCanvasId(nextId(project.content.mediaOutputs, 'media-output-'))
  return { ...project, content: { ...project.content, mediaOutputs: [...project.content.mediaOutputs,
    { id, name: name?.trim() || `Media Output ${project.content.mediaOutputs.length + 1}`, resolution: { width, height }, mappingOrder: [] }] } }
}

export function updateMediaOutputV2(
  project: LedMapProjectV2, id: string, patch: { readonly name?: string; readonly width?: number; readonly height?: number },
): LedMapProjectV2 {
  const output = mediaOutputOf(project, id)
  const width = patch.width ?? output.resolution.width
  const height = patch.height ?? output.resolution.height
  positive(width, 'Media Output width')
  positive(height, 'Media Output height')
  const name = patch.name === undefined ? output.name : patch.name.trim()
  if (!name) throw new DomainError('PROJECT_INVALID_NAME', 'Media Output name cannot be empty')
  if (name === output.name && width === output.resolution.width && height === output.resolution.height) return project
  return { ...project, content: { ...project.content, mediaOutputs: project.content.mediaOutputs.map(value => value.id === id
    ? { ...value, name, resolution: { width, height } } : value) } }
}

export function deleteMediaOutputV2(project: LedMapProjectV2, id: string): LedMapProjectV2 {
  mediaOutputOf(project, id)
  if (project.content.outputMappings.some(value => value.mediaOutputId === id)) {
    throw new DomainError('PROJECT_MEDIA_OUTPUT_IN_USE', 'Cannot delete a Media Output with Output Mappings')
  }
  return { ...project, content: { ...project.content, mediaOutputs: project.content.mediaOutputs.filter(value => value.id !== id) } }
}

export function addOutputMappingV2(
  project: LedMapProjectV2, screenId: string, mediaOutputId: string, at: Point,
): LedMapProjectV2 {
  const screen = screenOf(project, screenId)
  const output = mediaOutputOf(project, mediaOutputId)
  outputPosition(at)
  const id = asOutputMappingId(nextId(project.content.outputMappings, 'output-mapping-'))
  const mapping = { id, name: id, enabled: true,
    screenId: screen.id, mediaOutputId: output.id,
    screenRect: { x: 0, y: 0, width: screen.resolution.width, height: screen.resolution.height },
    outputRect: { x: at.x, y: at.y, width: screen.resolution.width, height: screen.resolution.height },
    inputRotation: 0 as QuarterTurn, outputRotation: 0 as QuarterTurn, flipX: false, flipY: false }
  return { ...project, content: { ...project.content,
    mediaOutputs: project.content.mediaOutputs.map(value => value.id === output.id
      ? { ...value, mappingOrder: [...value.mappingOrder, id] } : value),
    outputMappings: [...project.content.outputMappings, mapping] } }
}

export interface OutputMappingPatch {
  readonly screenId?: string
  readonly mediaOutputId?: string
  readonly position?: Point
  readonly outputRect?: PixelRect
  readonly name?: string
  readonly enabled?: boolean
}

export function updateOutputMappingV2(
  project: LedMapProjectV2, id: string, patch: OutputMappingPatch,
): LedMapProjectV2 {
  const mapping = mappingOf(project, id)
  const screenId = patch.screenId ?? mapping.screenId
  const mediaOutputId = patch.mediaOutputId ?? mapping.mediaOutputId
  screenOf(project, screenId)
  mediaOutputOf(project, mediaOutputId)
  const screen = project.design.screens.find(item => item.id === screenId)!
  let outputRect = patch.outputRect ?? mapping.outputRect
  if (patch.position !== undefined) {
    outputPosition(patch.position)
    outputRect = { ...outputRect, x: patch.position.x, y: patch.position.y }
  }
  if (patch.outputRect !== undefined) {
    if (!Number.isSafeInteger(patch.outputRect.x) || !Number.isSafeInteger(patch.outputRect.y)) {
      throw new DomainError('PROJECT_INVALID_GEOMETRY', 'Output Mapping position must use signed safe integers')
    }
    positive(patch.outputRect.width, 'Output Mapping width')
    positive(patch.outputRect.height, 'Output Mapping height')
  }
  const name = patch.name ?? mapping.name
  if (typeof name !== 'string' || name.length < 1) throw new DomainError('PROJECT_INVALID_NAME', 'Output Mapping name cannot be empty')
  const enabled = patch.enabled ?? mapping.enabled
  if (typeof enabled !== 'boolean') throw new DomainError('PROJECT_INVALID_ORDER', 'Output Mapping enabled must be boolean')
  const nextScreenId = project.design.screens.find(item => item.id === screenId)!.id
  const nextMediaId = mediaOutputOf(project, mediaOutputId).id
  const screenSizeChanged = nextScreenId !== mapping.screenId
  const nextScreenRect = screenSizeChanged
    ? { x: 0, y: 0, width: screen.resolution.width, height: screen.resolution.height }
    : mapping.screenRect
  const nextOutputRect = screenSizeChanged && patch.outputRect === undefined && patch.position === undefined
    ? { x: outputRect.x, y: outputRect.y, width: screen.resolution.width, height: screen.resolution.height }
    : outputRect
  if (nextScreenId === mapping.screenId && nextMediaId === mapping.mediaOutputId && name === mapping.name &&
      enabled === mapping.enabled && nextOutputRect.x === mapping.outputRect.x && nextOutputRect.y === mapping.outputRect.y &&
      nextOutputRect.width === mapping.outputRect.width && nextOutputRect.height === mapping.outputRect.height &&
      nextScreenRect.x === mapping.screenRect.x && nextScreenRect.y === mapping.screenRect.y &&
      nextScreenRect.width === mapping.screenRect.width && nextScreenRect.height === mapping.screenRect.height) return project
  const moved = nextMediaId !== mapping.mediaOutputId
  return { ...project, content: { ...project.content,
    mediaOutputs: moved ? project.content.mediaOutputs.map(value => {
      if (value.id === mapping.mediaOutputId) return { ...value, mappingOrder: value.mappingOrder.filter(item => item !== mapping.id) }
      if (value.id === nextMediaId) return { ...value, mappingOrder: [...value.mappingOrder, mapping.id] }
      return value
    }) : project.content.mediaOutputs,
    outputMappings: project.content.outputMappings.map(value => value.id === id
      ? { ...value, name, enabled, screenId: nextScreenId, mediaOutputId: nextMediaId,
        screenRect: { ...nextScreenRect }, outputRect: { ...nextOutputRect } } : value) } }
}

export function deleteOutputMappingV2(project: LedMapProjectV2, id: string): LedMapProjectV2 {
  const mapping = mappingOf(project, id)
  return { ...project, content: { ...project.content,
    mediaOutputs: project.content.mediaOutputs.map(value => value.id === mapping.mediaOutputId
      ? { ...value, mappingOrder: value.mappingOrder.filter(item => item !== mapping.id) } : value),
    outputMappings: project.content.outputMappings.filter(value => value.id !== id) } }
}
