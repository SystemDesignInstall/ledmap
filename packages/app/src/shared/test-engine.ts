export type TestPatternGroup = 'Basic' | 'Geometry' | 'LedMAP diagnostics' | 'Address Walk'

export type TestPatternId =
  | 'black' | 'white' | 'red' | 'green' | 'blue'
  | 'checkerboard' | 'module-grid' | 'borders' | 'center-cross' | 'diagonals' | 'corner-markers'
  | 'horizontal-gradient' | 'vertical-gradient'
  | 'screen-labels' | 'cabinet-labels' | 'cabinet-order' | 'module-labels'
  | 'receiver-labels' | 'port-labels' | 'processor-labels' | 'signal-flow'
  | 'address-walk'

export type TestScopeKind = 'composition' | 'screen' | 'cabinet' | 'module' | 'receiver' | 'port'

export interface TestBounds {
  readonly x: number
  readonly y: number
  readonly width: number
  readonly height: number
}

export interface TestPoint {
  readonly x: number
  readonly y: number
}

export interface TestScreenNode {
  readonly id: string
  readonly name: string
  readonly bounds: TestBounds
}

export interface TestHardwareIdentity {
  readonly receiver: string
  readonly port: string
  readonly processor: string
  readonly processorName: string
}

export interface TestCabinetNode {
  readonly id: string
  readonly screen: string
  readonly logicalOrder: number
  readonly bounds: TestBounds
  readonly hardware: TestHardwareIdentity | null
}

export interface TestModuleNode {
  readonly id: string
  readonly cabinet: string
  readonly screen: string
  readonly bounds: TestBounds
}

export interface TestSignalPath {
  readonly receiver: string
  readonly port: string
  readonly processor: string
  readonly cabinets: readonly string[]
  readonly points: readonly TestPoint[]
}

export interface TestScene {
  readonly bounds: TestBounds
  readonly screens: readonly TestScreenNode[]
  readonly cabinets: readonly TestCabinetNode[]
  readonly modules: readonly TestModuleNode[]
  readonly signalPaths: readonly TestSignalPath[]
  readonly hardwareReady: boolean
  readonly mappingReady: boolean
  readonly hardwareReason: string | null
  readonly mappingReason: string | null
}

export interface TestScope {
  readonly kind: TestScopeKind
  readonly target: string | null
}

export interface TestWalkPixel {
  readonly ordinal: number
  readonly total: number
  readonly input: TestPoint
  readonly screen: string
  readonly screenName: string
  readonly screenCoordinate: TestPoint
  readonly cabinet: string
  readonly cabinetCoordinate: TestPoint
  readonly module: string
  readonly moduleCoordinate: TestPoint
  readonly receiver: string
  readonly port: string
  readonly processor: string
  readonly dataIndex: number
  readonly compositionPoint: TestPoint
}

export interface TestPatternConfig {
  readonly pattern: TestPatternId
  readonly scope: TestScope
  readonly walkPixel: TestWalkPixel | null
}

export type TestPrimitive =
  | { readonly kind: 'rect'; readonly bounds: TestBounds; readonly fill?: string; readonly stroke?: string; readonly lineWidth?: number }
  | { readonly kind: 'line'; readonly from: TestPoint; readonly to: TestPoint; readonly color: string; readonly lineWidth: number; readonly dash?: readonly number[] }
  | { readonly kind: 'text'; readonly point: TestPoint; readonly text: string; readonly color: string; readonly size: number; readonly align?: 'left' | 'center' | 'right' }
  | { readonly kind: 'gradient'; readonly bounds: TestBounds; readonly direction: 'horizontal' | 'vertical'; readonly from: string; readonly to: string }
  | { readonly kind: 'pixel'; readonly point: TestPoint; readonly color: string }

export interface TestFrame {
  readonly pattern: TestPatternId
  readonly scope: TestScope
  readonly bounds: TestBounds
  readonly scopeBounds: TestBounds | null
  readonly background: string
  readonly scopedCabinets: readonly string[]
  readonly primitives: readonly TestPrimitive[]
  readonly walkPixel: TestWalkPixel | null
}

export interface TestPatternDefinition {
  readonly id: TestPatternId
  readonly name: string
  readonly group: TestPatternGroup
  readonly requiresHardware: boolean
  readonly requiresMapping: boolean
}

const definition = (
  id: TestPatternId,
  name: string,
  group: TestPatternGroup,
  requiresHardware = false,
  requiresMapping = false,
): TestPatternDefinition => Object.freeze({ id, name, group, requiresHardware, requiresMapping })

