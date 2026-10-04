import { contextBridge, ipcRenderer } from 'electron'
import {
  ipcChannels,
  type DesktopDocumentState,
  type LedmapDesktopApi,
  type SaveProjectRequest,
  type RecoverySnapshotRequest,
  type RecoverySaveCommit,
  type SimulateDisplayChangeRequest,
  type StartLiveOutputRequest,
  type UpdateLiveOutputRequest,
  type WriteExportFilesRequest,
  type WriteGenericMappingRequest,
} from '../shared/ipc.js'

const api: LedmapDesktopApi = {
  openProject: () => ipcRenderer.invoke(ipcChannels.openProject),
  saveProject: (request: SaveProjectRequest) => ipcRenderer.invoke(ipcChannels.saveProject, request),
  confirmUnsavedChanges: () => ipcRenderer.invoke(ipcChannels.confirmUnsaved),
  confirmLegacyUpgrade: () => ipcRenderer.invoke(ipcChannels.confirmLegacyUpgrade),
  setDocumentState: (state: DesktopDocumentState) => ipcRenderer.send(ipcChannels.setDocumentState, state),
  finishCloseAfterSave: (saved: boolean) => ipcRenderer.send(ipcChannels.finishCloseAfterSave, saved),
  onRequestSaveBeforeClose: callback => {
    const listener = (): void => callback()
    ipcRenderer.on(ipcChannels.requestSaveBeforeClose, listener)
    return () => ipcRenderer.removeListener(ipcChannels.requestSaveBeforeClose, listener)
  },
  writeRecovery: (request: RecoverySnapshotRequest) => ipcRenderer.invoke(ipcChannels.writeRecovery, request),
  reconcileRecovery: (request: RecoverySaveCommit) => ipcRenderer.invoke(ipcChannels.reconcileRecovery, request),
  discardRecovery: (recoveryId: string) => ipcRenderer.invoke(ipcChannels.discardRecovery, recoveryId),
  reviewRecovery: () => ipcRenderer.invoke(ipcChannels.reviewRecovery),
  onRequestDiscardBeforeClose: callback => {
    const listener = (): void => callback()
    ipcRenderer.on(ipcChannels.requestDiscardBeforeClose, listener)
    return () => ipcRenderer.removeListener(ipcChannels.requestDiscardBeforeClose, listener)
  },
  finishCloseAfterDiscard: (discarded: boolean) => ipcRenderer.send(ipcChannels.finishCloseAfterDiscard, discarded),
  onRequestSettleBeforeClose: callback => {
    const listener = (): void => callback()
    ipcRenderer.on(ipcChannels.requestSettleBeforeClose, listener)
    return () => ipcRenderer.removeListener(ipcChannels.requestSettleBeforeClose, listener)
  },
  finishCloseAfterSettle: (settled: boolean) => ipcRenderer.send(ipcChannels.finishCloseAfterSettle, settled),
  listDisplays: () => ipcRenderer.invoke(ipcChannels.listDisplays),
  startLiveOutput: (request: StartLiveOutputRequest) => ipcRenderer.invoke(ipcChannels.startLiveOutput, request),
  updateLiveOutput: (request: UpdateLiveOutputRequest) => ipcRenderer.invoke(ipcChannels.updateLiveOutput, request),
  stopLiveOutput: (outputId: string) => ipcRenderer.invoke(ipcChannels.stopLiveOutput, outputId),
  onDisplaysChanged: callback => {
    const listener = (_event: Electron.IpcRendererEvent, displays: Parameters<typeof callback>[0]): void => callback(displays)
    ipcRenderer.on(ipcChannels.displaysChanged, listener)
    return () => ipcRenderer.removeListener(ipcChannels.displaysChanged, listener)
  },
  onLiveOutputStateChanged: callback => {
    const listener = (_event: Electron.IpcRendererEvent, state: Parameters<typeof callback>[0]): void => callback(state)
    ipcRenderer.on(ipcChannels.liveOutputStateChanged, listener)
    return () => ipcRenderer.removeListener(ipcChannels.liveOutputStateChanged, listener)
  },
  simulateDisplayChange: (request: SimulateDisplayChangeRequest) => ipcRenderer.invoke(ipcChannels.simulateDisplayChange, request),
  writeExportFiles: (request: WriteExportFilesRequest) => ipcRenderer.invoke(ipcChannels.writeExportFiles, request),
  writeGenericMapping: (request: WriteGenericMappingRequest) => ipcRenderer.invoke(ipcChannels.writeGenericMapping, request),
  simulateExportCancel: () => ipcRenderer.invoke(ipcChannels.simulateExportCancel),
}

contextBridge.exposeInMainWorld('ledmapDesktop', api)
