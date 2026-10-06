import { afterEach, describe, expect, it } from 'vitest'
import { mkdtemp, mkdir, readFile, rm, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createProjectSession, recoverProjectSession, serializeProjectSession } from '../src/renderer/project-session.js'
import { RecoveryStore, parseRecoveryManifest, sha256, type RecoverySnapshotRequest } from '../src/main/recovery-store.js'
import { StagedProjectWriter } from '../src/main/staged-project-write.js'
import { asProcessorId, createEmptyProjectV2, createProjectV2, serializeProjectV3 } from '@ledmap/core'

const directories: string[] = []
const id = '11111111-1111-4111-8111-111111111111'
const epoch = '22222222-2222-4222-8222-222222222222'
const text = serializeProjectSession(createProjectSession('test'))

async function fixture(): Promise<{ root: string; source: string }> {
  const directory = await mkdtemp(join(tmpdir(), 'ledmap-recovery-'))
  directories.push(directory)
  const root = join(directory, 'recovery')
  return { root, source: join(directory, 'source.ledmap') }
}

function snapshot(overrides: Partial<RecoverySnapshotRequest> = {}): RecoverySnapshotRequest {
  return { recoveryId: id, sessionEpoch: epoch, text, sourcePath: null, displayName: 'Untitled',
    snapshotRevision: 1, observedSavedRevision: 0, sourceSchemaVersion: 5,
    baselineSourceSha256: null, ...overrides }
}

afterEach(async () => {
  await Promise.all(directories.splice(0).map(directory => rm(directory, { recursive: true, force: true })))
})

