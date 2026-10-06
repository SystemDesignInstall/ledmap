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
import { chartFrameProblem, defaultChartSettings, screenChartStyle, type ChartSettings } from './chart-settings.js'

export type PngExportMode = 'composition' | 'current-scope' | 'screen' | 'batch-screens'

export interface PngExportConfig {
  readonly pattern: TestPatternId
  readonly currentScope: TestScope
  readonly walkPixel: TestWalkPixel | null
  readonly mode: PngExportMode
  readonly screenId: string | null
  readonly chartSettings?: ChartSettings
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

function fileStem(pattern: TestPatternId): string {
  if (pattern === 'composition-chart') return 'screen-drawings'
  if (pattern === 'composition-mask') return 'screen-mask'
  return `test-${pattern}`
}

function validBounds(bounds: TestBounds | null): bounds is TestBounds {
  return bounds !== null && Number.isSafeInteger(bounds.x) && Number.isSafeInteger(bounds.y) &&
    Number.isSafeInteger(bounds.width) && Number.isSafeInteger(bounds.height) && bounds.width > 0 && bounds.height > 0 &&
    bounds.width <= 32767 && bounds.height <= 32767 && bounds.width * bounds.height <= 64 * 1024 * 1024
}

export function buildPngExportPlan(scene: TestScene, config: PngExportConfig): PngExportPlan {
  const diagnostics: string[] = []
  const unavailable = testPatternAvailability(scene, config.pattern)
  if (unavailable) diagnostics.push(unavailable)
  if (config.pattern === 'address-walk' && config.walkPixel === null) diagnostics.push('Choose an Address Walk pixel in Test before export.')
  const chartPattern = config.pattern === 'composition-chart' || config.pattern === 'composition-mask'
  const chartSettings = config.chartSettings ?? defaultChartSettings
  if (chartPattern && config.mode === 'current-scope' && config.currentScope.kind !== 'composition' && config.currentScope.kind !== 'screen') {
    diagnostics.push('Screen drawing PNG supports Composition or Screen scope.')
  }
  if (chartPattern && (config.mode === 'composition' ||
      (config.mode === 'current-scope' && config.currentScope.kind === 'composition'))) {
    const problem = chartFrameProblem(scene, chartSettings, config.pattern === 'composition-chart')
    if (problem) diagnostics.push(problem)
  }

  let scopes: readonly { readonly scope: TestScope; readonly name: string }[] = []
  const stem = fileStem(config.pattern)
  if (config.mode === 'composition') {
    scopes = [{ scope: { kind: 'composition', target: null }, name: `${stem}.png` }]
  } else if (config.mode === 'current-scope') {
    scopes = [{ scope: config.currentScope, name: `${stem}-current-scope.png` }]
  } else if (config.mode === 'screen') {
    const screen = scene.screens.find(value => value.id === config.screenId)
    if (!screen) diagnostics.push('Choose a Screen for PNG export.')
    else scopes = [{ scope: { kind: 'screen', target: screen.id }, name: `${stem}-${safeName(screen.name)}-${safeName(screen.id)}.png` }]
  } else {
    if (scene.screens.length === 0) diagnostics.push('No Screens are available for batch PNG export.')
    scopes = scene.screens.map(screen => ({
      scope: { kind: 'screen', target: screen.id },
      name: `${stem}-${safeName(screen.name)}-${safeName(screen.id)}.png`,
    }))
  }

  const jobs: PngExportJob[] = []
  if (diagnostics.length === 0) {
    for (const item of scopes) {
      const frame = evaluateTestPattern(scene, {
        pattern: config.pattern,
        scope: item.scope,
        walkPixel: config.pattern === 'address-walk' ? config.walkPixel : null,
        chartSettings,
      })
      const bounds = item.scope.kind === 'composition' ? frame.bounds : frame.scopeBounds
      if (!validBounds(bounds)) {
        diagnostics.push(`PNG scope ${item.name} has invalid or oversized pixel bounds.`)
        continue
      }
      const logo = chartSettings.logo
      if (config.pattern === 'composition-chart' && logo && (logo.width + 16 > bounds.width || logo.height + 16 > bounds.height)) {
        diagnostics.push(`Chart logo does not fit in PNG scope ${item.name}.`)
        continue
      }
      if (config.pattern === 'composition-chart' && item.scope.kind === 'screen') {
        const screen = scene.screens.find(value => value.id === item.scope.target)
        const screenLogo = screen && screenChartStyle(chartSettings, screen.id).logo
        if (screen && screenLogo &&
            (screenLogo.width + 16 > screen.bounds.width || screenLogo.height + 16 > screen.bounds.height)) {
          diagnostics.push(`The logo does not fit inside Screen ${screen.name}.`)
          continue
        }
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
