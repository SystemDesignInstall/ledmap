import type {
  DisplayDescriptor,
  LiveOutputRegion,
  LiveOutputScaleMode,
  LiveOutputState,
} from '../shared/ipc.js'
import { displayPickerLabel, liveOutputId, validateLiveOutputRegion } from '../shared/live-output.js'
import type { TestBounds } from '../shared/test-engine.js'
import type { TestOutputOverlay } from './test-canvas.js'
import type { TestWorkspaceSnapshot } from './test-workspace.js'

interface LiveOutputOptions {
  readonly getSelectedScreenBounds: () => TestBounds | null
  readonly onOverlaysChanged: () => void
}

interface Route {
  readonly id: string
  displayId: string
  region: LiveOutputRegion
  scaleMode: LiveOutputScaleMode
  running: boolean
  revision: number
  message: string
  customized: boolean
}

export interface LiveOutputController {
  frameChanged(snapshot: TestWorkspaceSnapshot): void
  overlays(): readonly TestOutputOverlay[]
}

interface LiveOutputHook {
  dump(): {
    readonly displays: readonly DisplayDescriptor[]
    readonly pattern: string
    readonly outputs: ReadonlyArray<{
      readonly id: string
      readonly displayId: string
      readonly region: LiveOutputRegion
      readonly scaleMode: LiveOutputScaleMode
      readonly running: boolean
      readonly revision: number
    }>
  }
  simulateDisplayChange(action: 'add' | 'remove', displayId?: string): Promise<boolean>
}

const routeColors = ['#69d5b7', '#e8b05f', '#7baee8', '#cf8ec1']

function element<T extends HTMLElement>(id: string): T {
  const found = document.getElementById(id)
  if (!found) throw new Error(`Missing element: ${id}`)
  return found as T
}

function integerRegion(bounds: TestBounds): LiveOutputRegion {
  return {
    x: Math.round(bounds.x),
    y: Math.round(bounds.y),
    width: Math.max(1, Math.round(bounds.width)),
    height: Math.max(1, Math.round(bounds.height)),
  }
}

