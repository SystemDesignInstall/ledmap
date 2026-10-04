import { randomUUID } from 'node:crypto'
import { lstat, open, rename, unlink } from 'node:fs/promises'
import { basename, dirname, resolve } from 'node:path'

interface StagedFileHandle {
  writeFile(data: Uint8Array): Promise<void>
  stat(): Promise<{ size: number }>
  sync(): Promise<void>
  close(): Promise<void>
}

export interface StagedWriteOps {
  open(path: string, flags: 'wx'): Promise<StagedFileHandle>
  lstat(path: string): Promise<{ isSymbolicLink(): boolean; isFile(): boolean }>
  rename(source: string, destination: string): Promise<void>
  unlink(path: string): Promise<void>
}

const nodeWriteOps: StagedWriteOps = { open, lstat, rename, unlink }

function isMissing(error: unknown): boolean {
  return error !== null && typeof error === 'object' && 'code' in error && error.code === 'ENOENT'
}

async function destinationState(path: string, ops: StagedWriteOps): Promise<'missing' | 'file'> {
  let state: Awaited<ReturnType<StagedWriteOps['lstat']>>
  try {
    state = await ops.lstat(path)
  } catch (error) {
    if (isMissing(error)) return 'missing'
    throw error
  }
  if (state.isSymbolicLink()) throw new Error('Cannot save a project through a symbolic link.')
  if (!state.isFile()) throw new Error('Project destination is not a regular file.')
  return 'file'
}

async function removeOwnTemp(path: string, ops: StagedWriteOps): Promise<void> {
  try {
    await ops.lstat(path)
  } catch (error) {
    if (isMissing(error)) return
    throw error
  }
  await ops.unlink(path)
}

export async function stagedWriteProject(path: string, text: string, ops: StagedWriteOps = nodeWriteOps): Promise<void> {
  const destination = resolve(path)
  const initialState = await destinationState(destination, ops)
  const temp = resolve(dirname(destination), `.${basename(destination)}.${randomUUID()}.tmp`)
  const bytes = Buffer.from(text, 'utf8')
  let handle: StagedFileHandle | undefined
  let ownsTemp = false

  try {
    handle = await ops.open(temp, 'wx')
    ownsTemp = true
    await handle.writeFile(bytes)
    const stats = await handle.stat()
    if (stats.size !== bytes.byteLength) throw new Error('Temporary project file has an unexpected length.')
    await handle.sync()
    await handle.close()
    handle = undefined

    const currentState = await destinationState(destination, ops)
    if (currentState !== initialState) throw new Error('Project destination changed while Save was in progress.')
    await ops.rename(temp, destination)
  } catch (error) {
    const secondary: unknown[] = []
    if (handle) {
      try { await handle.close() } catch (closeError) { secondary.push(closeError) }
    }
    if (ownsTemp) {
      try { await removeOwnTemp(temp, ops) } catch (cleanupError) { secondary.push(cleanupError) }
    }
    if (secondary.length > 0) {
      const message = error instanceof Error ? error.message : 'Unable to save the project.'
      throw new AggregateError([error, ...secondary], message)
    }
    throw error
  }
}

export class StagedProjectWriter {
  private readonly pending = new Map<string, Promise<void>>()

  constructor(private readonly ops: StagedWriteOps = nodeWriteOps) {}

  write(path: string, text: string): Promise<void> {
    const destination = resolve(path)
    const key = process.platform === 'win32' ? destination.toLowerCase() : destination
    const previous = this.pending.get(key) ?? Promise.resolve()
    const operation = previous.then(() => stagedWriteProject(destination, text, this.ops))
    const settled = operation.then(() => undefined, () => undefined)
    this.pending.set(key, settled)
    void settled.then(() => {
      if (this.pending.get(key) === settled) this.pending.delete(key)
    })
    return operation
  }
}
