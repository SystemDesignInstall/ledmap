import { createHash, randomUUID } from 'node:crypto'
import { createReadStream } from 'node:fs'
import { lstat, mkdir, readFile, readdir, unlink } from 'node:fs/promises'
import { basename, isAbsolute, join } from 'node:path'
import { loadLedMapProject } from '@ledmap/core'
import { StagedProjectWriter } from './staged-project-write.js'

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/
const hashPattern = /^[0-9a-f]{64}$/
const manifestKeys = [
  'baselineSourceSha256', 'createdAt', 'displayName', 'format', 'manifestVersion', 'observedSavedRevision',
  'payloadFile', 'payloadSha256', 'recoveryId', 'sessionEpoch', 'snapshotRevision', 'sourcePath',
  'sourceSchemaVersion', 'updatedAt',
].sort()

export interface RecoveryManifest {
  readonly format: 'ledmap-recovery'
  readonly manifestVersion: 1
  readonly recoveryId: string
  readonly sessionEpoch: string
  readonly payloadFile: string
  readonly sourcePath: string | null
  readonly displayName: string
  readonly createdAt: string
  readonly updatedAt: string
  readonly snapshotRevision: number
  readonly observedSavedRevision: number
  readonly sourceSchemaVersion: 1 | 2 | 3 | 4 | 5 | 6 | 7
  readonly payloadSha256: string
  readonly baselineSourceSha256: string | null
}

export interface RecoverySnapshotRequest {
  readonly recoveryId: string
  readonly sessionEpoch: string
  readonly text: string
  readonly sourcePath: string | null
  readonly displayName: string
  readonly snapshotRevision: number
  readonly observedSavedRevision: number
  readonly sourceSchemaVersion: 1 | 2 | 3 | 4 | 5 | 6 | 7
  readonly baselineSourceSha256: string | null
}

export interface RecoverySaveCommit {
  readonly recoveryId: string
  readonly sessionEpoch: string
  readonly savedRevision: number
  readonly currentRevision: number
  readonly sourcePath: string
  readonly baselineSourceSha256: string
  readonly sourceSchemaVersion?: 5 | 6 | 7
}

export interface RecoveryCandidate {
  readonly manifest: RecoveryManifest
  readonly classification: 'UNSAVED' | 'CONFLICT' | 'REDUNDANT'
  readonly text: string
}

interface Writer {
  write(path: string, text: string): Promise<void>
}

export function sha256(bytes: Uint8Array): string {
  return createHash('sha256').update(bytes).digest('hex')
}

export function validRecoveryId(value: unknown): value is string {
  return typeof value === 'string' && uuidPattern.test(value)
}

function validPayloadFile(id: string, value: unknown): value is string {
  return typeof value === 'string' && basename(value) === value && !value.includes('/') && !value.includes('\\') &&
    value.startsWith(`${id}-`) && new RegExp(`^${id}-[0-9a-f-]{36}\\.json$`).test(value)
}

function validDate(value: unknown): value is string {
  return typeof value === 'string' && Number.isFinite(Date.parse(value)) && new Date(value).toISOString() === value
}

function validRevision(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0
}

export function parseRecoveryManifest(text: string): RecoveryManifest {
  const value: unknown = JSON.parse(text)
  if (value === null || typeof value !== 'object' || Array.isArray(value)) throw new Error('Invalid recovery manifest.')
  const data = value as Record<string, unknown>
  if (Object.keys(data).sort().join('\0') !== manifestKeys.join('\0') ||
      data['format'] !== 'ledmap-recovery' || data['manifestVersion'] !== 1 ||
      !validRecoveryId(data['recoveryId']) || !validRecoveryId(data['sessionEpoch']) ||
      !validPayloadFile(data['recoveryId'], data['payloadFile']) ||
      (data['sourcePath'] !== null && (typeof data['sourcePath'] !== 'string' || !isAbsolute(data['sourcePath']))) ||
      typeof data['displayName'] !== 'string' || data['displayName'].length > 200 ||
      !validDate(data['createdAt']) || !validDate(data['updatedAt']) ||
      !validRevision(data['snapshotRevision']) || !validRevision(data['observedSavedRevision']) ||
      data['observedSavedRevision'] > data['snapshotRevision'] ||
      (data['sourceSchemaVersion'] !== 1 && data['sourceSchemaVersion'] !== 2 && data['sourceSchemaVersion'] !== 3 && data['sourceSchemaVersion'] !== 4 && data['sourceSchemaVersion'] !== 5 && data['sourceSchemaVersion'] !== 6 && data['sourceSchemaVersion'] !== 7) ||
      typeof data['payloadSha256'] !== 'string' || !hashPattern.test(data['payloadSha256']) ||
      (data['baselineSourceSha256'] !== null &&
        (typeof data['baselineSourceSha256'] !== 'string' || !hashPattern.test(data['baselineSourceSha256'])))) {
    throw new Error('Invalid recovery manifest.')
  }
  return data as unknown as RecoveryManifest
}

