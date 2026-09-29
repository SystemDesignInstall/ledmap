import {
  DomainError,
  asCabinetId,
  asModuleId,
  inspectGeometryInputPixel,
  projectEditableGeometryMapping,
  projectEditableHardwareMapping,
  unmapGeometryCabinetPixel,
  unmapGeometryModulePixel,
  type EditableProjectionDiagnostic,
  type GeometryMappedPixel,
  type MappingRegion,
  type ResolvedGeometryMapping,
} from '@ledmap/core'
import { fitCamera, toProject, zoomAt, type Camera, type Point } from './canvas.js'
import {
  drawMappingCanvas,
  hitMappingRegion,
  hitMappingResizeHandle,
  resizeMappingRegion,
  type MappingDiagnosticStatus,
  type MappingRegionRenderState,
  type MappingResizeHandle,
} from './mapping-canvas.js'
import {
  addMappingRegion,
  deleteMappingRegion,
  findMappingRegion,
  mapFromLayoutPosition,
  setInputCanvasResolution,
  updateMappingRegion,
} from './mapping-project.js'
import { findScreen, type Project } from './project.js'

interface MappingWorkspaceOptions {
  readonly getProject: () => Project
  readonly updateProject: (project: Project) => void
  readonly showError: (error: unknown, fallback: string) => void
  readonly clearError: () => void
}

export interface MappingWorkspace {
  activate(): void
  deactivate(): void
  projectChanged(): void
}

interface MappingDump {
  readonly inputCanvas: { readonly width: number; readonly height: number } | null
  readonly regions: ReadonlyArray<{
    readonly id: string
    readonly screen: string
    readonly grid: string
    readonly x: number
    readonly y: number
    readonly width: number
    readonly height: number
    readonly status: MappingDiagnosticStatus
  }>
}

interface MappingTestHook {
  dump(): MappingDump
  camera(): Camera
  forward(regionId: string, x: number, y: number): ReturnType<typeof pixelDump>
  reverseModule(regionId: string, cabinet: string, module: string, x: number, y: number): ReturnType<typeof pixelDump>
}

type ReverseMode = 'module' | 'cabinet'

function element<T extends HTMLElement>(id: string): T {
  const found = document.getElementById(id)
  if (!found) throw new Error(`Missing element: ${id}`)
  return found as T
}

function pixelDump(pixel: GeometryMappedPixel): {
  input: Point
  screen: Point
  cabinet: string
  cabinetPixel: Point
  module: string
  modulePixel: Point
} {
  return {
    input: pixel.inputCoordinate,
    screen: pixel.screenCoordinate,
    cabinet: pixel.cabinet,
    cabinetPixel: pixel.cabinetCoordinate,
    module: pixel.module,
    modulePixel: pixel.moduleCoordinate,
  }
}

function diagnosticStatus(diagnostics: readonly EditableProjectionDiagnostic[]): MappingDiagnosticStatus {
  const code = diagnostics[0]?.code
  if (code === 'MAPPING_OUT_OF_RANGE') return 'out-of-bounds'
  if (code === 'MAPPING_INCOMPLETE' || code === 'MAPPING_UNKNOWN_REFERENCE') return 'incomplete'
  return 'invalid'
}

function statusLabel(status: MappingDiagnosticStatus): string {
  if (status === 'out-of-bounds') return 'Out of bounds'
  return status[0]!.toUpperCase() + status.slice(1)
}

function numberInput(value: number, label: string, commit: (value: number) => void): HTMLInputElement {
  const input = document.createElement('input')
  input.type = 'number'
  input.step = '1'
  input.value = String(value)
  input.setAttribute('aria-label', label)
  input.addEventListener('change', () => commit(Number(input.value)))
  return input
}

function row(label: string, value: HTMLElement | string): HTMLDivElement {
  const result = document.createElement('div')
  result.className = 'property'
  const name = document.createElement('label')
  name.textContent = label
  const content = typeof value === 'string' ? document.createElement('span') : value
  if (typeof value === 'string') {
    content.className = 'value'
    content.textContent = value
  }
  result.append(name, content)
  return result
}

