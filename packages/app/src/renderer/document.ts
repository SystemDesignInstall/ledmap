import type { LegacyUpgradeChoice, OpenProjectResult, SaveProjectRequest, SaveProjectResult } from '../shared/ipc.js'
import type { LedMapProjectV2 } from '@ledmap/core'
import {
  commitProjectV2,
  createProjectSession,
  loadProjectSession,
  markProjectSessionSaved,
  restoreProjectSessionState,
  sameDocumentValue,
  serializeProjectSession,
  type ProjectSession,
} from './project-session.js'

export type OpenSessionResult = 'opened' | 'canceled' | 'stale'

interface HistoryEntry {
  readonly project: LedMapProjectV2
  readonly stateId: number
}

const historyLimit = 32

export class ProjectDocumentController {
  private current: ProjectSession
  private saveQueue: Promise<void> = Promise.resolve()
  private pendingSaves = 0
  private readonly undoStack: HistoryEntry[] = []
  private readonly redoStack: HistoryEntry[] = []
  private activeGroup: { readonly id: number; readonly initial: HistoryEntry; changed: boolean } | null = null
  private nextGroupId = 1

  constructor(private readonly nextDocumentId: () => string) {
    this.current = createProjectSession(nextDocumentId())
  }

  get session(): ProjectSession {
    return this.current
  }

  get canUndo(): boolean { return this.undoStack.length > 0 }
  get canRedo(): boolean { return this.redoStack.length > 0 }
  get historyDepth(): number { return this.undoStack.length + this.redoStack.length }

  beginHistoryGroup(): number {
    this.endHistoryGroup()
    const id = this.nextGroupId++
    this.activeGroup = { id, initial: this.entry(), changed: false }
    return id
  }

  endHistoryGroup(id?: number): void {
    const group = this.activeGroup
    if (!group || (id !== undefined && group.id !== id)) return
    if (!group.changed) { this.activeGroup = null; return }
    if (sameDocumentValue(this.current.project, group.initial.project)) {
      const restored = restoreProjectSessionState(this.current, group.initial.project, group.initial.stateId)
      this.activeGroup = null
      this.current = restored
      return
    }
    this.activeGroup = null
    this.redoStack.length = 0
    this.retainUndo(group.initial)
  }

  transactV2(command: (project: LedMapProjectV2) => LedMapProjectV2, groupId?: number): void {
    const previous = this.current
    let next = commitProjectV2(previous, command)
    if (next === previous) return
    if (this.activeGroup && this.activeGroup.id !== groupId) {
      this.endHistoryGroup()
      if (this.current !== previous) next = commitProjectV2(this.current, () => next.project)
    }
    if (this.activeGroup) this.activeGroup.changed = true
    else {
      this.redoStack.length = 0
      this.retainUndo(this.entry())
    }
    this.current = next
  }

  undo(): boolean {
    this.endHistoryGroup()
    const previous = this.undoStack.at(-1)
    if (!previous) return false
    const restored = restoreProjectSessionState(this.current, previous.project, previous.stateId)
    this.undoStack.pop()
    this.redoStack.push(this.entry())
    this.current = restored
    return true
  }

  redo(): boolean {
    this.endHistoryGroup()
    const next = this.redoStack.at(-1)
    if (!next) return false
    const restored = restoreProjectSessionState(this.current, next.project, next.stateId)
    this.redoStack.pop()
    this.undoStack.push(this.entry())
    this.current = restored
    return true
  }

  private entry(): HistoryEntry {
    return Object.freeze({ project: this.current.project, stateId: this.current.stateId })
  }

  private retainUndo(entry: HistoryEntry): void {
    this.undoStack.push(entry)
    while (this.undoStack.length + this.redoStack.length > historyLimit) this.undoStack.shift()
  }

  private resetHistory(): void {
    this.activeGroup = null
    this.undoStack.length = 0
    this.redoStack.length = 0
  }

  replace(next: ProjectSession): void {
    this.current = next
    this.resetHistory()
  }

  async settleSaves(): Promise<void> {
    await this.saveQueue
  }

  save(
    saveAs: boolean,
    write: (request: SaveProjectRequest) => Promise<SaveProjectResult>,
    confirmLegacyUpgrade?: () => Promise<LegacyUpgradeChoice>,
    onSaved?: (snapshot: ProjectSession, current: ProjectSession, result: SaveProjectResult) => Promise<void>,
  ): Promise<boolean> {
    const requestedDocumentId = this.current.documentId
    const run = async () => {
      if (this.current.documentId !== requestedDocumentId) return false
      this.endHistoryGroup()
      const snapshot = this.current
      let effectiveSaveAs = saveAs
      if (!saveAs && snapshot.currentFilePath && snapshot.sourceSchemaVersion < 3) {
        if (!confirmLegacyUpgrade) throw new Error('Legacy project upgrade requires explicit confirmation.')
        const choice = await confirmLegacyUpgrade()
        if (this.current.documentId !== snapshot.documentId || choice === 'cancel') return false
        effectiveSaveAs = choice === 'save-as'
      }
      const text = serializeProjectSession(snapshot)
      const result = await write({ currentFilePath: snapshot.currentFilePath, text, saveAs: effectiveSaveAs,
        ...(effectiveSaveAs && snapshot.sourceSchemaVersion < 3 && snapshot.currentFilePath
          ? { preserveOriginal: true } : {}) })
      if (result.canceled || !result.filePath || this.current.documentId !== snapshot.documentId) return false
      this.current = markProjectSessionSaved(this.current, snapshot.documentId, snapshot.revision,
        snapshot.stateId, result.filePath)
      if (onSaved) await onSaved(snapshot, this.current, result)
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
    this.resetHistory()
    return 'opened'
  }
}
