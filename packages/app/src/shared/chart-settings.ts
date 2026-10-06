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
  readonly palette: ChartPalette
  readonly labels: ChartLabels
  readonly fill: string
  readonly cabinetEdges: boolean
  readonly textShadow: boolean
  readonly caption: string
  readonly logo: ChartLogo | null
  readonly offsetMarkers?: boolean
  readonly maskOffsetX?: number
  readonly maskOffsetY?: number
  readonly cabinetLabelMode?: CabinetLabelMode
}

export interface ChartSettings {
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

function screenStyle(value: unknown, label: string): ScreenChartStyle {
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
  return Object.freeze({
    palette: source['palette'] as ChartPalette,
    labels: source['labels'] as ChartLabels,
    fill,
    cabinetEdges: source['cabinetEdges'],
    textShadow: source['textShadow'],
    caption: source['caption'],
    logo: chartLogo(source['logo'], `${label} logo`),
    offsetMarkers: source['offsetMarkers'] === true,
    maskOffsetX: maskOffsetX as number,
    maskOffsetY: maskOffsetY as number,
    cabinetLabelMode: (source['cabinetLabelMode'] ?? 'row-coordinate') as CabinetLabelMode,
  })
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
    screenStyles[id] = screenStyle(entry, `Screen ${id}`)
  }
  if (typeof source['logoText'] !== 'string' || source['logoText'].length > 80) throw new Error('Chart caption must be at most 80 characters.')
  const logo = chartLogo(source['logo'], 'Chart logo')
  return Object.freeze({
    frameMode: source['frameMode'],
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

export function chartFrameProblem(scene: TestScene, settings: ChartSettings, includeLogos = true): string | null {
  if (scene.screens.length === 0) return 'Add a Screen before exporting a Composition chart.'
  const bounds = chartBounds(scene, settings)
  if (bounds.width > 32767 || bounds.height > 32767 || bounds.width * bounds.height > 64 * 1024 * 1024) {
    return 'Composition chart frame exceeds the PNG renderer limit.'
  }
  if (settings.frameMode === 'fixed' && scene.screens.some(screen =>
    screen.bounds.x < bounds.x || screen.bounds.y < bounds.y ||
    screen.bounds.x + screen.bounds.width > bounds.x + bounds.width ||
    screen.bounds.y + screen.bounds.height > bounds.y + bounds.height)) {
    return 'A Screen lies outside the fixed chart frame.'
  }
  if (includeLogos && settings.logo && (settings.logo.width + 16 > bounds.width || settings.logo.height + 16 > bounds.height)) {
    return 'The chart logo does not fit inside the chart frame.'
  }
  for (const screen of scene.screens) {
    const logo = screenChartStyle(settings, screen.id).logo
    if (includeLogos && logo && (logo.width + 16 > screen.bounds.width || logo.height + 16 > screen.bounds.height)) {
      return `The logo does not fit inside Screen ${screen.name}.`
    }
  }
  return null
}
