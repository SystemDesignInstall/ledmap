import type { JsonObject, JsonValue } from '@ledmap/core'
import type { TestBounds, TestScene } from './test-engine.js'
import { CABINET_LABEL_MODES, type CabinetLabelMode } from './cabinet-labels.js'

export type ChartPalette = 'screen-color' | 'white-grid' | 'checkerboard' | 'gray-gradient' | 'rgb-bars'
export type ChartLabels = 'none' | 'screen' | 'cabinet' | 'cabinet-id' | 'coordinates' | 'grid-address'

export interface ChartLogo {
  readonly dataUrl: string
  readonly width: number
  readonly height: number
}

export interface ScreenChartStyle {
  readonly guides?: ChartGuides
  readonly information?: ChartInformation
  readonly logoLayout?: ChartLogoLayout
  readonly palette: ChartPalette
  readonly labels: ChartLabels
  readonly fill: string
  readonly cabinetEdges: boolean
  readonly cabinetLineColor?: string
  readonly textShadow: boolean
  readonly caption: string
  readonly logo: ChartLogo | null
  readonly offsetMarkers?: boolean
  readonly maskOffsetX?: number
  readonly maskOffsetY?: number
  readonly cabinetLabelMode?: CabinetLabelMode
  readonly showScreenName?: boolean
  readonly screenNameSize?: number
  readonly textColor?: string
  readonly checkerColors?: readonly string[]
  readonly bandColors?: readonly string[]
  readonly patternDirection?: 'horizontal' | 'vertical'
  readonly gradientFrom?: string
  readonly gradientTo?: string
}

export type ChartGuides = {
  readonly diagonals: boolean
  readonly horizontalCenter: boolean
  readonly verticalCenter: boolean
  readonly centralCircle: boolean
  readonly cornerCircles: boolean
  readonly outerBorder: boolean
  readonly color: string
  readonly thickness: number
}

export const defaultChartGuides: ChartGuides = Object.freeze({
  diagonals: false, horizontalCenter: false, verticalCenter: false,
  centralCircle: false, cornerCircles: false, outerBorder: false,
  color: '#ffffff', thickness: 1,
})

export type ChartAnchor = 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right'

export type ChartInformation = {
  readonly enabled: boolean
  readonly position: ChartAnchor
  readonly size: number
  readonly resolution: boolean
  readonly aspectRatio: boolean
  readonly cabinetSize: boolean
  readonly grid: boolean
  readonly cabinetCount: boolean
  readonly canvasPosition: boolean
}

export const defaultChartInformation: ChartInformation = Object.freeze({
  enabled: false, position: 'top-left', size: 14, resolution: true, aspectRatio: true,
  cabinetSize: true, grid: true, cabinetCount: true, canvasPosition: false,
})

export type ChartLogoLayout = {
  readonly position: ChartAnchor | 'center'
  readonly width: number
  readonly opacity: number
}

export interface ChartSettings {
  readonly allowFrameCrop?: boolean
  readonly frameMode: 'fit' | 'fixed'
  readonly frame: TestBounds
  readonly palette: ChartPalette
  readonly labels: ChartLabels
  readonly background: string
  readonly cabinetEdges: boolean
  readonly screenColors: Readonly<Record<string, string>>
  readonly screenStyles: Readonly<Record<string, ScreenChartStyle>>
  readonly logoText: string
  readonly logo: ChartLogo | null
}

export const CHART_EXTENSION_KEY = 'ledmap.compositionChart'
export const defaultChartSettings: ChartSettings = Object.freeze({
  frameMode: 'fit',
  frame: Object.freeze({ x: 0, y: 0, width: 1920, height: 1080 }),
  palette: 'screen-color',
  labels: 'screen',
  background: 'transparent',
  cabinetEdges: true,
  screenColors: Object.freeze(Object.create(null) as Record<string, string>),
  screenStyles: Object.freeze(Object.create(null) as Record<string, ScreenChartStyle>),
  logoText: '',
  logo: null,
})

function record(value: unknown, label: string): Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) throw new Error(`${label} must be an object.`)
  return value as Record<string, unknown>
}