function missing(error: unknown): boolean {
  return error !== null && typeof error === 'object' && 'code' in error && error.code === 'ENOENT'
}

async function readRegularFile(path: string, maxBytes: number): Promise<Buffer> {
  const info = await lstat(path)
  if (!info.isFile() || info.isSymbolicLink() || info.size > maxBytes) throw new Error('Unsafe recovery file.')
  return readFile(path)
}

async function hashFile(path: string): Promise<string> {
  const hash = createHash('sha256')
  for await (const chunk of createReadStream(path)) hash.update(chunk)
  return hash.digest('hex')
}

export class RecoveryStore {
  private readonly pending = new Map<string, Promise<void>>()

  constructor(private readonly root: string, private readonly writer: Writer = new StagedProjectWriter()) {}

  private manifests(): string { return join(this.root, 'manifests') }
  private payloads(): string { return join(this.root, 'payloads') }
  private manifestPath(id: string): string { return join(this.manifests(), `${id}.json`) }
  private payloadPath(name: string): string { return join(this.payloads(), name) }

  private async ready(): Promise<void> {
    await mkdir(this.manifests(), { recursive: true })
    await mkdir(this.payloads(), { recursive: true })
  }

  private async existing(id: string): Promise<RecoveryManifest | null> {
    try {
      const manifest = parseRecoveryManifest((await readRegularFile(this.manifestPath(id), 16_384)).toString('utf8'))
      if (manifest.recoveryId !== id) throw new Error('Recovery manifest identity mismatch.')
      return manifest
    } catch (error) {
      if (missing(error)) return null
      throw error
    }
  }

  private enqueue<T>(id: string, task: () => Promise<T>): Promise<T> {
    const previous = this.pending.get(id) ?? Promise.resolve()
    const operation = previous.then(task)
    const settled = operation.then(() => undefined, () => undefined)
    this.pending.set(id, settled)
    void settled.then(() => { if (this.pending.get(id) === settled) this.pending.delete(id) })
    return operation
  }

  writeSnapshot(input: RecoverySnapshotRequest): Promise<RecoveryManifest> {
    if (input === null || typeof input !== 'object' || !validRecoveryId(input.recoveryId) || !validRecoveryId(input.sessionEpoch)) {
      return Promise.reject(new Error('Invalid recovery identity.'))
    }
    return this.enqueue(input.recoveryId, async () => {
      await this.ready()
      const previous = await this.existing(input.recoveryId)
      if (!validRevision(input.snapshotRevision) || !validRevision(input.observedSavedRevision) ||
          input.observedSavedRevision > input.snapshotRevision ||
          !validRecoveryId(input.sessionEpoch) || typeof input.text !== 'string' ||
          Buffer.byteLength(input.text, 'utf8') > 512 * 1024 * 1024 ||
          (input.sourcePath !== null && (typeof input.sourcePath !== 'string' || !isAbsolute(input.sourcePath))) ||
          typeof input.displayName !== 'string' || input.displayName.length > 200 ||
          (input.sourceSchemaVersion !== 1 && input.sourceSchemaVersion !== 2 && input.sourceSchemaVersion !== 3 && input.sourceSchemaVersion !== 4 && input.sourceSchemaVersion !== 5 && input.sourceSchemaVersion !== 6 && input.sourceSchemaVersion !== 7) ||
          (input.baselineSourceSha256 !== null && (typeof input.baselineSourceSha256 !== 'string' ||
            !hashPattern.test(input.baselineSourceSha256))) ||
          (previous?.sessionEpoch === input.sessionEpoch && previous.snapshotRevision > input.snapshotRevision)) {
        throw new Error('Invalid recovery revision.')
      }
      const payload = loadLedMapProject(input.text)
      if (!payload.project) throw new Error('Invalid recovery payload.')
      const payloadFile = `${input.recoveryId}-${randomUUID()}.json`
      const payloadPath = this.payloadPath(payloadFile)
      const bytes = Buffer.from(input.text, 'utf8')
      await this.writer.write(payloadPath, input.text)
      const stored = await readRegularFile(payloadPath, 512 * 1024 * 1024)
      if (sha256(stored) !== sha256(bytes)) throw new Error('Recovery payload hash mismatch.')
      loadLedMapProject(stored.toString('utf8'))
      const now = new Date().toISOString()
      const manifest = parseRecoveryManifest(JSON.stringify({
        format: 'ledmap-recovery', manifestVersion: 1, recoveryId: input.recoveryId,
        sessionEpoch: input.sessionEpoch, payloadFile, sourcePath: input.sourcePath,
        displayName: input.displayName, createdAt: previous?.createdAt ?? now, updatedAt: now,
        snapshotRevision: input.snapshotRevision, observedSavedRevision: input.observedSavedRevision,
        sourceSchemaVersion: input.sourceSchemaVersion, payloadSha256: sha256(bytes),
        baselineSourceSha256: input.baselineSourceSha256,
      }))
      await this.writer.write(this.manifestPath(input.recoveryId), JSON.stringify(manifest))
      if (previous && previous.payloadFile !== payloadFile) {
        await unlink(this.payloadPath(previous.payloadFile)).catch(() => undefined)
      }
      return manifest
    })
  }

