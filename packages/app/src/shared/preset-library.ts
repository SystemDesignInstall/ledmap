import { validateScreenChartStyle, type ScreenChartStyle } from './chart-settings.js'

export interface CabinetPreset {
  readonly id: string
  readonly name: string
  readonly moduleColumns: number
  readonly moduleRows: number
  readonly modulePixelWidth: number
  readonly modulePixelHeight: number
  readonly legacyGrid?: { readonly columns: number; readonly rows: number }
}

export interface DrawingPreset {
  readonly id: string
  readonly name: string
  readonly drawing: ScreenChartStyle
}

export interface PresetLibrary {
  readonly version: 1
  readonly revision: number
  readonly migratedLegacy: boolean
  readonly cabinets: readonly CabinetPreset[]
  readonly drawings: readonly DrawingPreset[]
}

export const builtInCabinetPresets: readonly CabinetPreset[] = Object.freeze([
  { id: 'builtin-standard-128', name: 'Standard cabinet · 128×128', moduleColumns: 1, moduleRows: 1,
    modulePixelWidth: 128, modulePixelHeight: 128 },
  { id: 'builtin-half-height', name: 'Half-height cabinet · 128×64', moduleColumns: 1, moduleRows: 1,
    modulePixelWidth: 128, modulePixelHeight: 64 },
  { id: 'builtin-half-width', name: 'Half-width cabinet · 64×128', moduleColumns: 1, moduleRows: 1,
    modulePixelWidth: 64, modulePixelHeight: 128 },
])

export function emptyPresetLibrary(): PresetLibrary {
  return { version: 1, revision: 0, migratedLegacy: false, cabinets: [], drawings: [] }
}

function record(value: unknown, label: string): Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) throw new Error(`${label} must be an object.`)
  return value as Record<string, unknown>
}

function name(value: unknown, label: string): string {
  if (typeof value !== 'string' || value.trim().length < 1 || value.trim().length > 40) {
    throw new Error(`${label} name must be 1–40 characters.`)
  }
  return value.trim()
}

function positive(value: unknown, label: string): number {
  if (!Number.isSafeInteger(value) || (value as number) < 1 || (value as number) > 8192) {
    throw new Error(`${label} must be a positive whole number at most 8192.`)
  }
  return value as number
}

function id(value: unknown): string {
  if (typeof value !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)) {
    throw new Error('Preset ID is invalid.')
  }
  return value
}

export function validateCabinetPreset(value: unknown): CabinetPreset {
  const item = record(value, 'Cabinet preset')
  const legacy = item['legacyGrid'] === undefined ? undefined : record(item['legacyGrid'], 'Legacy grid')
  return {
    id: id(item['id']), name: name(item['name'], 'Cabinet preset'),
    moduleColumns: positive(item['moduleColumns'], 'Module columns'),
    moduleRows: positive(item['moduleRows'], 'Module rows'),
    modulePixelWidth: positive(item['modulePixelWidth'], 'Module width'),
    modulePixelHeight: positive(item['modulePixelHeight'], 'Module height'),
    ...(legacy ? { legacyGrid: { columns: positive(legacy['columns'], 'Legacy columns'),
      rows: positive(legacy['rows'], 'Legacy rows') } } : {}),
  }
}

export function validateDrawingPreset(value: unknown): DrawingPreset {
  const item = record(value, 'Drawing preset')
  return { id: id(item['id']), name: name(item['name'], 'Drawing preset'),
    drawing: validateScreenChartStyle(item['drawing'], 'Drawing preset') }
}

function uniqueNames<T extends { readonly id: string; readonly name: string }>(items: readonly T[], label: string): void {
  if (new Set(items.map(item => item.id)).size !== items.length ||
      new Set(items.map(item => item.name.toLocaleLowerCase())).size !== items.length) {
    throw new Error(`${label} names and IDs must be unique.`)
  }
}

export function validatePresetLibrary(value: unknown): PresetLibrary {
  const item = record(value, 'Preset library')
  if (item['version'] !== 1 || !Number.isSafeInteger(item['revision']) || (item['revision'] as number) < 0 ||
      typeof item['migratedLegacy'] !== 'boolean' || !Array.isArray(item['cabinets']) || !Array.isArray(item['drawings']) ||
      item['cabinets'].length > 64 || item['drawings'].length > 64) throw new Error('Preset library is invalid.')
  const cabinets = item['cabinets'].map(validateCabinetPreset)
  const drawings = item['drawings'].map(validateDrawingPreset)
  uniqueNames(cabinets, 'Cabinet preset')
  uniqueNames(drawings, 'Drawing preset')
  if (cabinets.some((preset: CabinetPreset) => builtInCabinetPresets.some(value => value.name.toLocaleLowerCase() === preset.name.toLocaleLowerCase()))) {
    throw new Error('A Cabinet preset cannot use a built-in name.')
  }
  return { version: 1, revision: item['revision'] as number, migratedLegacy: item['migratedLegacy'] as boolean,
    cabinets, drawings }
}

export function migrateLegacyScreenPresets(library: PresetLibrary, raw: string | null, createId: () => string): PresetLibrary {
  if (library.migratedLegacy) return library
  let values: unknown
  try { values = raw ? JSON.parse(raw) : [] } catch { values = [] }
  const cabinets = [...library.cabinets]
  const drawings = [...library.drawings]
  if (Array.isArray(values)) for (const value of values.slice(0, 32)) {
    try {
      const item = record(value, 'Legacy preset')
      const presetName = name(item['name'], 'Legacy preset')
      const drawing = validateScreenChartStyle({ ...record(item['drawing'], 'Legacy drawing'), logo: null }, 'Legacy drawing')
      if (cabinets.some(preset => preset.name.toLocaleLowerCase() === presetName.toLocaleLowerCase()) ||
          drawings.some(preset => preset.name.toLocaleLowerCase() === presetName.toLocaleLowerCase())) continue
      const legacyGrid = item['columns'] === undefined || item['rows'] === undefined ? undefined :
        { columns: positive(item['columns'], 'Legacy columns'), rows: positive(item['rows'], 'Legacy rows') }
      cabinets.push({ id: createId(), name: presetName,
        moduleColumns: positive(item['moduleColumns'], 'Module columns'), moduleRows: positive(item['moduleRows'], 'Module rows'),
        modulePixelWidth: positive(item['modulePixelWidth'], 'Module width'),
        modulePixelHeight: positive(item['modulePixelHeight'], 'Module height'),
        ...(legacyGrid ? { legacyGrid } : {}) })
      drawings.push({ id: createId(), name: presetName, drawing })
    } catch { continue }
  }
  return validatePresetLibrary({ ...library, cabinets, drawings, migratedLegacy: true })
}
