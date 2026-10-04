import { app, BrowserWindow, screen, webContents, type Display, type WebContents } from 'electron'
import { fileURLToPath } from 'node:url'
import {
  ipcChannels,
  type DisplayDescriptor,
  type LiveOutputFrameUpdate,
  type LiveOutputRegion,
  type LiveOutputScaleMode,
  type LiveOutputState,
  type SimulateDisplayChangeRequest,
  type StartLiveOutputRequest,
  type UpdateLiveOutputRequest,
} from '../shared/ipc.js'
import { validateLiveOutputId, validateLiveOutputRegion, validateLiveOutputScaleMode } from '../shared/live-output.js'
import type { TestFrame } from '../shared/test-engine.js'

interface OutputRoute {
  readonly key: string
  readonly outputId: string
  readonly ownerId: number
  readonly displayId: string
  readonly displayScaleFactor: number
  readonly window: BrowserWindow
  region: LiveOutputRegion
  scaleMode: LiveOutputScaleMode
  frame: TestFrame
  revision: number
  closeReason: string | null
}

const simulatedInitialDisplays: readonly DisplayDescriptor[] = [
  {
    id: 'sim-display-1', bounds: { x: 0, y: 0, width: 1920, height: 1080 },
    resolution: { width: 1920, height: 1080 }, scaleFactor: 1, primary: true,
  },
  {
    id: 'sim-display-2', bounds: { x: 1920, y: 0, width: 1280, height: 720 },
    resolution: { width: 1280, height: 720 }, scaleFactor: 1, primary: false,
  },
]

function descriptor(display: Display, primaryId: number): DisplayDescriptor {
  return {
    id: String(display.id),
    bounds: { ...display.bounds },
    resolution: {
      width: Math.round(display.bounds.width * display.scaleFactor),
      height: Math.round(display.bounds.height * display.scaleFactor),
    },
    scaleFactor: display.scaleFactor,
    primary: display.id === primaryId,
  }
}

function validateFrame(value: unknown): TestFrame {
  if (value === null || typeof value !== 'object') throw new Error('Invalid Live Output TestFrame.')
  const frame = value as Partial<TestFrame>
  if (typeof frame.pattern !== 'string' || frame.bounds === undefined || !Array.isArray(frame.primitives)) {
    throw new Error('Invalid Live Output TestFrame.')
  }
  if (frame.primitives.length > 100000) throw new Error('Live Output TestFrame is too large.')
  return value as TestFrame
}

function stopped(outputId: string, displayId: string, revision: number, reason?: string): LiveOutputState {
  return { outputId, displayId, running: false, revision, ...(reason ? { reason } : {}) }
}

export class LiveOutputManager {
  private readonly routes = new Map<string, OutputRoute>()
  private readonly editors = new Set<number>()
  private readonly simulated: boolean
  private simulatedDisplays = [...simulatedInitialDisplays]

  constructor() {
    this.simulated = process.env['LEDMAP_SMOKE_SIMULATED_DISPLAYS'] === '1'
  }

  registerEditor(contents: WebContents): void {
    this.editors.add(contents.id)
  }

  unregisterEditor(contents: WebContents): void {
    this.stopAll(contents)
    this.editors.delete(contents.id)
  }

  attachDisplayEvents(): void {
    if (this.simulated) return
    screen.on('display-added', () => this.broadcastDisplays())
    screen.on('display-metrics-changed', () => this.broadcastDisplays())
    screen.on('display-removed', (_event, display) => {
      this.removeDisplay(String(display.id))
      this.broadcastDisplays()
    })
  }

  displays(): readonly DisplayDescriptor[] {
    if (this.simulated) return this.simulatedDisplays.map(value => ({ ...value, bounds: { ...value.bounds }, resolution: { ...value.resolution } }))
    const primaryId = screen.getPrimaryDisplay().id
    return screen.getAllDisplays().map(display => descriptor(display, primaryId))
  }

  async start(owner: WebContents, input: StartLiveOutputRequest): Promise<LiveOutputState> {
    const outputId = validateLiveOutputId(input.outputId)
    if (typeof input.displayId !== 'string') throw new Error('Invalid Windows Display identity.')
    const target = this.displays().find(display => display.id === input.displayId)
    if (!target) throw new Error(`Windows Display ${input.displayId} is unavailable.`)
    const region = validateLiveOutputRegion(input.region)
    const scaleMode = validateLiveOutputScaleMode(input.scaleMode)
    const frame = validateFrame(input.frame)
    const key = this.key(owner.id, outputId)
    const existing = this.routes.get(key)
    if (existing) this.closeRoute(existing, 'Output restarted.')
    const ownerRoutes = [...this.routes.values()].filter(route => route.ownerId === owner.id)
    if (ownerRoutes.length >= 4) throw new Error('A maximum of 4 Live Outputs can run at once.')
    const window = this.createOutputWindow(target)
    const route: OutputRoute = {
      key, outputId, ownerId: owner.id, displayId: target.id, displayScaleFactor: target.scaleFactor,
      window, region, scaleMode, frame, revision: 1, closeReason: null,
    }
    this.routes.set(key, route)
    window.on('closed', () => {
      if (this.routes.get(key) !== route) return
      this.routes.delete(key)
      this.notifyState(route.ownerId, stopped(route.outputId, route.displayId, route.revision, route.closeReason ?? 'Output window closed.'))
    })
    await this.loadOutputWindow(window)
    this.sendFrame(route)
    if (!this.simulated) window.show()
    const state = this.state(route)
    this.notifyState(route.ownerId, state)
    return state
  }

