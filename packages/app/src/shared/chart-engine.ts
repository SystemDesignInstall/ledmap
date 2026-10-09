import type { ChartSettings } from './chart-settings.js'
import { chartBounds, chartLogoBounds, screenChartStyle, screenNameVisible } from './chart-settings.js'
import type { TestBounds, TestFrame, TestPrimitive, TestScene, TestScope } from './test-engine.js'
import { cabinetDisplayLabel } from './cabinet-labels.js'
import { buildChartGuides } from './chart-guides.js'
import { buildChartInformation } from './chart-information.js'

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

function intersectBounds(a: TestBounds, b: TestBounds): TestBounds | null {
  const x = Math.max(a.x, b.x)
  const y = Math.max(a.y, b.y)
  const right = Math.min(a.x + a.width, b.x + b.width)
  const bottom = Math.min(a.y + a.height, b.y + b.height)
  return right > x && bottom > y ? { x, y, width: right - x, height: bottom - y } : null
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
    const screenCabinets = cabinets.filter(cabinet => cabinet.screen === screen.id)
    const sparse = screen.sparse === true
    const paintBounds = sparse ? screenCabinets.map(cabinet => cabinet.bounds) : [screen.bounds]
    if (mask) {
      for (const bounds of paintBounds) primitives.push({ kind: 'rect', bounds, fill: '#ffffff' })
      continue
    }
    if (style.palette === 'screen-color' && style.fill !== 'transparent') {
      for (const bounds of paintBounds) primitives.push({ kind: 'rect', bounds, fill: style.fill })
    } else if (style.palette === 'white-grid') {
      for (const bounds of paintBounds) primitives.push({ kind: 'rect', bounds, fill: '#ffffff' })
    } else if (style.palette === 'gray-gradient') {
      for (const bounds of paintBounds) primitives.push({ kind: 'gradient', bounds,
        ...(sparse ? { gradientBounds: screen.bounds } : {}), direction: style.patternDirection ?? 'horizontal',
        from: style.gradientFrom ?? '#000000', to: style.gradientTo ?? '#ffffff' })
    } else if (style.palette === 'rgb-bars') {
      const colors = style.bandColors ?? ['#ff0000', '#00ff00', '#0000ff']
      const horizontal = style.patternDirection !== 'vertical'
      const size = horizontal ? screen.bounds.width : screen.bounds.height
      for (let index = 0; index < colors.length; index += 1) {
        const start = Math.floor(size * index / colors.length)
        const end = Math.floor(size * (index + 1) / colors.length)
        const band = horizontal
          ? { x: screen.bounds.x + start, y: screen.bounds.y, width: end - start, height: screen.bounds.height }
          : { x: screen.bounds.x, y: screen.bounds.y + start, width: screen.bounds.width, height: end - start }
        for (const bounds of paintBounds) {
          const clipped = intersectBounds(bounds, band)
          if (clipped) primitives.push({ kind: 'rect', bounds: clipped, fill: colors[index]!, pixelAligned: true })
        }
      }
    } else if (style.palette === 'checkerboard') {
      for (const bounds of paintBounds) primitives.push({ kind: 'rect', bounds, fill: '#161b23' })
    }
    const cabinetLabels: TestPrimitive[] = []
    for (const cabinet of screenCabinets) {
      if (style.palette === 'checkerboard') {
        const column = Math.round((cabinet.bounds.x - screen.bounds.x) / cabinet.bounds.width)
        const row = Math.round((cabinet.bounds.y - screen.bounds.y) / cabinet.bounds.height)
        const colors = style.checkerColors ?? ['#e9edf0', '#202b39']
        const index = colors.length === 4 ? row % 2 * 2 + column % 2 : (column + row) % colors.length
        primitives.push({ kind: 'rect', bounds: cabinet.bounds, fill: colors[index]!, pixelAligned: true })
      }
      if (style.cabinetEdges) {
        const edge = style.cabinetLineColor ?? (style.palette === 'white-grid' ? '#202b39' : '#ffffff')
        primitives.push({ kind: 'cabinet-border', bounds: cabinet.bounds, color: edge })
      }
      if (style.labels === 'cabinet' || style.labels === 'cabinet-id' || style.labels === 'coordinates' || style.labels === 'grid-address') {
        const column = Math.round((cabinet.bounds.x - screen.bounds.x) / cabinet.bounds.width)
        const row = Math.round((cabinet.bounds.y - screen.bounds.y) / cabinet.bounds.height)
        const columns = Math.round(screen.bounds.width / cabinet.bounds.width)
        const rows = Math.round(screen.bounds.height / cabinet.bounds.height)
        cabinetLabels.push({ kind: 'text', point: { x: cabinet.bounds.x + cabinet.bounds.width / 2, y: cabinet.bounds.y + cabinet.bounds.height / 2 },
          text: style.labels === 'cabinet' ? cabinetDisplayLabel(style.cabinetLabelMode ?? 'row-coordinate', columns, rows,
            { id: cabinet.id, label: cabinet.label, column, row })
            : style.labels === 'cabinet-id' ? cabinet.id
            : style.labels === 'coordinates' ? `${cabinet.bounds.x},${cabinet.bounds.y}`
              : `${columnLetter(column)}${row + 1}`,
          color: style.textColor ?? (style.palette === 'white-grid' ? '#202b39' : '#ffffff'), size: 16, align: 'center', shadow: style.textShadow,
          role: 'cabinet-label', cellBounds: cabinet.bounds })
      }
    }
    if (style.guides) primitives.push(...buildChartGuides(screen.bounds, style.guides)
      .map(primitive => sparse ? { ...primitive, clip: paintBounds } : primitive))
    primitives.push(...cabinetLabels)
    const decorationStart = primitives.length
    if (screenNameVisible(style)) {
      const labeledCabinets = style.labels !== 'none' && style.labels !== 'screen'
      const heights = cabinets.filter(value => value.screen === screen.id).map(value => value.bounds.height)
      const cabinetHeight = heights.length > 0 ? Math.min(...heights) : screen.bounds.height
      const inset = Math.min(24, cabinetHeight * 0.2)
      const titleSize = labeledCabinets ? Math.min(style.screenNameSize ?? 24, Math.floor(cabinetHeight - 2 * inset - 14)) : style.screenNameSize ?? 24
      if (!labeledCabinets || titleSize >= 10) {
        screenTitles.push({ kind: 'text', point: labeledCabinets
          ? { x: screen.bounds.x + 12, y: screen.bounds.y + inset }
          : { x: screen.bounds.x + screen.bounds.width / 2, y: screen.bounds.y + screen.bounds.height / 2 },
        text: `${screen.name} · ${screen.bounds.width}×${screen.bounds.height}`, color: style.textColor ?? (style.palette === 'white-grid' ? '#202b39' : '#ffffff'),
          size: titleSize, align: labeledCabinets ? 'left' : 'center', shadow: style.textShadow, role: 'screen-title',
          ...(sparse ? { clip: paintBounds } : {}),
        ...(labeledCabinets ? { cellBounds: { ...screen.bounds, height: cabinetHeight } } : {}) })
      }
    }
    if (style.information) primitives.push(...buildChartInformation(screen, cabinets.filter(value => value.screen === screen.id),
      style.information, style.textColor ?? (style.palette === 'white-grid' ? '#202b39' : '#ffffff')))
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
      primitives.push({ kind: 'image', bounds: chartLogoBounds(screen.bounds, style.logo, style.logoLayout),
        dataUrl: style.logo.dataUrl, ...(style.logoLayout ? { opacity: style.logoLayout.opacity / 100 } : {}) })
    }
    if (sparse) {
      for (let index = decorationStart; index < primitives.length; index += 1) {
        primitives[index] = { ...primitives[index]!, clip: paintBounds }
      }
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
