import type { ChartSettings } from './chart-settings.js'
import { chartBounds, screenChartStyle } from './chart-settings.js'
import type { TestBounds, TestFrame, TestPrimitive, TestScene, TestScope } from './test-engine.js'
import { cabinetDisplayLabel } from './cabinet-labels.js'

function selectedScreens(scene: TestScene, scope: TestScope) {
  if (scope.kind === 'composition') return scene.screens
  if (scope.kind === 'screen') return scene.screens.filter(screen => screen.id === scope.target)
  const cabinetIds = new Set(scene.cabinets.filter(cabinet =>
    scope.kind === 'cabinet' ? cabinet.id === scope.target
      : scope.kind === 'module' ? scene.modules.some(module => module.id === scope.target && module.cabinet === cabinet.id)
        : scope.kind === 'receiver' ? cabinet.hardware?.receiver === scope.target
          : cabinet.hardware?.port === scope.target).map(cabinet => cabinet.screen))
  return scene.screens.filter(screen => cabinetIds.has(screen.id))
}

function unionBounds(regions: readonly TestBounds[]): TestBounds | null {
  if (regions.length === 0) return null
  const x = Math.min(...regions.map(value => value.x))
  const y = Math.min(...regions.map(value => value.y))
  const right = Math.max(...regions.map(value => value.x + value.width))
  const bottom = Math.max(...regions.map(value => value.y + value.height))
  return { x, y, width: right - x, height: bottom - y }
}

function columnLetter(index: number): string {
  let value = index + 1
  let result = ''
  while (value > 0) {
    value -= 1
    result = String.fromCharCode(65 + value % 26) + result
    value = Math.floor(value / 26)
  }
  return result
}

