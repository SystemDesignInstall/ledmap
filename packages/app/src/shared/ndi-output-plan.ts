import type { TestBounds, TestScene } from './test-engine.js'

// NDI is a live video transport, never a Processor Port or a hardware mapping.
export interface NdiStreamPlan {
  readonly id: string
  readonly name: string
  readonly region: TestBounds
  readonly kind: 'composition' | 'screen'
}

function integralBounds(bounds: TestBounds): TestBounds {
  if (![bounds.x, bounds.y, bounds.width, bounds.height].every(Number.isSafeInteger) ||
      bounds.width <= 0 || bounds.height <= 0) {
    throw new Error('NDI output requires positive integer pixel bounds.')
  }
  return { ...bounds }
}

/** A composition is the minimal union of all Screen rectangles, including gaps and negative coordinates. */
export function planNdiStreams(scene: Pick<TestScene, 'screens'>, prefix = 'LedMAP'): readonly NdiStreamPlan[] {
  if (!scene.screens.length) return []
  const screens = scene.screens.map(screen => ({
    ...screen,
    bounds: integralBounds(screen.bounds),
  }))
  const left = Math.min(...screens.map(screen => screen.bounds.x))
  const top = Math.min(...screens.map(screen => screen.bounds.y))
  const right = Math.max(...screens.map(screen => screen.bounds.x + screen.bounds.width))
  const bottom = Math.max(...screens.map(screen => screen.bounds.y + screen.bounds.height))
  const counts = new Map<string, number>()
  for (const screen of screens) counts.set(screen.name, (counts.get(screen.name) ?? 0) + 1)
  const base = prefix.trim() || 'LedMAP'
  return [
    {
      id: 'composition',
      kind: 'composition',
      name: `${base} / Composition`,
      region: integralBounds({ x: left, y: top, width: right - left, height: bottom - top }),
    },
    ...screens.map(screen => ({
      id: `screen:${screen.id}`,
      kind: 'screen' as const,
      name: `${base} / Screen / ${screen.name}${counts.get(screen.name)! > 1 ? ` (${screen.id})` : ''}`,
      region: screen.bounds,
    })),
  ]
}
