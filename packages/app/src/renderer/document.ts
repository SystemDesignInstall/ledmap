import type { OpenProjectResult, SaveProjectRequest, SaveProjectResult } from '../shared/ipc.js'
import type { LedMapProjectV2 } from '@ledmap/core'
import {
  commitProjectV2,
  createProjectSession,
  loadProjectSession,
  markProjectSessionSaved,
  serializeProjectSession,
  type ProjectSession,
} from './project-session.js'

export type OpenSessionResult = 'opened' | 'canceled' | 'stale'

export class ProjectDocumentController {
  private current: ProjectSession
  private saveQueue: Promise<void> = Promise.resolve()
  private pendingSaves = 0

  constructor(private readonly nextDocumentId: () => string) {
    this.current = createProjectSession(nextDocumentId())
  }

  get session(): ProjectSession {
    return this.current
  }

  transactV2(command: (project: LedMapProjectV2) => LedMapProjectV2): void {
    this.current = commitProjectV2(this.current, command)
  }

  replace(next: ProjectSession): void {
    this.current = next
  }

  async settleSaves(): Promise<void> {
    await this.saveQueue
  }

  save(saveAs: boolean, write: (request: SaveProjectRequest) => Promise<SaveProjectResult>): Promise<boolean> {
    const requestedDocumentId = this.current.documentId
    const run = async () => {
      if (this.current.documentId !== requestedDocumentId) return false
      const snapshot = this.current
      const text = serializeProjectSession(snapshot)
      const result = await write({ currentFilePath: snapshot.currentFilePath, text, saveAs })
      if (result.canceled || !result.filePath || this.current.documentId !== snapshot.documentId) return false
      this.current = markProjectSessionSaved(this.current, snapshot.documentId, snapshot.revision, result.filePath)
      return true
    }
    const operation = this.pendingSaves === 0 ? run() : this.saveQueue.then(run)
    this.pendingSaves += 1
    this.saveQueue = operation.then(() => undefined, () => undefined).then(() => { this.pendingSaves -= 1 })
    return operation
  }

  async open(read: () => Promise<OpenProjectResult>): Promise<OpenSessionResult> {
    const started = this.current
    const opened = await read()
    if (this.current !== started) return 'stale'
    if (opened.canceled || !opened.filePath || opened.text === undefined) return 'canceled'
    const candidate = loadProjectSession(opened.text, opened.filePath, this.nextDocumentId())
    if (this.current !== started) return 'stale'
    this.current = candidate
    return 'opened'
  }
}