export const TEST_PATTERN_DEFINITIONS: readonly TestPatternDefinition[] = Object.freeze([
  definition('black', 'Black', 'Basic'),
  definition('white', 'White', 'Basic'),
  definition('red', 'Red', 'Basic'),
  definition('green', 'Green', 'Basic'),
  definition('blue', 'Blue', 'Basic'),
  definition('checkerboard', 'Checkerboard', 'Geometry'),
  definition('module-grid', 'Module / Grid', 'Geometry'),
  definition('borders', 'Borders', 'Geometry'),
  definition('center-cross', 'Center cross', 'Geometry'),
  definition('diagonals', 'Diagonals', 'Geometry'),
  definition('corner-markers', 'Corner markers', 'Geometry'),
  definition('horizontal-gradient', 'Horizontal gradient', 'Geometry'),
  definition('vertical-gradient', 'Vertical gradient', 'Geometry'),
  definition('screen-labels', 'Screen IDs / names', 'LedMAP diagnostics'),
  definition('cabinet-labels', 'Cabinet IDs', 'LedMAP diagnostics'),
  definition('cabinet-order', 'Cabinet logical order', 'LedMAP diagnostics'),
  definition('module-labels', 'Module IDs / bounds', 'LedMAP diagnostics'),
  definition('receiver-labels', 'Receiver colors / IDs', 'LedMAP diagnostics', true),
  definition('port-labels', 'Port colors / IDs', 'LedMAP diagnostics', true),
  definition('processor-labels', 'Processor colors / IDs', 'LedMAP diagnostics', true),
  definition('signal-flow', 'Signal / Data Flow', 'LedMAP diagnostics', true),
  definition('address-walk', 'Address Walk', 'Address Walk', true, true),
])

const basicColors: Partial<Record<TestPatternId, string>> = {
  black: '#000000',
  white: '#ffffff',
  red: '#ff2028',
  green: '#20e070',
  blue: '#2488ff',
}

function center(bounds: TestBounds): TestPoint {
  return { x: bounds.x + bounds.width / 2, y: bounds.y + bounds.height / 2 }
}

function identityColor(identity: string, alpha = 1): string {
  let hash = 2166136261
  for (let index = 0; index < identity.length; index += 1) {
    hash ^= identity.charCodeAt(index)
    hash = Math.imul(hash, 16777619)
  }
  return `hsl(${Math.abs(hash) % 360} 62% 48% / ${alpha})`
}

function matchingCabinets(scene: TestScene, scope: TestScope): readonly TestCabinetNode[] {
  if (scope.kind === 'composition') return scene.cabinets
  if (scope.kind === 'screen') return scene.cabinets.filter(cabinet => cabinet.screen === scope.target)
  if (scope.kind === 'cabinet') return scene.cabinets.filter(cabinet => cabinet.id === scope.target)
  if (scope.kind === 'module') {
    const module = scene.modules.find(value => value.id === scope.target)
    return module ? scene.cabinets.filter(cabinet => cabinet.id === module.cabinet) : []
  }
  if (scope.kind === 'receiver') return scene.cabinets.filter(cabinet => cabinet.hardware?.receiver === scope.target)
  return scene.cabinets.filter(cabinet => cabinet.hardware?.port === scope.target)
}

export function scopeCabinetIds(scene: TestScene, scope: TestScope): readonly string[] {
  return matchingCabinets(scene, scope).map(cabinet => cabinet.id)
}

function matchingScreens(scene: TestScene, scope: TestScope, cabinets: readonly TestCabinetNode[]): readonly TestScreenNode[] {
  if (scope.kind === 'composition') return scene.screens
  if (scope.kind === 'screen') return scene.screens.filter(screen => screen.id === scope.target)
  const ids = new Set(cabinets.map(cabinet => cabinet.screen))
  return scene.screens.filter(screen => ids.has(screen.id))
}

function matchingModules(scene: TestScene, scope: TestScope, cabinets: readonly TestCabinetNode[]): readonly TestModuleNode[] {
  if (scope.kind === 'module') return scene.modules.filter(module => module.id === scope.target)
  const ids = new Set(cabinets.map(cabinet => cabinet.id))
  return scene.modules.filter(module => ids.has(module.cabinet))
}

function scopeRegions(
  scene: TestScene,
  scope: TestScope,
  screens: readonly TestScreenNode[],
  cabinets: readonly TestCabinetNode[],
  modules: readonly TestModuleNode[],
): readonly TestBounds[] {
  if (scope.kind === 'composition' || scope.kind === 'screen') return screens.map(screen => screen.bounds)
  if (scope.kind === 'module') return modules.map(module => module.bounds)
  return cabinets.map(cabinet => cabinet.bounds)
}