function group(title: string, ...children: HTMLElement[]): HTMLDivElement {
  const result = document.createElement('div')
  result.className = 'property-group'
  const heading = document.createElement('h3')
  heading.textContent = title
  result.append(heading, ...children)
  return result
}

function action(label: string, run: () => void, disabled = false): HTMLButtonElement {
  const button = document.createElement('button')
  button.type = 'button'
  button.textContent = label
  button.disabled = disabled
  button.addEventListener('click', run)
  return button
}

function selectInput(label: string, values: readonly { readonly value: string; readonly label: string }[], selected: string): HTMLSelectElement {
  const select = document.createElement('select')
  select.setAttribute('aria-label', label)
  for (const value of values) {
    const option = document.createElement('option')
    option.value = value.value
    option.textContent = value.label
    select.append(option)
  }
  select.value = selected
  return select
}

export function createMappingWorkspace(options: MappingWorkspaceOptions): MappingWorkspace {
  const canvas = element<HTMLCanvasElement>('mapping-canvas')
  const tree = element<HTMLDivElement>('mapping-tree')
  const diagnostics = element<HTMLDivElement>('mapping-diagnostics')
  const properties = element<HTMLDivElement>('mapping-properties')
  const title = element<HTMLHeadingElement>('mapping-inspector-title')
  const selectionChip = element<HTMLSpanElement>('mapping-selection-chip')
  const empty = element<HTMLDivElement>('mapping-empty')
  const widthInput = element<HTMLInputElement>('mapping-input-width')
  const heightInput = element<HTMLInputElement>('mapping-input-height')
  const applyInputButton = element<HTMLButtonElement>('mapping-apply-input')
  const createRegionButton = element<HTMLButtonElement>('mapping-create-region')
  const layoutPositionButton = element<HTMLButtonElement>('mapping-from-layout')
  const deleteRegionButton = element<HTMLButtonElement>('mapping-delete-region')
  const fitButton = element<HTMLButtonElement>('mapping-fit')
  const actualButton = element<HTMLButtonElement>('mapping-actual-size')
  const zoomInButton = element<HTMLButtonElement>('mapping-zoom-in')
  const zoomOutButton = element<HTMLButtonElement>('mapping-zoom-out')
  const cursorStatus = element<HTMLSpanElement>('mapping-cursor-status')
  const zoomStatus = element<HTMLSpanElement>('mapping-zoom-indicator')
  const healthStatus = element<HTMLSpanElement>('mapping-health-status')

  let active = false
  let selectedScreenId: string | null = null
  let selectedRegionId: string | null = null
  let inspectionRegionId: string | null = null
  let inspectedInput: Point | null = null
  let camera: Camera = { zoom: 1, offsetX: 0, offsetY: 0 }
  let reverseMode: ReverseMode = 'module'
  let reverseCabinet = ''
  let reverseModule = ''
  let reverseX = 0
  let reverseY = 0
  let reverseResult: GeometryMappedPixel | null = null
  let spaceDown = false
  let gesture:
    | { readonly type: 'pan'; x: number; y: number }
    | { readonly type: 'drag'; regionId: string; start: Point; x: number; y: number }
    | { readonly type: 'resize'; region: MappingRegion; handle: MappingResizeHandle; start: Point }
    | null = null

  function project(): Project {
    return options.getProject()
  }

  function projection(regionId: string): ReturnType<typeof projectEditableGeometryMapping> {
    const region = findMappingRegion(project(), regionId)
    if (!region) throw new Error(`Unknown Mapping Region: ${regionId}`)
    return projectEditableGeometryMapping(project().source, region.id)
  }

  function regionStates(): readonly MappingRegionRenderState[] {
    return project().source.mappingRegions.map(region => {
      const result = projectEditableGeometryMapping(project().source, region.id)
      return {
        region,
        screenName: findScreen(project(), region.screen)?.screen.name ?? region.screen,
        status: result.status === 'ready' ? 'complete' : diagnosticStatus(result.diagnostics),
      }
    })
  }

  function fit(): void {
    const input = project().source.inputCanvas
    const rect = canvas.getBoundingClientRect()
    if (!input || rect.width < 1 || rect.height < 1) {
      camera = { zoom: 1, offsetX: rect.width / 2, offsetY: rect.height / 2 }
      draw()
      return
    }
    camera = fitCamera({
      left: 0,
      top: 0,
      right: input.resolution.width,
      bottom: input.resolution.height,
      width: input.resolution.width,
      height: input.resolution.height,
    }, rect.width, rect.height)
    draw()
  }

  function draw(): void {
    if (!active) return
    drawMappingCanvas(canvas, project(), {
      inputCanvas: project().source.inputCanvas,
      regions: regionStates(),
      selectedRegionId,
      inspectedInput,
    }, camera)
    zoomStatus.textContent = `${Math.round(camera.zoom * 100)}%`
  }

  function mutate(run: () => Project, fallback: string): void {
    options.clearError()
    try {
      const next = run()
      options.updateProject(next)
      render()
    } catch (error) {
      options.showError(error, fallback)
    }
  }

  function selectedRegion(): MappingRegion | undefined {
    return selectedRegionId ? findMappingRegion(project(), selectedRegionId) : undefined
  }

  function selectedScreen(): ReturnType<typeof findScreen> {
    const region = selectedRegion()
    return findScreen(project(), region?.screen ?? selectedScreenId ?? '')
  }

  function selectScreen(screenId: string): void {
    selectedScreenId = screenId
    selectedRegionId = null
    inspectionRegionId = null
    inspectedInput = null
    reverseResult = null
    render()
  }

  function selectRegion(regionId: string): void {
    const region = findMappingRegion(project(), regionId)
    if (!region) return
    selectedScreenId = region.screen
    selectedRegionId = region.id
    inspectionRegionId = region.id
    reverseResult = null
    render()
  }

  function createRegion(): void {
    const screen = selectedScreen()
    if (!screen) return
    mutate(() => {
      const next = addMappingRegion(project(), screen.screen.id)
      selectedRegionId = next.source.mappingRegions[next.source.mappingRegions.length - 1]?.id ?? null
      inspectionRegionId = selectedRegionId
      return next
    }, 'Unable to create Mapping Region.')
  }

  function mapFromLayout(): void {
    const screen = selectedScreen()
    if (!screen) return
    mutate(() => {
      const next = mapFromLayoutPosition(project(), screen.screen.id, selectedRegionId ?? undefined)
      const target = selectedRegionId
        ? findMappingRegion(next, selectedRegionId)
        : next.source.mappingRegions.find(region => region.screen === screen.screen.id)
      selectedRegionId = target?.id ?? null
      inspectionRegionId = selectedRegionId
      return next
    }, 'Unable to map from Layout position.')
  }

  function removeRegion(): void {
    if (!selectedRegionId) return
    const regionId = selectedRegionId
    mutate(() => {
      const next = deleteMappingRegion(project(), regionId)
      selectedRegionId = null
      inspectionRegionId = null
      inspectedInput = null
      reverseResult = null
      return next
    }, 'Unable to delete Mapping Region.')
  }

  function renderTree(): void {
    tree.replaceChildren()
    for (const screen of project().screens) {
      const screenRegions = project().source.mappingRegions.filter(region => region.screen === screen.screen.id)
      const screenNode = document.createElement('button')
      screenNode.type = 'button'
      screenNode.className = 'mapping-tree-screen'
      screenNode.dataset['screenId'] = screen.screen.id
      screenNode.setAttribute('aria-pressed', String(selectedScreenId === screen.screen.id && !selectedRegionId))
      const label = document.createElement('span')
      label.textContent = screen.screen.name
      const target = document.createElement('small')
      target.textContent = `${screen.grid.id} · ${screen.screen.resolution.width} × ${screen.screen.resolution.height}`
      screenNode.append(label, target)
      screenNode.addEventListener('click', () => selectScreen(screen.screen.id))
      tree.append(screenNode)
      for (const region of screenRegions) {
        const state = regionStates().find(item => item.region.id === region.id)!
        const node = document.createElement('button')
        node.type = 'button'
        node.className = `mapping-tree-region status-${state.status}`
        node.dataset['regionId'] = region.id
        node.setAttribute('aria-pressed', String(selectedRegionId === region.id))
        const name = document.createElement('span')
        name.textContent = region.id
        const detail = document.createElement('small')
        detail.textContent = `${statusLabel(state.status)} · ${region.position.x}, ${region.position.y}`
        node.append(name, detail)
        node.addEventListener('click', () => selectRegion(region.id))
        tree.append(node)
      }
    }
  }

  function renderDiagnostics(): void {
    diagnostics.replaceChildren()
    const items: Array<{ label: string; status: MappingDiagnosticStatus; screenId?: string; regionId?: string }> = []
    if (!project().source.inputCanvas) items.push({ label: 'Input Canvas is not configured', status: 'incomplete' })
    if (project().screens.length === 0) items.push({ label: 'No Screens available from Layout', status: 'incomplete' })
    for (const screen of project().screens) {
      if (!project().source.mappingRegions.some(region => region.screen === screen.screen.id)) {
        items.push({ label: `${screen.screen.name}: no Mapping Region`, status: 'incomplete', screenId: screen.screen.id })
      }
    }
    for (const state of regionStates()) {
      if (state.status === 'complete') continue
      const result = projectEditableGeometryMapping(project().source, state.region.id)
      const message = result.status === 'incomplete' ? result.diagnostics[0]?.message : undefined
      items.push({
        label: `${state.screenName}: ${message ?? statusLabel(state.status)}`,
        status: state.status,
        regionId: state.region.id,
      })
    }
    if (items.length === 0) {
      const healthy = document.createElement('p')
      healthy.className = 'mapping-diagnostic-ok'
      healthy.textContent = 'Mapping complete'
      diagnostics.append(healthy)
      return
    }
    for (const item of items) {
      const button = document.createElement('button')
      button.type = 'button'
      button.className = `mapping-diagnostic status-${item.status}`
      button.textContent = item.label
      button.addEventListener('click', () => {
        if (item.regionId) selectRegion(item.regionId)
        else if (item.screenId) selectScreen(item.screenId)
        else widthInput.focus()
      })
      diagnostics.append(button)
    }
  }

  function commitRegion(regionId: string, patch: Parameters<typeof updateMappingRegion>[2]): void {
    mutate(() => updateMappingRegion(project(), regionId, patch), 'Unable to update Mapping Region.')
  }

  function geometryFields(region: MappingRegion): HTMLElement {
    const box = document.createElement('div')
    const definitions = [
      ['X', region.position.x, 'Mapping Region X', (value: number) => ({ x: value })],
      ['Y', region.position.y, 'Mapping Region Y', (value: number) => ({ y: value })],
      ['Width', region.size.width, 'Mapping Region Width', (value: number) => ({ width: value })],
      ['Height', region.size.height, 'Mapping Region Height', (value: number) => ({ height: value })],
    ] as const
    for (const [label, value, aria, patch] of definitions) {
      box.append(row(label, numberInput(value, aria, next => commitRegion(region.id, patch(next)))))
    }
    return box
  }

  function forwardPixel(regionId: string, point: Point): GeometryMappedPixel {
    const result = projection(regionId)
    if (result.status !== 'ready') throw new Error(result.diagnostics[0]?.message ?? 'Mapping geometry is incomplete.')
    const input = project().source.inputCanvas
    if (!input) throw new Error('Input Canvas is not configured.')
    return inspectGeometryInputPixel(result.mapping, {
      inputCanvas: input.id,
      inputCoordinate: point,
    }, projectEditableHardwareMapping(project().source)).geometry
  }

  function inspectionRows(pixel: GeometryMappedPixel): HTMLElement {
    const box = document.createElement('div')
    const screen = selectedScreen()
    box.append(
      row('Input X/Y', `${pixel.inputCoordinate.x}, ${pixel.inputCoordinate.y}`),
      row('Screen', screen?.screen.name ?? 'Unknown'),
      row('Screen X/Y', `${pixel.screenCoordinate.x}, ${pixel.screenCoordinate.y}`),
      row('Cabinet', pixel.cabinet),
      row('Cabinet X/Y', `${pixel.cabinetCoordinate.x}, ${pixel.cabinetCoordinate.y}`),
      row('Module', pixel.module),
      row('Module X/Y', `${pixel.moduleCoordinate.x}, ${pixel.moduleCoordinate.y}`),
    )
    const hardware = projectEditableHardwareMapping(project().source)
    box.append(row('Hardware', hardware.status === 'ready' ? 'Configured' : 'Not configured'))
    return box
  }

  function reverseInspector(mapping: ResolvedGeometryMapping): HTMLElement {
    const box = document.createElement('div')
    const mode = selectInput('Reverse lookup mode', [
      { value: 'module', label: 'Module pixel' },
      { value: 'cabinet', label: 'Cabinet pixel' },
    ], reverseMode)
    mode.addEventListener('change', () => {
      reverseMode = mode.value as ReverseMode
      reverseResult = null
      renderInspector()
    })
    const cabinets = mapping.cells.map(cell => ({ value: cell.cabinet, label: cell.cabinet }))
    if (!mapping.cells.some(cell => cell.cabinet === reverseCabinet)) reverseCabinet = mapping.cells[0]?.cabinet ?? ''
    const cabinet = selectInput('Reverse Cabinet', cabinets, reverseCabinet)
    cabinet.addEventListener('change', () => {
      reverseCabinet = cabinet.value
      reverseModule = ''
      reverseResult = null
      renderInspector()
    })
    box.append(row('Source', mode), row('Cabinet', cabinet))
    const cell = mapping.cells.find(candidate => candidate.cabinet === reverseCabinet)
    if (reverseMode === 'module' && cell) {
      if (!cell.moduleIds.includes(asModuleId(reverseModule))) reverseModule = cell.moduleIds[0] ?? ''
      const module = selectInput('Reverse Module', cell.moduleIds.map(id => ({ value: id, label: id })), reverseModule)
      module.addEventListener('change', () => {
        reverseModule = module.value
        reverseResult = null
      })
      box.append(row('Module', module))
    }
    box.append(
      row('Pixel X', numberInput(reverseX, 'Reverse pixel X', value => { reverseX = value })),
      row('Pixel Y', numberInput(reverseY, 'Reverse pixel Y', value => { reverseY = value })),
    )
    const locate = action('Locate on Input Canvas', () => {
      options.clearError()
      try {
        reverseResult = reverseMode === 'module'
          ? unmapGeometryModulePixel(mapping, {
              cabinet: asCabinetId(reverseCabinet),
              module: asModuleId(reverseModule),
              coordinate: { x: reverseX, y: reverseY },
            })
          : unmapGeometryCabinetPixel(mapping, {
              cabinet: asCabinetId(reverseCabinet),
              coordinate: { x: reverseX, y: reverseY },
            })
        inspectedInput = reverseResult.inputCoordinate
        inspectionRegionId = selectedRegionId
        renderInspector()
        draw()
      } catch (error) {
        options.showError(error, 'Unable to reverse-map pixel.')
      }
    })
    locate.className = 'wide-action'
    box.append(locate)
    if (reverseResult) box.append(row('Input X/Y', `${reverseResult.inputCoordinate.x}, ${reverseResult.inputCoordinate.y}`))
    return box
  }

  function renderInspector(): void {
    properties.replaceChildren()
    const region = selectedRegion()
    const screen = selectedScreen()
    if (!region) {
      title.textContent = screen ? 'Screen target' : 'Mapping'
      if (!screen) {
        const hint = document.createElement('p')
        hint.className = 'hint'
        hint.textContent = project().screens.length === 0
          ? 'Create Screens in Layout before mapping.'
          : 'Select a Screen or Mapping Region.'
        properties.append(hint)
        return
      }
      const target = document.createElement('div')
      target.append(
        row('Screen', screen.screen.name),
        row('Grid', screen.grid.id),
        row('Resolution', `${screen.screen.resolution.width} × ${screen.screen.resolution.height} px`),
      )
      const buttons = document.createElement('div')
      buttons.className = 'inspector-actions'
      buttons.append(action('Create Region', createRegion, !project().source.inputCanvas), action('Map from Layout', mapFromLayout, !project().source.inputCanvas))
      properties.append(group('Target', target), buttons)
      return
    }
    title.textContent = 'Mapping Region'
    const result = projection(region.id)
    const state = result.status === 'ready' ? 'complete' : diagnosticStatus(result.diagnostics)
    const identity = document.createElement('div')
    identity.append(
      row('Identity', region.id),
      row('Target Screen', screen?.screen.name ?? region.screen),
      row('Target Grid', region.grid),
      row('Status', statusLabel(state)),
    )
    const actions = document.createElement('div')
    actions.className = 'inspector-actions'
    actions.append(action('Map from Layout', mapFromLayout), action('Delete Region', removeRegion))
    properties.append(group('Region', identity), group('Source rectangle', geometryFields(region)), actions)
    if (result.status !== 'ready') {
      const error = document.createElement('button')
      error.type = 'button'
      error.className = `mapping-diagnostic status-${state}`
      error.textContent = result.diagnostics[0]?.message ?? 'Mapping geometry is incomplete.'
      error.addEventListener('click', () => selectRegion(region.id))
      properties.append(group('Diagnostic', error))
      return
    }
    let inspected: GeometryMappedPixel | null = null
    if (inspectedInput && inspectionRegionId === region.id) {
      try {
        inspected = forwardPixel(region.id, inspectedInput)
      } catch (error) {
        if (!(error instanceof DomainError)) throw error
      }
    }
    if (inspected) properties.append(group('Geometry Pixel Inspector', inspectionRows(inspected)))
    else {
      const hint = document.createElement('p')
      hint.className = 'hint'
      hint.textContent = 'Hover or click a pixel inside this Region to inspect its geometry path.'
      properties.append(group('Geometry Pixel Inspector', hint))
    }
    properties.append(group('Reverse lookup', reverseInspector(result.mapping)))
  }

  function renderStatus(): void {
    const input = project().source.inputCanvas
    widthInput.value = String(input?.resolution.width ?? 1920)
    heightInput.value = String(input?.resolution.height ?? 1080)
    const screen = selectedScreen()
    selectionChip.textContent = selectedRegionId
      ? `${selectedRegionId} selected`
      : screen ? `${screen.screen.name} target` : 'No selection'
    createRegionButton.disabled = !input || !screen
    layoutPositionButton.disabled = !input || !screen
    deleteRegionButton.disabled = !selectedRegionId
    empty.hidden = input !== null
    canvas.hidden = input === null
    const states = regionStates()
    const complete = new Set(states.filter(state => state.status === 'complete').map(state => state.region.screen)).size
    healthStatus.textContent = input
      ? `${complete}/${project().screens.length} Screens mapped`
      : 'Input Canvas not configured'
  }

  function render(): void {
    if (!selectedScreenId || !findScreen(project(), selectedScreenId)) {
      selectedScreenId = project().screens[0]?.screen.id ?? null
    }
    if (selectedRegionId && !findMappingRegion(project(), selectedRegionId)) selectedRegionId = null
    renderTree()
    renderDiagnostics()
    renderInspector()
    renderStatus()
    draw()
  }

  function configureInput(): void {
    mutate(() => setInputCanvasResolution(project(), Number(widthInput.value), Number(heightInput.value)), 'Unable to configure Input Canvas.')
    fit()
  }

  function viewportPoint(event: PointerEvent): Point {
    const rect = canvas.getBoundingClientRect()
    return { x: event.clientX - rect.left, y: event.clientY - rect.top }
  }

  function sourcePoint(event: PointerEvent): Point {
    return toProject(camera, viewportPoint(event))
  }

  function mappingCursor(handle: MappingResizeHandle | null, overRegion: boolean): string {
    if (handle === 'n' || handle === 's') return 'ns-resize'
    if (handle === 'e' || handle === 'w') return 'ew-resize'
    if (handle === 'nw' || handle === 'se') return 'nwse-resize'
    if (handle === 'ne' || handle === 'sw') return 'nesw-resize'
    return overRegion ? 'move' : 'crosshair'
  }

  function inspectAt(point: Point, regionId: string | null): void {
    const input = project().source.inputCanvas
    if (!input) return
    const pixel = { x: Math.floor(point.x), y: Math.floor(point.y) }
    if (pixel.x < 0 || pixel.y < 0 || pixel.x >= input.resolution.width || pixel.y >= input.resolution.height) return
    if (
      inspectedInput?.x === pixel.x && inspectedInput.y === pixel.y &&
      inspectionRegionId === regionId
    ) return
    inspectedInput = pixel
    inspectionRegionId = regionId
    if (selectedRegionId === regionId) renderInspector()
    draw()
  }

  applyInputButton.addEventListener('click', configureInput)
  createRegionButton.addEventListener('click', createRegion)
  layoutPositionButton.addEventListener('click', mapFromLayout)
  deleteRegionButton.addEventListener('click', removeRegion)
  fitButton.addEventListener('click', fit)
  actualButton.addEventListener('click', () => {
    const rect = canvas.getBoundingClientRect()
    const center = toProject(camera, { x: rect.width / 2, y: rect.height / 2 })
    camera = { zoom: 1, offsetX: rect.width / 2 - center.x, offsetY: rect.height / 2 - center.y }
    draw()
  })
  zoomInButton.addEventListener('click', () => {
    const rect = canvas.getBoundingClientRect()
    camera = zoomAt(camera, { x: rect.width / 2, y: rect.height / 2 }, 1.2)
    draw()
  })
  zoomOutButton.addEventListener('click', () => {
    const rect = canvas.getBoundingClientRect()
    camera = zoomAt(camera, { x: rect.width / 2, y: rect.height / 2 }, 1 / 1.2)
    draw()
  })

  canvas.addEventListener('pointerdown', event => {
    const pointPx = viewportPoint(event)
    const point = sourcePoint(event)
    if (event.button === 1 || spaceDown) {
      gesture = { type: 'pan', x: pointPx.x, y: pointPx.y }
      canvas.classList.add('dragging')
      canvas.setPointerCapture(event.pointerId)
      event.preventDefault()
      return
    }
    if (event.button !== 0) return
    const current = selectedRegion()
    const handle = current ? hitMappingResizeHandle(current, pointPx, camera) : null
    if (current && handle) {
      gesture = { type: 'resize', region: current, handle, start: point }
      canvas.classList.add('dragging')
      canvas.setPointerCapture(event.pointerId)
      return
    }
    const hit = hitMappingRegion(project().source.mappingRegions, point)
    if (!hit) {
      selectedRegionId = null
      inspectionRegionId = null
      render()
      return
    }
    if (selectedRegionId !== hit.id) selectRegion(hit.id)
    inspectAt(point, hit.id)
    gesture = { type: 'drag', regionId: hit.id, start: point, x: hit.position.x, y: hit.position.y }
    canvas.classList.add('dragging')
    canvas.setPointerCapture(event.pointerId)
  })

  canvas.addEventListener('pointermove', event => {
    const pointPx = viewportPoint(event)
    const point = sourcePoint(event)
    cursorStatus.textContent = `Input X ${Math.floor(point.x)} · Y ${Math.floor(point.y)}`
    if (gesture?.type === 'pan') {
      camera = {
        ...camera,
        offsetX: camera.offsetX + pointPx.x - gesture.x,
        offsetY: camera.offsetY + pointPx.y - gesture.y,
      }
      gesture = { type: 'pan', x: pointPx.x, y: pointPx.y }
      draw()
      return
    }
    if (gesture?.type === 'drag') {
      const x = Math.max(0, Math.round(gesture.x + point.x - gesture.start.x))
      const y = Math.max(0, Math.round(gesture.y + point.y - gesture.start.y))
      const region = findMappingRegion(project(), gesture.regionId)
      if (region && (region.position.x !== x || region.position.y !== y)) {
        options.updateProject(updateMappingRegion(project(), gesture.regionId, { x, y }))
        render()
      }
      return
    }
    if (gesture?.type === 'resize') {
      const geometry = resizeMappingRegion(gesture.region, gesture.handle, point.x - gesture.start.x, point.y - gesture.start.y)
      const current = findMappingRegion(project(), gesture.region.id)
      if (current && (
        current.position.x !== geometry.x || current.position.y !== geometry.y ||
        current.size.width !== geometry.width || current.size.height !== geometry.height
      )) {
        options.updateProject(updateMappingRegion(project(), current.id, geometry))
        render()
      }
      return
    }
    const hit = hitMappingRegion(project().source.mappingRegions, point)
    const current = selectedRegion()
    const handle = current ? hitMappingResizeHandle(current, pointPx, camera) : null
    canvas.style.cursor = mappingCursor(handle, hit !== null)
    inspectAt(point, hit?.id ?? null)
  })

  function finishPointer(event: PointerEvent): void {
    gesture = null
    canvas.classList.remove('dragging')
    if (canvas.hasPointerCapture(event.pointerId)) canvas.releasePointerCapture(event.pointerId)
  }

  canvas.addEventListener('pointerup', finishPointer)
  canvas.addEventListener('pointercancel', finishPointer)
  canvas.addEventListener('wheel', event => {
    event.preventDefault()
    if (event.ctrlKey) camera = zoomAt(camera, { x: event.offsetX, y: event.offsetY }, Math.exp(-event.deltaY * .002))
    else camera = { ...camera, offsetX: camera.offsetX - event.deltaX, offsetY: camera.offsetY - event.deltaY }
    draw()
  }, { passive: false })

  window.addEventListener('keydown', event => {
    if (!active || event.target instanceof HTMLInputElement || event.target instanceof HTMLSelectElement) return
    if (event.code === 'Space') {
      spaceDown = true
      event.preventDefault()
    }
    if ((event.key === 'Delete' || event.key === 'Backspace') && selectedRegionId) {
      removeRegion()
      event.preventDefault()
    }
  })
  window.addEventListener('keyup', event => {
    if (event.code === 'Space') spaceDown = false
  })
  window.addEventListener('resize', () => { if (active) draw() })

  const hook: MappingTestHook = {
    dump: () => {
      const inputCanvas = project().source.inputCanvas
      return {
        inputCanvas: inputCanvas ? { ...inputCanvas.resolution } : null,
        regions: regionStates().map(state => ({
          id: state.region.id,
          screen: state.region.screen,
          grid: state.region.grid,
          x: state.region.position.x,
          y: state.region.position.y,
          width: state.region.size.width,
          height: state.region.size.height,
          status: state.status,
        })),
      }
    },
    camera: () => ({ ...camera }),
    forward: (regionId, x, y) => pixelDump(forwardPixel(regionId, { x, y })),
    reverseModule: (regionId, cabinet, module, x, y) => {
      const result = projection(regionId)
      if (result.status !== 'ready') throw new Error(result.diagnostics[0]?.message ?? 'Mapping geometry is incomplete.')
      return pixelDump(unmapGeometryModulePixel(result.mapping, {
        cabinet: asCabinetId(cabinet),
        module: asModuleId(module),
        coordinate: { x, y },
      }))
    },
  }
  ;(window as Window & { __ledmapMapping?: MappingTestHook }).__ledmapMapping = hook

  return {
    activate: () => {
      active = true
      render()
      requestAnimationFrame(fit)
    },
    deactivate: () => { active = false },
    projectChanged: render,
  }
}