  reconcileSave(input: RecoverySaveCommit): Promise<void> {
    if (input === null || typeof input !== 'object' || !validRecoveryId(input.recoveryId) || !validRecoveryId(input.sessionEpoch) ||
        !validRevision(input.savedRevision) || !validRevision(input.currentRevision) ||
        input.currentRevision < input.savedRevision || typeof input.sourcePath !== 'string' ||
        !isAbsolute(input.sourcePath) || typeof input.baselineSourceSha256 !== 'string' ||
        !hashPattern.test(input.baselineSourceSha256) ||
        (input.sourceSchemaVersion !== undefined && input.sourceSchemaVersion !== 5 && input.sourceSchemaVersion !== 6 && input.sourceSchemaVersion !== 7)) {
      return Promise.reject(new Error('Invalid recovery Save commit.'))
    }
    return this.enqueue(input.recoveryId, async () => {
      const previous = await this.existing(input.recoveryId)
      if (!previous) return
      if (input.currentRevision === input.savedRevision ||
          (previous.sessionEpoch === input.sessionEpoch && previous.snapshotRevision <= input.savedRevision)) {
        await unlink(this.manifestPath(input.recoveryId))
        await unlink(this.payloadPath(previous.payloadFile)).catch(() => undefined)
        return
      }
      const updated = parseRecoveryManifest(JSON.stringify({ ...previous, sourcePath: input.sourcePath,
        sourceSchemaVersion: input.sourceSchemaVersion ?? 5, observedSavedRevision: previous.sessionEpoch === input.sessionEpoch
          ? input.savedRevision : previous.observedSavedRevision,
        baselineSourceSha256: input.baselineSourceSha256, updatedAt: new Date().toISOString() }))
      await this.writer.write(this.manifestPath(input.recoveryId), JSON.stringify(updated))
    })
  }

  discard(id: string): Promise<void> {
    if (!validRecoveryId(id)) return Promise.reject(new Error('Invalid recovery identity.'))
    return this.enqueue(id, async () => {
      const previous = await this.existing(id)
      if (!previous) return
      await unlink(this.manifestPath(id))
      await unlink(this.payloadPath(previous.payloadFile)).catch(() => undefined)
    })
  }

  async candidates(): Promise<RecoveryCandidate[]> {
    let names: string[]
    try { names = await readdir(this.manifests()) } catch (error) {
      if (missing(error)) return []
      throw error
    }
    const found: RecoveryCandidate[] = []
    for (const name of names) {
      if (!name.endsWith('.json') || !validRecoveryId(name.slice(0, -5))) continue
      try {
        const manifest = parseRecoveryManifest((await readRegularFile(join(this.manifests(), name), 16_384)).toString('utf8'))
        if (`${manifest.recoveryId}.json` !== name) continue
        const payloadPath = this.payloadPath(manifest.payloadFile)
        const bytes = await readRegularFile(payloadPath, 512 * 1024 * 1024)
        if (sha256(bytes) !== manifest.payloadSha256) continue
        loadLedMapProject(bytes.toString('utf8'))
        let classification: RecoveryCandidate['classification'] = 'UNSAVED'
        if (manifest.sourcePath) {
          try {
            const currentHash = await hashFile(manifest.sourcePath)
            if (currentHash === manifest.payloadSha256) classification = 'REDUNDANT'
            else if (currentHash !== manifest.baselineSourceSha256) classification = 'CONFLICT'
          } catch { classification = 'CONFLICT' }
        }
        if (manifest.snapshotRevision <= manifest.observedSavedRevision) classification = 'REDUNDANT'
        found.push({ manifest, classification, text: bytes.toString('utf8') })
      } catch { continue }
    }
    return found.sort((a, b) => b.manifest.updatedAt.localeCompare(a.manifest.updatedAt) ||
      a.manifest.recoveryId.localeCompare(b.manifest.recoveryId))
  }
}
