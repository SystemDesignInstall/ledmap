import { randomUUID } from 'node:crypto'
import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { PresetLibraryStore } from '../src/main/preset-library-store.js'
import { defaultChartSettings, screenChartStyle } from '../src/shared/chart-settings.js'
import { builtInCabinetPresets, emptyPresetLibrary, migrateLegacyScreenPresets, validatePresetLibrary } from '../src/shared/preset-library.js'

const folders: string[] = []
afterEach(async () => { await Promise.all(folders.splice(0).map(path => rm(path, { recursive: true, force: true }))) })

const style = screenChartStyle(defaultChartSettings, 'screen-1')
const logo = { dataUrl: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9rkT8AAAAASUVORK5CYII=',
  width: 1, height: 1 }

function legacyRaw(): string {
  return JSON.stringify([{ name: 'Touring LED', columns: 5, rows: 3, moduleColumns: 4, moduleRows: 4,
    modulePixelWidth: 32, modulePixelHeight: 32, drawing: { ...style, cabinetLineColor: '#dc517b', logo: undefined } }])
}

describe('Split preset library', () => {
  it('migrates a combined legacy preset into independent named entries without copying grid size into geometry', () => {
    const migrated = migrateLegacyScreenPresets(emptyPresetLibrary(), legacyRaw(), randomUUID)
    expect(migrated.cabinets).toMatchObject([{ name: 'Touring LED', moduleColumns: 4, moduleRows: 4,
      modulePixelWidth: 32, modulePixelHeight: 32, legacyGrid: { columns: 5, rows: 3 } }])
    expect(migrated.drawings).toMatchObject([{ name: 'Touring LED', drawing: { cabinetLineColor: '#dc517b' } }])
    expect(migrateLegacyScreenPresets(migrated, legacyRaw(), randomUUID)).toBe(migrated)
    expect(builtInCabinetPresets).toHaveLength(3)
  })

  it('stores presets across loads with logo bytes in a separate PNG and rejects stale writes', async () => {
    const root = await mkdtemp(join(tmpdir(), 'ledmap-preset-library-'))
    folders.push(root)
    const store = new PresetLibraryStore(root)
    const migrated = await store.load(legacyRaw())
    expect(migrated.revision).toBe(1)
    const custom = { id: randomUUID(), name: 'Checker', drawing: { ...style, palette: 'checkerboard' as const, logo } }
    const saved = await store.save({ ...migrated, drawings: [...migrated.drawings, custom] })
    expect(saved.revision).toBe(2)
    expect((await new PresetLibraryStore(root).load(null)).drawings.at(-1)?.drawing.logo).toEqual(logo)
    const assets = await readdir(join(root, 'assets'))
    expect(assets).toHaveLength(1)
    expect((await readFile(join(root, 'library.json'), 'utf8'))).not.toContain(logo.dataUrl)
    await expect(store.save(migrated)).rejects.toThrow(/another window/)
    expect((await new PresetLibraryStore(root).load(null)).revision).toBe(2)
  })

  it('rejects duplicate names, invalid dimensions and invalid drawing colors', () => {
    const id = randomUUID()
    const cabinet = { id, name: 'Touring LED', moduleColumns: 1, moduleRows: 1,
      modulePixelWidth: 128, modulePixelHeight: 128 }
    const library = { ...emptyPresetLibrary(), cabinets: [cabinet] }
    expect(() => validatePresetLibrary({ ...library, cabinets: [cabinet, { ...cabinet, id: randomUUID() }] })).toThrow(/unique/)
    expect(() => validatePresetLibrary({ ...library, cabinets: [{ ...cabinet, modulePixelWidth: 0 }] })).toThrow(/positive/)
    expect(() => validatePresetLibrary({ ...library, drawings: [{ id: randomUUID(), name: 'Bad',
      drawing: { ...style, cabinetLineColor: 'red' } }] })).toThrow(/color/)
  })
})
