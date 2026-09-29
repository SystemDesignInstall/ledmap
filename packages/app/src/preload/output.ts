import { contextBridge, ipcRenderer } from 'electron'
import type { LedmapOutputApi, LiveOutputFrameUpdate } from '../shared/ipc.js'

const outputFrameChannel = 'live-output:frame'

const api: LedmapOutputApi = {
  onFrame: callback => {
    const listener = (_event: Electron.IpcRendererEvent, update: LiveOutputFrameUpdate): void => callback(update)
    ipcRenderer.on(outputFrameChannel, listener)
    return () => ipcRenderer.removeListener(outputFrameChannel, listener)
  },
}

contextBridge.exposeInMainWorld('ledmapOutput', api)