describe('RecoveryStore', () => {
  it('retains v6 profile intent through manifest discovery and recovery', async () => {
    const { root, source } = await fixture()
    const project = createEmptyProjectV2()
    const processorId = asProcessorId('capacity-processor')
    const candidate = createProjectV2({ ...project, hardware: { ...project.hardware,
      processors: [{ id: processorId, name: 'Declared controller', portCount: 1, capacityProfile: {
        name: 'Recovery mode', source: { kind: 'manual', reference: 'Recovery fixture', revision: '1' },
        mode: { frameRateHz: 50, bitDepth: 12, linkRateGbps: 10 }, portPixelCapacity: 1000, processorPixelCapacity: 1000,
      } }], processorOrder: [processorId],
    } })
    const payload = serializeProjectSession({ ...createProjectSession('capacity'), project: candidate })
    const store = new RecoveryStore(root)
    await store.writeSnapshot(snapshot({ text: payload, sourceSchemaVersion: 6 }))
    const recovered = (await store.candidates())[0]!
    expect(recovered.manifest.sourceSchemaVersion).toBe(6)
    expect(recoverProjectSession(recovered.text, 'restored').project).toEqual(candidate)
    const malformed = JSON.parse(payload)
    malformed.project.hardware.processors[0].capacityProfile.mode.bitDepth = 9
    await expect(store.writeSnapshot(snapshot({ text: JSON.stringify(malformed), sourceSchemaVersion: 6, snapshotRevision: 2 }))).rejects.toThrow(/Capacity mode/)
    expect((await store.candidates())[0]!.text).toBe(payload)
    await store.reconcileSave({ recoveryId: id, sessionEpoch: epoch, savedRevision: 0, currentRevision: 1,
      sourcePath: source, baselineSourceSha256: sha256(Buffer.from(payload)), sourceSchemaVersion: 6 })
    expect(parseRecoveryManifest(await readFile(join(root, 'manifests', `${id}.json`), 'utf8')).sourceSchemaVersion).toBe(6)
  })

  it('commits one verified V5 payload behind a versioned manifest', async () => {
    const { root } = await fixture()
    const store = new RecoveryStore(root)
    const manifest = await store.writeSnapshot(snapshot())
    expect(manifest).toMatchObject({ format: 'ledmap-recovery', manifestVersion: 1, recoveryId: id,
      snapshotRevision: 1, observedSavedRevision: 0, payloadSha256: sha256(Buffer.from(text)) })
    expect(await readFile(join(root, 'payloads', manifest.payloadFile), 'utf8')).toBe(text)
    expect((await store.candidates())[0]).toMatchObject({ classification: 'UNSAVED' })
  })

  it('keeps old V3 recovery payloads discoverable and recoverable', async () => {
    const { root } = await fixture()
    const store = new RecoveryStore(root)
    const legacyText = serializeProjectV3({ project: createEmptyProjectV2() })
    await store.writeSnapshot(snapshot({ text: legacyText, sourceSchemaVersion: 3 }))
    const candidate = (await store.candidates())[0]
    expect(candidate?.text).toBe(legacyText)
    expect(candidate?.manifest.sourceSchemaVersion).toBe(3)
    expect(recoverProjectSession(candidate!.text, 'recovered').project).toEqual(createEmptyProjectV2())
  })

  it('keeps the old authoritative manifest and payload when a new manifest write fails', async () => {
    const { root } = await fixture()
    const writer = new StagedProjectWriter()
    const store = new RecoveryStore(root, { write: (path, value) => writer.write(path, value) })
    const old = await store.writeSnapshot(snapshot())
    const failing = new RecoveryStore(root, { write: (path, value) => {
      if (path === join(root, 'manifests', `${id}.json`)) throw new Error('manifest write failed')
      return writer.write(path, value)
    } })
    await expect(failing.writeSnapshot(snapshot({ snapshotRevision: 2 }))).rejects.toThrow('manifest write failed')
    expect(parseRecoveryManifest(await readFile(join(root, 'manifests', `${id}.json`), 'utf8')).payloadFile)
      .toBe(old.payloadFile)
    expect(await readFile(join(root, 'payloads', old.payloadFile), 'utf8')).toBe(text)
    expect((await store.candidates())[0]?.manifest.snapshotRevision).toBe(1)
  })

  it('retains newer recovery after an older Save and reassociates Save As', async () => {
    const { root, source } = await fixture()
    const store = new RecoveryStore(root)
    await store.writeSnapshot(snapshot({ snapshotRevision: 12, observedSavedRevision: 0 }))
    const savedBytes = Buffer.from('saved revision 10')
    await store.reconcileSave({ recoveryId: id, sessionEpoch: epoch, savedRevision: 10,
      currentRevision: 12, sourcePath: source, baselineSourceSha256: sha256(savedBytes) })
    const candidate = (await store.candidates())[0]
    expect(candidate?.manifest).toMatchObject({ snapshotRevision: 12, observedSavedRevision: 10,
      sourcePath: source, baselineSourceSha256: sha256(savedBytes) })
    await store.reconcileSave({ recoveryId: id, sessionEpoch: epoch, savedRevision: 12,
      currentRevision: 12, sourcePath: source, baselineSourceSha256: sha256(Buffer.from(text)) })
    expect(await store.candidates()).toEqual([])
  })

  it('classifies unchanged source, external conflict, and redundant saved bytes without mtime', async () => {
    const { root, source } = await fixture()
    const store = new RecoveryStore(root)
    await writeFile(source, 'baseline')
    await store.writeSnapshot(snapshot({ sourcePath: source, baselineSourceSha256: sha256(Buffer.from('baseline')) }))
    expect((await store.candidates())[0]?.classification).toBe('UNSAVED')
    await writeFile(source, 'external change')
    expect((await store.candidates())[0]?.classification).toBe('CONFLICT')
    await writeFile(source, text)
    expect((await store.candidates())[0]?.classification).toBe('REDUNDANT')
  })

  it('rejects traversal, absolute payload paths, invalid ids, and unknown manifest versions', async () => {
    const { root, source } = await fixture()
    const store = new RecoveryStore(root)
    const valid = await store.writeSnapshot(snapshot())
    const manifestPath = join(root, 'manifests', `${id}.json`)
    await writeFile(source, 'outside bytes')
    for (const payloadFile of ['../source.ledmap', source, '..\\source.ledmap']) {
      await writeFile(manifestPath, JSON.stringify({ ...valid, payloadFile }))
      expect(await store.candidates()).toEqual([])
      await expect(store.discard(id)).rejects.toThrow('Invalid recovery manifest')
      expect(await readFile(source, 'utf8')).toBe('outside bytes')
    }
    await writeFile(manifestPath, JSON.stringify({ ...valid, manifestVersion: 2 }))
    expect(await store.candidates()).toEqual([])
    await expect(store.discard('../outside')).rejects.toThrow('Invalid recovery identity')
  })

  it('does not read a payload symlink outside recovery storage', async () => {
    const { root, source } = await fixture()
    const store = new RecoveryStore(root)
    const valid = await store.writeSnapshot(snapshot())
    await writeFile(source, text)
    await rm(join(root, 'payloads', valid.payloadFile))
    await symlink(source, join(root, 'payloads', valid.payloadFile), 'file')
    expect(await store.candidates()).toEqual([])
    expect(await readFile(source, 'utf8')).toBe(text)
  })

  it('does not read or delete a manifest symlink outside recovery storage', async () => {
    const { root, source } = await fixture()
    const store = new RecoveryStore(root)
    await store.writeSnapshot(snapshot())
    const manifestPath = join(root, 'manifests', `${id}.json`)
    await writeFile(source, await readFile(manifestPath))
    await rm(manifestPath)
    await symlink(source, manifestPath, 'file')
    expect(await store.candidates()).toEqual([])
    await expect(store.discard(id)).rejects.toThrow('Unsafe recovery file')
    expect((await readFile(source, 'utf8')).includes('ledmap-recovery')).toBe(true)
  })

  it('ignores malformed candidates without preventing other recovery discovery', async () => {
    const { root } = await fixture()
    const store = new RecoveryStore(root)
    await store.writeSnapshot(snapshot())
    await mkdir(join(root, 'manifests'), { recursive: true })
    await writeFile(join(root, 'manifests', '33333333-3333-4333-8333-333333333333.json'), '{broken')
    expect(await store.candidates()).toHaveLength(1)
  })

  it('orders multiple candidates deterministically and preserves others after one Discard', async () => {
    const { root } = await fixture()
    const store = new RecoveryStore(root)
    const secondId = '44444444-4444-4444-8444-444444444444'
    await store.writeSnapshot(snapshot())
    await store.writeSnapshot(snapshot({ recoveryId: secondId }))
    const candidates = await store.candidates()
    expect(candidates).toHaveLength(2)
    expect(candidates.map(candidate => candidate.manifest.recoveryId).sort()).toEqual([id, secondId])
    await store.discard(candidates[0]!.manifest.recoveryId)
    expect((await store.candidates()).map(candidate => candidate.manifest.recoveryId))
      .toEqual([candidates[1]!.manifest.recoveryId])
  })
})
