import { afterEach, describe, expect, it } from 'vitest'
import { mkdtemp, lstat, open, readFile, readdir, rename, rm, symlink, unlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { StagedProjectWriter, stagedWriteProject, type StagedWriteOps } from '../src/main/staged-project-write.js'

const directories: string[] = []
const realOps: StagedWriteOps = { open, lstat, rename, unlink }

async function projectPath(name = 'project.ledmap'): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), 'ledmap-staged-save-'))
  directories.push(directory)
  return join(directory, name)
}

async function tempNames(path: string): Promise<string[]> {
  return (await readdir(join(path, '..'))).filter(name => name.endsWith('.tmp'))
}

function faultAt(phase: 'open' | 'write' | 'sync' | 'close' | 'rename' | 'cleanup'): StagedWriteOps {
  let closeFailed = false
  return {
    ...realOps,
    open: async (path, flags) => {
      if (phase === 'open') throw new Error('injected open failure')
      const handle = await open(path, flags)
      return {
        writeFile: async bytes => {
          if (phase === 'write') {
            await handle.writeFile(bytes.subarray(0, 2))
            throw new Error('injected write failure')
          }
          await handle.writeFile(bytes)
        },
        stat: () => handle.stat(),
        sync: async () => {
          if (phase === 'sync') throw new Error('injected sync failure')
          await handle.sync()
        },
        close: async () => {
          await handle.close()
          if (phase === 'close' && !closeFailed) {
            closeFailed = true
            throw new Error('injected close failure')
          }
        },
      }
    },
    rename: async (source, destination) => {
      if (phase === 'rename') throw new Error('injected rename failure')
      await rename(source, destination)
    },
    unlink: async path => {
      if (phase === 'cleanup') throw new Error('injected cleanup failure')
      await unlink(path)
    },
  }
}

function deferred(): { promise: Promise<void>; resolve: () => void } {
  let resolve!: () => void
  const promise = new Promise<void>(fulfill => { resolve = fulfill })
  return { promise, resolve }
}

afterEach(async () => {
  await Promise.all(directories.splice(0).map(directory => rm(directory, { recursive: true, force: true })))
})

