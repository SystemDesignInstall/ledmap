import type { TestFrame } from './test-engine.js'
import type { GenericMappingExportInput, V2GenericMappingFormat, V2GenericMappingScope } from './v2-export-engine.js'

export const ipcChannels = {
  openProject: 'project:open',
  saveProject: 'project:save',
  confirmUnsaved: 'project:confirm-unsaved',
  confirmLegacyUpgrade: 'project:confirm-legacy-upgrade',
  setDocumentState: 'project:set-document-state',
  requestSaveBeforeClose: 'project:request-save-before-close',
  finishCloseAfterSave: 'project:finish-close-after-save',
  writeRecovery: 'recovery:write',
  reconcileRecovery: 'recovery:reconcile-save',
  discardRecovery: 'recovery:discard',
  reviewRecovery: 'recovery:review-startup',
  requestDiscardBeforeClose: 'recovery:request-discard-before-close',
  finishCloseAfterDiscard: 'recovery:finish-close-after-discard',
  requestSettleBeforeClose: 'recovery:request-settle-before-close',
  finishCloseAfterSettle: 'recovery:finish-close-after-settle',
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
export type LegacyUpgradeChoice = 'upgrade' | 'save-as' | 'cancel'

export interface OpenProjectResult {
  readonly canceled: boolean
  readonly filePath?: string
  readonly text?: string
  readonly sha256?: string
}

export interface SaveProjectRequest {
  readonly currentFilePath: string | null
  readonly text: string
  readonly saveAs: boolean
  readonly preserveOriginal?: boolean
}

export interface SaveProjectResult {
  readonly canceled: boolean
  readonly filePath?: string
  readonly sha256?: string
}

export interface RecoverySnapshotRequest {
  readonly recoveryId: string
  readonly sessionEpoch: string
  readonly text: string
  readonly sourcePath: string | null
  readonly displayName: string
  readonly snapshotRevision: number
  readonly observedSavedRevision: number
  readonly sourceSchemaVersion: 1 | 2 | 3
  readonly baselineSourceSha256: string | null
}

export interface RecoverySaveCommit {
  readonly recoveryId: string
  readonly sessionEpoch: string
  readonly savedRevision: number
  readonly currentRevision: number
  readonly sourcePath: string
  readonly baselineSourceSha256: string
}

export interface RecoverySelection {
  readonly recoveryId: string
  readonly text: string
  readonly classification: 'UNSAVED' | 'CONFLICT'
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
  confirmLegacyUpgrade(): Promise<LegacyUpgradeChoice>
  setDocumentState(state: DesktopDocumentState): void
  finishCloseAfterSave(saved: boolean): void
  onRequestSaveBeforeClose(callback: () => void): () => void
  writeRecovery(request: RecoverySnapshotRequest): Promise<void>
  reconcileRecovery(request: RecoverySaveCommit): Promise<void>
  discardRecovery(recoveryId: string): Promise<void>
  reviewRecovery(): Promise<RecoverySelection | null>
  onRequestDiscardBeforeClose(callback: () => void): () => void
  finishCloseAfterDiscard(discarded: boolean): void
  onRequestSettleBeforeClose(callback: () => void): () => void
  finishCloseAfterSettle(settled: boolean): void
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
