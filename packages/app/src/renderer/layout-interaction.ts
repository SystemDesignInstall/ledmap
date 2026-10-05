export interface LayoutPoint {
  readonly x: number
  readonly y: number
}

export interface LayoutRect extends LayoutPoint {
  readonly id: string
  readonly width: number
  readonly height: number
}

export interface SelectionBox {
  readonly left: number
  readonly top: number
  readonly right: number
  readonly bottom: number
}

export interface AlignmentGuide {
  readonly axis: 'x' | 'y'
  readonly value: number
}

export interface SnapResult {
  readonly dx: number
  readonly dy: number
  readonly guides: readonly AlignmentGuide[]
}

export type AlignMode = 'left' | 'horizontal-center' | 'right' | 'top' | 'vertical-center' | 'bottom'
export type DistributeAxis = 'horizontal' | 'vertical'

export function integerCoordinate(value: number): number {
  if (!Number.isFinite(value)) throw new Error('Coordinate must be finite.')
  const rounded = Math.round(value)
  if (!Number.isSafeInteger(rounded)) throw new Error('Coordinate exceeds the safe integer range.')
  return rounded
}

export function replaceOrToggleSelection(
  selectedIds: readonly string[],
  id: string,
  additive: boolean,
): readonly string[] {
  if (!additive) return [id]
  return selectedIds.includes(id)
    ? selectedIds.filter(selected => selected !== id)
    : [...selectedIds, id]
}

export function normalizeSelectionBox(start: LayoutPoint, end: LayoutPoint): SelectionBox {
  return {
    left: Math.min(start.x, end.x),
    top: Math.min(start.y, end.y),
    right: Math.max(start.x, end.x),
    bottom: Math.max(start.y, end.y),
  }
}

function intersects(box: SelectionBox, rect: LayoutRect): boolean {
  return rect.x < box.right && rect.x + rect.width > box.left && rect.y < box.bottom && rect.y + rect.height > box.top
}

export function marqueeSelection(
  screens: readonly LayoutRect[],
  start: LayoutPoint,
  end: LayoutPoint,
  baseSelection: readonly string[] = [],
): readonly string[] {
  const box = normalizeSelectionBox(start, end)
  const selected = new Set(baseSelection)
  for (const screen of screens) {
    if (intersects(box, screen)) selected.add(screen.id)
  }
  return [...selected]
}

export function selectionBounds(screens: readonly LayoutRect[]): LayoutRect | null {
  if (screens.length === 0) return null
  const left = Math.min(...screens.map(screen => screen.x))
  const top = Math.min(...screens.map(screen => screen.y))
  const right = Math.max(...screens.map(screen => screen.x + screen.width))
  const bottom = Math.max(...screens.map(screen => screen.y + screen.height))
  return { id: 'selection', x: left, y: top, width: right - left, height: bottom - top }
}

export function clampTranslationToOrigin(
  bounds: LayoutPoint,
  dx: number,
  dy: number,
): { readonly dx: number; readonly dy: number } {
  const nextDx = Math.max(integerCoordinate(dx), -integerCoordinate(bounds.x))
  const nextDy = Math.max(integerCoordinate(dy), -integerCoordinate(bounds.y))
  return {
    dx: nextDx === 0 ? 0 : nextDx,
    dy: nextDy === 0 ? 0 : nextDy,
  }
}

export function clampPositionToOrigin(point: LayoutPoint): LayoutPoint {
  return { x: Math.max(0, integerCoordinate(point.x)), y: Math.max(0, integerCoordinate(point.y)) }
}

export function snapCoordinateToGrid(value: number, step: number): number {
  if (!Number.isSafeInteger(step) || step < 1) throw new Error('Grid step must be a positive whole number.')
  return integerCoordinate(Math.round(value / step) * step)
}

interface AxisCandidate {
  readonly correction: number
  readonly guide: number
}

function bestAxisCandidate(
  moving: readonly number[],
  targets: readonly number[],
  currentDelta: number,
  tolerance: number,
): AxisCandidate | null {
  let best: AxisCandidate | null = null
  for (const movingValue of moving) {
    for (const target of targets) {
      const correction = target - (movingValue + currentDelta)
      if (Math.abs(correction) > tolerance || !Number.isSafeInteger(currentDelta + correction)) continue
      if (!best || Math.abs(correction) < Math.abs(best.correction)) best = { correction, guide: target }
    }
  }
  return best
}