export function testPatternAvailability(scene: TestScene, pattern: TestPatternId): string | null {
  const metadata = TEST_PATTERN_DEFINITIONS.find(value => value.id === pattern)
  if (!metadata) return `Unknown test pattern: ${pattern}`
  if (metadata.requiresHardware && !scene.hardwareReady) return scene.hardwareReason ?? 'Complete Hardware topology to use this pattern.'
  if (metadata.requiresMapping && !scene.mappingReady) return scene.mappingReason ?? 'Complete Mapping to use this pattern.'
  return null
}

function screenFrames(primitives: TestPrimitive[], scene: TestScene): void {
  for (const screen of scene.screens) {
    primitives.push({ kind: 'rect', bounds: screen.bounds, fill: '#080d13', stroke: '#314256', lineWidth: 2 })
  }
}

function unionBounds(regions: readonly TestBounds[]): TestBounds | null {
  if (regions.length === 0) return null
  const left = Math.min(...regions.map(bounds => bounds.x))
  const top = Math.min(...regions.map(bounds => bounds.y))
  const right = Math.max(...regions.map(bounds => bounds.x + bounds.width))
  const bottom = Math.max(...regions.map(bounds => bounds.y + bounds.height))
  return { x: left, y: top, width: right - left, height: bottom - top }
}

function addGeometryPattern(pattern: TestPatternId, regions: readonly TestBounds[], primitives: TestPrimitive[]): void {
  for (const bounds of regions) {
    if (pattern === 'checkerboard') {
      const tile = 32
      for (let y = 0; y < bounds.height; y += tile) {
        for (let x = 0; x < bounds.width; x += tile) {
          primitives.push({
            kind: 'rect',
            bounds: { x: bounds.x + x, y: bounds.y + y, width: Math.min(tile, bounds.width - x), height: Math.min(tile, bounds.height - y) },
            fill: (Math.floor(x / tile) + Math.floor(y / tile)) % 2 === 0 ? '#f4f6f8' : '#11151a',
          })
        }
      }
    }
    if (pattern === 'borders') primitives.push({ kind: 'rect', bounds, fill: '#05080c', stroke: '#ffffff', lineWidth: 5 })
    if (pattern === 'center-cross') {
      primitives.push({ kind: 'rect', bounds, fill: '#05080c' })
      const middle = center(bounds)
      primitives.push(
        { kind: 'line', from: { x: bounds.x, y: middle.y }, to: { x: bounds.x + bounds.width, y: middle.y }, color: '#ffffff', lineWidth: 3 },
        { kind: 'line', from: { x: middle.x, y: bounds.y }, to: { x: middle.x, y: bounds.y + bounds.height }, color: '#ffffff', lineWidth: 3 },
      )
    }
    if (pattern === 'diagonals') {
      primitives.push(
        { kind: 'rect', bounds, fill: '#05080c' },
        { kind: 'line', from: { x: bounds.x, y: bounds.y }, to: { x: bounds.x + bounds.width, y: bounds.y + bounds.height }, color: '#ffffff', lineWidth: 3 },
        { kind: 'line', from: { x: bounds.x + bounds.width, y: bounds.y }, to: { x: bounds.x, y: bounds.y + bounds.height }, color: '#ffffff', lineWidth: 3 },
      )
    }
    if (pattern === 'corner-markers') {
      const size = Math.max(8, Math.min(40, Math.min(bounds.width, bounds.height) / 5))
      const corners = [
        { x: bounds.x, y: bounds.y },
        { x: bounds.x + bounds.width - size, y: bounds.y },
        { x: bounds.x, y: bounds.y + bounds.height - size },
        { x: bounds.x + bounds.width - size, y: bounds.y + bounds.height - size },
      ]
      primitives.push({ kind: 'rect', bounds, fill: '#05080c' })
      corners.forEach((point, index) => primitives.push({
        kind: 'rect', bounds: { ...point, width: size, height: size }, fill: ['#ff3040', '#40e070', '#3388ff', '#ffffff'][index]!,
      }))
    }
    if (pattern === 'horizontal-gradient' || pattern === 'vertical-gradient') {
      primitives.push({
        kind: 'gradient', bounds,
        direction: pattern === 'horizontal-gradient' ? 'horizontal' : 'vertical',
        from: '#000000', to: '#ffffff',
      })
    }
  }
}

function label(primitives: TestPrimitive[], bounds: TestBounds, text: string, color = '#ffffff', size = 24): void {
  primitives.push({ kind: 'text', point: center(bounds), text, color, size, align: 'center' })
}