function color(value: unknown, label: string): string {
  if (typeof value !== 'string' || !/^#[0-9a-fA-F]{6}$/.test(value)) throw new Error(`${label} must be a six-digit hex color.`)
  return value.toLowerCase()
}

function colors(value: unknown, label: string, max: number): readonly string[] {
  if (!Array.isArray(value) || value.length < 2 || value.length > max) {
    throw new Error(`${label} must contain 2–${max} colors.`)
  }
  return Object.freeze(value.map((entry, index) => color(entry, `${label} ${index + 1}`)))
}

function chartGuides(value: unknown, label: string): ChartGuides {
  const source = record(value, label)
  for (const key of ['diagonals', 'horizontalCenter', 'verticalCenter', 'centralCircle', 'cornerCircles', 'outerBorder']) {
    if (typeof source[key] !== 'boolean') throw new Error(`${label} ${key} must be a boolean.`)
  }
  if (!Number.isSafeInteger(source['thickness']) || (source['thickness'] as number) < 1 || (source['thickness'] as number) > 8) {
    throw new Error(`${label} thickness must be 1–8 pixels.`)
  }
  return Object.freeze({
    diagonals: source['diagonals'] as boolean, horizontalCenter: source['horizontalCenter'] as boolean,
    verticalCenter: source['verticalCenter'] as boolean, centralCircle: source['centralCircle'] as boolean,
    cornerCircles: source['cornerCircles'] as boolean, outerBorder: source['outerBorder'] as boolean,
    color: color(source['color'], `${label} color`), thickness: source['thickness'] as number,
  })
}

function information(value: unknown, label: string): ChartInformation {
  const source = record(value, label)
  for (const key of ['enabled', 'resolution', 'aspectRatio', 'cabinetSize', 'grid', 'cabinetCount', 'canvasPosition']) {
    if (typeof source[key] !== 'boolean') throw new Error(`${label} ${key} must be a boolean.`)
  }
  if (!['top-left', 'top-right', 'bottom-left', 'bottom-right'].includes(String(source['position']))) {
    throw new Error(`${label} position is invalid.`)
  }
  if (!Number.isSafeInteger(source['size']) || (source['size'] as number) < 10 || (source['size'] as number) > 32) {
    throw new Error(`${label} size must be 10–32 pixels.`)
  }
  return Object.freeze({
    enabled: source['enabled'] as boolean, position: source['position'] as ChartAnchor, size: source['size'] as number,
    resolution: source['resolution'] as boolean, aspectRatio: source['aspectRatio'] as boolean,
    cabinetSize: source['cabinetSize'] as boolean, grid: source['grid'] as boolean,
    cabinetCount: source['cabinetCount'] as boolean, canvasPosition: source['canvasPosition'] as boolean,
  })
}

function logoLayout(value: unknown, label: string): ChartLogoLayout {
  const source = record(value, label)
  if (!['top-left', 'top-right', 'bottom-left', 'bottom-right', 'center'].includes(String(source['position'])) ||
      !Number.isSafeInteger(source['width']) || (source['width'] as number) < 1 || (source['width'] as number) > 8192 ||
      !Number.isSafeInteger(source['opacity']) || (source['opacity'] as number) < 0 || (source['opacity'] as number) > 100) {
    throw new Error(`${label} needs a valid position, width 1–8192 and opacity 0–100.`)
  }
  return Object.freeze({ position: source['position'] as ChartLogoLayout['position'],
    width: source['width'] as number, opacity: source['opacity'] as number })
}

export function chartLogoBounds(bounds: TestBounds, logo: ChartLogo, layout?: ChartLogoLayout): TestBounds {
  const margin = layout ? Math.min(16, bounds.width / 4, bounds.height / 4) : 16
  const width = layout ? Math.min(layout.width, bounds.width - margin * 2,
    (bounds.height - margin * 2) * logo.width / logo.height) : logo.width
  const height = logo.height * width / logo.width
  const position = layout?.position ?? 'top-right'
  return {
    x: position === 'center' ? bounds.x + (bounds.width - width) / 2
      : position.endsWith('right') ? bounds.x + bounds.width - margin - width : bounds.x + margin,
    y: position === 'center' ? bounds.y + (bounds.height - height) / 2
      : position.startsWith('bottom') ? bounds.y + bounds.height - margin - height : bounds.y + margin,
    width, height,
  }
}

const validatedPngHeaders = new Map<string, { width: number; height: number }>()

function chartLogo(value: unknown, label: string): ChartLogo | null {
  if (value === null) return null
  const image = record(value, label)
  if (typeof image['dataUrl'] !== 'string' || image['dataUrl'].length > 350_000 ||
      !/^data:image\/png;base64,[A-Za-z0-9+/]+={0,2}$/.test(image['dataUrl']) ||
      !Number.isSafeInteger(image['width']) || !Number.isSafeInteger(image['height']) ||
      (image['width'] as number) < 1 || (image['height'] as number) < 1 ||
      (image['width'] as number) > 512 || (image['height'] as number) > 512) {
    throw new Error(`${label} must be a PNG no larger than 256 KiB and 512×512 px.`)
  }
  let dimensions = validatedPngHeaders.get(image['dataUrl'])
  if (!dimensions) {
    let png: string
    try {
      png = atob(image['dataUrl'].slice('data:image/png;base64,'.length))
    } catch {
      throw new Error(`${label} contains invalid PNG data.`)
    }
    const pngSize = (offset: number) =>
      (png.charCodeAt(offset) * 0x1000000 + png.charCodeAt(offset + 1) * 0x10000 +
        png.charCodeAt(offset + 2) * 0x100 + png.charCodeAt(offset + 3))
    if (png.length < 45 || png.length > 256 * 1024 ||
        png.slice(0, 8) !== '\x89PNG\r\n\x1a\n' || pngSize(8) !== 13 || png.slice(12, 16) !== 'IHDR') {
      throw new Error(`${label} contains invalid PNG data.`)
    }
    dimensions = { width: pngSize(16), height: pngSize(20) }
    if (validatedPngHeaders.size >= 32) validatedPngHeaders.clear()
    validatedPngHeaders.set(image['dataUrl'], dimensions)
  }
  if (dimensions.width !== image['width'] || dimensions.height !== image['height']) {
    throw new Error(`${label} contains invalid PNG data or dimensions.`)
  }
  return Object.freeze({ dataUrl: image['dataUrl'], width: image['width'] as number, height: image['height'] as number })
}

export function validateScreenChartStyle(value: unknown, label = 'Screen drawing'): ScreenChartStyle {
  const source = record(value, label)
  if (!['screen-color', 'white-grid', 'checkerboard', 'gray-gradient', 'rgb-bars'].includes(String(source['palette']))) {
    throw new Error(`${label} palette is invalid.`)
  }
  if (!['none', 'screen', 'cabinet', 'cabinet-id', 'coordinates', 'grid-address'].includes(String(source['labels']))) {
    throw new Error(`${label} labels are invalid.`)
  }
  const fill = source['fill'] === 'transparent' ? 'transparent' : color(source['fill'], `${label} fill`)
  if (typeof source['cabinetEdges'] !== 'boolean' || typeof source['textShadow'] !== 'boolean') {
    throw new Error(`${label} display settings are invalid.`)
  }
  if (typeof source['caption'] !== 'string' || source['caption'].length > 80) {
    throw new Error(`${label} caption must be at most 80 characters.`)
  }
  const maskOffsetX = source['maskOffsetX'] ?? 0
  const maskOffsetY = source['maskOffsetY'] ?? 0
  if (source['offsetMarkers'] !== undefined && typeof source['offsetMarkers'] !== 'boolean') {
    throw new Error(`${label} offset markers setting is invalid.`)
  }
  if (![maskOffsetX, maskOffsetY].every(value => Number.isSafeInteger(value) && Math.abs(value as number) <= 8192)) {
    throw new Error(`${label} mask offsets must be whole numbers from -8192 to 8192.`)
  }
  if (source['cabinetLabelMode'] !== undefined && !CABINET_LABEL_MODES.includes(source['cabinetLabelMode'] as CabinetLabelMode)) {
    throw new Error(`${label} Cabinet label mode is invalid.`)
  }
  if (source['showScreenName'] !== undefined && typeof source['showScreenName'] !== 'boolean') {
    throw new Error(`${label} Screen name visibility is invalid.`)
  }
  if (source['screenNameSize'] !== undefined && (!Number.isSafeInteger(source['screenNameSize']) ||
      (source['screenNameSize'] as number) < 10 || (source['screenNameSize'] as number) > 48)) {
    throw new Error(`${label} Screen name size must be 10–48 pixels.`)
  }
  if (source['patternDirection'] !== undefined && !['horizontal', 'vertical'].includes(String(source['patternDirection']))) {
    throw new Error(`${label} pattern direction is invalid.`)
  }
  return Object.freeze({
    palette: source['palette'] as ChartPalette,
    labels: source['labels'] as ChartLabels,
    fill,
    cabinetEdges: source['cabinetEdges'],
    ...(source['cabinetLineColor'] === undefined ? {} : { cabinetLineColor: color(source['cabinetLineColor'], `${label} Cabinet line color`) }),
    textShadow: source['textShadow'],
    caption: source['caption'],
    logo: chartLogo(source['logo'], `${label} logo`),
    offsetMarkers: source['offsetMarkers'] === true,
    maskOffsetX: maskOffsetX as number,
    maskOffsetY: maskOffsetY as number,
    cabinetLabelMode: (source['cabinetLabelMode'] ?? 'row-coordinate') as CabinetLabelMode,
    ...(source['showScreenName'] === undefined ? {} : { showScreenName: source['showScreenName'] as boolean }),
    ...(source['screenNameSize'] === undefined ? {} : { screenNameSize: source['screenNameSize'] as number }),
    ...(source['textColor'] === undefined ? {} : { textColor: color(source['textColor'], `${label} text color`) }),
    ...(source['checkerColors'] === undefined ? {} : { checkerColors: colors(source['checkerColors'], `${label} checkerboard`, 4) }),
    ...(source['bandColors'] === undefined ? {} : { bandColors: colors(source['bandColors'], `${label} color bands`, 10) }),
    ...(source['patternDirection'] === undefined ? {} : { patternDirection: source['patternDirection'] as 'horizontal' | 'vertical' }),
    ...(source['gradientFrom'] === undefined ? {} : { gradientFrom: color(source['gradientFrom'], `${label} gradient start`) }),
    ...(source['gradientTo'] === undefined ? {} : { gradientTo: color(source['gradientTo'], `${label} gradient end`) }),
    ...(source['guides'] === undefined ? {} : { guides: chartGuides(source['guides'], `${label} guides`) }),
    ...(source['information'] === undefined ? {} : { information: information(source['information'], `${label} information`) }),
    ...(source['logoLayout'] === undefined ? {} : { logoLayout: logoLayout(source['logoLayout'], `${label} logo layout`) }),
  })
}

export function screenNameVisible(style: ScreenChartStyle): boolean {
  return style.showScreenName ?? style.labels === 'screen'
}

export function screenCabinetLabels(style: ScreenChartStyle): Exclude<ChartLabels, 'screen'> {
  return style.labels === 'screen' ? 'none' : style.labels
}

export function screenChartStyle(settings: ChartSettings, screenId: string): ScreenChartStyle {
  if (Object.hasOwn(settings.screenStyles, screenId)) return settings.screenStyles[screenId]!
  return {
    palette: settings.palette,
    labels: settings.labels,
    fill: Object.hasOwn(settings.screenColors, screenId) ? settings.screenColors[screenId]! : '#284a68',
    cabinetEdges: settings.cabinetEdges,
    textShadow: true,
    caption: '',
    logo: null,
    offsetMarkers: false,
    maskOffsetX: 0,
    maskOffsetY: 0,
    cabinetLabelMode: 'row-coordinate',
  }
}

export function validateChartSettings(value: unknown): ChartSettings {
  const source = record(value, 'Composition chart settings')
  const frame = record(source['frame'], 'Chart frame')
  const x = frame['x']
  const y = frame['y']
  const width = frame['width']
  const height = frame['height']
  if (!Number.isSafeInteger(x) || !Number.isSafeInteger(y) ||
      !Number.isSafeInteger(width) || !Number.isSafeInteger(height) ||
      (width as number) < 1 || (height as number) < 1) {
    throw new Error('Chart frame needs signed whole-number X/Y and positive whole-number Width/Height.')
  }
  if (source['frameMode'] !== 'fit' && source['frameMode'] !== 'fixed') throw new Error('Chart frame mode is invalid.')
  if (source['allowFrameCrop'] !== undefined && typeof source['allowFrameCrop'] !== 'boolean') throw new Error('Chart frame crop setting is invalid.')
  if (!['screen-color', 'white-grid', 'checkerboard', 'gray-gradient', 'rgb-bars'].includes(String(source['palette']))) throw new Error('Chart palette is invalid.')
  if (!['none', 'screen', 'cabinet', 'cabinet-id', 'coordinates', 'grid-address'].includes(String(source['labels']))) throw new Error('Chart labels are invalid.')
  const background = source['background'] === 'transparent' ? 'transparent' : color(source['background'], 'Chart background')
  if (typeof source['cabinetEdges'] !== 'boolean') throw new Error('Chart cabinet edges setting is invalid.')
  const screenColors = Object.create(null) as Record<string, string>
  for (const [id, entry] of Object.entries(record(source['screenColors'], 'Chart screen colors'))) {
    screenColors[id] = color(entry, `Screen ${id} color`)
  }
  const screenStyles = Object.create(null) as Record<string, ScreenChartStyle>
  for (const [id, entry] of Object.entries(record(source['screenStyles'] ?? {}, 'Screen drawing settings'))) {
    screenStyles[id] = validateScreenChartStyle(entry, `Screen ${id}`)
  }
  if (typeof source['logoText'] !== 'string' || source['logoText'].length > 80) throw new Error('Chart caption must be at most 80 characters.')
  const logo = chartLogo(source['logo'], 'Chart logo')
  return Object.freeze({
    frameMode: source['frameMode'],
    ...(source['allowFrameCrop'] === undefined ? {} : { allowFrameCrop: source['allowFrameCrop'] as boolean }),
    frame: Object.freeze({ x: x as number, y: y as number, width: width as number, height: height as number }),
    palette: source['palette'] as ChartPalette,
    labels: source['labels'] as ChartLabels,
    background,
    cabinetEdges: source['cabinetEdges'],
    screenColors: Object.freeze(screenColors),
    screenStyles: Object.freeze(screenStyles),
    logoText: source['logoText'],
    logo,
  })
}

export function chartSettingsFromExtensions(extensions: JsonObject): ChartSettings {
  const value = extensions[CHART_EXTENSION_KEY]
  if (value === undefined) return defaultChartSettings
  const source = record(value, 'Composition chart extension')
  if (source['version'] !== 1) throw new Error('Unsupported Composition chart settings version.')
  return validateChartSettings(source)
}

export function withChartSettings(extensions: JsonObject, settings: ChartSettings): JsonObject {
  const valid = validateChartSettings(settings)
  const value: JsonValue = {
    version: 1,
    frameMode: valid.frameMode,
    ...(valid.allowFrameCrop === undefined ? {} : { allowFrameCrop: valid.allowFrameCrop }),
    frame: { ...valid.frame },
    palette: valid.palette,
    labels: valid.labels,
    background: valid.background,
    cabinetEdges: valid.cabinetEdges,
    screenColors: { ...valid.screenColors },
    screenStyles: Object.fromEntries(Object.entries(valid.screenStyles).map(([id, style]) => [id, {
      ...style, logo: style.logo ? { ...style.logo } : null,
    }])),
    logoText: valid.logoText,
    logo: valid.logo ? { ...valid.logo } : null,
  }
  return Object.freeze({ ...extensions, [CHART_EXTENSION_KEY]: value })
}

export function chartBounds(scene: TestScene, settings: ChartSettings): TestBounds {
  return settings.frameMode === 'fixed' ? settings.frame : scene.bounds
}

export function withChartFrameBounds(settings: ChartSettings, bounds: TestBounds, allowFrameCrop = false): ChartSettings {
  return validateChartSettings({ ...settings, frameMode: 'fixed', frame: { ...bounds }, allowFrameCrop })
}

export function chartFrameProblem(scene: TestScene, settings: ChartSettings, includeLogos = true): string | null {
  if (scene.screens.length === 0) return 'Add a Screen before exporting a Composition chart.'
  const bounds = chartBounds(scene, settings)
  if (bounds.width > 32767 || bounds.height > 32767 || bounds.width * bounds.height > 64 * 1024 * 1024) {
    return 'Composition chart frame exceeds the PNG renderer limit.'
  }
  if (settings.frameMode === 'fixed' && !settings.allowFrameCrop && scene.screens.some(screen =>
    screen.bounds.x < bounds.x || screen.bounds.y < bounds.y ||
    screen.bounds.x + screen.bounds.width > bounds.x + bounds.width ||
    screen.bounds.y + screen.bounds.height > bounds.y + bounds.height)) {
    return 'A Screen lies outside the fixed chart frame.'
  }
  if (includeLogos && settings.logo && (settings.logo.width + 16 > bounds.width || settings.logo.height + 16 > bounds.height)) {
    return 'The chart logo does not fit inside the chart frame.'
  }
  for (const screen of scene.screens) {
    const style = screenChartStyle(settings, screen.id)
    const logo = style.logo
    if (includeLogos && logo && !style.logoLayout && (logo.width + 16 > screen.bounds.width || logo.height + 16 > screen.bounds.height)) {
      return `The logo does not fit inside Screen ${screen.name}.`
    }
  }
  return null
}
