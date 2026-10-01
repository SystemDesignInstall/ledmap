import type { TestFrame } from './test-engine.js'
import type { GenericMappingExportInput, V2GenericMappingFormat, V2GenericMappingScope } from './v2-export-engine.js'

export const ipcChannels = {
  openProject: 'project:open',
  saveProject: 'project:save',
  confirmUnsaved: 'project:confirm-unsaved',
  setDocumentState: 'project:set-document-state',
  requestSaveBeforeClose: 'project:request-save-before-close',
  finishCloseAfterSave: 'project:finish-close-after-save',
  listDisplays: 'live-output:list-displays',
  startLiveOutput: 'live-output:start',
  updateLiveOutput: 'live-output:update',
  stopLiveOutput: 'live-output:stop',
  displaysChanged: 'live-output:displays-changed',
  liveOutputStateChanged: 'live-output:state-changed',
  outputFrame: 'live-output:frame',
  simulateDisplayChange: 'live-output:simulate-display-change',
  writeExportFiles: 'export:write-files',
  writeGenericMapping: 'export:write-generic-mapping',
  simulateExportCancel: 'export:simulate-cancel',
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

export interface DisplayDescriptor {
  readonly id: string
  readonly bounds: { readonly x: number; readonly y: number; readonly width: number; readonly height: number }
  readonly resolution: { readonly width: number; readonly height: number }
  readonly scaleFactor: number
  readonly primary: boolean
}

export interface LiveOutputRegion {
  readonly x: number
  readonly y: number
  readonly width: number
  readonly height: number
}

export type LiveOutputScaleMode = 'actual' | 'fit'

export interface LiveOutputFrameUpdate {
  readonly outputId: string
  readonly displayId: string
  readonly displayScaleFactor: number
  readonly region: LiveOutputRegion
  readonly scaleMode: LiveOutputScaleMode
  readonly revision: number
  readonly frame: TestFrame
}

export interface StartLiveOutputRequest {
  readonly outputId: string
  readonly displayId: string
  readonly region: LiveOutputRegion
  readonly scaleMode: LiveOutputScaleMode
  readonly frame: TestFrame
}

export interface UpdateLiveOutputRequest {
  readonly outputId: string
  readonly region: LiveOutputRegion
  readonly scaleMode: LiveOutputScaleMode
  readonly frame: TestFrame
}

export interface LiveOutputState {
  readonly outputId: string
  readonly displayId: string
  readonly running: boolean
  readonly revision: number
  readonly reason?: string
}

export interface SimulateDisplayChangeRequest {
  readonly action: 'add' | 'remove'
  readonly displayId?: string
}

export interface LedmapOutputApi {
  onFrame(callback: (update: LiveOutputFrameUpdate) => void): () => void
}

export interface ExportFilePayload {
  readonly name: string
  readonly bytes: Uint8Array
}

export interface WriteExportFilesRequest {
  readonly mode: 'single' | 'batch'
  readonly files: readonly ExportFilePayload[]
}

export interface WriteGenericMappingRequest {
  readonly input: GenericMappingExportInput
  readonly scope: V2GenericMappingScope
  readonly format: V2GenericMappingFormat
  readonly name: string
}

export interface ExportWriteResult {
  readonly canceled: boolean
  readonly filePaths: readonly string[]
}

export interface LedmapDesktopApi {
  openProject(): Promise<OpenProjectResult>
  saveProject(request: SaveProjectRequest): Promise<SaveProjectResult>
  confirmUnsavedChanges(): Promise<UnsavedChoice>
  setDocumentState(state: DesktopDocumentState): void
  finishCloseAfterSave(saved: boolean): void
  onRequestSaveBeforeClose(callback: () => void): () => void
  listDisplays(): Promise<readonly DisplayDescriptor[]>
  startLiveOutput(request: StartLiveOutputRequest): Promise<LiveOutputState>
  updateLiveOutput(request: UpdateLiveOutputRequest): Promise<LiveOutputState>
  stopLiveOutput(outputId: string): Promise<LiveOutputState>
  onDisplaysChanged(callback: (displays: readonly DisplayDescriptor[]) => void): () => void
  onLiveOutputStateChanged(callback: (state: LiveOutputState) => void): () => void
  simulateDisplayChange(request: SimulateDisplayChangeRequest): Promise<boolean>
  writeExportFiles(request: WriteExportFilesRequest): Promise<ExportWriteResult>
  writeGenericMapping(request: WriteGenericMappingRequest): Promise<ExportWriteResult>
  simulateExportCancel(): Promise<boolean>
}