export interface SnapSources {
  readonly grid: boolean
  readonly edges: boolean
  readonly centers: boolean
  readonly guides: boolean
}

export interface ProjectGuide {
  readonly id: string
  readonly orientation: 'vertical' | 'horizontal'
  readonly position: number
  readonly locked: boolean
}

let guideSerial = 1

export function addGuide(
  guides: readonly ProjectGuide[],
  orientation: ProjectGuide['orientation'],
  position: number,
): readonly ProjectGuide[] {
  const guide: ProjectGuide = {
    id: `guide-${guideSerial++}`,
    orientation,
    position: integerCoordinate(position),
    locked: false,
  }
  return [...guides, guide]
}

export function moveGuide(
  guides: readonly ProjectGuide[],
  id: string,
  position: number,
): readonly ProjectGuide[] {
  return guides.map(guide => guide.id === id && !guide.locked
    ? { ...guide, position: integerCoordinate(position) }
    : guide)
}

export function removeGuide(guides: readonly ProjectGuide[], id: string): readonly ProjectGuide[] {
  return guides.filter(guide => guide.id !== id)
}

export function setGuideLocked(
  guides: readonly ProjectGuide[],
  id: string,
  locked: boolean,
): readonly ProjectGuide[] {
  return guides.map(guide => guide.id === id ? { ...guide, locked } : guide)
}

export function guideHitTest(
  guides: readonly ProjectGuide[],
  point: LayoutPoint,
  tolerance: number,
): ProjectGuide | null {
  for (let index = guides.length - 1; index >= 0; index -= 1) {
    const guide = guides[index]!
    if (guide.locked) continue
    const distance = guide.orientation === 'vertical'
      ? Math.abs(point.x - guide.position)
      : Math.abs(point.y - guide.position)
    if (distance <= tolerance) return guide
  }
  return null
}

export function guidePositions(guides: readonly ProjectGuide[]): { readonly vertical: readonly number[]; readonly horizontal: readonly number[] } {
  return {
    vertical: guides.filter(guide => guide.orientation === 'vertical').map(guide => guide.position),
    horizontal: guides.filter(guide => guide.orientation === 'horizontal').map(guide => guide.position),
  }
}

export function snapTranslation(input: {
  readonly moving: LayoutRect
  readonly targets: readonly LayoutRect[]
  readonly dx: number
  readonly dy: number
  readonly gridStep?: number
  readonly smartSnap?: boolean
  readonly snapEdges?: boolean
  readonly snapCenters?: boolean
  readonly guideTargets?: { readonly vertical: readonly number[]; readonly horizontal: readonly number[] }
  readonly tolerance?: number
}): SnapResult {
  let dx = integerCoordinate(input.dx)
  let dy = integerCoordinate(input.dy)
  if (input.gridStep !== undefined) {
    dx = snapCoordinateToGrid(input.moving.x + dx, input.gridStep) - input.moving.x
    dy = snapCoordinateToGrid(input.moving.y + dy, input.gridStep) - input.moving.y
  }
  const guides: AlignmentGuide[] = []
  const snapEdges = input.snapEdges ?? input.smartSnap !== false
  const snapCenters = input.snapCenters ?? input.smartSnap !== false
  if ((input.smartSnap !== false || input.snapEdges !== undefined || input.snapCenters !== undefined) && (snapEdges || snapCenters) && input.targets.length > 0) {
    const tolerance = input.tolerance ?? 8
    const movingX = [
      ...(snapEdges ? [input.moving.x, input.moving.x + input.moving.width] : []),
      ...(snapCenters ? [input.moving.x + input.moving.width / 2] : []),
    ]
    const movingY = [
      ...(snapEdges ? [input.moving.y, input.moving.y + input.moving.height] : []),
      ...(snapCenters ? [input.moving.y + input.moving.height / 2] : []),
    ]
    const targetX = input.targets.flatMap(target => [
      ...(snapEdges ? [target.x, target.x + target.width] : []),
      ...(snapCenters ? [target.x + target.width / 2] : []),
    ])
    const targetY = input.targets.flatMap(target => [
      ...(snapEdges ? [target.y, target.y + target.height] : []),
      ...(snapCenters ? [target.y + target.height / 2] : []),
    ])
    const xCandidate = bestAxisCandidate(movingX, targetX, dx, tolerance)
    const yCandidate = bestAxisCandidate(movingY, targetY, dy, tolerance)
    if (xCandidate) {
      dx += xCandidate.correction
      guides.push({ axis: 'x', value: xCandidate.guide })
    }
    if (yCandidate) {
      dy += yCandidate.correction
      guides.push({ axis: 'y', value: yCandidate.guide })
    }
  }
  if (input.guideTargets !== undefined) {
    const tolerance = input.tolerance ?? 8
    const movingX = [input.moving.x + dx, input.moving.x + dx + input.moving.width / 2, input.moving.x + dx + input.moving.width]
    const movingY = [input.moving.y + dy, input.moving.y + dy + input.moving.height / 2, input.moving.y + dy + input.moving.height]
    const vertical = bestAxisCandidate(movingX, input.guideTargets.vertical, 0, tolerance)
    const horizontal = bestAxisCandidate(movingY, input.guideTargets.horizontal, 0, tolerance)
    if (vertical) {
      dx += vertical.correction
      guides.push({ axis: 'x', value: vertical.guide })
    }
    if (horizontal) {
      dy += horizontal.correction
      guides.push({ axis: 'y', value: horizontal.guide })
    }
  }
  return { dx: integerCoordinate(dx), dy: integerCoordinate(dy), guides }
}

