import {
  createDemoProject, findScreen, hitTest, maxColumnsForRows, maxRowsForColumns, moveScreens, projectBounds,
  removeScreens, duplicateScreens, screensInRect, screenBounds, screenHeight, screenWidth, setScreenPosition, updateScreenCabinetConfig,
  type Bounds, type Project, type ScreenView, type SelectedObject,
} from './project.js'
import {
  applyBoxSelection, emptySelection, groupActionBlocker, repairSelection,
  selectSingle, selectedScreenIds, toggleSelection,
  type SelectionState,
} from './selection.js'
import {
  addGuide, alignScreens, distributeScreens, guideHit, moveGuide, removeGuide,
  screenSnapTargets, setGuideLocked, snapDelta, snapGrid,
  type AlignMode, type DistributeAxis, type Guide, type SnapCategory, type SnapLines, type SnapTarget,
} from './productivity.js'
import { addScreen } from './project.js'
import type { GridShape, Point, ResizeHandle, ResizePreview } from './canvas.js'
import {
  cabinetLabelHit, drawProject, fitCamera, resizeHandleCursor, resizeHandleHit,
  screenResizeHandles, screenShape, toProject, toScreen, zoomAt, type Camera,
} from './canvas.js'
import type { ScreenId } from '@ledmap/core'

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
    readonly locked: boolean
    readonly cabinets: ReadonlyArray<{ readonly id: string; readonly index: number; readonly column: number; readonly row: number }>
    readonly order: readonly number[]
  }>
  bounds(): { readonly width: number; readonly height: number; readonly left: number; readonly top: number; readonly right: number; readonly bottom: number }
  camera(): { readonly zoom: number; readonly offsetX: number; readonly offsetY: number }
  selection(): SelectedObject | null
  selectionSet(): { readonly items: readonly SelectedObject[]; readonly primary: SelectedObject | null }
  boxPreview(): Bounds | null
  guides(): ReadonlyArray<{ readonly id: string; readonly orientation: 'vertical' | 'horizontal'; readonly position: number; readonly locked: boolean }>
  viewMode(): 'all' | 'active'
  screenCenterPx(id: string): Point
  projectToPx(point: Point): Point
  preview(): ResizePreview | null
  resizeHandlesPx(id: string): ReadonlyArray<{ readonly handle: ResizeHandle; readonly x: number; readonly y: number }>
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
const snapToggle = element<HTMLButtonElement>('snap-toggle')
const snapGridButton = element<HTMLButtonElement>('snap-grid')
const snapEdgesButton = element<HTMLButtonElement>('snap-edges')
const snapCentersButton = element<HTMLButtonElement>('snap-centers')
const snapGuidesButton = element<HTMLButtonElement>('snap-guides')
const guideAddV = element<HTMLButtonElement>('guide-add-v')
const guideAddH = element<HTMLButtonElement>('guide-add-h')
const alignSelect = element<HTMLSelectElement>('align-select')
const distributeSelect = element<HTMLSelectElement>('distribute-select')
const snapState = element<HTMLSpanElement>('snap-state')

let project: Project = createDemoProject()
let viewMode: 'all' | 'active' = 'all'
let selection: SelectionState = emptySelection()
let lockedScreenIds: readonly ScreenId[] = []
let guides: readonly Guide[] = []
let selectedGuideId: string | null = null
let snapEnabled = true
let snapCategories: readonly SnapCategory[] = ['grid', 'edges', 'centers', 'guides']
let snapHighlight: SnapLines | null = null
let activeScreenId: string | null = project.screens[0]?.screen.id ?? null
let camera: Camera = fitCamera(projectBounds(project), 1, 1)
let spaceDown = false
function primaryScreenBox(screenIds: readonly string[], fallbackId: string): Bounds {
  const primary = selection.primary
  const primaryId = primary?.type === 'screen' && screenIds.includes(primary.id) ? primary.id : fallbackId
  const screen = findScreen(project, primaryId) ?? findScreen(project, fallbackId)
  if (!screen) return { left: 0, top: 0, right: 0, bottom: 0, width: 0, height: 0 }
  return screenBounds(screen)
}

function shiftBounds(bounds: Bounds, dx: number, dy: number): Bounds {
  return {
    left: bounds.left + dx, top: bounds.top + dy,
    right: bounds.right + dx, bottom: bounds.bottom + dy,
    width: bounds.width, height: bounds.height,
  }
}

type PointerMode = 'none' | 'drag' | 'pan' | 'resize' | 'box' | 'guide'
let pointerMode: PointerMode = 'none'
let dragState: { screenIds: string[]; lastProject: Point; appliedX: number; appliedY: number; startBox: Bounds } | null = null
let guideGesture: { id: string; previous: number; moved: boolean } | null = null
let boxGesture: { startProject: Point; currentProject: Point; startView: Point; moved: boolean; previous: SelectionState; additive: boolean } | null = null
let panState: { lastX: number; lastY: number } | null = null
let resizeGesture: {
  screenId: string
  handle: ResizeHandle
  startProject: Point
  startColumns: number
  startRows: number
  columns: number
  rows: number
} | null = null
let resizePreview: ResizePreview | null = null

