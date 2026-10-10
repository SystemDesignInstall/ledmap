import { app, BrowserWindow, webContents, type WebContents } from 'electron'
import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process'
import { existsSync } from 'node:fs'
import { join, isAbsolute } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  ipcChannels, type NdiOutputRequest, type NdiOutputState, type NdiOutputUpdate,
  type LiveOutputFrameUpdate,
} from '../shared/ipc.js'
import { validateLiveOutputRegion } from '../shared/live-output.js'
import type { TestFrame } from '../shared/test-engine.js'

interface NdiRoute {
  readonly ownerId: number
  readonly id: string
  readonly name: string
  readonly fps: 25 | 30 | 60
  readonly window: BrowserWindow
  readonly child: ChildProcessWithoutNullStreams
  region: NdiOutputRequest['region']
  frame: TestFrame
  revision: number
  bitmap: Buffer | null
  blocked: boolean
  readonly timer: NodeJS.Timeout
}

const MAX_NDI_STREAMS = 16
const MAX_NDI_PIXELS = 16_777_216
const MAX_ACTIVE_NDI_PIXELS = 33_554_432

function checkId(id: unknown): string {
  if (typeof id !== 'string' || (id !== 'composition' && !/^screen:[\w.-]{1,128}$/.test(id))) {
    throw new Error('Invalid NDI stream identity.')
  }
  return id
}

function validateFrame(frame: unknown): TestFrame {
  if (!frame || typeof frame !== 'object') throw new Error('Invalid NDI frame.')
  const candidate = frame as Partial<TestFrame>
  if (typeof candidate.pattern !== 'string' || !candidate.bounds ||
      !Array.isArray(candidate.primitives) || candidate.primitives.length > 100000) {
    throw new Error('Invalid NDI frame.')
  }
  return frame as TestFrame
}

function validateRegion(region: unknown): NdiOutputRequest['region'] {
  const result = validateLiveOutputRegion(region)
  if (result.width > 8192 || result.height > 8192 || result.width * result.height > MAX_NDI_PIXELS) {
    throw new Error('NDI output is limited to 8192 pixels per axis and 16,777,216 total pixels.')
  }
  return result
}

function executablePath(): string {
  if (process.platform !== 'win32') throw new Error('NDI Output MVP currently requires Windows.')
  const override = process.env['LEDMAP_NDI_SENDER_PATH']
  if (override && !isAbsolute(override)) throw new Error('LEDMAP_NDI_SENDER_PATH must be absolute.')
  const path = override || join(process.resourcesPath, 'ndi', 'ledmap-ndi-sender.exe')
  if (!existsSync(path)) throw new Error('NDI helper not installed. See docs/specs/LEDMAP-NDI-OUTPUT-MVP.md.')
  return path
}

async function launchSender(name: string, width: number, height: number, fps: number): Promise<ChildProcessWithoutNullStreams> {
  const child = spawn(executablePath(), [name, String(width), String(height), String(fps)], {
    windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'],
  })
  return new Promise((resolve, reject) => {
    let done = false
    let diagnostic = ''
    const finish = (error?: Error): void => {
      if (done) return
      done = true
      clearTimeout(timeout)
      if (error) { child.kill(); reject(error) } else resolve(child)
    }
    const timeout = setTimeout(() => finish(new Error('NDI sender startup timed out.')), 10000)
    child.once('error', error => finish(error))
    child.once('exit', code => finish(new Error(`NDI sender exited during startup (code ${code}). ${diagnostic.trim()}`)))
    child.stderr.on('data', (chunk: Buffer) => {
      diagnostic = (diagnostic + chunk.toString('utf8')).slice(-4096)
      if (diagnostic.includes('READY\n')) finish()
      else if (diagnostic.includes('ERROR ')) finish(new Error(diagnostic.trim()))
    })
  })
}

export class NdiOutputManager {
  private readonly routes = new Map<string, NdiRoute>()

  async start(owner: WebContents, input: NdiOutputRequest): Promise<NdiOutputState> {
    if (!BrowserWindow.fromWebContents(owner)) throw new Error('Editor window unavailable.')
    if (!input || typeof input !== 'object') throw new Error('Invalid NDI request.')
    const id = checkId(input.streamId)
    const name = input.streamName
    if (typeof name !== 'string' || name.trim().length === 0 || name.length > 128 || /[\r\n]/.test(name)) {
      throw new Error('Invalid NDI stream name.')
    }
    const region = validateRegion(input.region)
    const fps = input.fps
    if (fps !== 25 && fps !== 30 && fps !== 60) throw new Error('NDI frame rate must be 25, 30 or 60.')
    const frame = validateFrame(input.frame)
    const key = this.key(owner.id, id)
    this.stopByKey(key)
    if ([...this.routes.values()].filter(route => route.ownerId === owner.id).length >= MAX_NDI_STREAMS) {
      throw new Error(`Only ${MAX_NDI_STREAMS} simultaneous NDI streams are supported.`)
    }
    const totalPixels = [...this.routes.values()].reduce((sum, route) =>
      sum + route.region.width * route.region.height, 0)
    if (totalPixels + region.width * region.height > MAX_ACTIVE_NDI_PIXELS) {
      throw new Error('NDI streams exceed the 33,554,432-pixel session budget.')
    }
    // Do not report Running before the executable confirms NDIlib_send_create succeeded.
    const child = await launchSender(name, region.width, region.height, fps)
    let window: BrowserWindow | undefined
    try {
      window = new BrowserWindow({
        width: region.width, height: region.height, useContentSize: true,
        show: false, frame: false, backgroundColor: '#000000',
        webPreferences: {
          offscreen: true, nodeIntegration: false, contextIsolation: true, sandbox: true,
          preload: fileURLToPath(new URL('../preload/output.cjs', import.meta.url)),
          backgroundThrottling: false,
        },
      })
      window.webContents.setFrameRate(fps)
      window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))
      window.webContents.on('will-navigate', event => event.preventDefault())
      const devUrl = process.env['ELECTRON_RENDERER_URL']
      if (!app.isPackaged && devUrl) await window.loadURL(new URL('output.html', devUrl).toString())
      else await window.loadFile(fileURLToPath(new URL('../renderer/output.html', import.meta.url)))