export function nudgePositions(
  positions: Readonly<Record<string, LayoutPoint>>,
  selectedIds: readonly string[],
  dx: number,
  dy: number,
): Readonly<Record<string, LayoutPoint>> {
  const selected = selectedIds
    .map(id => positions[id])
    .filter((position): position is LayoutPoint => position !== undefined)
  if (selected.length === 0) return { ...positions }
  const clamped = clampTranslationToOrigin(
    { x: Math.min(...selected.map(position => position.x)), y: Math.min(...selected.map(position => position.y)) },
    dx,
    dy,
  )
  const next = { ...positions }
  for (const id of selectedIds) {
    const position = positions[id]
    if (position) next[id] = { x: integerCoordinate(position.x + clamped.dx), y: integerCoordinate(position.y + clamped.dy) }
  }
  return next
}

export function alignScreens(screens: readonly LayoutRect[], mode: AlignMode): Readonly<Record<string, LayoutPoint>> {
  const bounds = selectionBounds(screens)
  if (!bounds) return {}
  const result: Record<string, LayoutPoint> = {}
  for (const screen of screens) {
    let x = screen.x
    let y = screen.y
    if (mode === 'left') x = bounds.x
    if (mode === 'horizontal-center') x = bounds.x + (bounds.width - screen.width) / 2
    if (mode === 'right') x = bounds.x + bounds.width - screen.width
    if (mode === 'top') y = bounds.y
    if (mode === 'vertical-center') y = bounds.y + (bounds.height - screen.height) / 2
    if (mode === 'bottom') y = bounds.y + bounds.height - screen.height
    const clamped = clampPositionToOrigin({ x, y })
    result[screen.id] = { x: integerCoordinate(clamped.x), y: integerCoordinate(clamped.y) }
  }
  return result
}

export function distributeScreens(
  screens: readonly LayoutRect[],
  axis: DistributeAxis,
): Readonly<Record<string, LayoutPoint>> {
  const result = Object.fromEntries(screens.map(screen => {
    const clamped = clampPositionToOrigin({ x: screen.x, y: screen.y })
    return [screen.id, { x: integerCoordinate(clamped.x), y: integerCoordinate(clamped.y) }]
  })) as Record<string, LayoutPoint>
  if (screens.length < 3) return result
  const horizontal = axis === 'horizontal'
  const ordered = [...screens].sort((a, b) => horizontal ? a.x - b.x || a.id.localeCompare(b.id) : a.y - b.y || a.id.localeCompare(b.id))
  const first = ordered[0]!
  const last = ordered[ordered.length - 1]!
  const firstStart = horizontal ? first.x : first.y
  const lastEnd = horizontal ? last.x + last.width : last.y + last.height
  const totalSize = ordered.reduce((sum, screen) => sum + (horizontal ? screen.width : screen.height), 0)
  const gap = (lastEnd - firstStart - totalSize) / (ordered.length - 1)
  let cursor = firstStart
  for (const screen of ordered) {
    const clamped = clampPositionToOrigin(horizontal ? { x: cursor, y: screen.y } : { x: screen.x, y: cursor })
    result[screen.id] = horizontal
      ? { x: integerCoordinate(clamped.x), y: integerCoordinate(clamped.y) }
      : { x: integerCoordinate(clamped.x), y: integerCoordinate(clamped.y) }
    cursor += (horizontal ? screen.width : screen.height) + gap
  }
  return result
}
