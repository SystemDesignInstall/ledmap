import { validateScreenChartStyle, type ScreenChartStyle } from '../shared/chart-settings.js'
import type { ScreenView } from './v2-view-model.js'

export const SCREEN_PRESETS_KEY = 'ledmap.screenPresets.v1'

export interface ScreenPreset {
  readonly name: string
  readonly columns?: number
  readonly rows?: number
  readonly moduleColumns: number
  readonly moduleRows: number
  readonly modulePixelWidth: number
  readonly modulePixelHeight: number
  readonly drawing: Omit<ScreenChartStyle, 'logo'>
}

const standardDrawing: ScreenPreset['drawing'] = {
  palette: 'screen-color', labels: 'screen', fill: '#284a68',
  cabinetEdges: true, textShadow: true, caption: '',
  offsetMarkers: false, maskOffsetX: 0, maskOffsetY: 0,
  cabinetLabelMode: 'row-coordinate',
}

export const builtInScreenPresets: readonly ScreenPreset[] = [
  { name: 'Standard cabinet · 128×128', moduleColumns: 1, moduleRows: 1,
    modulePixelWidth: 128, modulePixelHeight: 128, drawing: standardDrawing },
  { name: 'Half-height cabinet · 128×64', moduleColumns: 1, moduleRows: 1,
    modulePixelWidth: 128, modulePixelHeight: 64, drawing: standardDrawing },
  { name: 'Half-width cabinet · 64×128', moduleColumns: 1, moduleRows: 1,
    modulePixelWidth: 64, modulePixelHeight: 128, drawing: standardDrawing },
]

export function makeScreenPreset(name: string, screen: ScreenView, style: ScreenChartStyle): ScreenPreset {
  const normalized = name.trim()
  if (!normalized || normalized.length > 40) throw new Error('Preset name must be 1–40 characters.')
  return {
    name: normalized,
    columns: screen.grid.columns,
    rows: screen.grid.rows,
    moduleColumns: screen.config.moduleColumns,
    moduleRows: screen.config.moduleRows,
    modulePixelWidth: screen.config.modulePixelWidth,
    modulePixelHeight: screen.config.modulePixelHeight,
    drawing: Object.fromEntries(Object.entries(validateScreenChartStyle(style)).filter(([key]) => key !== 'logo')) as ScreenPreset['drawing'],
  }
}

export function parseScreenPresets(raw: string | null): ScreenPreset[] {
  if (!raw) return []
  try {
    const values: unknown = JSON.parse(raw)
    if (!Array.isArray(values) || values.length > 32) return []
    return values.filter((value): value is ScreenPreset => {
      if (value === null || typeof value !== 'object') return false
      const preset = value as Partial<ScreenPreset>
      const drawing = preset.drawing
      try {
        validateScreenChartStyle({ ...drawing, logo: null }, 'Screen preset')
      } catch {
        return false
      }
      const hasGrid = preset.columns !== undefined || preset.rows !== undefined
      const validGrid = !hasGrid || Number.isSafeInteger(preset.columns) && Number.isSafeInteger(preset.rows) &&
        (preset.columns ?? 0) > 0 && (preset.rows ?? 0) > 0
      return validGrid && typeof preset.name === 'string' && preset.name.trim().length > 0 && preset.name.length <= 40 &&
        !builtInScreenPresets.some(builtIn => builtIn.name.toLocaleLowerCase() === preset.name?.toLocaleLowerCase()) &&
        (['moduleColumns', 'moduleRows', 'modulePixelWidth', 'modulePixelHeight'] as const).every(field =>
          Number.isSafeInteger(preset[field]) && (preset[field] ?? 0) > 0) &&
        drawing !== undefined
    })
  } catch {
    return []
  }
}

export function upsertScreenPreset(presets: readonly ScreenPreset[], preset: ScreenPreset): ScreenPreset[] {
  if (builtInScreenPresets.some(value => value.name.toLocaleLowerCase() === preset.name.toLocaleLowerCase())) {
    throw new Error('Choose a different name from a built-in Cabinet format.')
  }
  const index = presets.findIndex(value => value.name.toLocaleLowerCase() === preset.name.toLocaleLowerCase())
  const next = presets.filter((_, position) => position !== index)
  if (next.length >= 32) throw new Error('Up to 32 Screen presets can be saved.')
  return [...next, preset].sort((a, b) => a.name.localeCompare(b.name))
}