      const activeWindow = window
      const route: NdiRoute = {
        ownerId: owner.id, id, name, fps, window: activeWindow, child, region, frame,
        revision: 1, bitmap: null, blocked: false,
        timer: setInterval(() => this.writeFrame(key), 1000 / fps),
      }
      this.routes.set(key, route)
      child.stdin.on('drain', () => { route.blocked = false })
      // EPIPE is expected if the native sender exits during a write; it must not crash Electron.
      child.stdin.on('error', () => {
        if (this.routes.get(key) === route) this.stopByKey(key, 'NDI sender pipe closed.')
      })
      child.once('error', error => {
        if (this.routes.get(key) === route) this.stopByKey(key, `NDI sender error: ${error.message}`)
      })
      child.once('exit', code => {
        if (this.routes.get(key) === route) this.stopByKey(key, `NDI sender exited (code ${code}).`)
      })
      activeWindow.on('closed', () => {
        if (this.routes.get(key) === route) this.stopByKey(key, 'NDI render window closed.')
      })
      activeWindow.webContents.on('paint', (_event, _dirty, image) => {
        if (this.routes.get(key) !== route) return
        // Electron NativeImage.toBitmap() is BGRA, exactly what the native sender expects.
        const size = image.getSize()
        const bitmap = size.width === region.width && size.height === region.height
          ? image.toBitmap() : image.resize({ width: region.width, height: region.height }).toBitmap()
        if (bitmap.byteLength === region.width * region.height * 4) route.bitmap = bitmap
      })
      activeWindow.webContents.startPainting()
      this.pushFrame(route)
      const state = this.state(route)
      this.notify(owner.id, state)
      return state
    } catch (error) {
      if (window && !window.isDestroyed()) window.destroy()
      child.kill()
      throw error
    }
  }

  update(owner: WebContents, input: NdiOutputUpdate): NdiOutputState {
    if (!input || typeof input !== 'object') throw new Error('Invalid NDI update.')
    const id = checkId(input.streamId)
    const route = this.routes.get(this.key(owner.id, id))
    if (!route) throw new Error('NDI stream is not running.')
    const region = validateRegion(input.region)
    if (region.width !== route.region.width || region.height !== route.region.height) {
      throw new Error('NDI resolution changed: stop and restart this stream.')
    }
    route.region = region
    route.frame = validateFrame(input.frame)
    route.revision++
    this.pushFrame(route)
    return this.state(route)
  }

  stop(owner: WebContents, streamId: unknown): NdiOutputState {
    const id = checkId(streamId)
    this.stopByKey(this.key(owner.id, id))
    return { streamId: id, running: false, revision: 0 }
  }

  unregisterEditor(ownerId: number): void {
    for (const [key, route] of [...this.routes]) {
      if (route.ownerId === ownerId) this.stopByKey(key, 'Editor closed.')
    }
  }

  private key(owner: number, stream: string): string { return `${owner}:${stream}` }
  private state(route: NdiRoute): NdiOutputState {
    return { streamId: route.id, running: true, revision: route.revision }
  }

  private notify(ownerId: number, state: NdiOutputState): void {
    webContents.fromId(ownerId)?.send(ipcChannels.ndiOutputStateChanged, state)
  }

  private pushFrame(route: NdiRoute): void {
    route.bitmap = null // Never send pixels from a previous TestFrame revision.
    const value: LiveOutputFrameUpdate = {
      outputId: route.id, displayId: 'ndi', displayScaleFactor: 1,
      region: route.region, scaleMode: 'actual', revision: route.revision, frame: route.frame,
    }
    route.window.webContents.send(ipcChannels.outputFrame, value)
    route.window.webContents.invalidate()
  }

  private writeFrame(key: string): void {
    const route = this.routes.get(key)
    if (!route?.bitmap || route.blocked || route.child.stdin.destroyed) return
    // A writable stream's high-water mark applies backpressure; never queue multiple big frames.
    if (!route.child.stdin.write(route.bitmap)) route.blocked = true
  }

  private stopByKey(key: string, reason?: string): void {
    const route = this.routes.get(key)
    if (!route) return
    this.routes.delete(key)
    clearInterval(route.timer)
    route.bitmap = null
    route.child.stdin.destroy()
    route.child.kill()
    if (!route.window.isDestroyed()) route.window.destroy()
    this.notify(route.ownerId, {
      streamId: route.id, running: false, revision: route.revision, ...(reason ? { reason } : {}),
    })
  }
}
