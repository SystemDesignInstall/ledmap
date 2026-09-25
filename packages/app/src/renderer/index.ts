import {
  createDemoProject, findScreen, hitTest, moveScreen, projectBounds, screenBounds,
  screenHeight, screenWidth, setScreenPosition, type Project, type ScreenView, type SelectedObject,
} from './project.js'
import { addScreen } from './project.js'
import type { Point } from './canvas.js'
import {
  cabinetLabelHit, drawProject, fitCamera, screenBoundaryHit, toProject, toScreen, zoomAt, type Camera,
} from './canvas.js'
import type { Direction } from '@ledmap/core'

interface LedmapHook {
  dump(): ReadonlyArray<{
    readonly id: string
    readonly name: string
    readonly x: number
    readonly y: number
    readonly width: number
    readonly height: number
    readonly columns: number
    readonly rows: number
    readonly cabinets: ReadonlyArray<{ readonly id: string; readonly index: number; readonly column: number; readonly row: number }>
    readonly order: readonly number[]
  }>
  bounds(): { readonly width: number; readonly height: number; readonly left: number; readonly top: number; readonly right: number; readonly bottom: number }
  camera(): { readonly zoom: number; readonly offsetX: number; readonly offsetY: number }
  selection(): SelectedObject | null
  viewMode(): 'all' | 'active'
  screenCenterPx(id: string): Point
  projectToPx(point: Point): Point
}

function element<T extends HTMLElement>(id: string): T {
  const found = document.getElementById(id)
  if (!found) throw new Error(`Missing element: ${id}`)
  return found as T
}

const canvas = element<HTMLCanvasElement>('project-canvas')
const viewport = element<HTMLDivElement>('viewport')
const tree = element<HTMLDivElement>('project-tree')
const properties = element<HTMLDivElement>('properties')
const chip = element<HTMLSpanElement>('selection-chip')
const bounds = element<HTMLSpanElement>('bounds')
const zoomIndicator = element<HTMLSpanElement>('zoom-indicator')
const canvasNote = element<HTMLSpanElement>('canvas-note')
const canvasTitle = element<HTMLHeadingElement>('canvas-title')
const empty = element<HTMLDivElement>('empty')
const toggleMode = element<HTMLButtonElement>('toggle-mode')
const fitProject = element<HTMLButtonElement>('fit-project')
const addScreenButton = element<HTMLButtonElement>('add-screen')

let project: Project = createDemoProject()
let viewMode: 'all' | 'active' = 'all'
let selection: SelectedObject | null = null
let activeScreenId: string | null = project.screens[0]?.screen.id ?? null
let camera: Camera = fitCamera(projectBounds(project), 1, 1)
let spaceDown = false
type PointerMode = 'none' | 'drag' | 'pan'
let pointerMode: PointerMode = 'none'
let dragState: { screenId: string; lastProject: Point } | null = null
let panState: { lastX: number; lastY: number } | null = null

const format = new Intl.NumberFormat('en-US')

function directionLabel(direction: Direction): string {
  const labels: Record<Direction, string> = {
    'left-to-right': 'Left → Right',
    'right-to-left': 'Right → Left',
    'top-to-bottom': 'Top → Bottom',
    'bottom-to-top': 'Bottom → Top',
  }
  return labels[direction]
}

function orderingSummary(screen: ScreenView): string {
  const { ordering } = screen.grid
  const numbering = ordering.numbering === 'row' ? 'Row' : 'Column'
  return `${numbering} · ${directionLabel(ordering.direction)} · Snake ${ordering.snake ? 'ON' : 'OFF'}`
}

function apply(next: Project): void {
  project = next
}

function render(): void {
  renderTree()
  renderProperties()
  renderStatus()
  draw()
}