const format = new Intl.NumberFormat('en-US')

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
  const note = drawProject(canvas, project, {
    mode: viewMode, selection, activeScreenId, resizePreview,
    box: boxGesture !== null && boxGesture.moved ? boxRect(boxGesture) : null,
    lockedIds: lockedScreenIds,
    guides, selectedGuideId, snapLines: snapHighlight,
  }, camera)
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

function boxRect(gesture: { startProject: Point; currentProject: Point }): Bounds {
  const left = Math.min(gesture.startProject.x, gesture.currentProject.x)
  const top = Math.min(gesture.startProject.y, gesture.currentProject.y)
  const right = Math.max(gesture.startProject.x, gesture.currentProject.x)
  const bottom = Math.max(gesture.startProject.y, gesture.currentProject.y)
  return { left, top, right, bottom, width: right - left, height: bottom - top }
}

function chipText(): string {
  if (selectedGuideId !== null) return 'Guide selected'
  const primary = selection.primary
  if (!primary) return 'No selection'
  if (selection.items.length > 1 && selectedScreenIds(selection).length === selection.items.length) {
    return `${selection.items.length} Screens selected`
  }
  if (selection.items.length > 1) return `${selection.items.length} selected`
  const screen = primary.type === 'cabinet' ? findScreen(project, primary.screenId) : (
    primary.type === 'screen' ? findScreen(project, primary.id) : findScreenByGrid(primary.id)
  )
  const suffix = screen ? ` · ${screen.screen.name}` : ''
  if (primary.type === 'screen') return `${screen?.screen.name ?? 'Screen'} selected`
  if (primary.type === 'cabinetGrid') return `Cabinet Grid${suffix}`
  return `${primary.id}${suffix}`
}

function findScreenByGrid(gridId: string): ScreenView | undefined {
  return project.screens.find(s => s.grid.id === gridId)
}