export function createLiveOutputController(options: LiveOutputOptions): LiveOutputController {
  const openButton = element<HTMLButtonElement>('live-output-open')
  const count = element<HTMLSpanElement>('live-output-count')
  const dialog = element<HTMLDialogElement>('live-output-dialog')
  const list = element<HTMLDivElement>('live-output-list')
  const closeButton = element<HTMLButtonElement>('live-output-close')
  const refreshButton = element<HTMLButtonElement>('live-output-refresh')
  const fallbackRegion: LiveOutputRegion = { x: 0, y: 0, width: 1920, height: 1080 }
  const routes: Route[] = Array.from({ length: 4 }, (_, index) => ({
    id: liveOutputId(index + 1),
    displayId: '',
    region: { ...fallbackRegion },
    scaleMode: 'fit',
    running: false,
    revision: 0,
    message: '',
    customized: false,
  }))
  let displays: readonly DisplayDescriptor[] = []
  let snapshot: TestWorkspaceSnapshot | null = null

  function defaultDisplay(): DisplayDescriptor | undefined {
    return displays.find(display => !display.primary) ?? displays[0]
  }

  function normalizeDisplays(): void {
    for (const route of routes) {
      if (!route.displayId || (!route.running && !displays.some(display => display.id === route.displayId))) {
        route.displayId = defaultDisplay()?.id ?? ''
      }
    }
  }

  async function refreshDisplays(): Promise<void> {
    displays = await window.ledmapDesktop.listDisplays()
    normalizeDisplays()
    render()
  }

  function updateCount(): void {
    count.textContent = `${routes.filter(route => route.running).length}/4`
  }

  function field(label: string, input: HTMLElement, wide = false): HTMLLabelElement {
    const result = document.createElement('label')
    if (wide) result.className = 'wide'
    result.append(label, input)
    return result
  }

  function button(label: string, run: () => void, primary = false): HTMLButtonElement {
    const result = document.createElement('button')
    result.type = 'button'
    result.textContent = label
    if (primary) result.className = 'primary'
    result.addEventListener('click', run)
    return result
  }

  function setRegion(route: Route, region: LiveOutputRegion): void {
    route.region = validateLiveOutputRegion(region)
    route.customized = true
    route.message = ''
    options.onOverlaysChanged()
    if (route.running) void sync(route)
    render()
  }

  function regionInput(route: Route, key: keyof LiveOutputRegion): HTMLInputElement {
    const input = document.createElement('input')
    input.type = 'number'
    input.step = '1'
    if (key === 'width' || key === 'height') input.min = '1'
    input.value = String(route.region[key])
    input.setAttribute('aria-label', `${route.id} source ${key}`)
    input.addEventListener('change', () => {
      try {
        setRegion(route, { ...route.region, [key]: Number(input.value) })
      } catch (error) {
        route.message = error instanceof Error ? error.message : 'Invalid source region.'
        input.setAttribute('aria-invalid', 'true')
        render()
      }
    })
    return input
  }

  function displaySelect(route: Route): HTMLSelectElement {
    const select = document.createElement('select')
    select.setAttribute('aria-label', `${route.id} Windows Display`)
    select.disabled = route.running
    for (const display of displays) {
      const option = document.createElement('option')
      option.value = display.id
      option.textContent = displayPickerLabel(display)
      select.append(option)
    }
    select.value = route.displayId
    select.addEventListener('change', () => {
      route.displayId = select.value
      route.message = ''
      render()
    })
    return select
  }

  function scaleSelect(route: Route): HTMLSelectElement {
    const select = document.createElement('select')
    select.setAttribute('aria-label', `${route.id} scale mode`)
    for (const [value, label] of [['actual', 'Actual pixels / 1:1'], ['fit', 'Fit']] as const) {
      const option = document.createElement('option')
      option.value = value
      option.textContent = label
      select.append(option)
    }
    select.value = route.scaleMode
    select.addEventListener('change', () => {
      route.scaleMode = select.value as LiveOutputScaleMode
      if (route.running) void sync(route)
      render()
    })
    return select
  }

  async function start(route: Route): Promise<void> {
    if (!snapshot || !route.displayId) {
      route.message = !snapshot ? 'TestFrame is unavailable.' : 'Choose a Windows Display.'
      render()
      return
    }
    try {
      const state = await window.ledmapDesktop.startLiveOutput({
        outputId: route.id,
        displayId: route.displayId,
        region: route.region,
        scaleMode: route.scaleMode,
        frame: snapshot.frame,
      })
      applyState(state)
    } catch (error) {
      route.message = error instanceof Error ? error.message : 'Unable to start Live Output.'
      route.running = false
      render()
    }
  }

  async function sync(route: Route): Promise<void> {
    if (!route.running || !snapshot) return
    try {
      applyState(await window.ledmapDesktop.updateLiveOutput({
        outputId: route.id,
        region: route.region,
        scaleMode: route.scaleMode,
        frame: snapshot.frame,
      }))
    } catch (error) {
      route.message = error instanceof Error ? error.message : 'Unable to update Live Output.'
      render()
    }
  }

  async function stop(route: Route): Promise<void> {
    try {
      applyState(await window.ledmapDesktop.stopLiveOutput(route.id))
    } catch (error) {
      route.message = error instanceof Error ? error.message : 'Unable to stop Live Output.'
      render()
    }
  }

  function applyState(state: LiveOutputState): void {
    const route = routes.find(value => value.id === state.outputId)
    if (!route) return
    route.running = state.running
    route.revision = state.revision
    route.message = state.reason ?? ''
    if (state.displayId) route.displayId = state.displayId
    updateCount()
    options.onOverlaysChanged()
    render()
  }

  function convenience(route: Route): HTMLDivElement {
    const actions = document.createElement('div')
    actions.className = 'live-output-convenience'
    const entire = snapshot?.frame.bounds
    const current = snapshot?.frame.scopeBounds
    const selected = options.getSelectedScreenBounds()
    const display = displays.find(value => value.id === route.displayId)
    const entireButton = button('Entire Composition', () => { if (entire) setRegion(route, integerRegion(entire)) })
    const currentButton = button('Current Test Scope', () => { if (current) setRegion(route, integerRegion(current)) })
    const screenButton = button('Selected Screen', () => { if (selected) setRegion(route, integerRegion(selected)) })
    const resolutionButton = button('Use Display Resolution', () => {
      if (display) setRegion(route, { ...route.region, width: display.resolution.width, height: display.resolution.height })
    })
    entireButton.disabled = !entire || entire.width <= 0 || entire.height <= 0
    currentButton.disabled = current === null || current === undefined
    screenButton.disabled = selected === null
    resolutionButton.disabled = display === undefined
    actions.append(entireButton, currentButton, screenButton, resolutionButton)
    return actions
  }

  function renderCard(route: Route, index: number): HTMLElement {
    const card = document.createElement('section')
    card.className = `live-output-card${route.running ? ' running' : ''}`
    card.dataset['outputId'] = route.id
    const header = document.createElement('div')
    header.className = 'live-output-card-header'
    const title = document.createElement('h3')
    title.textContent = `Output ${index + 1}`
    const state = document.createElement('span')
    state.className = 'live-output-state'
    state.textContent = route.running ? `Running · revision ${route.revision}` : 'Stopped'
    header.append(title, state)
    const fields = document.createElement('div')
    fields.className = 'live-output-fields'
    fields.append(
      field('Windows Display', displaySelect(route), true),
      field('Scale', scaleSelect(route)),
      field('Source X', regionInput(route, 'x')),
      field('Source Y', regionInput(route, 'y')),
      field('Source W', regionInput(route, 'width')),
      field('Source H', regionInput(route, 'height')),
    )
    const actions = document.createElement('div')
    actions.className = 'live-output-actions'
    actions.append(route.running
      ? button('Stop', () => { void stop(route) })
      : button('Start', () => { void start(route) }, true))
    const message = document.createElement('p')
    message.className = 'live-output-message'
    message.textContent = route.message
    card.append(header, fields, convenience(route), message, actions)
    return card
  }

  function render(): void {
    normalizeDisplays()
    list.replaceChildren(...routes.map(renderCard))
    updateCount()
  }

  openButton.addEventListener('click', () => {
    render()
    dialog.showModal()
  })
  closeButton.addEventListener('click', () => dialog.close())
  refreshButton.addEventListener('click', () => { void refreshDisplays() })
  window.ledmapDesktop.onDisplaysChanged(next => {
    displays = next
    normalizeDisplays()
    render()
  })
  window.ledmapDesktop.onLiveOutputStateChanged(applyState)

  void refreshDisplays()

  const controller: LiveOutputController = {
    frameChanged: next => {
      snapshot = next
      for (const route of routes) {
        if (!route.customized && !route.running && next.frame.bounds.width > 0 && next.frame.bounds.height > 0) {
          route.region = integerRegion(next.frame.bounds)
        }
        if (route.running) void sync(route)
      }
      render()
    },
    overlays: () => routes.flatMap((route, index): TestOutputOverlay[] => route.running
      ? [{ id: `Output ${index + 1}`, region: { ...route.region }, color: routeColors[index]! }]
      : []),
  }

  const hook: LiveOutputHook = {
    dump: () => ({
      displays: displays.map(display => ({ ...display, bounds: { ...display.bounds }, resolution: { ...display.resolution } })),
      pattern: snapshot?.frame.pattern ?? '',
      outputs: routes.map(route => ({
        id: route.id,
        displayId: route.displayId,
        region: { ...route.region },
        scaleMode: route.scaleMode,
        running: route.running,
        revision: route.revision,
      })),
    }),
    simulateDisplayChange: (action, displayId) => window.ledmapDesktop.simulateDisplayChange({
      action,
      ...(displayId ? { displayId } : {}),
    }),
  }
  ;(window as Window & { __ledmapLiveOutput?: LiveOutputHook }).__ledmapLiveOutput = hook
  return controller
}
