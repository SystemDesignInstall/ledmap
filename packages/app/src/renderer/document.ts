import {
  createEditableProject, loadEditableProject, serializeEditableProject,
  type EditableProject, type JsonObject,
} from '@ledmap/core'

export interface EditorDocumentState {
  readonly project: EditableProject
  readonly extensions: JsonObject
  readonly currentFilePath: string | null
  readonly dirty: boolean
  readonly sourceSchemaVersion: 1 | 2
}

export function createEditorDocument(): EditorDocumentState {
  return {
    project: createEditableProject(),
    extensions: {},
    currentFilePath: null,
    dirty: false,
    sourceSchemaVersion: 2,
  }
}

export function mutateEditorDocument(state: EditorDocumentState, project: EditableProject): EditorDocumentState {
  return { ...state, project, dirty: true }
}

export function loadEditorDocument(text: string, currentFilePath: string): EditorDocumentState {
  const loaded = loadEditableProject(text)
  return {
    project: loaded.project,
    extensions: loaded.extensions,
    currentFilePath,
    dirty: false,
    sourceSchemaVersion: loaded.sourceSchemaVersion,
  }
}

export function serializeEditorDocument(state: EditorDocumentState): string {
  return serializeEditableProject({ project: state.project, extensions: state.extensions })
}

export function savedEditorDocument(state: EditorDocumentState, currentFilePath: string): EditorDocumentState {
  return { ...state, currentFilePath, dirty: false, sourceSchemaVersion: 2 }
}