function renderStatus(): void {
  chip.textContent = chipText()
  toggleMode.textContent = viewMode === 'all' ? 'Active Screen' : 'All Screens'
  toggleMode.setAttribute('aria-pressed', String(viewMode === 'active'))
  const labels: Record<SnapCategory, string> = { grid: 'Grid', edges: 'Edges', centers: 'Centers', guides: 'Guides' }
  snapState.textContent = snapEnabled ? `Snap on: ${snapCategories.map(c => labels[c]).join('+')}` : 'Snap off'
  snapToggle.textContent = snapEnabled ? 'Snap ✓' : 'Snap off'
  snapToggle.setAttribute('aria-pressed', String(snapEnabled))
  const categoryButtons: ReadonlyArray<[SnapCategory, HTMLButtonElement]> = [
    ['grid', snapGridButton], ['edges', snapEdgesButton], ['centers', snapCentersButton], ['guides', snapGuidesButton],
  ]
  for (const [category, button] of categoryButtons) {
    button.setAttribute('aria-pressed', String(snapCategories.includes(category)))
  }
  const screenCount = selectedScreenIds(selection).length
  alignSelect.disabled = screenCount < 2
  alignSelect.title = screenCount < 2 ? 'Select at least 2 Screens to align.' : 'Align Screens'
  distributeSelect.disabled = screenCount < 3
  distributeSelect.title = screenCount < 3 ? 'Select at least 3 Screens to distribute.' : 'Distribute Screens'
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
    const node = makeTreeNode('screen', screen.screen.id, screen.screen.name, '▦', format.format(screen.cabinets.length), isSelected('screen', screen.screen.id), isPrimary('screen', screen.screen.id))
    node.addEventListener('click', event => {
      if (event.ctrlKey || event.metaKey) {
        setScreenSelection(toggleSelection(selection, { type: 'screen', id: screen.screen.id }))
        if (selection.primary?.type === 'screen') activeScreenId = selection.primary.id
        render()
        return
      }
      selectScreen(screen.screen.id)
    })
    group.append(node)
    const gridNode = makeTreeNode('cabinetGrid', screen.grid.id, 'Cabinet Grid', '▣', format.format(screen.cabinets.length), isSelected('cabinetGrid', screen.grid.id))
    gridNode.addEventListener('click', () => {
      setScreenSelection(selectSingle({ type: 'cabinetGrid', id: screen.grid.id }))
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
  return selection.items.some(item => item.type === type && item.id === id)
}

function isPrimary(type: SelectedObject['type'], id: string): boolean {
  const primary = selection.primary
  return primary !== null && primary.type === type && primary.id === id
}

function makeTreeNode(type: SelectedObject['type'], id: string, label: string, icon: string, count: string, selected: boolean, primary = false): HTMLDivElement {
  const node = document.createElement('div')
  node.className = primary ? 'tree-node primary' : 'tree-node'
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
  setScreenSelection(selectSingle({ type: 'screen', id: screenId }))
  activeScreenId = screenId
  render()
}

function setScreenSelection(next: SelectionState): void {
  selection = next
  selectedGuideId = null
}

function renderProperties(): void {
  properties.replaceChildren()
  const title = element<HTMLHeadingElement>('properties-title')
  if (selectedGuideId !== null) {
    const guide = guides.find(candidate => candidate.id === selectedGuideId)
    if (guide) renderGuideProperties(guide)
    return
  }
  if (selection.items.length === 0) {
    title.textContent = 'Nothing selected'
    const hint = document.createElement('p')
    hint.className = 'hint'
    hint.textContent = 'Select a Screen, a Cabinet Grid or a Cabinet on the canvas or in the project tree.'
    properties.append(hint)
    return
  }
  if (selection.items.length > 1) {
    renderMultiScreenProperties()
    return
  }
  const current = selection.items[0]!
  if (current.type === 'screen') {
    const screen = findScreen(project, current.id)
    if (screen) renderScreenProperties(screen)
    return
  }
  if (current.type === 'cabinetGrid') {
    const screen = findScreenByGrid(current.id)
    if (screen) renderGridProperties(screen)
    return
  }
  const screen = findScreen(project, current.screenId)
  if (screen) renderCabinetProperties(screen)
}

function renderMultiScreenProperties(): void {
  const screens: ScreenView[] = []
  for (const id of selectedScreenIds(selection)) {
    const screen = findScreen(project, id)
    if (screen) screens.push(screen)
  }
  element<HTMLHeadingElement>('properties-title').textContent = `${screens.length} Screens`
  const container = document.createElement('div')
  container.className = 'properties-body'
  const summary = document.createElement('div')
  const columns = new Set(screens.map(s => s.grid.columns))
  const rows = new Set(screens.map(s => s.grid.rows))
  summary.append(
    propertyRow('Screens', valueNode(screens.map(s => s.screen.name).join('; '))),
    propertyRow('Columns', valueNode(columns.size === 1 ? format.format(screens[0]!.grid.columns) : '—')),
    propertyRow('Rows', valueNode(rows.size === 1 ? format.format(screens[0]!.grid.rows) : '—')),
    propertyRow('Cabinets', valueNode(format.format(screens.reduce((total, s) => total + s.cabinets.length, 0)))),
    propertyRow('Locked', valueNode(format.format(screens.filter(s => lockedScreenIds.includes(s.screen.id)).length))),
  )
  container.append(group('Selection', summary))
  const hint = document.createElement('p')
  hint.className = 'hint'
  hint.textContent = 'Select a single Screen to edit values.'
  container.append(hint)
  properties.append(container)
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

function numberField(initial: number, ariaLabel: string, onCommit: (value: number) => void, validate?: (value: number) => string | null): HTMLInputElement {
  const input = document.createElement('input')
  input.type = 'number'
  input.min = '1'
  input.step = '1'
  input.value = String(initial)
  input.setAttribute('aria-label', ariaLabel)
  input.addEventListener('change', () => {
    const raw = input.value.trim()
    const value = Number(raw)
    const problem = !raw || !Number.isFinite(value)
      ? 'Enter a number.'
      : validate ? validate(value) : null
    if (problem) {
      input.setAttribute('aria-invalid', 'true')
      input.title = problem
      input.value = String(initial)
      return
    }
    input.removeAttribute('aria-invalid')
    input.removeAttribute('title')
    onCommit(value)
  })
  return input
}

function gridValidator(label: string, limit: (value: number) => number): (value: number) => string | null {
  return value => {
    if (!Number.isSafeInteger(value) || value < 1) return `${label} must be a whole number of at least 1.`
    const max = limit(value)
    if (value > max) return `${label} is limited to ${format.format(max)} for this screen.`
    return null
  }
}

function checkField(initial: boolean, ariaLabel: string, onCommit: (value: boolean) => void): HTMLInputElement {
  const input = document.createElement('input')
  input.type = 'checkbox'
  input.checked = initial
  input.setAttribute('aria-label', ariaLabel)
  input.addEventListener('change', () => {
    onCommit(input.checked)
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

  const gridBox = document.createElement('div')
  gridBox.append(
    propertyRow('Columns', numberField(
      screen.grid.columns,
      'Screen Columns',
      value => commitResize(screen.screen.id, value, screen.grid.rows),
      gridValidator('Columns', () => maxColumnsForRows(screen, screen.grid.rows)),
    )),
    propertyRow('Rows', numberField(
      screen.grid.rows,
      'Screen Rows',
      value => commitResize(screen.screen.id, screen.grid.columns, value),
      gridValidator('Rows', () => maxRowsForColumns(screen, screen.grid.columns)),
    )),
  )
  container.append(group('Cabinet Grid', gridBox))

  const cabinetBox = document.createElement('div')
  cabinetBox.append(
    propertyRow('Width', valueNode(`${format.format(screen.grid.cabinetWidth)} px`)),
    propertyRow('Height', valueNode(`${format.format(screen.grid.cabinetHeight)} px`)),
  )
  container.append(group('Cabinet', cabinetBox))

  const lockBox = document.createElement('div')
  lockBox.append(
    propertyRow('Locked', checkField(
      lockedScreenIds.includes(screen.screen.id),
      'Screen Locked',
      value => setScreenLocked(screen.screen.id, value),
    )),
  )
  container.append(group('Lock', lockBox))

  const sizeBox = document.createElement('div')
  sizeBox.append(
    propertyRow('Width', valueNode(`${format.format(screenWidth(screen))} px`)),
    propertyRow('Height', valueNode(`${format.format(screenHeight(screen))} px`)),
  )
  container.append(group('Calculated Screen Size', sizeBox))

  const countBox = document.createElement('div')
  countBox.append(propertyRow('Cabinets', valueNode(format.format(screen.cabinets.length))))
  container.append(group('Totals', countBox))
  properties.append(container)
}

function commitResize(screenId: string, columns: number, rows: number): void {
  commitCabinetConfig(screenId, { columns, rows })
}

function commitCabinetConfig(screenId: string, patch: { readonly columns?: number; readonly rows?: number }): void {
  if (lockedScreenIds.some(id => id === screenId)) {
    render()
    canvasNote.textContent = 'Screen is locked.'
    return
  }
  try {
    apply(updateScreenCabinetConfig(project, screenId, patch))
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to update the cabinet grid.'
    canvasNote.textContent = message
    return
  }
  render()
}

function setScreenLocked(screenId: string, locked: boolean): void {
  lockedScreenIds = locked
    ? (lockedScreenIds.some(id => id === screenId) ? lockedScreenIds : [...lockedScreenIds, screenId as ScreenId])
    : lockedScreenIds.filter(id => id !== screenId)
  render()
}

function renderGridProperties(screen: ScreenView): void {
  element<HTMLHeadingElement>('properties-title').textContent = 'Cabinet Grid'
  const container = document.createElement('div')
  container.className = 'properties-body'

  const identityBox = document.createElement('div')
  identityBox.append(
    propertyRow('Name', valueNode(screen.grid.name)),
    propertyRow('Screen', valueNode(screen.screen.name)),
  )
  container.append(group('Grid', identityBox))

  const dimensionsBox = document.createElement('div')
  dimensionsBox.append(
    propertyRow('Columns', numberField(
      screen.grid.columns,
      'Cabinet Grid Columns',
      value => commitResize(screen.screen.id, value, screen.grid.rows),
      gridValidator('Columns', () => maxColumnsForRows(screen, screen.grid.rows)),
    )),
    propertyRow('Rows', numberField(
      screen.grid.rows,
      'Cabinet Grid Rows',
      value => commitResize(screen.screen.id, screen.grid.columns, value),
      gridValidator('Rows', () => maxRowsForColumns(screen, screen.grid.columns)),
    )),
  )
  container.append(group('Dimensions', dimensionsBox))

  const summaryBox = document.createElement('div')
  summaryBox.append(
    propertyRow('Cabinets', valueNode(format.format(screen.cabinets.length))),
    propertyRow('Cabinet size', valueNode(`${format.format(screen.grid.cabinetWidth)} × ${format.format(screen.grid.cabinetHeight)} px`)),
    propertyRow('Screen size', valueNode(`${format.format(screenWidth(screen))} × ${format.format(screenHeight(screen))} px`)),
  )
  container.append(group('Summary', summaryBox))
  properties.append(container)
}

function renderGuideProperties(guide: Guide): void {
  element<HTMLHeadingElement>('properties-title').textContent = 'Guide'
  const container = document.createElement('div')
  container.className = 'properties-body'
  const box = document.createElement('div')
  box.append(
    propertyRow('Orientation', valueNode(guide.orientation === 'vertical' ? 'Vertical' : 'Horizontal')),
    propertyRow('Position', numberField(guide.position, 'Guide Position', value => {
      guides = moveGuide(guides, guide.id, value)
      render()
    })),
    propertyRow('Locked', checkField(guide.locked, 'Guide Locked', value => {
      guides = setGuideLocked(guides, guide.id, value)
      render()
    })),
  )
  container.append(group('Guide', box))
  const remove = document.createElement('button')
  remove.type = 'button'
  remove.textContent = 'Delete Guide'
  remove.setAttribute('aria-label', 'Delete Guide')
  remove.addEventListener('click', () => deleteSelectedGuide())
  container.append(remove)
  properties.append(container)
}

function renderCabinetProperties(screen: ScreenView): void {  const current = selection.primary
  if (current?.type !== 'cabinet') return
  const cabinet = screen.cabinets.find(c => c.id === current.id)
  if (!cabinet) return
  element<HTMLHeadingElement>('properties-title').textContent = 'Cabinet'
  const container = document.createElement('div')
  container.className = 'properties-body'
  const box = document.createElement('div')
  box.append(
    propertyRow('Physical ID', valueNode(cabinet.id)),
    propertyRow('Position', valueNode(`Column ${cabinet.column + 1} · Row ${cabinet.row + 1}`)),
    propertyRow('Screen', valueNode(screen.screen.name)),
  )
  container.append(group('Cabinet', box))
  properties.append(container)
}

function viewportPoint(event: { offsetX: number; offsetY: number }): { x: number; y: number } {
  return { x: event.offsetX, y: event.offsetY }
}

function selectedScreenShape(): { screen: ScreenView; shape: GridShape } | null {
  const screen = singleSelectedScreen()
  if (!screen) return null
  return { screen, shape: screenShape(screen, screen.grid.columns, screen.grid.rows) }
}

function singleSelectedScreen(): ScreenView | null {
  if (selection.items.length !== 1) return null
  const item = selection.items[0]!
  if (item.type !== 'screen') return null
  if (lockedScreenIds.some(id => id === item.id)) return null
  return findScreen(project, item.id) ?? null
}

function resizeTargetAt(px: Point): { screen: ScreenView; handle: ResizeHandle } | null {
  const target = selectedScreenShape()
  if (!target) return null
  const handle = resizeHandleHit(camera, target.screen, target.shape, px)
  return handle ? { screen: target.screen, handle } : null
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

function endPointerGesture(): void {
  pointerMode = 'none'
  dragState = null
  panState = null
  boxGesture = null
  guideGesture = null
  resizeGesture = null
  resizePreview = null
  snapHighlight = null
  canvas.classList.remove('dragging')
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
  const resizeTarget = resizeTargetAt(px)
  if (resizeTarget) {
    const { screen, handle } = resizeTarget
    setScreenSelection(selectSingle({ type: 'screen', id: screen.screen.id }))
    activeScreenId = screen.screen.id
    pointerMode = 'resize'
    resizeGesture = {
      screenId: screen.screen.id,
      handle,
      startProject: projectPoint,
      startColumns: screen.grid.columns,
      startRows: screen.grid.rows,
      columns: screen.grid.columns,
      rows: screen.grid.rows,
    }
    canvas.classList.add('dragging')
    canvas.setPointerCapture(event.pointerId)
    render()
    return
  }
  const hit = hitTest(project, projectPoint)
  canvas.classList.add('dragging')
  if (hit) {
    activeScreenId = hit.screen.screen.id
    if ((event.ctrlKey || event.metaKey) && !hit.cabinet) {
      setScreenSelection(toggleSelection(selection, { type: 'screen', id: hit.screen.screen.id }))
      if (selection.primary?.type === 'screen') activeScreenId = selection.primary.id
      render()
      return
    }
    const originSelected = selection.items.some(item => item.type === 'screen' && item.id === hit.screen.screen.id)
    if (!originSelected) {
      setScreenSelection(hit.cabinet && cabinetLabelHit(camera, hit.screen, hit.cabinet, px)
        ? selectSingle({ type: 'cabinet', id: hit.cabinet.id, screenId: hit.screen.screen.id })
        : selectSingle({ type: 'screen', id: hit.screen.screen.id }))
    }
    const selectedIds = selectedScreenIds(selection)
    const screenIds = selectedIds.length > 0 ? selectedIds : [hit.screen.screen.id]
    const blocker = groupActionBlocker(lockedScreenIds, screenIds)
    if (blocker) {
      render()
      canvasNote.textContent = blocker
      return
    }
    pointerMode = 'drag'
    const primaryBox = primaryScreenBox(screenIds, hit.screen.screen.id)
    dragState = { screenIds, lastProject: projectPoint, appliedX: 0, appliedY: 0, startBox: primaryBox }
    canvas.setPointerCapture(event.pointerId)
  } else {
    const guide = guideHit(guides, projectPoint, camera.zoom)
    if (guide) {
      selection = emptySelection()
      selectedGuideId = guide.id
      if (!guide.locked) {
        guideGesture = { id: guide.id, previous: guide.position, moved: false }
        pointerMode = 'guide'
        canvas.setPointerCapture(event.pointerId)
      }
      render()
      return
    }
    pointerMode = 'box'
    boxGesture = {
      startProject: projectPoint,
      currentProject: projectPoint,
      startView: px,
      moved: false,
      previous: selection,
      additive: event.ctrlKey || event.metaKey,
    }
    canvas.setPointerCapture(event.pointerId)
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
  if (pointerMode === 'resize' && resizeGesture) {
    const screen = findScreen(project, resizeGesture.screenId)
    if (!screen) return
    const point = toProject(camera, viewportPoint(event))
    const dx = point.x - resizeGesture.startProject.x
    const dy = point.y - resizeGesture.startProject.y
    const changesColumns = resizeGesture.handle === 'right' || resizeGesture.handle === 'bottomRight'
    const changesRows = resizeGesture.handle === 'bottom' || resizeGesture.handle === 'bottomRight'
    const columns = changesColumns
      ? clamp(
        resizeGesture.startColumns + Math.round(dx / screen.grid.cabinetWidth),
        1,
        maxColumnsForRows(screen, resizeGesture.startRows),
      )
      : resizeGesture.startColumns
    const rows = changesRows
      ? clamp(
        resizeGesture.startRows + Math.round(dy / screen.grid.cabinetHeight),
        1,
        maxRowsForColumns(screen, resizeGesture.startColumns),
      )
      : resizeGesture.startRows
    resizeGesture = { ...resizeGesture, columns, rows }
    resizePreview = columns === screen.grid.columns && rows === screen.grid.rows
      ? null
      : { screenId: screen.screen.id, columns, rows }
    draw()
    return
  }
  if (pointerMode === 'drag' && dragState) {
    const px = viewportPoint(event)
    const projectPoint = toProject(camera, px)
    const stepX = projectPoint.x - dragState.lastProject.x
    const stepY = projectPoint.y - dragState.lastProject.y
    dragState.lastProject = projectPoint
    let totalX = dragState.appliedX + stepX
    let totalY = dragState.appliedY + stepY
    snapHighlight = null
    if (snapEnabled && !event.altKey) {
      const tentative = shiftBounds(dragState.startBox, totalX, totalY)
      const exclude = new Set(dragState.screenIds)
      const targets = snapTargetsFor(exclude)
      const correction = snapDelta(tentative, targets.vertical, targets.horizontal, camera.zoom, snapCategories.includes('grid'))
      totalX += correction.dx
      totalY += correction.dy
      if (correction.lines.x.length > 0 || correction.lines.y.length > 0) snapHighlight = correction.lines
    }
    project = moveScreens(project, dragState.screenIds, totalX - dragState.appliedX, totalY - dragState.appliedY)
    dragState.appliedX = totalX
    dragState.appliedY = totalY
    render()
    return
  }
  if (pointerMode === 'guide' && guideGesture) {
    const gesture = guideGesture
    const px = viewportPoint(event)
    const projectPoint = toProject(camera, px)
    const guide = guides.find(candidate => candidate.id === gesture.id)
    if (guide && !guide.locked) {
      const position = guide.orientation === 'vertical' ? projectPoint.x : projectPoint.y
      if (position !== guide.position) {
        guideGesture = { ...gesture, moved: true }
        guides = moveGuide(guides, guide.id, position)
      }
    }
    draw()
    return
  }
  if (pointerMode === 'box' && boxGesture) {
    const px = viewportPoint(event)
    boxGesture = {
      ...boxGesture,
      currentProject: toProject(camera, px),
      moved: boxGesture.moved || Math.hypot(px.x - boxGesture.startView.x, px.y - boxGesture.startView.y) > 4,
    }
    draw()
    return
  }
  const target = resizeTargetAt(viewportPoint(event))
  canvas.style.cursor = target ? resizeHandleCursor(target.handle) : ''
})

canvas.addEventListener('pointerup', () => {
  if (pointerMode === 'resize') {
    const gesture = resizeGesture
    const screen = gesture ? findScreen(project, gesture.screenId) : undefined
    if (gesture && screen && (gesture.columns !== screen.grid.columns || gesture.rows !== screen.grid.rows)) {
      endPointerGesture()
      commitResize(gesture.screenId, gesture.columns, gesture.rows)
      return
    }
    endPointerGesture()
    render()
    return
  }
  if (pointerMode === 'box') {
    const gesture = boxGesture
    endPointerGesture()
    if (gesture) {
      if (!gesture.moved) {
        if (!gesture.additive) setScreenSelection(emptySelection())
      } else {
        const matched = screensInRect(project, boxRect(gesture))
          .map(screen => ({ type: 'screen', id: screen.screen.id }) as const)
        setScreenSelection(applyBoxSelection(gesture.previous, matched, gesture.additive))
        if (selection.primary?.type === 'screen') activeScreenId = selection.primary.id
      }
    }
    render()
    return
  }
  if (pointerMode === 'guide') {
    endPointerGesture()
    render()
    return
  }
  endPointerGesture()
})

canvas.addEventListener('pointercancel', () => {
  if (boxGesture) selection = boxGesture.previous
  if (guideGesture) guides = moveGuide(guides, guideGesture.id, guideGesture.previous)
  endPointerGesture()
  render()
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

snapToggle.addEventListener('click', () => {
  snapEnabled = !snapEnabled
  render()
})

snapGridButton.addEventListener('click', () => toggleSnapCategory('grid'))
snapEdgesButton.addEventListener('click', () => toggleSnapCategory('edges'))
snapCentersButton.addEventListener('click', () => toggleSnapCategory('centers'))
snapGuidesButton.addEventListener('click', () => toggleSnapCategory('guides'))

guideAddV.addEventListener('click', () => addGuideAtCenter('vertical'))
guideAddH.addEventListener('click', () => addGuideAtCenter('horizontal'))

alignSelect.addEventListener('change', () => {
  const mode = alignSelect.value as AlignMode | ''
  alignSelect.value = ''
  if (mode !== '') applyAlign(mode)
})

distributeSelect.addEventListener('change', () => {
  const axis = distributeSelect.value as DistributeAxis | ''
  distributeSelect.value = ''
  if (axis !== '') applyDistribute(axis)
})

addScreenButton.addEventListener('click', () => {  const next = addScreen(project)
  const fresh = next.screens[next.screens.length - 1]
  if (!fresh) return
  project = next
  setScreenSelection(selectSingle({ type: 'screen', id: fresh.screen.id }))
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

function isTextEditableFocus(): boolean {
  const tag = document.activeElement?.tagName
  return tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA'
}

function isEditableFocus(): boolean {
  return isTextEditableFocus() || document.activeElement?.tagName === 'BUTTON'
}

function deleteSelected(): void {
  const ids = selectedScreenIds(selection)
  if (ids.length === 0) return
  const blocker = groupActionBlocker(lockedScreenIds, ids)
  if (blocker) {
    render()
    canvasNote.textContent = blocker
    return
  }
  project = removeScreens(project, ids)
  repairAfterRemove()
  render()
}

function duplicateSelected(): void {
  const ids = selectedScreenIds(selection)
  if (ids.length === 0) return
  const primaryId = selection.primary?.type === 'screen' ? selection.primary.id : null
  const primaryIndex = primaryId !== null ? ids.indexOf(primaryId) : -1
  const result = duplicateScreens(project, ids)
  project = result.project
  setScreenSelection({
    items: result.newIds.map(id => ({ type: 'screen', id }) as const),
    primary: { type: 'screen', id: result.newIds[primaryIndex >= 0 ? primaryIndex : result.newIds.length - 1]! } as const,
  })
  const primary = selection.primary
  if (primary?.type === 'screen') activeScreenId = primary.id
  render()
}

function nudgeSelected(dx: number, dy: number): void {
  const ids = selectedScreenIds(selection)
  if (ids.length === 0) return
  const blocker = groupActionBlocker(lockedScreenIds, ids)
  if (blocker) {
    render()
    canvasNote.textContent = blocker
    return
  }
  project = moveScreens(project, ids, dx, dy)
  render()
}

function repairAfterRemove(): void {
  const aliveScreens = new Set<string>(project.screens.map(s => s.screen.id))
  const aliveGrids = new Set<string>(project.screens.map(s => s.grid.id))
  lockedScreenIds = lockedScreenIds.filter(id => aliveScreens.has(id))
  setScreenSelection(repairSelection(selection, item => {
    if (item.type === 'screen') return aliveScreens.has(item.id)
    if (item.type === 'cabinetGrid') return aliveGrids.has(item.id)
    return aliveScreens.has(item.screenId)
  }))
  if (activeScreenId !== null && !aliveScreens.has(activeScreenId)) {
    activeScreenId = project.screens[0]?.screen.id ?? null
  }
}

function snapTargetsFor(exclude: ReadonlySet<string>): { readonly vertical: SnapTarget[]; readonly horizontal: SnapTarget[] } {
  const screens = screenSnapTargets(project.screens, exclude)
  const guideVertical: SnapTarget[] = []
  const guideHorizontal: SnapTarget[] = []
  guides.forEach((guide, index) => {
    if (guide.orientation === 'vertical') guideVertical.push({ position: guide.position, kind: 'guide', rank: index })
    else guideHorizontal.push({ position: guide.position, kind: 'guide', rank: index })
  })
  const includeEdges = snapCategories.includes('edges')
  const includeCenters = snapCategories.includes('centers')
  const includeGuides = snapCategories.includes('guides')
  return {
    vertical: [
      ...screens.vertical.filter(t => (t.kind === 'edge' ? includeEdges : includeCenters)),
      ...(includeGuides ? guideVertical : []),
    ],
    horizontal: [
      ...screens.horizontal.filter(t => (t.kind === 'edge' ? includeEdges : includeCenters)),
      ...(includeGuides ? guideHorizontal : []),
    ],
  }
}

function applyAlign(mode: AlignMode): void {
  const ids = selectedScreenIds(selection)
  if (ids.length < 2) {
    render()
    canvasNote.textContent = 'Select at least 2 Screens to align.'
    return
  }
  const blocker = groupActionBlocker(lockedScreenIds, ids)
  if (blocker) {
    render()
    canvasNote.textContent = blocker
    return
  }
  project = alignScreens(project, ids, mode)
  render()
}

function applyDistribute(axis: DistributeAxis): void {
  const ids = selectedScreenIds(selection)
  if (ids.length < 3) {
    render()
    canvasNote.textContent = 'Select at least 3 Screens to distribute.'
    return
  }
  const blocker = groupActionBlocker(lockedScreenIds, ids)
  if (blocker) {
    render()
    canvasNote.textContent = blocker
    return
  }
  project = distributeScreens(project, ids, axis)
  render()
}

function addGuideAtCenter(orientation: Guide['orientation']): void {
  const rect = canvas.getBoundingClientRect()
  const center = toProject(camera, { x: rect.width / 2, y: rect.height / 2 })
  const position = snapGrid(orientation === 'vertical' ? center.x : center.y)
  guides = addGuide(guides, orientation, position)
  const created = guides[guides.length - 1]!
  selection = emptySelection()
  selectedGuideId = created.id
  render()
}

function deleteSelectedGuide(): void {
  if (selectedGuideId === null) return
  const guide = guides.find(candidate => candidate.id === selectedGuideId)
  if (!guide) {
    selectedGuideId = null
    render()
    return
  }
  if (guide.locked) {
    render()
    canvasNote.textContent = 'Guide is locked.'
    return
  }
  guides = removeGuide(guides, guide.id)
  selectedGuideId = null
  render()
}

function toggleSnapCategory(category: SnapCategory): void {
  snapCategories = snapCategories.includes(category)
    ? snapCategories.filter(current => current !== category)
    : [...snapCategories, category]
  render()
}

window.addEventListener('keydown', event => {
  if (event.code === 'Space' && !isEditableFocus()) {
    spaceDown = true
    canvas.classList.add('space-grab')
    event.preventDefault()
  }
  if (event.key === 'Escape') {
    if (isTextEditableFocus()) {
      (document.activeElement as HTMLElement).blur()
      return
    }
    if (boxGesture) selection = boxGesture.previous
    if (guideGesture) guides = moveGuide(guides, guideGesture.id, guideGesture.previous)
    endPointerGesture()
    selection = emptySelection()
    selectedGuideId = null
    render()
    return
  }
  if (isEditableFocus() || pointerMode !== 'none') return
  if (event.key === 'Delete' || event.key === 'Backspace') {
    event.preventDefault()
    if (selectedGuideId !== null) deleteSelectedGuide()
    else deleteSelected()
    return
  }
  if ((event.ctrlKey || event.metaKey) && (event.key === 'd' || event.key === 'D')) {
    event.preventDefault()
    duplicateSelected()
    return
  }
  if (event.key.startsWith('Arrow')) {
    const step = event.shiftKey ? 10 : 1
    const dx = event.key === 'ArrowLeft' ? -step : event.key === 'ArrowRight' ? step : 0
    const dy = event.key === 'ArrowUp' ? -step : event.key === 'ArrowDown' ? step : 0
    event.preventDefault()
    nudgeSelected(dx, dy)
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
    locked: lockedScreenIds.includes(s.screen.id),
    cabinets: s.cabinets.map(c => ({ id: c.id, index: c.index, column: c.column, row: c.row })),
    order: s.cabinets.map(c => c.index + 1),
  })),
  bounds: () => projectBounds(project),
  camera: () => ({ ...camera }),
  selection: () => selection.primary,
  selectionSet: () => ({ items: [...selection.items], primary: selection.primary }),
  boxPreview: () => boxGesture !== null && boxGesture.moved ? boxRect(boxGesture) : null,
  guides: () => guides.map(guide => ({ ...guide })),
  viewMode: () => viewMode,
  screenCenterPx: id => {
    const screen = findScreen(project, id)
    if (!screen) return { x: 0, y: 0 }
    const center = { x: screen.x + screenWidth(screen) / 2, y: screen.y + screenHeight(screen) / 2 }
    return toScreen(camera, center)
  },
  projectToPx: point => toScreen(camera, point),
  preview: () => resizePreview,
  resizeHandlesPx: id => {
    const screen = findScreen(project, id)
    if (!screen) return []
    return screenResizeHandles(camera, screen, screenShape(screen, screen.grid.columns, screen.grid.rows))
      .map(({ handle, point }) => ({ handle, x: point.x, y: point.y }))
  },
}

;(window as unknown as { __ledmap: LedmapHook }).__ledmap = hook
