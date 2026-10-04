import {
  createEmptyProjectV2,
  createProjectV2,
  loadLedMapProject,
  serializeProjectV4,
  validateProjectV2Structural,
  DomainError,
  type JsonObject,
  type LedMapProjectV2,
} from '@ledmap/core'
import { projectV2WorkspaceReadModel } from './v2-read-model.js'
import type { Project } from './v2-view-model.js'

export interface ProjectSession<TProject = LedMapProjectV2> {
  readonly project: TProject
  readonly revision: number
  readonly savedRevision: number
  readonly stateId: number
  readonly savedStateId: number | null
  readonly documentId: string
  readonly currentFilePath: string | null
  readonly sourceSchemaVersion: 1 | 2 | 3 | 4
  readonly extensions: JsonObject
}

export function sessionDirty(session: ProjectSession): boolean {
  return session.stateId !== session.savedStateId
}

export function createProjectSession(documentId: string): ProjectSession {
  return Object.freeze({
    project: createEmptyProjectV2(),
    revision: 0,
    savedRevision: 0,
    stateId: 0,
    savedStateId: 0,
    documentId,
    currentFilePath: null,
    sourceSchemaVersion: 4,
    extensions: Object.freeze({}),
  })
}

export function loadProjectSession(text: string, currentFilePath: string, documentId: string): ProjectSession {
  const loaded = loadLedMapProject(text)
  const project = loaded.project
  projectV2WorkspaceReadModel(project)
  return Object.freeze({
    project,
    revision: 0,
    savedRevision: 0,
    stateId: 0,
    savedStateId: 0,
    documentId,
    currentFilePath,
    sourceSchemaVersion: loaded.sourceSchemaVersion,
    extensions: loaded.extensions,
  })
}

export function recoverProjectSession(text: string, documentId: string): ProjectSession {
  const loaded = loadLedMapProject(text)
  projectV2WorkspaceReadModel(loaded.project)
  return Object.freeze({ project: loaded.project, extensions: loaded.extensions, documentId,
    revision: 1, savedRevision: 0, stateId: 1, savedStateId: null,
    currentFilePath: null, sourceSchemaVersion: 4 })
}

export function sessionWorkspaceProject(session: ProjectSession): Project {
  return projectV2WorkspaceReadModel(session.project)
}

export function sameDocumentValue(left: unknown, right: unknown): boolean {
  if (Object.is(left, right)) return true
  if (left === null || right === null || typeof left !== 'object' || typeof right !== 'object') return false
  if (Array.isArray(left) || Array.isArray(right)) {
    if (!Array.isArray(left) || !Array.isArray(right) || left.length !== right.length) return false
    return left.every((value, index) => sameDocumentValue(value, right[index]))
  }
  const leftRecord = left as Record<string, unknown>
  const rightRecord = right as Record<string, unknown>
  const leftKeys = Object.keys(leftRecord).sort()
  const rightKeys = Object.keys(rightRecord).sort()
  return leftKeys.length === rightKeys.length && leftKeys.every((key, index) => (
    key === rightKeys[index] && sameDocumentValue(leftRecord[key], rightRecord[key])
  ))
}

export function commitProjectV2(session: ProjectSession, command: (project: LedMapProjectV2) => LedMapProjectV2): ProjectSession {
  const proposed = command(session.project)
  if (sameDocumentValue(session.project, proposed)) return session
  const candidate = createProjectV2(proposed)
  const diagnostic = validateProjectV2Structural(candidate)[0]
  if (diagnostic) throw new DomainError('PROJECT_V2_INVALID', `${diagnostic.code}: ${diagnostic.message}`)
  projectV2WorkspaceReadModel(candidate)
  if (!Number.isSafeInteger(session.revision + 1)) throw new DomainError('PROJECT_REVISION_OVERFLOW', 'Project revision exceeds the safe integer range')
  return Object.freeze({ ...session, project: candidate, revision: session.revision + 1,
    stateId: session.revision + 1 })
}

export function restoreProjectSessionState(session: ProjectSession, project: LedMapProjectV2, stateId: number): ProjectSession {
  if (!Number.isSafeInteger(session.revision + 1)) throw new DomainError('PROJECT_REVISION_OVERFLOW', 'Project revision exceeds the safe integer range')
  return Object.freeze({ ...session, project, stateId, revision: session.revision + 1 })
}

export function serializeProjectSession(session: ProjectSession): string {
  return serializeProjectV4({ project: session.project, extensions: session.extensions })
}

export function markProjectSessionSaved(
  session: ProjectSession,
  documentId: string,
  savedRevision: number,
  savedStateId: number,
  currentFilePath: string,
): ProjectSession {
  if (session.documentId !== documentId) return session
  if (savedRevision > session.revision) throw new DomainError('PROJECT_REVISION_INVALID', 'Saved revision exceeds current revision')
  if (!Number.isSafeInteger(savedStateId) || savedStateId < 0 || savedStateId > savedRevision) {
    throw new DomainError('PROJECT_STATE_ID_INVALID', 'Saved state identity is invalid')
  }
  return Object.freeze({ ...session, savedRevision, savedStateId, currentFilePath, sourceSchemaVersion: 4 })
}
