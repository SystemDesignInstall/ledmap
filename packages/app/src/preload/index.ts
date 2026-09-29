import { contextBridge, ipcRenderer } from 'electron'
import { ipcChannels, type DesktopDocumentState, type LedmapDesktopApi, type SaveProjectRequest } from '../shared/ipc.js'

const api: LedmapDesktopApi = {
  openProject: () => ipcRenderer.invoke(ipcChannels.openProject),
  saveProject: (request: SaveProjectRequest) => ipcRenderer.invoke(ipcChannels.saveProject, request),
  confirmUnsavedChanges: () => ipcRenderer.invoke(ipcChannels.confirmUnsaved),
  setDocumentState: (state: DesktopDocumentState) => ipcRenderer.send(ipcChannels.setDocumentState, state),
  finishCloseAfterSave: (saved: boolean) => ipcRenderer.send(ipcChannels.finishCloseAfterSave, saved),
  onRequestSaveBeforeClose: callback => {
    const listener = (): void => callback()
    ipcRenderer.on(ipcChannels.requestSaveBeforeClose, listener)
    return () => ipcRenderer.removeListener(ipcChannels.requestSaveBeforeClose, listener)
  },
}

contextBridge.exposeInMainWorld('ledmapDesktop', api)
