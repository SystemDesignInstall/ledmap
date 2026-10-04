import {
  asMediaOutputCanvasId, asOutputMappingId, DomainError,
  type LedMapProjectV2, type Point,
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

function position(value: Point): void {
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

function screenOf(project: LedMapProjectV2, id: string): void {
  if (!project.design.screens.some(value => value.id === id)) throw new DomainError('PROJECT_UNKNOWN_SCREEN', `Unknown Screen: ${id}`)
}

export function addMediaOutputV2(project: LedMapProjectV2, width: number, height: number, name?: string): LedMapProjectV2 {
  positive(width, 'Media Output width')
  positive(height, 'Media Output height')
  const id = asMediaOutputCanvasId(nextId(project.content.mediaOutputs, 'media-output-'))
  return { ...project, content: { ...project.content, mediaOutputs: [...project.content.mediaOutputs,
    { id, name: name?.trim() || `Media Output ${project.content.mediaOutputs.length + 1}`, resolution: { width, height } }] } }
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
  screenOf(project, screenId)
  mediaOutputOf(project, mediaOutputId)
  position(at)
  const id = asOutputMappingId(nextId(project.content.outputMappings, 'output-mapping-'))
  return { ...project, content: { ...project.content, outputMappings: [...project.content.outputMappings,
    { id, screenId: project.design.screens.find(value => value.id === screenId)!.id,
      mediaOutputId: mediaOutputOf(project, mediaOutputId).id, position: { ...at } }] } }
}

export function updateOutputMappingV2(
  project: LedMapProjectV2, id: string,
  patch: { readonly screenId?: string; readonly mediaOutputId?: string; readonly position?: Point },
): LedMapProjectV2 {
  const mapping = mappingOf(project, id)
  const screenId = patch.screenId ?? mapping.screenId
  const mediaOutputId = patch.mediaOutputId ?? mapping.mediaOutputId
  const at = patch.position ?? mapping.position
  screenOf(project, screenId)
  mediaOutputOf(project, mediaOutputId)
  if (at !== undefined) position(at)
  if (screenId === mapping.screenId && mediaOutputId === mapping.mediaOutputId &&
      at?.x === mapping.position?.x && at?.y === mapping.position?.y) return project
  return { ...project, content: { ...project.content, outputMappings: project.content.outputMappings.map(value => value.id === id
    ? { ...value, screenId: project.design.screens.find(screen => screen.id === screenId)!.id,
      mediaOutputId: mediaOutputOf(project, mediaOutputId).id,
      ...(at === undefined ? {} : { position: { ...at } }) } : value) } }
}

export function deleteOutputMappingV2(project: LedMapProjectV2, id: string): LedMapProjectV2 {
  mappingOf(project, id)
  return { ...project, content: { ...project.content, outputMappings: project.content.outputMappings.filter(value => value.id !== id) } }
}
