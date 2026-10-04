import type { Bounds, Project, ScreenView } from './project.js'
import { screenBounds } from './project.js'

export const GRID_STEP = 8
export const SNAP_TOLERANCE_PX = 8

export type SnapKind = 'guide' | 'edge' | 'center' | 'grid'

const KIND_RANK: Record<SnapKind, number> = { guide: 0, edge: 1, center: 2, grid: 3 }

export type SnapCategory = 'grid' | 'edges' | 'centers' | 'guides'

export interface SnapTarget {
  readonly position: number
  readonly kind: SnapKind
  readonly rank: number
}

export interface SnapHit {
  readonly delta: number
  readonly target: number
  readonly kind: SnapKind
}

export function snapGrid(value: number): number {
  const snapped = Math.round(value / GRID_STEP) * GRID_STEP
  return snapped === 0 ? 0 : snapped
}

export function snapAxis(
  moving: readonly [number, number, number],
  targets: readonly SnapTarget[],
  zoom: number,
  includeGrid = true,
): SnapHit | null {
  interface Candidate {
    readonly delta: number
    readonly target: number
    readonly kind: SnapKind
    readonly distancePx: number
    readonly kindRank: number
    readonly lineRank: number
    readonly targetRank: number
  }
  const candidates: Candidate[] = []
  const consider = (lineRank: number, movingPosition: number, position: number, kind: SnapKind, targetRank: number): void => {
    const distancePx = Math.abs(position - movingPosition) * zoom
    if (distancePx > SNAP_TOLERANCE_PX) return
    candidates.push({
      delta: position - movingPosition,
      target: position,
      kind,
      distancePx,
      kindRank: KIND_RANK[kind],
      lineRank,
      targetRank,
    })
  }
  for (let line = 0; line < 3; line += 1) {
    if (includeGrid) consider(line, moving[line]!, snapGrid(moving[line]!), 'grid', 0)
  }
  for (const target of targets) {
    for (let line = 0; line < 3; line += 1) {
      consider(line, moving[line]!, target.position, target.kind, target.rank)
    }
  }
  let best: Candidate | null = null
  for (const candidate of candidates) {
    if (best === null || precedes(candidate, best)) best = candidate
  }
  return best === null ? null : { delta: best.delta, target: best.target, kind: best.kind }
}

function precedes(
  candidate: { readonly distancePx: number; readonly kindRank: number; readonly lineRank: number; readonly targetRank: number },
  best: { readonly distancePx: number; readonly kindRank: number; readonly lineRank: number; readonly targetRank: number },
): boolean {
  if (candidate.distancePx < best.distancePx - 1e-9) return true
  if (Math.abs(candidate.distancePx - best.distancePx) > 1e-9) return false
  if (candidate.kindRank !== best.kindRank) return candidate.kindRank < best.kindRank
  if (candidate.lineRank !== best.lineRank) return candidate.lineRank < best.lineRank
  return candidate.targetRank < best.targetRank
}

export interface SnapLines {
  readonly x: readonly number[]
  readonly y: readonly number[]
}

export interface SnapResult {
  readonly dx: number
  readonly dy: number
  readonly lines: SnapLines
}

export function snapDelta(
  primary: Bounds,
  vertical: readonly SnapTarget[],
  horizontal: readonly SnapTarget[],
  zoom: number,
  includeGrid = true,
): SnapResult {
  const centerX = primary.left + primary.width / 2
  const centerY = primary.top + primary.height / 2
  const hitX = snapAxis([primary.left, centerX, primary.right], vertical, zoom, includeGrid)
  const hitY = snapAxis([primary.top, centerY, primary.bottom], horizontal, zoom, includeGrid)
  return {
    dx: hitX?.delta ?? 0,
    dy: hitY?.delta ?? 0,
    lines: { x: hitX ? [hitX.target] : [], y: hitY ? [hitY.target] : [] },
  }
}

export function screenSnapTargets(
  screens: readonly ScreenView[],
  exclude: ReadonlySet<string>,
): { readonly vertical: SnapTarget[]; readonly horizontal: SnapTarget[] } {
  const vertical: SnapTarget[] = []
  const horizontal: SnapTarget[] = []
  let rank = 0
  for (const screen of screens) {
    if (exclude.has(screen.screen.id)) continue
    const bounds = screenBounds(screen)
    vertical.push({ position: bounds.left, kind: 'edge', rank: rank++ })
    vertical.push({ position: bounds.right, kind: 'edge', rank: rank++ })
    vertical.push({ position: bounds.left + bounds.width / 2, kind: 'center', rank: rank++ })
    horizontal.push({ position: bounds.top, kind: 'edge', rank: rank++ })
    horizontal.push({ position: bounds.bottom, kind: 'edge', rank: rank++ })
    horizontal.push({ position: bounds.top + bounds.height / 2, kind: 'center', rank: rank++ })
  }
  return { vertical, horizontal }
}

export type AlignMode = 'left' | 'centerX' | 'right' | 'top' | 'middle' | 'bottom'

function unionBounds(bounds: readonly Bounds[]): Bounds {
  const left = Math.min(...bounds.map(b => b.left))
  const top = Math.min(...bounds.map(b => b.top))
  const right = Math.max(...bounds.map(b => b.right))
  const bottom = Math.max(...bounds.map(b => b.bottom))
  return { left, top, right, bottom, width: right - left, height: bottom - top }
}

