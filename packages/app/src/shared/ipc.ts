export const ipcChannels = {
  openProject: 'project:open',
  saveProject: 'project:save',
  confirmUnsaved: 'project:confirm-unsaved',
  setDocumentState: 'project:set-document-state',
  requestSaveBeforeClose: 'project:request-save-before-close',
  finishCloseAfterSave: 'project:finish-close-after-save',
} as const

export type UnsavedChoice = 'save' | 'discard' | 'cancel'

export interface OpenProjectResult {
  readonly canceled: boolean
  readonly filePath?: string
  readonly text?: string
}

export interface SaveProjectRequest {
  readonly currentFilePath: string | null
  readonly text: string
  readonly saveAs: boolean
}

export interface SaveProjectResult {
  readonly canceled: boolean
  readonly filePath?: string
}

export interface DesktopDocumentState {
  readonly currentFilePath: string | null
  readonly dirty: boolean
}

export interface LedmapDesktopApi {
  openProject(): Promise<OpenProjectResult>
  saveProject(request: SaveProjectRequest): Promise<SaveProjectResult>
  confirmUnsavedChanges(): Promise<UnsavedChoice>
  setDocumentState(state: DesktopDocumentState): void
  finishCloseAfterSave(saved: boolean): void
  onRequestSaveBeforeClose(callback: () => void): () => void
}