function draw(): void {
  const note = drawProject(canvas, project, { mode: viewMode, selection, activeScreenId }, camera)
  const b = projectBounds(project)
  bounds.textContent = `Project bounds ${format.format(b.width)} × ${format.format(b.height)} px`
  zoomIndicator.textContent = `${Math.round(camera.zoom * 100)}%`
  canvasNote.textContent = note
  const active = activeScreenId ? findScreen(project, activeScreenId) : undefined
  canvasTitle.textContent = viewMode === 'all' ? 'All Screens' : active ? active.screen.name : 'Active Screen'
  const summaries = project.screens.map(s => `${s.screen.name} at ${s.x}, ${s.y}`).join('; ')
  canvas.setAttribute('aria-label', `Project canvas. ${project.screens.length} screens. ${summaries}.`)
  const hidden = project.screens.length === 0
  canvas.hidden = hidden
  empty.hidden = !hidden
  toggleMode.disabled = project.screens.length === 0
}

function fitTo(b: { left: number; top: number; right: number; bottom: number; width: number; height: number }): void {
  const { width, height } = canvas.getBoundingClientRect()
  camera = fitCamera({ left: b.left, top: b.top, right: b.right, bottom: b.bottom, width: b.width, height: b.height }, width, height)
  draw()
}

function fitToProject(): void {
  const active = activeScreenId ? findScreen(project, activeScreenId) : undefined
  if (viewMode === 'all') fitTo(projectBounds(project))
  else if (active) fitTo(screenBounds(active))
}

function chipText(): string {
  const current = selection
  if (!current) return 'No selection'
  const screen = current.type === 'cabinet' ? findScreen(project, current.screenId) : (
    current.type === 'screen' ? findScreen(project, current.id) : findScreenByGrid(current.id)
  )
  const suffix = screen ? ` · ${screen.screen.name}` : ''
  if (current.type === 'screen') return `${screen?.screen.name ?? 'Screen'} selected`
  if (current.type === 'cabinetGrid') return `Cabinet Grid${suffix}`
  const cabinet = screen?.cabinets.find(c => c.id === current.id)
  return `${current.id}${cabinet ? ` · #${cabinet.index + 1}` : ''}${suffix}`
}

function findScreenByGrid(gridId: string): ScreenView | undefined {
  return project.screens.find(s => s.grid.id === gridId)
}

function renderStatus(): void {
  chip.textContent = chipText()
  toggleMode.textContent = viewMode === 'all' ? 'Active Screen' : 'All Screens'
  toggleMode.setAttribute('aria-pressed', String(viewMode === 'active'))
}

function renderTree(): void {
  tree.replaceChildren()
  const root = document.createElement('div')
  root.className = 'tree-root'
  root.textContent = 'PROJECT'
  tree.append(root)
  const screensLabel = document.createElement('div')
  screensLabel.className = 'tree-node'
  screensLabel.innerHTML = ''
  const screenIcon = document.createElement('span')
  screenIcon.className = 'tree-icon'
  screenIcon.textContent = '▦'
  const screenText = document.createElement('span')
  screenText.textContent = `Screens (${project.screens.length})`
  const screenCount = document.createElement('span')
  screenCount.className = 'count'
  screenCount.textContent = format.format(project.screens.length)
  screensLabel.append(screenIcon, screenText, screenCount)
  tree.append(screensLabel)
  const group = document.createElement('div')
  group.className = 'tree-group'
  for (const screen of project.screens) {
    const node = makeTreeNode('screen', screen.screen.id, screen.screen.name, '▦', format.format(screen.cabinets.length), isSelected('screen', screen.screen.id))
    node.addEventListener('click', () => selectScreen(screen.screen.id))
    group.append(node)
    const gridNode = makeTreeNode('cabinetGrid', screen.grid.id, 'Cabinet Grid', '▣', format.format(screen.cabinets.length), isSelected('cabinetGrid', screen.grid.id))
    gridNode.addEventListener('click', () => {
      selection = { type: 'cabinetGrid', id: screen.grid.id }
      activeScreenId = screen.screen.id
      render()
    })
    const gridGroup = document.createElement('div')
    gridGroup.className = 'tree-group'
    gridGroup.append(gridNode)
    group.append(gridGroup)
  }
  tree.append(group)
}

function isSelected(type: SelectedObject['type'], id: string): boolean {
  if (!selection || selection.type !== type) return false
  return selection.id === id
}