export function alignScreens(project: Project, screenIds: readonly string[], mode: AlignMode): Project {
  const targets = project.screens.filter(screen => screenIds.includes(screen.screen.id))
  if (targets.length < 2) throw new Error('Align needs at least 2 Screens.')
  const box = unionBounds(targets.map(screenBounds))
  const positions = new Map<string, { readonly x: number; readonly y: number }>()
  for (const screen of targets) {
    const bounds = screenBounds(screen)
    switch (mode) {
      case 'left': positions.set(screen.screen.id, { x: screen.x + (box.left - bounds.left), y: screen.y }); break
      case 'centerX': positions.set(screen.screen.id, { x: screen.x + (box.left + box.width / 2 - (bounds.left + bounds.width / 2)), y: screen.y }); break
      case 'right': positions.set(screen.screen.id, { x: screen.x + (box.right - bounds.right), y: screen.y }); break
      case 'top': positions.set(screen.screen.id, { x: screen.x, y: screen.y + (box.top - bounds.top) }); break
      case 'middle': positions.set(screen.screen.id, { x: screen.x, y: screen.y + (box.top + box.height / 2 - (bounds.top + bounds.height / 2)) }); break
      case 'bottom': positions.set(screen.screen.id, { x: screen.x, y: screen.y + (box.bottom - bounds.bottom) }); break
    }
  }
  return {
    screens: project.screens.map(screen => {
      const position = positions.get(screen.screen.id)
      return position ? { ...screen, x: position.x, y: position.y } : screen
    }),
  }
}

export type DistributeAxis = 'horizontal' | 'vertical'

export function distributeScreens(project: Project, screenIds: readonly string[], axis: DistributeAxis): Project {
  const order = new Map(project.screens.map((screen, index) => [screen.screen.id as string, index]))
  const targets = project.screens
    .filter(screen => screenIds.includes(screen.screen.id))
    .sort((a, b) => {
      const aValue = axis === 'horizontal' ? a.x : a.y
      const bValue = axis === 'horizontal' ? b.x : b.y
      if (aValue !== bValue) return aValue - bValue
      return (order.get(a.screen.id) ?? 0) - (order.get(b.screen.id) ?? 0)
    })
  if (targets.length < 3) throw new Error('Distribute needs at least 3 Screens.')
  const box = unionBounds(targets.map(screenBounds))
  const positions = new Map<string, { readonly x: number; readonly y: number }>()
  if (axis === 'horizontal') {
    const total = targets.reduce((sum, screen) => sum + screenBounds(screen).width, 0)
    const gap = (box.width - total) / (targets.length - 1)
    let cursor = box.left
    for (const screen of targets) {
      positions.set(screen.screen.id, { x: cursor, y: screen.y })
      cursor += screenBounds(screen).width + gap
    }
  } else {
    const total = targets.reduce((sum, screen) => sum + screenBounds(screen).height, 0)
    const gap = (box.height - total) / (targets.length - 1)
    let cursor = box.top
    for (const screen of targets) {
      positions.set(screen.screen.id, { x: screen.x, y: cursor })
      cursor += screenBounds(screen).height + gap
    }
  }
  return {
    screens: project.screens.map(screen => {
      const position = positions.get(screen.screen.id)
      return position ? { ...screen, x: position.x, y: position.y } : screen
    }),
  }
}

export interface Guide {
  readonly id: string
  readonly orientation: 'vertical' | 'horizontal'
  readonly position: number
  readonly locked: boolean
}

export function nextGuideIndex(guides: readonly Guide[]): number {
  let max = 0
  for (const guide of guides) {
    const match = /^guide-(\d+)$/.exec(guide.id)
    if (match) max = Math.max(max, Number(match[1]))
  }
  return max + 1
}

export function addGuide(guides: readonly Guide[], orientation: Guide['orientation'], position: number): Guide[] {
  const guide: Guide = { id: `guide-${nextGuideIndex(guides)}`, orientation, position, locked: false }
  return [...guides, guide]
}

export function moveGuide(guides: readonly Guide[], id: string, position: number): Guide[] {
  return guides.map(guide => guide.id === id ? { ...guide, position } : guide)
}

export function removeGuide(guides: readonly Guide[], id: string): Guide[] {
  return guides.filter(guide => guide.id !== id)
}

export function setGuideLocked(guides: readonly Guide[], id: string, locked: boolean): Guide[] {
  return guides.map(guide => guide.id === id ? { ...guide, locked } : guide)
}

export function guideHit(guides: readonly Guide[], point: { readonly x: number; readonly y: number }, zoom: number): Guide | null {
  let best: Guide | null = null
  let bestDistance = SNAP_TOLERANCE_PX + 1
  for (const guide of guides) {
    const distance = (guide.orientation === 'vertical' ? Math.abs(point.x - guide.position) : Math.abs(point.y - guide.position)) * zoom
    if (distance <= SNAP_TOLERANCE_PX && distance < bestDistance - 1e-9) {
      best = guide
      bestDistance = distance
    }
  }
  return best
}
