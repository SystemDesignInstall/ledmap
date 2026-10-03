import { afterEach, describe, expect, it } from 'vitest'
import { mkdtemp, mkdir, readFile, rm, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createProjectSession, serializeProjectSession } from '../src/renderer/project-session.js'
import { RecoveryStore, parseRecoveryManifest, sha256, type RecoverySnapshotRequest } from '../src/main/recovery-store.js'
import { StagedProjectWriter } from '../src/main/staged-project-write.js'

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
    snapshotRevision: 1, observedSavedRevision: 0, sourceSchemaVersion: 3,
    baselineSourceSha256: null, ...overrides }
}

afterEach(async () => {
  await Promise.all(directories.splice(0).map(directory => rm(directory, { recursive: true, force: true })))
})

describe('RecoveryStore', () => {
  it('commits one verified V3 payload behind a versioned manifest', async () => {
    const { root } = await fixture()
    const store = new RecoveryStore(root)
    const manifest = await store.writeSnapshot(snapshot())
    expect(manifest).toMatchObject({ format: 'ledmap-recovery', manifestVersion: 1, recoveryId: id,
      snapshotRevision: 1, observedSavedRevision: 0, payloadSha256: sha256(Buffer.from(text)) })
    expect(await readFile(join(root, 'payloads', manifest.payloadFile), 'utf8')).toBe(text)
    expect((await store.candidates())[0]).toMatchObject({ classification: 'UNSAVED' })
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

  it('ignores malformed candidates without preventing other recovery discovery', async () => {
    const { root } = await fixture()
    const store = new RecoveryStore(root)
    await store.writeSnapshot(snapshot())
    await mkdir(join(root, 'manifests'), { recursive: true })
    await writeFile(join(root, 'manifests', '33333333-3333-4333-8333-333333333333.json'), '{broken')
    expect(await store.candidates()).toHaveLength(1)
  })
})
