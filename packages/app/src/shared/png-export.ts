import {
  evaluateTestPattern,
  testPatternAvailability,
  type TestBounds,
  type TestFrame,
  type TestPatternId,
  type TestScene,
  type TestScope,
  type TestWalkPixel,
} from './test-engine.js'

export type PngExportMode = 'composition' | 'current-scope' | 'screen' | 'batch-screens'

export interface PngExportConfig {
  readonly pattern: TestPatternId
  readonly currentScope: TestScope
  readonly walkPixel: TestWalkPixel | null
  readonly mode: PngExportMode
  readonly screenId: string | null
}

export interface PngExportJob {
  readonly name: string
  readonly bounds: TestBounds
  readonly frame: TestFrame
}

export interface PngExportPlan {
  readonly ready: boolean
  readonly diagnostics: readonly string[]
  readonly jobs: readonly PngExportJob[]
}

function safeName(value: string): string {
  const normalized = value.trim().replace(/[^a-zA-Z0-9._-]+/g, '-').replace(/^-+|-+$/g, '')
  return normalized || 'screen'
}

function validBounds(bounds: TestBounds | null): bounds is TestBounds {
  return bounds !== null && Number.isSafeInteger(bounds.x) && Number.isSafeInteger(bounds.y) &&
    Number.isSafeInteger(bounds.width) && Number.isSafeInteger(bounds.height) && bounds.width > 0 && bounds.height > 0
}

export function buildPngExportPlan(scene: TestScene, config: PngExportConfig): PngExportPlan {
  const diagnostics: string[] = []
  const unavailable = testPatternAvailability(scene, config.pattern)
  if (unavailable) diagnostics.push(unavailable)
  if (config.pattern === 'address-walk' && config.walkPixel === null) diagnostics.push('Choose an Address Walk pixel in Test before export.')

  let scopes: readonly { readonly scope: TestScope; readonly name: string }[] = []
  if (config.mode === 'composition') {
    scopes = [{ scope: { kind: 'composition', target: null }, name: `test-${config.pattern}.png` }]
  } else if (config.mode === 'current-scope') {
    scopes = [{ scope: config.currentScope, name: `test-${config.pattern}-current-scope.png` }]
  } else if (config.mode === 'screen') {
    const screen = scene.screens.find(value => value.id === config.screenId)
    if (!screen) diagnostics.push('Choose a Screen for PNG export.')
    else scopes = [{ scope: { kind: 'screen', target: screen.id }, name: `test-${config.pattern}-${safeName(screen.name)}-${safeName(screen.id)}.png` }]
  } else {
    if (scene.screens.length === 0) diagnostics.push('No Screens are available for batch PNG export.')
    scopes = scene.screens.map(screen => ({
      scope: { kind: 'screen', target: screen.id },
      name: `test-${config.pattern}-${safeName(screen.name)}-${safeName(screen.id)}.png`,
    }))
  }

  const jobs: PngExportJob[] = []
  if (diagnostics.length === 0) {
    for (const item of scopes) {
      const frame = evaluateTestPattern(scene, {
        pattern: config.pattern,
        scope: item.scope,
        walkPixel: config.pattern === 'address-walk' ? config.walkPixel : null,
      })
      const bounds = item.scope.kind === 'composition' ? scene.bounds : frame.scopeBounds
      if (!validBounds(bounds)) {
        diagnostics.push(`PNG scope ${item.name} has no pixel bounds.`)
        continue
      }
      jobs.push(Object.freeze({ name: item.name, bounds: Object.freeze({ ...bounds }), frame }))
    }
  }
  return Object.freeze({
    ready: diagnostics.length === 0 && jobs.length > 0,
    diagnostics: Object.freeze(diagnostics),
    jobs: Object.freeze(jobs),
  })
}