function makeTreeNode(type: SelectedObject['type'], id: string, label: string, icon: string, count: string, selected: boolean): HTMLDivElement {
  const node = document.createElement('div')
  node.className = 'tree-node'
  node.dataset.type = type
  node.dataset.id = id
  node.setAttribute('role', 'treeitem')
  node.setAttribute('aria-selected', String(selected))
  const glyph = document.createElement('span')
  glyph.className = type === 'screen' ? 'tree-icon' : 'tree-icon grid'
  glyph.textContent = icon
  const text = document.createElement('span')
  text.textContent = label
  const counter = document.createElement('span')
  counter.className = 'count'
  counter.textContent = count
  node.append(glyph, text, counter)
  return node
}

function selectScreen(screenId: string): void {
  selection = { type: 'screen', id: screenId }
  activeScreenId = screenId
  render()
}

function renderProperties(): void {
  properties.replaceChildren()
  const title = element<HTMLHeadingElement>('properties-title')
  if (!selection) {
    title.textContent = 'Nothing selected'
    const hint = document.createElement('p')
    hint.className = 'hint'
    hint.textContent = 'Select a Screen, a Cabinet Grid or a Cabinet on the canvas or in the project tree.'
    properties.append(hint)
    return
  }
  if (selection.type === 'screen') {
    const screen = findScreen(project, selection.id)
    if (screen) renderScreenProperties(screen)
    return
  }
  if (selection.type === 'cabinetGrid') {
    const screen = findScreenByGrid(selection.id)
    if (screen) renderGridProperties(screen)
    return
  }
  const screen = findScreen(project, selection.screenId)
  if (screen) renderCabinetProperties(screen)
}

function group(title: string, container: HTMLDivElement): HTMLDivElement {
  const section = document.createElement('div')
  section.className = 'property-group'
  const heading = document.createElement('h3')
  heading.textContent = title
  section.append(heading, container)
  return section
}

function propertyRow(label: string, valueNode: HTMLElement): HTMLDivElement {
  const row = document.createElement('div')
  row.className = 'property'
  const labelNode = document.createElement('label')
  labelNode.textContent = label
  row.append(labelNode, valueNode)
  return row
}

function valueNode(text: string): HTMLElement {
  const node = document.createElement('span')
  node.className = 'value'
  node.textContent = text
  return node
}

function numberField(initial: number, ariaLabel: string, onCommit: (value: number) => void): HTMLInputElement {
  const input = document.createElement('input')
  input.type = 'number'
  input.value = String(initial)
  input.setAttribute('aria-label', ariaLabel)
  input.addEventListener('change', () => {
    const raw = input.value.trim()
    const value = Number(raw)
    if (!raw || !Number.isFinite(value)) {
      input.setAttribute('aria-invalid', 'true')
      return
    }
    input.removeAttribute('aria-invalid')
    onCommit(value)
  })
  return input
}

function renderScreenProperties(screen: ScreenView): void {
  element<HTMLHeadingElement>('properties-title').textContent = 'Screen'
  const container = document.createElement('div')
  container.className = 'properties-body'
  const name = document.createElement('div')
  name.className = 'property'
  const nameLabel = document.createElement('label')
  nameLabel.textContent = 'Name'
  const nameValue = valueNode(screen.screen.name)
  name.append(nameLabel, nameValue)
  container.append(name)

  const positionBox = document.createElement('div')
  const xInput = numberField(screen.x, 'Screen X position', value => {
    apply(setScreenPosition(project, screen.screen.id, value, screen.y))
    render()
  })
  const yInput = numberField(screen.y, 'Screen Y position', value => {
    apply(setScreenPosition(project, screen.screen.id, screen.x, value))
    render()
  })
  positionBox.append(
    propertyRow('X', xInput),
    propertyRow('Y', yInput),
  )
  container.append(group('Position', positionBox))

  const sizeBox = document.createElement('div')
  sizeBox.append(
    propertyRow('Width', valueNode(`${format.format(screenWidth(screen))} px`)),
    propertyRow('Height', valueNode(`${format.format(screenHeight(screen))} px`)),
  )
  container.append(group('Size (from grid)', sizeBox))

  const gridBox = document.createElement('div')
  gridBox.append(
    propertyRow('Columns', valueNode(format.format(screen.grid.columns))),
    propertyRow('Rows', valueNode(format.format(screen.grid.rows))),
    propertyRow('Cabinets', valueNode(format.format(screen.cabinets.length))),
  )
  container.append(group('Cabinet Grid', gridBox))
  properties.append(container)
}

