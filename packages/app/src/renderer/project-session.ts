import {
  convertEditableProjectToV2,
  createEmptyProjectV2,
  createProjectV2,
  loadEditableProject,
  projectV2AsEditableReadModel,
  serializeEditableProject,
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
  readonly documentId: string
  readonly currentFilePath: string | null
  readonly sourceSchemaVersion: 1 | 2 | 3
  readonly extensions: JsonObject
}

export function sessionDirty(session: ProjectSession): boolean {
  return session.revision !== session.savedRevision
}

export function createProjectSession(documentId: string): ProjectSession {
  return Object.freeze({
    project: createEmptyProjectV2(),
    revision: 0,
    savedRevision: 0,
    documentId,
    currentFilePath: null,
    sourceSchemaVersion: 2,
    extensions: Object.freeze({}),
  })
}

export function loadProjectSession(text: string, currentFilePath: string, documentId: string): ProjectSession {
  const loaded = loadEditableProject(text)
  const project = convertEditableProjectToV2(loaded.project)
  projectV2WorkspaceReadModel(project)
  return Object.freeze({
    project,
    revision: 0,
    savedRevision: 0,
    documentId,
    currentFilePath,
    sourceSchemaVersion: loaded.sourceSchemaVersion,
    extensions: loaded.extensions,
  })
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
  return Object.freeze({ ...session, project: candidate, revision: session.revision + 1 })
}

export function serializeProjectSession(session: ProjectSession): string {
  const editable = projectV2AsEditableReadModel(session.project)
  if (!sameDocumentValue(convertEditableProjectToV2(editable), session.project)) {
    throw new DomainError('PROJECT_COMPAT_SAVE_LOSSY', 'Project Model v2 contains data that schemaVersion 2 cannot preserve')
  }
  return serializeEditableProject({ project: editable, extensions: session.extensions })
}

export function markProjectSessionSaved(
  session: ProjectSession,
  documentId: string,
  savedRevision: number,
  currentFilePath: string,
): ProjectSession {
  if (session.documentId !== documentId) return session
  if (savedRevision > session.revision) throw new DomainError('PROJECT_REVISION_INVALID', 'Saved revision exceeds current revision')
  return Object.freeze({ ...session, savedRevision, currentFilePath, sourceSchemaVersion: 2 })
}