export function buildCompositionChartFrame(
  scene: TestScene,
  scope: TestScope,
  settings: ChartSettings,
  mask = false,
): TestFrame {
  const screens = selectedScreens(scene, scope)
  const included = new Set(screens.map(screen => screen.id))
  const cabinets = scene.cabinets.filter(cabinet => included.has(cabinet.screen))
  const primitives: TestPrimitive[] = []
  const screenTitles: TestPrimitive[] = []
  for (const screen of screens) {
    const style = screenChartStyle(settings, screen.id)
    if (mask) {
      primitives.push({ kind: 'rect', bounds: {
        ...screen.bounds, x: screen.bounds.x + (style.maskOffsetX ?? 0), y: screen.bounds.y + (style.maskOffsetY ?? 0),
      }, fill: '#ffffff' })
      continue
    }
    if (style.palette === 'screen-color' && style.fill !== 'transparent') {
      primitives.push({ kind: 'rect', bounds: screen.bounds, fill: style.fill })
    } else if (style.palette === 'white-grid') {
      primitives.push({ kind: 'rect', bounds: screen.bounds, fill: '#ffffff' })
    } else if (style.palette === 'gray-gradient') {
      primitives.push({ kind: 'gradient', bounds: screen.bounds, direction: 'horizontal', from: '#000000', to: '#ffffff' })
    } else if (style.palette === 'rgb-bars') {
      const colors = ['#ff0000', '#00ff00', '#0000ff']
      for (let index = 0; index < 3; index += 1) {
        const left = screen.bounds.x + Math.floor(screen.bounds.width * index / 3)
        const right = screen.bounds.x + Math.floor(screen.bounds.width * (index + 1) / 3)
        primitives.push({ kind: 'rect', bounds: { x: left, y: screen.bounds.y, width: right - left, height: screen.bounds.height }, fill: colors[index]! })
      }
    } else if (style.palette === 'checkerboard') {
      primitives.push({ kind: 'rect', bounds: screen.bounds, fill: '#161b23' })
    }
    for (const cabinet of cabinets.filter(value => value.screen === screen.id)) {
      if (style.palette === 'checkerboard') {
        const column = Math.round((cabinet.bounds.x - screen.bounds.x) / cabinet.bounds.width)
        const row = Math.round((cabinet.bounds.y - screen.bounds.y) / cabinet.bounds.height)
        primitives.push({ kind: 'rect', bounds: cabinet.bounds, fill: (column + row) % 2 === 0 ? '#e9edf0' : '#202b39' })
      }
      if (style.cabinetEdges) {
        const { x, y, width, height } = cabinet.bounds
        const edge = style.palette === 'white-grid' ? '#202b39' : '#ffffff'
        primitives.push(
          { kind: 'rect', bounds: { x, y, width, height: 1 }, fill: edge },
          { kind: 'rect', bounds: { x, y, width: 1, height }, fill: edge },
        )
        if (x + width === screen.bounds.x + screen.bounds.width) {
          primitives.push({ kind: 'rect', bounds: { x: x + width - 1, y, width: 1, height }, fill: edge })
        }
        if (y + height === screen.bounds.y + screen.bounds.height) {
          primitives.push({ kind: 'rect', bounds: { x, y: y + height - 1, width, height: 1 }, fill: edge })
        }
      }
      if (style.labels === 'cabinet' || style.labels === 'cabinet-id' || style.labels === 'coordinates' || style.labels === 'grid-address') {
        const column = Math.round((cabinet.bounds.x - screen.bounds.x) / cabinet.bounds.width)
        const row = Math.round((cabinet.bounds.y - screen.bounds.y) / cabinet.bounds.height)
        const columns = Math.round(screen.bounds.width / cabinet.bounds.width)
        const rows = Math.round(screen.bounds.height / cabinet.bounds.height)
        primitives.push({ kind: 'text', point: { x: cabinet.bounds.x + cabinet.bounds.width / 2, y: cabinet.bounds.y + cabinet.bounds.height / 2 },
          text: style.labels === 'cabinet' ? cabinetDisplayLabel(style.cabinetLabelMode ?? 'row-coordinate', columns, rows,
            { id: cabinet.id, label: cabinet.label, column, row })
            : style.labels === 'cabinet-id' ? cabinet.id
            : style.labels === 'coordinates' ? `${cabinet.bounds.x},${cabinet.bounds.y}`
              : `${columnLetter(column)}${row + 1}`,
          color: style.palette === 'white-grid' ? '#202b39' : '#ffffff', size: 16, align: 'center', shadow: style.textShadow })
      }
    }
    if (style.labels === 'screen') {
      screenTitles.push({ kind: 'text', point: { x: screen.bounds.x + screen.bounds.width / 2, y: screen.bounds.y + screen.bounds.height / 2 },
        text: `${screen.name} · ${screen.bounds.width}×${screen.bounds.height}`, color: style.palette === 'white-grid' ? '#202b39' : '#ffffff',
        size: 24, align: 'center', shadow: style.textShadow, role: 'screen-title' })
    }
    if (style.caption) {
      primitives.push({ kind: 'text', point: { x: screen.bounds.x + 16, y: screen.bounds.y + 20 }, text: style.caption,
        color: style.palette === 'white-grid' ? '#202b39' : '#ffffff', size: 16, align: 'left', shadow: style.textShadow })
    }
    if (style.offsetMarkers && screen.bounds.width >= 80 && screen.bounds.height >= 40) {
      const { x, y, height } = screen.bounds
      primitives.push(
        { kind: 'rect', bounds: { x: x + 8, y: y + height - 19, width: 1, height: 9 }, fill: '#ffffff' },
        { kind: 'rect', bounds: { x: x + 4, y: y + height - 15, width: 9, height: 1 }, fill: '#ffffff' },
        { kind: 'text', point: { x: x + 20, y: y + height - 14 }, text: `X ${x} · Y ${y}`,
          color: '#ffffff', size: 12, align: 'left', shadow: true },
      )
    }
    if (style.logo) {
      primitives.push({ kind: 'image', bounds: {
        x: screen.bounds.x + screen.bounds.width - style.logo.width - 16,
        y: screen.bounds.y + 16,
        width: style.logo.width, height: style.logo.height,
      }, dataUrl: style.logo.dataUrl })
    }
  }
  if (!mask) {
    if (settings.logoText) {
      const bounds = scope.kind === 'composition' ? chartBounds(scene, settings) : unionBounds(screens.map(value => value.bounds))
      if (bounds) primitives.push({ kind: 'text', point: { x: bounds.x + 16, y: bounds.y + 20 }, text: settings.logoText,
        color: '#ffffff', size: 16, align: 'left', shadow: true })
    }
    if (settings.logo) {
      const bounds = scope.kind === 'composition' ? chartBounds(scene, settings) : unionBounds(screens.map(value => value.bounds))
      if (bounds) primitives.push({ kind: 'image', bounds: {
        x: bounds.x + bounds.width - settings.logo.width - 16,
        y: bounds.y + 16,
        width: settings.logo.width, height: settings.logo.height,
      }, dataUrl: settings.logo.dataUrl })
    }
  }
  primitives.push(...screenTitles)
  const bounds = scope.kind === 'composition' ? chartBounds(scene, settings) : unionBounds(screens.map(value => value.bounds)) ?? scene.bounds
  return Object.freeze({
    pattern: mask ? 'composition-mask' : 'composition-chart',
    scope: Object.freeze({ ...scope }),
    bounds,
    scopeBounds: unionBounds(screens.map(value => value.bounds)),
    background: mask ? 'transparent' : settings.background,
    scopedCabinets: Object.freeze(cabinets.map(value => value.id)),
    primitives: Object.freeze(primitives),
    walkPixel: null,
  })
}