function renderGridProperties(screen: ScreenView): void {
  element<HTMLHeadingElement>('properties-title').textContent = 'Cabinet Grid'
  const container = document.createElement('div')
  container.className = 'properties-body'
  const box = document.createElement('div')
  box.append(
    propertyRow('Name', valueNode(screen.grid.name)),
    propertyRow('Screen', valueNode(screen.screen.name)),
    propertyRow('Columns', valueNode(format.format(screen.grid.columns))),
    propertyRow('Rows', valueNode(format.format(screen.grid.rows))),
    propertyRow('Cabinets', valueNode(format.format(screen.cabinets.length))),
    propertyRow('Cabinet size', valueNode(`${format.format(screen.grid.cabinetWidth)} × ${format.format(screen.grid.cabinetHeight)} px`)),
    propertyRow('Ordering', valueNode(orderingSummary(screen))),
  )
  container.append(group('Grid', box))
  properties.append(container)
}

function renderCabinetProperties(screen: ScreenView): void {
  const current = selection
  if (current?.type !== 'cabinet') return
  const cabinet = screen.cabinets.find(c => c.id === current.id)
  if (!cabinet) return
  element<HTMLHeadingElement>('properties-title').textContent = 'Cabinet'
  const container = document.createElement('div')
  container.className = 'properties-body'
  const box = document.createElement('div')
  box.append(
    propertyRow('Physical ID', valueNode(cabinet.id)),
    propertyRow('Logical order', valueNode(`#${cabinet.index + 1}`)),
    propertyRow('Position', valueNode(`Column ${cabinet.column + 1} · Row ${cabinet.row + 1}`)),
    propertyRow('Screen', valueNode(screen.screen.name)),
  )
  container.append(group('Cabinet', box))
  properties.append(container)
}

function viewportPoint(event: { offsetX: number; offsetY: number }): { x: number; y: number } {
  return { x: event.offsetX, y: event.offsetY }
}

canvas.addEventListener('pointerdown', event => {
  if (event.button === 1) {
    event.preventDefault()
    pointerMode = 'pan'
    panState = { lastX: event.offsetX, lastY: event.offsetY }
    canvas.setPointerCapture(event.pointerId)
    return
  }
  if (event.button !== 0) return
  if (spaceDown) {
    pointerMode = 'pan'
    panState = { lastX: event.offsetX, lastY: event.offsetY }
    canvas.setPointerCapture(event.pointerId)
    return
  }
  const px = viewportPoint(event)
  const projectPoint = toProject(camera, px)
  const hit = hitTest(project, projectPoint)
  canvas.classList.add('dragging')
  if (hit) {
    activeScreenId = hit.screen.screen.id
    if (hit.cabinet && cabinetLabelHit(camera, hit.screen, hit.cabinet, px)) {
      selection = { type: 'cabinet', id: hit.cabinet.id, screenId: hit.screen.screen.id }
    } else if (screenBoundaryHit(camera, hit.screen, px)) {
      selection = { type: 'screen', id: hit.screen.screen.id }
    } else {
      selection = hit.cabinet
        ? { type: 'cabinet', id: hit.cabinet.id, screenId: hit.screen.screen.id }
        : { type: 'screen', id: hit.screen.screen.id }
    }
    pointerMode = 'drag'
    dragState = { screenId: hit.screen.screen.id, lastProject: projectPoint }
    canvas.setPointerCapture(event.pointerId)
  } else {
    selection = null
  }
  render()
})

canvas.addEventListener('pointermove', event => {
  if (pointerMode === 'pan' && panState) {
    camera = { ...camera, offsetX: camera.offsetX + event.offsetX - panState.lastX, offsetY: camera.offsetY + event.offsetY - panState.lastY }
    panState = { lastX: event.offsetX, lastY: event.offsetY }
    draw()
    return
  }
  if (pointerMode === 'drag' && dragState) {
    const px = viewportPoint(event)
    const projectPoint = toProject(camera, px)
    const dx = projectPoint.x - dragState.lastProject.x
    const dy = projectPoint.y - dragState.lastProject.y
    dragState.lastProject = projectPoint
    project = moveScreen(project, dragState.screenId, dx, dy)
    const moved = findScreen(project, dragState.screenId)
    if (moved) selection = { type: 'screen', id: moved.screen.id }
    render()
  }
})