  update(owner: WebContents, input: UpdateLiveOutputRequest): LiveOutputState {
    const outputId = validateLiveOutputId(input.outputId)
    const route = this.routes.get(this.key(owner.id, outputId))
    if (!route) throw new Error(`${outputId} is not running.`)
    route.region = validateLiveOutputRegion(input.region)
    route.scaleMode = validateLiveOutputScaleMode(input.scaleMode)
    route.frame = validateFrame(input.frame)
    route.revision += 1
    this.sendFrame(route)
    const state = this.state(route)
    this.notifyState(route.ownerId, state)
    return state
  }

  stop(owner: WebContents, outputIdValue: unknown): LiveOutputState {
    const outputId = validateLiveOutputId(outputIdValue)
    const route = this.routes.get(this.key(owner.id, outputId))
    if (!route) return stopped(outputId, '', 0)
    const state = stopped(route.outputId, route.displayId, route.revision)
    this.closeRoute(route, null)
    return state
  }

  simulateDisplayChange(request: SimulateDisplayChangeRequest): boolean {
    if (!this.simulated) return false
    if (request.action === 'add') {
      if (this.simulatedDisplays.some(display => display.id === 'sim-display-3')) return false
      this.simulatedDisplays.push({
        id: 'sim-display-3', bounds: { x: -1024, y: 0, width: 1024, height: 768 },
        resolution: { width: 1280, height: 960 }, scaleFactor: 1.25, primary: false,
      })
      this.broadcastDisplays()
      return true
    }
    if (typeof request.displayId !== 'string') return false
    const before = this.simulatedDisplays.length
    this.simulatedDisplays = this.simulatedDisplays.filter(display => display.id !== request.displayId)
    if (this.simulatedDisplays.length === before) return false
    this.removeDisplay(request.displayId)
    this.broadcastDisplays()
    return true
  }

  private key(ownerId: number, outputId: string): string {
    return `${ownerId}:${outputId}`
  }

  private state(route: OutputRoute): LiveOutputState {
    return { outputId: route.outputId, displayId: route.displayId, running: true, revision: route.revision }
  }

  private createOutputWindow(display: DisplayDescriptor): BrowserWindow {
    const simulatedBounds = { x: 0, y: 0, width: 640, height: 360 }
    const bounds = this.simulated ? simulatedBounds : display.bounds
    const window = new BrowserWindow({
      x: bounds.x,
      y: bounds.y,
      width: bounds.width,
      height: bounds.height,
      frame: false,
      fullscreen: !this.simulated,
      show: false,
      skipTaskbar: true,
      backgroundColor: '#000000',
      webPreferences: {
        preload: fileURLToPath(new URL('../preload/output.cjs', import.meta.url)),
        nodeIntegration: false,
        contextIsolation: true,
        sandbox: true,
        backgroundThrottling: false,
      },
    })
    window.setMenuBarVisibility(false)
    window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))
    window.webContents.on('will-navigate', event => event.preventDefault())
    window.webContents.on('will-attach-webview', event => event.preventDefault())
    window.webContents.session.setPermissionRequestHandler((_contents, _permission, callback) => callback(false))
    window.webContents.session.setPermissionCheckHandler(() => false)
    return window
  }

  private async loadOutputWindow(window: BrowserWindow): Promise<void> {
    const devUrl = process.env['ELECTRON_RENDERER_URL']
    if (!app.isPackaged && devUrl) {
      await window.loadURL(new URL('output.html', devUrl).toString())
    } else {
      await window.loadFile(fileURLToPath(new URL('../renderer/output.html', import.meta.url)))
    }
  }

  private sendFrame(route: OutputRoute): void {
    const update: LiveOutputFrameUpdate = {
      outputId: route.outputId,
      displayId: route.displayId,
      displayScaleFactor: route.displayScaleFactor,
      region: route.region,
      scaleMode: route.scaleMode,
      revision: route.revision,
      frame: route.frame,
    }
    route.window.webContents.send(ipcChannels.outputFrame, update)
  }

  private notifyState(ownerId: number, state: LiveOutputState): void {
    webContents.fromId(ownerId)?.send(ipcChannels.liveOutputStateChanged, state)
  }

  private closeRoute(route: OutputRoute, reason: string | null): void {
    route.closeReason = reason
    this.routes.delete(route.key)
    if (!route.window.isDestroyed()) route.window.close()
    this.notifyState(route.ownerId, stopped(route.outputId, route.displayId, route.revision, reason ?? undefined))
  }

  private stopAll(owner: WebContents): void {
    for (const route of [...this.routes.values()]) {
      if (route.ownerId === owner.id) this.closeRoute(route, 'Editor window closed.')
    }
  }

  private removeDisplay(displayId: string): void {
    for (const route of [...this.routes.values()]) {
      if (route.displayId === displayId) this.closeRoute(route, 'Windows Display removed.')
    }
  }

  private broadcastDisplays(): void {
    const displays = this.displays()
    for (const id of this.editors) webContents.fromId(id)?.send(ipcChannels.displaysChanged, displays)
  }
}
