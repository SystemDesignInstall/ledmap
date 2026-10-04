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
  readonly screenRect?: PixelRect
  readonly outputRect?: PixelRect
  readonly inputRotation?: QuarterTurn
  readonly outputRotation?: QuarterTurn
  readonly flipX?: boolean
  readonly flipY?: boolean
  readonly name?: string
  readonly enabled?: boolean
  readonly mask?: { readonly enabled: boolean; readonly points: readonly Point[] } | null
}

function checkRect(rect: PixelRect, label: string, allowNegative: boolean): void {
  if (!Number.isSafeInteger(rect.x) || !Number.isSafeInteger(rect.y)) {
    throw new DomainError('PROJECT_INVALID_GEOMETRY', `${label} position must use safe integers`)
  }
  if (!allowNegative && (rect.x < 0 || rect.y < 0)) {
    throw new DomainError('PROJECT_INVALID_GEOMETRY', `${label} position must be non-negative`)
  }
  positive(rect.width, `${label} width`)
  positive(rect.height, `${label} height`)
}

function checkRotation(value: unknown, label: string): asserts value is QuarterTurn {
  if (value !== 0 && value !== 90 && value !== 180 && value !== 270) {
    throw new DomainError('PROJECT_INVALID_GEOMETRY', `${label} must be 0, 90, 180 or 270`)
  }
}

function checkMask(mask: { readonly enabled: boolean; readonly points: readonly Point[] }, label: string): void {
  if (typeof mask.enabled !== 'boolean') throw new DomainError('PROJECT_INVALID_GEOMETRY', `${label} mask enabled must be boolean`)
  if (!Array.isArray(mask.points)) throw new DomainError('PROJECT_INVALID_GEOMETRY', `${label} mask must have points`)
  if (mask.enabled && mask.points.length < 3) {
    throw new DomainError('PROJECT_INVALID_GEOMETRY', `${label} mask must have at least 3 points`)
  }
  for (const point of mask.points) {
    if (!Number.isFinite(point.x) || !Number.isFinite(point.y)) {
      throw new DomainError('PROJECT_INVALID_GEOMETRY', `${label} mask must use finite coordinates`)
    }
  }
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
  if (patch.outputRect !== undefined) checkRect(patch.outputRect, 'Output Mapping outputRect', true)
  const screenRect = patch.screenRect ?? mapping.screenRect
  if (patch.screenRect !== undefined) checkRect(patch.screenRect, 'Output Mapping screenRect', false)
  if (screenRect.x + screenRect.width > screen.resolution.width ||
      screenRect.y + screenRect.height > screen.resolution.height) {
    throw new DomainError('PROJECT_INVALID_GEOMETRY', `OutputMapping ${mapping.id} screenRect exceeds Screen ${screen.id}`)
  }
  const inputRotation = patch.inputRotation ?? mapping.inputRotation
  const outputRotation = patch.outputRotation ?? mapping.outputRotation
  if (patch.inputRotation !== undefined) checkRotation(patch.inputRotation, 'Output Mapping inputRotation')
  if (patch.outputRotation !== undefined) checkRotation(patch.outputRotation, 'Output Mapping outputRotation')
  const flipX = patch.flipX ?? mapping.flipX
  const flipY = patch.flipY ?? mapping.flipY
  if (typeof flipX !== 'boolean' || typeof flipY !== 'boolean') {
    throw new DomainError('PROJECT_INVALID_GEOMETRY', 'Output Mapping flips must be boolean')
  }
  const mask = patch.mask === null ? undefined : (patch.mask ?? mapping.mask)
  if (patch.mask !== undefined && patch.mask !== null) checkMask(patch.mask, `OutputMapping ${mapping.id}`)
  const name = patch.name ?? mapping.name
  if (typeof name !== 'string' || name.length < 1) throw new DomainError('PROJECT_INVALID_NAME', 'Output Mapping name cannot be empty')
  const enabled = patch.enabled ?? mapping.enabled
  if (typeof enabled !== 'boolean') throw new DomainError('PROJECT_INVALID_ORDER', 'Output Mapping enabled must be boolean')
  const nextScreenId = project.design.screens.find(item => item.id === screenId)!.id
  const nextMediaId = mediaOutputOf(project, mediaOutputId).id
  const screenChanged = nextScreenId !== mapping.screenId
  const nextScreenRect = patch.screenRect !== undefined
    ? { ...screenRect }
    : screenChanged
      ? { x: 0, y: 0, width: screen.resolution.width, height: screen.resolution.height }
      : { ...mapping.screenRect }
  const nextOutputRect = patch.outputRect !== undefined || patch.position !== undefined
    ? { ...outputRect }
    : screenChanged
      ? { x: outputRect.x, y: outputRect.y, width: screen.resolution.width, height: screen.resolution.height }
      : { ...mapping.outputRect }
  const sameMask = (mask?.enabled ?? undefined) === (mapping.mask?.enabled ?? undefined) &&
    (mask?.points.length ?? 0) === (mapping.mask?.points.length ?? 0) &&
    (mask?.points ?? []).every((point, index) => point.x === mapping.mask?.points[index]?.x && point.y === mapping.mask?.points[index]?.y)
  if (nextScreenId === mapping.screenId && nextMediaId === mapping.mediaOutputId && name === mapping.name &&
      enabled === mapping.enabled && inputRotation === mapping.inputRotation && outputRotation === mapping.outputRotation &&
      flipX === mapping.flipX && flipY === mapping.flipY && sameMask &&
      nextOutputRect.x === mapping.outputRect.x && nextOutputRect.y === mapping.outputRect.y &&
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
    outputMappings: project.content.outputMappings.map(value => {
      if (value.id !== id) return value
      const rest = { ...value }
      delete (rest as { mask?: unknown }).mask
      return { ...rest, name, enabled, screenId: nextScreenId, mediaOutputId: nextMediaId,
        screenRect: nextScreenRect, outputRect: nextOutputRect,
        inputRotation, outputRotation, flipX, flipY,
        ...(mask === undefined ? {} : { mask: { enabled: mask.enabled, points: mask.points.map(point => ({ ...point })) } }) }
    }) } }
}