canvas.addEventListener('pointerup', () => {
  pointerMode = 'none'
  dragState = null
  panState = null
  canvas.classList.remove('dragging')
})

canvas.addEventListener('pointercancel', () => {
  pointerMode = 'none'
  dragState = null
  panState = null
  canvas.classList.remove('dragging')
})

canvas.addEventListener('wheel', event => {
  event.preventDefault()
  const px = viewportPoint(event)
  if (event.ctrlKey || event.metaKey) {
    camera = zoomAt(camera, px, Math.exp(-event.deltaY * .0015))
  } else {
    camera = { ...camera, offsetX: camera.offsetX - event.deltaX, offsetY: camera.offsetY - event.deltaY }
  }
  draw()
}, { passive: false })

toggleMode.addEventListener('click', () => {
  if (viewMode === 'all') {
    viewMode = 'active'
    if (!activeScreenId) {
      const first = project.screens[0]
      if (first) activeScreenId = first.screen.id
    }
    const active = activeScreenId ? findScreen(project, activeScreenId) : undefined
    if (active) fitTo(screenBounds(active))
  } else {
    viewMode = 'all'
    fitToProject()
  }
  renderStatus()
})

fitProject.addEventListener('click', () => {
  fitToProject()
  renderStatus()
})

addScreenButton.addEventListener('click', () => {
  const next = addScreen(project)
  const fresh = next.screens[next.screens.length - 1]
  if (!fresh) return
  project = next
  selection = { type: 'screen', id: fresh.screen.id }
  activeScreenId = fresh.screen.id
  if (project.screens.length === 1) {
    viewMode = 'all'
    fitToProject()
  } else if (viewMode === 'all') {
    fitToProject()
  } else {
    fitTo(screenBounds(fresh))
  }
  render()
})

window.addEventListener('keydown', event => {
  if (event.code === 'Space' && document.activeElement?.tagName !== 'INPUT') {
    spaceDown = true
    canvas.classList.add('space-grab')
    event.preventDefault()
  }
  if (event.key === 'Escape') {
    selection = null
    render()
  }
})

window.addEventListener('keyup', event => {
  if (event.code === 'Space') {
    spaceDown = false
    canvas.classList.remove('space-grab')
  }
})

function fitOnFirstPaint(): void {
  const { width, height } = canvas.getBoundingClientRect()
  if (width > 0 && height > 0) {
    camera = fitCamera(projectBounds(project), width, height)
    draw()
  }
}

new ResizeObserver(fitOnFirstPaint).observe(viewport)
window.addEventListener('resize', draw)

function watchPixelRatio(): void {
  const query = window.matchMedia(`(resolution: ${window.devicePixelRatio}dppx)`)
  query.addEventListener('change', () => {
    draw()
    watchPixelRatio()
  }, { once: true })
}

watchPixelRatio()
fitOnFirstPaint()
render()

const hook: LedmapHook = {
  dump: () => project.screens.map(s => ({
    id: s.screen.id,
    name: s.screen.name,
    x: s.x,
    y: s.y,
    width: screenWidth(s),
    height: screenHeight(s),
    columns: s.grid.columns,
    rows: s.grid.rows,
    cabinets: s.cabinets.map(c => ({ id: c.id, index: c.index, column: c.column, row: c.row })),
    order: s.cabinets.map(c => c.index + 1),
  })),
  bounds: () => projectBounds(project),
  camera: () => ({ ...camera }),
  selection: () => selection,
  viewMode: () => viewMode,
  screenCenterPx: id => {
    const screen = findScreen(project, id)
    if (!screen) return { x: 0, y: 0 }
    const center = { x: screen.x + screenWidth(screen) / 2, y: screen.y + screenHeight(screen) / 2 }
    return toScreen(camera, center)
  },
  projectToPx: point => toScreen(camera, point),
}

;(window as unknown as { __ledmap: LedmapHook }).__ledmap = hook