describe('staged project file writer', () => {
  it('commits a complete new UTF-8 file without leaving a temp', async () => {
    const path = await projectPath()
    const text = '{"name":"Экран"}\n'
    await stagedWriteProject(path, text)
    expect(await readFile(path)).toEqual(Buffer.from(text, 'utf8'))
    expect(await tempNames(path)).toEqual([])
  })

  it('replaces an existing file and supports a separate Save As destination', async () => {
    const original = await projectPath('original.ledmap')
    const saveAs = join(original, '..', 'copy.ledmap')
    await writeFile(original, 'old')
    await stagedWriteProject(original, 'new')
    await stagedWriteProject(saveAs, 'copy')
    expect(await readFile(original, 'utf8')).toBe('new')
    expect(await readFile(saveAs, 'utf8')).toBe('copy')
    expect(await tempNames(original)).toEqual([])
  })

  it.each(['open', 'write', 'sync', 'close', 'rename'] as const)(
    '%s failure preserves the existing bytes and cleans the owned temp', async phase => {
      const path = await projectPath()
      const legacy = Buffer.from('legacy\r\nexact bytes\0', 'utf8')
      await writeFile(path, legacy)
      await expect(stagedWriteProject(path, 'new v3', faultAt(phase))).rejects.toThrow(`injected ${phase} failure`)
      expect(await readFile(path)).toEqual(legacy)
      expect(await tempNames(path)).toEqual([])
    },
  )

  it('does not leave a new .ledmap when a pre-replacement write fails', async () => {
    const path = await projectPath()
    await expect(stagedWriteProject(path, 'partial', faultAt('write'))).rejects.toThrow('injected write failure')
    await expect(lstat(path)).rejects.toMatchObject({ code: 'ENOENT' })
    expect(await tempNames(path)).toEqual([])
  })

  it('rejects a temp length mismatch before replacement', async () => {
    const path = await projectPath()
    await writeFile(path, 'old')
    const ops: StagedWriteOps = {
      ...realOps,
      open: async (temp, flags) => {
        const handle = await open(temp, flags)
        return { writeFile: bytes => handle.writeFile(bytes), stat: async () => ({ size: 0 }),
          sync: () => handle.sync(), close: () => handle.close() }
      },
    }
    await expect(stagedWriteProject(path, 'new', ops)).rejects.toThrow('unexpected length')
    expect(await readFile(path, 'utf8')).toBe('old')
    expect(await tempNames(path)).toEqual([])
  })

  it('keeps the primary error and leaves the temp for diagnosis if cleanup fails', async () => {
    const path = await projectPath()
    await writeFile(path, 'old')
    const ops = { ...faultAt('cleanup'), rename: async () => { throw new Error('injected rename failure') } }
    await expect(stagedWriteProject(path, 'new', ops)).rejects.toMatchObject({
      message: 'injected rename failure',
      errors: [expect.objectContaining({ message: 'injected rename failure' }),
        expect.objectContaining({ message: 'injected cleanup failure' })],
    })
    expect(await readFile(path, 'utf8')).toBe('old')
    expect(await tempNames(path)).toHaveLength(1)
  })

  it('rejects a symbolic-link destination without changing its target', async () => {
    const path = await projectPath()
    const target = join(path, '..', 'target.ledmap')
    await writeFile(target, 'target bytes')
    await symlink(target, path, 'file')
    await expect(stagedWriteProject(path, 'replacement')).rejects.toThrow('symbolic link')
    expect((await lstat(path)).isSymbolicLink()).toBe(true)
    expect(await readFile(target, 'utf8')).toBe('target bytes')
  })

  it('detects a new destination created before the final replacement check', async () => {
    const path = await projectPath()
    let destinationChecks = 0
    const ops: StagedWriteOps = {
      ...realOps,
      lstat: async candidate => {
        if (candidate === path && ++destinationChecks === 2) await writeFile(path, 'external bytes')
        return lstat(candidate)
      },
    }
    await expect(stagedWriteProject(path, 'our bytes', ops)).rejects.toThrow('changed while Save')
    expect(await readFile(path, 'utf8')).toBe('external bytes')
    expect(await tempNames(path)).toEqual([])
  })

  it('documents that Node rename can replace an externally created destination after the final check', async () => {
    const path = await projectPath()
    const ops: StagedWriteOps = {
      ...realOps,
      rename: async (source, destination) => {
        await writeFile(destination, 'external bytes')
        await rename(source, destination)
      },
    }
    await stagedWriteProject(path, 'our bytes', ops)
    expect(await readFile(path, 'utf8')).toBe('our bytes')
  })

  it('serializes two writes to one destination and keeps the later payload', async () => {
    const path = await projectPath()
    const entered = deferred()
    const release = deferred()
    let renames = 0
    const ops: StagedWriteOps = {
      ...realOps,
      rename: async (source, destination) => {
        renames += 1
        if (renames === 1) {
          entered.resolve()
          await release.promise
        }
        await rename(source, destination)
      },
    }
    const writer = new StagedProjectWriter(ops)
    const first = writer.write(path, 'first')
    await entered.promise
    const second = writer.write(path, 'second')
    await Promise.resolve()
    expect(renames).toBe(1)
    release.resolve()
    await Promise.all([first, second])
    expect(renames).toBe(2)
    expect(await readFile(path, 'utf8')).toBe('second')
  })

  it('continues the destination queue after a rejected write', async () => {
    const path = await projectPath()
    let renames = 0
    const ops: StagedWriteOps = {
      ...realOps,
      rename: async (source, destination) => {
        if (++renames === 1) throw new Error('first write failed')
        await rename(source, destination)
      },
    }
    const writer = new StagedProjectWriter(ops)
    const first = writer.write(path, 'first')
    const second = writer.write(path, 'second')
    await expect(first).rejects.toThrow('first write failed')
    await expect(second).resolves.toBeUndefined()
    expect(await readFile(path, 'utf8')).toBe('second')
    expect(await tempNames(path)).toEqual([])
  })

  it('does not block an independent destination behind another file', async () => {
    const firstPath = await projectPath('first.ledmap')
    const secondPath = join(firstPath, '..', 'second.ledmap')
    const entered = deferred()
    const release = deferred()
    const ops: StagedWriteOps = {
      ...realOps,
      rename: async (source, destination) => {
        if (destination === firstPath) {
          entered.resolve()
          await release.promise
        }
        await rename(source, destination)
      },
    }
    const writer = new StagedProjectWriter(ops)
    const first = writer.write(firstPath, 'first')
    await entered.promise
    await writer.write(secondPath, 'second')
    expect(await readFile(secondPath, 'utf8')).toBe('second')
    release.resolve()
    await first
  })
})