export function evaluateTestPattern(scene: TestScene, config: TestPatternConfig): TestFrame {
  const primitives: TestPrimitive[] = []
  screenFrames(primitives, scene)
  const cabinets = matchingCabinets(scene, config.scope)
  const screens = matchingScreens(scene, config.scope, cabinets)
  const modules = matchingModules(scene, config.scope, cabinets)
  const regions = scopeRegions(scene, config.scope, screens, cabinets, modules)
  const basic = basicColors[config.pattern]

  if (basic) regions.forEach(bounds => primitives.push({ kind: 'rect', bounds, fill: basic }))
  if ([
    'checkerboard', 'borders', 'center-cross', 'diagonals', 'corner-markers', 'horizontal-gradient', 'vertical-gradient',
  ].includes(config.pattern)) addGeometryPattern(config.pattern, regions, primitives)

  if (config.pattern === 'module-grid') {
    regions.forEach(bounds => primitives.push({ kind: 'rect', bounds, fill: '#0a1018' }))
    modules.forEach(module => primitives.push({ kind: 'rect', bounds: module.bounds, stroke: '#d5e1ec', lineWidth: 2 }))
  }
  if (config.pattern === 'screen-labels') {
    screens.forEach(screen => {
      primitives.push({ kind: 'rect', bounds: screen.bounds, fill: identityColor(screen.id, .6), stroke: '#ffffff', lineWidth: 3 })
      label(primitives, screen.bounds, `${screen.name} · ${screen.id}`, '#ffffff', 34)
    })
  }
  if (config.pattern === 'cabinet-labels' || config.pattern === 'cabinet-order') {
    cabinets.forEach(cabinet => {
      primitives.push({ kind: 'rect', bounds: cabinet.bounds, fill: '#101923', stroke: '#87a3bd', lineWidth: 2 })
      label(primitives, cabinet.bounds, config.pattern === 'cabinet-order' ? `#${cabinet.logicalOrder}` : cabinet.id, '#ffffff', 19)
    })
  }
  if (config.pattern === 'module-labels') {
    modules.forEach(module => {
      primitives.push({ kind: 'rect', bounds: module.bounds, fill: '#101923', stroke: '#9cc3df', lineWidth: 1 })
      label(primitives, module.bounds, module.id, '#ffffff', 12)
    })
  }
  if (config.pattern === 'receiver-labels' || config.pattern === 'port-labels' || config.pattern === 'processor-labels') {
    cabinets.forEach(cabinet => {
      const hardware = cabinet.hardware
      if (!hardware) return
      const id = config.pattern === 'receiver-labels'
        ? hardware.receiver
        : config.pattern === 'port-labels'
          ? hardware.port
          : hardware.processor
      primitives.push({ kind: 'rect', bounds: cabinet.bounds, fill: identityColor(id, .73), stroke: '#ffffff', lineWidth: 1 })
      label(primitives, cabinet.bounds, id, '#ffffff', 16)
    })
  }
  if (config.pattern === 'signal-flow') {
    const included = new Set(cabinets.map(cabinet => cabinet.id))
    for (const path of scene.signalPaths) {
      const points = path.points.filter((_, index) => included.has(path.cabinets[index]!))
      for (let index = 1; index < points.length; index += 1) {
        primitives.push({ kind: 'line', from: points[index - 1]!, to: points[index]!, color: identityColor(path.receiver), lineWidth: 4 })
      }
      if (points[0]) primitives.push({ kind: 'text', point: points[0], text: path.receiver, color: '#ffffff', size: 16, align: 'center' })
    }
  }
  if (config.pattern === 'address-walk' && config.walkPixel) {
    const cabinet = scene.cabinets.find(value => value.id === config.walkPixel?.cabinet)
    if (cabinet) primitives.push({ kind: 'rect', bounds: cabinet.bounds, fill: '#3c311c', stroke: '#ffdf66', lineWidth: 4 })
    const point = config.walkPixel.compositionPoint
    primitives.push(
      { kind: 'pixel', point, color: '#ffffff' },
      { kind: 'line', from: { x: point.x - 18, y: point.y }, to: { x: point.x + 18, y: point.y }, color: '#ffdf66', lineWidth: 2 },
      { kind: 'line', from: { x: point.x, y: point.y - 18 }, to: { x: point.x, y: point.y + 18 }, color: '#ffdf66', lineWidth: 2 },
      { kind: 'text', point: { x: point.x, y: point.y - 28 }, text: `${config.walkPixel.port} · ${config.walkPixel.dataIndex}`, color: '#ffffff', size: 15, align: 'center' },
    )
  }

  return Object.freeze({
    pattern: config.pattern,
    scope: Object.freeze({ ...config.scope }),
    bounds: scene.bounds,
    scopeBounds: unionBounds(regions),
    background: '#05080c',
    scopedCabinets: Object.freeze(cabinets.map(cabinet => cabinet.id)),
    primitives: Object.freeze(primitives),
    walkPixel: config.pattern === 'address-walk' ? config.walkPixel : null,
  })
}