export function deleteOutputMappingV2(project: LedMapProjectV2, id: string): LedMapProjectV2 {
  const mapping = mappingOf(project, id)
  return { ...project, content: { ...project.content,
    mediaOutputs: project.content.mediaOutputs.map(value => value.id === mapping.mediaOutputId
      ? { ...value, mappingOrder: value.mappingOrder.filter(item => item !== mapping.id) } : value),
    outputMappings: project.content.outputMappings.filter(value => value.id !== id) } }
}

export function reorderOutputMappingV2(project: LedMapProjectV2, mediaOutputId: string, mappingId: string, toIndex: number): LedMapProjectV2 {
  const output = mediaOutputOf(project, mediaOutputId)
  const mapping = mappingOf(project, mappingId)
  if (mapping.mediaOutputId !== output.id) {
    throw new DomainError('PROJECT_MAPPING_ORDER_PARENT_MISMATCH', `OutputMapping ${mappingId} does not belong to ${mediaOutputId}`)
  }
  if (!Number.isSafeInteger(toIndex) || toIndex < 0 || toIndex >= output.mappingOrder.length) {
    throw new DomainError('PROJECT_INVALID_ORDER', 'Output Mapping order index is out of range')
  }
  const fromIndex = output.mappingOrder.findIndex(item => item === mapping.id)
  if (fromIndex === -1) throw new DomainError('PROJECT_MISSING_MAPPING_ORDER', `OutputMapping ${mappingId} is missing from order`)
  if (fromIndex === toIndex) return project
  const order = [...output.mappingOrder]
  order.splice(fromIndex, 1)
  order.splice(toIndex, 0, mapping.id)
  return { ...project, content: { ...project.content,
    mediaOutputs: project.content.mediaOutputs.map(value => value.id === output.id ? { ...value, mappingOrder: order } : value) } }
}

export function setOutputMappingMaskV2(
  project: LedMapProjectV2, id: string, mask: { readonly enabled: boolean; readonly points: readonly Point[] } | null,
): LedMapProjectV2 {
  return updateOutputMappingV2(project, id, { mask })
}

export function moveOutputMaskPointV2(project: LedMapProjectV2, id: string, index: number, at: Point): LedMapProjectV2 {
  const mapping = mappingOf(project, id)
  if (!mapping.mask) throw new DomainError('PROJECT_INVALID_GEOMETRY', `OutputMapping ${id} has no mask`)
  if (!Number.isSafeInteger(index) || index < 0 || index >= mapping.mask.points.length) {
    throw new DomainError('PROJECT_INVALID_GEOMETRY', 'Mask point index is out of range')
  }
  if (!Number.isFinite(at.x) || !Number.isFinite(at.y)) {
    throw new DomainError('PROJECT_INVALID_GEOMETRY', 'Mask points must use finite coordinates')
  }
  const points = mapping.mask.points.map((point, i) => i === index ? { ...at } : { ...point })
  return updateOutputMappingV2(project, id, { mask: { enabled: mapping.mask.enabled, points } })
}

