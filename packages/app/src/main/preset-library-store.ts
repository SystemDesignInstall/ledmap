import { createHash, randomUUID } from 'node:crypto'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { migrateLegacyScreenPresets, emptyPresetLibrary, validatePresetLibrary,
  type PresetLibrary } from '../shared/preset-library.js'
import { StagedProjectWriter } from './staged-project-write.js'

interface StoredDrawing {
  readonly id: string
  readonly name: string
  readonly drawing: Record<string, unknown>
  readonly logoAsset?: string
  readonly logoWidth?: number
  readonly logoHeight?: number
}

export class PresetLibraryStore {
  private readonly writer = new StagedProjectWriter()
  private pending: Promise<void> = Promise.resolve()

  constructor(private readonly root: string) {}

  private enqueue<T>(operation: () => Promise<T>): Promise<T> {
    const result = this.pending.then(operation)
    this.pending = result.then(() => undefined, () => undefined)
    return result
  }

  private async read(): Promise<PresetLibrary> {
    let text: string
    try { text = await readFile(join(this.root, 'library.json'), 'utf8') }
    catch (error) {
      if (error !== null && typeof error === 'object' && 'code' in error && error.code === 'ENOENT') {
        return emptyPresetLibrary()
      }
      throw error
    }
    let stored: Record<string, unknown>
    try {
      stored = JSON.parse(text) as Record<string, unknown>
    } catch (error) {
      throw new Error('Preset library is corrupted.', { cause: error })
    }
    if (!Array.isArray(stored['drawings'])) throw new Error('Preset library drawings are invalid.')
    const drawings = await Promise.all(stored['drawings'].map(async (entry: unknown) => {
      if (entry === null || typeof entry !== 'object' || Array.isArray(entry)) throw new Error('Drawing preset is invalid.')
      const drawing = entry as StoredDrawing
      if (drawing.logoAsset === undefined) return drawing
      if (!/^[0-9a-f]{64}$/.test(drawing.logoAsset) || !Number.isSafeInteger(drawing.logoWidth) ||
          !Number.isSafeInteger(drawing.logoHeight)) throw new Error('Drawing preset logo reference is invalid.')
      const bytes = await readFile(join(this.root, 'assets', `${drawing.logoAsset}.png`))
      const digest = createHash('sha256').update(bytes).digest('hex')
      if (digest !== drawing.logoAsset) throw new Error('Drawing preset logo checksum mismatch.')
      return { id: drawing.id, name: drawing.name, drawing: { ...drawing.drawing,
        logo: { dataUrl: `data:image/png;base64,${bytes.toString('base64')}`,
          width: drawing.logoWidth, height: drawing.logoHeight } } }
    }))
    return validatePresetLibrary({ ...stored, drawings })
  }

  private async write(library: PresetLibrary): Promise<void> {
    await mkdir(join(this.root, 'assets'), { recursive: true })
    const drawings = await Promise.all(library.drawings.map(async preset => {
      const { logo, ...drawing } = preset.drawing
      if (!logo) return { id: preset.id, name: preset.name, drawing: { ...drawing, logo: null } }
      const bytes = Buffer.from(logo.dataUrl.slice('data:image/png;base64,'.length), 'base64')
      const hash = createHash('sha256').update(bytes).digest('hex')
      const asset = join(this.root, 'assets', `${hash}.png`)
      try { await writeFile(asset, bytes, { flag: 'wx' }) }
      catch (error) {
        if (error === null || typeof error !== 'object' || !('code' in error) || error.code !== 'EEXIST') throw error
      }
      return { id: preset.id, name: preset.name, drawing: { ...drawing, logo: null },
        logoAsset: hash, logoWidth: logo.width, logoHeight: logo.height }
    }))
    await this.writer.write(join(this.root, 'library.json'), JSON.stringify({ ...library, drawings }))
  }

  load(legacyRaw: string | null): Promise<PresetLibrary> {
    return this.enqueue(async () => {
      const current = await this.read()
      if (current.migratedLegacy) return current
      const migrated = migrateLegacyScreenPresets(current, legacyRaw, randomUUID)
      const next = validatePresetLibrary({ ...migrated, revision: current.revision + 1 })
      await this.write(next)
      return next
    })
  }

  save(value: unknown): Promise<PresetLibrary> {
    return this.enqueue(async () => {
      const submitted = validatePresetLibrary(value)
      const current = await this.read()
      if (submitted.revision !== current.revision) throw new Error('Preset library changed in another window. Reload the library and try again.')
      const next = validatePresetLibrary({ ...submitted, revision: current.revision + 1, migratedLegacy: true })
      await this.write(next)
      return next
    })
  }
}
