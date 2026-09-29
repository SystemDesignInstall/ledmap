import { app, BrowserWindow, dialog, ipcMain, type WebContents } from 'electron'
import { readFile, writeFile } from 'node:fs/promises'
import { basename, extname } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  ipcChannels,
  type DesktopDocumentState,
  type SaveProjectRequest,
  type SaveProjectResult,
  type UnsavedChoice,
} from '../shared/ipc.js'

interface WindowState {
  currentFilePath: string | null
  dirty: boolean
  allowClose: boolean
  closePromptActive: boolean
}

const windowStates = new Map<number, WindowState>()
const ledmapFilter = [{ name: 'LedMAP Project', extensions: ['ledmap'] }]

function stateFor(contents: WebContents): WindowState | undefined {
  return windowStates.get(contents.id)
}

function updateTitle(window: BrowserWindow, state: DesktopDocumentState): void {
  const name = state.currentFilePath ? basename(state.currentFilePath) : 'Untitled.ledmap'
  window.setTitle(`${name}${state.dirty ? ' *' : ''} — LedMAP`)
}

function normalizeSavePath(filePath: string): string {
  return extname(filePath).toLowerCase() === '.ledmap' ? filePath : `${filePath}.ledmap`
}

async function promptUnsaved(window: BrowserWindow): Promise<UnsavedChoice> {
  const smokeChoice = process.env['LEDMAP_SMOKE_UNSAVED_ACTION']
  if (smokeChoice === 'save' || smokeChoice === 'discard' || smokeChoice === 'cancel') return smokeChoice
  const result = await dialog.showMessageBox(window, {
    type: 'warning',
    title: 'Unsaved changes',
    message: 'Save changes before continuing?',
    detail: 'Your changes will be lost if you do not save them.',
    buttons: ['Save', 'Don’t Save', 'Cancel'],
    defaultId: 0,
    cancelId: 2,
    noLink: true,
  })
  return result.response === 0 ? 'save' : result.response === 1 ? 'discard' : 'cancel'
}

function registerIpc(): void {
  ipcMain.handle(ipcChannels.openProject, async event => {
    const window = BrowserWindow.fromWebContents(event.sender)
    if (!window) throw new Error('Project window is unavailable.')
    const smokePath = process.env['LEDMAP_SMOKE_PROJECT_PATH']
    const filePath = smokePath ?? (await dialog.showOpenDialog(window, {
      title: 'Open LedMAP Project',
      properties: ['openFile'],
      filters: ledmapFilter,
    })).filePaths[0]
    if (!filePath) return { canceled: true }
    return { canceled: false, filePath, text: await readFile(filePath, 'utf8') }
  })

  ipcMain.handle(ipcChannels.saveProject, async (event, value: unknown): Promise<SaveProjectResult> => {
    const window = BrowserWindow.fromWebContents(event.sender)
    if (!window) throw new Error('Project window is unavailable.')
    if (value === null || typeof value !== 'object') throw new Error('Invalid save request.')
    const request = value as Partial<SaveProjectRequest>
    if (typeof request.text !== 'string' || typeof request.saveAs !== 'boolean') throw new Error('Invalid save request.')
    if (request.currentFilePath !== null && typeof request.currentFilePath !== 'string') throw new Error('Invalid project path.')

    let filePath = request.saveAs ? null : request.currentFilePath
    if (!filePath) {
      const smokePath = process.env['LEDMAP_SMOKE_PROJECT_PATH']
      if (smokePath) {
        filePath = smokePath
      } else {
        const result = await dialog.showSaveDialog(window, {
          title: 'Save LedMAP Project',
          defaultPath: request.currentFilePath ?? 'Untitled.ledmap',
          filters: ledmapFilter,
        })
        if (result.canceled || !result.filePath) return { canceled: true }
        filePath = result.filePath
      }
    }
    const normalized = normalizeSavePath(filePath)
    await writeFile(normalized, request.text, 'utf8')
    return { canceled: false, filePath: normalized }
  })

  ipcMain.handle(ipcChannels.confirmUnsaved, async event => {
    const window = BrowserWindow.fromWebContents(event.sender)
    if (!window) return 'cancel'
    return promptUnsaved(window)
  })

  ipcMain.on(ipcChannels.setDocumentState, (event, value: unknown) => {
    const window = BrowserWindow.fromWebContents(event.sender)
    const state = stateFor(event.sender)
    if (!window || !state || value === null || typeof value !== 'object') return
    const next = value as Partial<DesktopDocumentState>
    if (typeof next.dirty !== 'boolean') return
    if (next.currentFilePath !== null && typeof next.currentFilePath !== 'string') return
    state.currentFilePath = next.currentFilePath
    state.dirty = next.dirty
    updateTitle(window, state)
  })

  ipcMain.on(ipcChannels.finishCloseAfterSave, (event, saved: unknown) => {
    if (saved !== true) return
    const window = BrowserWindow.fromWebContents(event.sender)
    const state = stateFor(event.sender)
    if (!window || !state) return
    state.allowClose = true
    window.close()
  })
}

async function createWindow(): Promise<void> {
  const window = new BrowserWindow({
    width: 1280,
    height: 900,
    minWidth: 900,
    minHeight: 700,
    title: 'Untitled.ledmap — LedMAP',
    backgroundColor: '#10151d',
    show: false,
    webPreferences: {
      preload: fileURLToPath(new URL('../preload/index.cjs', import.meta.url)),
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
    },
  })
  const webContentsId = window.webContents.id
  windowStates.set(webContentsId, {
    currentFilePath: null,
    dirty: false,
    allowClose: false,
    closePromptActive: false,
  })
  window.setMenuBarVisibility(false)
  window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))
  window.webContents.on('will-navigate', event => event.preventDefault())
  window.webContents.on('will-attach-webview', event => event.preventDefault())
  window.webContents.session.setPermissionRequestHandler((_contents, _permission, callback) => callback(false))
  window.webContents.session.setPermissionCheckHandler(() => false)
  window.once('ready-to-show', () => window.show())
  window.on('close', event => {
    const state = stateFor(window.webContents)
    if (!state || state.allowClose || !state.dirty) return
    event.preventDefault()
    if (state.closePromptActive) return
    state.closePromptActive = true
    void promptUnsaved(window).then(choice => {
      state.closePromptActive = false
      if (choice === 'discard') {
        state.allowClose = true
        window.close()
      } else if (choice === 'save') {
        window.webContents.send(ipcChannels.requestSaveBeforeClose)
      }
    })
  })
  window.on('closed', () => windowStates.delete(webContentsId))
  const devUrl = process.env['ELECTRON_RENDERER_URL']
  if (!app.isPackaged && devUrl) {
    await window.loadURL(devUrl)
  } else {
    await window.loadFile(fileURLToPath(new URL('../renderer/index.html', import.meta.url)))
  }
}

registerIpc()

app.whenReady().then(async () => {
  await createWindow()
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) void createWindow()
  })
}).catch(error => {
  console.error(error)
  app.quit()
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