export function addOutputMaskPointV2(project: LedMapProjectV2, id: string, at: Point, index?: number): LedMapProjectV2 {
  const mapping = mappingOf(project, id)
  if (!Number.isFinite(at.x) || !Number.isFinite(at.y)) {
    throw new DomainError('PROJECT_INVALID_GEOMETRY', 'Mask points must use finite coordinates')
  }
  const base = mapping.mask?.points ?? []
  const atIndex = index ?? base.length
  if (!Number.isSafeInteger(atIndex) || atIndex < 0 || atIndex > base.length) {
    throw new DomainError('PROJECT_INVALID_GEOMETRY', 'Mask point index is out of range')
  }
  const points = [...base.map(point => ({ ...point }))]
  points.splice(atIndex, 0, { ...at })
  return updateOutputMappingV2(project, id, { mask: { enabled: mapping.mask?.enabled ?? true, points } })
}

export function removeOutputMaskPointV2(project: LedMapProjectV2, id: string, index: number): LedMapProjectV2 {
  const mapping = mappingOf(project, id)
  if (!mapping.mask) throw new DomainError('PROJECT_INVALID_GEOMETRY', `OutputMapping ${id} has no mask`)
  if (!Number.isSafeInteger(index) || index < 0 || index >= mapping.mask.points.length) {
    throw new DomainError('PROJECT_INVALID_GEOMETRY', 'Mask point index is out of range')
  }
  const points = mapping.mask.points.filter((_, i) => i !== index).map(point => ({ ...point }))
  if (mapping.mask.enabled && points.length < 3) {
    throw new DomainError('PROJECT_INVALID_GEOMETRY', 'An enabled mask must keep at least 3 points')
  }
  if (points.length === 0) return updateOutputMappingV2(project, id, { mask: null })
  return updateOutputMappingV2(project, id, { mask: { enabled: mapping.mask.enabled, points } })
}

export function splitOutputMappingIntoRowsV2(project: LedMapProjectV2, id: string, count: number): LedMapProjectV2 {
  const mapping = mappingOf(project, id)
  if (!Number.isSafeInteger(count) || count < 2 || count > 64) {
    throw new DomainError('PROJECT_INVALID_GEOMETRY', 'Split count must be an integer between 2 and 64')
  }
  if (mapping.screenRect.width < count) {
    throw new DomainError('PROJECT_INVALID_GEOMETRY', 'Screen rect is too narrow to split into that many rows')
  }
  const output = mediaOutputOf(project, mapping.mediaOutputId)
  const base = Math.floor(mapping.screenRect.width / count)
  const remainder = mapping.screenRect.width % count
  const screenParts: PixelRect[] = []
  let sx = mapping.screenRect.x
  for (let i = 0; i < count; i += 1) {
    const w = base + (i < remainder ? 1 : 0)
    screenParts.push({ x: sx, y: mapping.screenRect.y, width: w, height: mapping.screenRect.height })
    sx += w
  }
  const ids = [mapping.id]
  for (let i = 1; i < count; i += 1) ids.push(asOutputMappingId(nextId(
    [...project.content.outputMappings, ...ids.slice(0, i).map(newId => ({ id: newId }))], 'output-mapping-')))
  const orderIndex = output.mappingOrder.findIndex(item => item === mapping.id)
  const order = [...output.mappingOrder]
  order.splice(orderIndex + 1, 0, ...ids.slice(1))
  let oy = mapping.outputRect.y
  const created = screenParts.map((screenRect, i) => {
    const placed = { x: mapping.outputRect.x, y: oy, width: screenRect.width, height: screenRect.height }
    oy += screenRect.height
    return {
      ...(i === 0 ? mapping : {
        ...mapping,
        id: ids[i]!,
        name: `${mapping.name} ${i + 1}/${count}`,
      }),
      screenRect: { ...screenRect },
      outputRect: placed,
    }
  })
  const withClearedMasks = created.map(item => {
    const rest = { ...item }
    delete (rest as { mask?: unknown }).mask
    return rest
  })
  const first = withClearedMasks[0]!
  const restMappings = withClearedMasks.slice(1)
  return { ...project, content: { ...project.content,
    mediaOutputs: project.content.mediaOutputs.map(value => value.id === output.id ? { ...value, mappingOrder: order } : value),
    outputMappings: project.content.outputMappings.flatMap(value => {
      if (value.id !== mapping.id) return [value]
      return [first as typeof mapping, ...restMappings as typeof mapping[]]
    }) } }
}
