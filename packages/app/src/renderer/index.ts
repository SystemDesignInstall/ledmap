import {
  findScreen, hitTest, maxColumnsForRows, maxRowsForColumns, projectBounds,
  screenBounds, screenHeight, screenWidth,
  type Project, type ScreenCabinetConfigPatch, type ScreenView, type SelectedObject,
} from './v2-view-model.js'
import type { LedMapProjectV2 } from '@ledmap/core'
import { ProjectDocumentController } from './document.js'
import { AutosaveCoordinator } from './autosave-coordinator.js'
import { createProjectSession, recoverProjectSession, sessionDirty, sessionWorkspaceProject, type ProjectSession } from './project-session.js'
import {
  addScreenV2, deleteScreensV2, duplicateScreenV2, renameScreenV2, resizeScreenGridV2,
  setScreenPositionV2, setScreenPositionsV2, updateScreenCabinetConfigV2,
} from './v2-commands.js'
import { initialDraft, type Draft } from './state.js'
import type { GridShape, OverlayVisibility, Point, ResizeHandle, ResizePreview } from './canvas.js'
import {
  drawProject, fitCamera, resizeHandleCursor, resizeHandleHit,
  screenResizeHandles, screenShape, toProject, toScreen, zoomAt, type Camera,
} from './canvas.js'
import {
  addGuide, alignScreens, clampTranslationToOrigin, distributeScreens, guideHitTest, guidePositions, marqueeSelection, moveGuide,
  normalizeSelectionBox, nudgePositions, removeGuide, replaceOrToggleSelection, selectionBounds, setGuideLocked,
  snapTranslation,
  type AlignMode, type AlignmentGuide, type DistributeAxis, type LayoutPoint, type LayoutRect,
  type ProjectGuide, type SelectionBox, type SnapSources,
} from './layout-interaction.js'
import { createMappingWorkspace, type MappingWorkspace } from './mapping-workspace.js'
import { createOutputMappingWorkspace, type OutputMappingWorkspace } from './output-mapping-workspace.js'
import { createHardwareWorkspace, type HardwareWorkspace } from './hardware-workspace.js'
import { createTestWorkspace, type TestWorkspace } from './test-workspace.js'
import { createLiveOutputController, type LiveOutputController } from './live-output.js'
import { createExportWorkspace, type ExportWorkspace } from './export-workspace.js'
import type { Direction, Numbering } from '@ledmap/core'

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
    readonly cabinetWidth: number
    readonly cabinetHeight: number
    readonly moduleColumns: number
    readonly moduleRows: number
    readonly modulePixelWidth: number
    readonly modulePixelHeight: number
    readonly modulesPerCabinet: number
    readonly totalModules: number
    readonly numbering: Numbering
    readonly direction: Direction
    readonly snake: boolean
    readonly nextCabinetSerial: number
    readonly cabinets: ReadonlyArray<{ readonly id: string; readonly index: number; readonly column: number; readonly row: number }>
    readonly order: readonly number[]
  }>
  bounds(): { readonly width: number; readonly height: number; readonly left: number; readonly top: number; readonly right: number; readonly bottom: number }
  camera(): { readonly zoom: number; readonly offsetX: number; readonly offsetY: number }
  selection(): SelectedObject | null
  viewMode(): 'all' | 'active'
  screenCenterPx(id: string): Point
  projectToPx(point: Point): Point
  preview(): ResizePreview | null
  resizeHandlesPx(id: string): ReadonlyArray<{ readonly handle: ResizeHandle; readonly x: number; readonly y: number }>
  document(): { readonly dirty: boolean; readonly currentFilePath: string | null; readonly sourceSchemaVersion: 1 | 2 | 3 | 4;
    readonly revision: number; readonly savedRevision: number }
  projectSnapshot(): string
  selectedScreens(): readonly string[]
  snap(): { readonly enabled: boolean; readonly sources: SnapSources; readonly step: number }
  guides(): readonly AlignmentGuide[]
  projectGuides(): readonly ProjectGuide[]
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
const zoomIndicator = element<HTMLSpanElement>('zoom-indicator')
const canvasNote = element<HTMLSpanElement>('canvas-note')
const canvasTitle = element<HTMLHeadingElement>('canvas-title')
const empty = element<HTMLDivElement>('empty')
const toggleMode = element<HTMLButtonElement>('toggle-mode')
const fitProject = element<HTMLButtonElement>('fit-project')
const addScreenButton = element<HTMLButtonElement>('add-screen')
const newProjectButton = element<HTMLButtonElement>('new-project')
const openProjectButton = element<HTMLButtonElement>('open-project')
const undoProjectButton = element<HTMLButtonElement>('undo-project')
const redoProjectButton = element<HTMLButtonElement>('redo-project')
const saveProjectButton = element<HTMLButtonElement>('save-project')
const saveProjectAsButton = element<HTMLButtonElement>('save-project-as')
const documentError = element<HTMLDivElement>('document-error')
const snapToggle = element<HTMLButtonElement>('snap-toggle')
const snapGridButton = element<HTMLButtonElement>('snap-grid')
const snapEdgesButton = element<HTMLButtonElement>('snap-edges')
const snapCentersButton = element<HTMLButtonElement>('snap-centers')
const snapGuidesButton = element<HTMLButtonElement>('snap-guides')
const gridStepInput = element<HTMLInputElement>('grid-step')
const guideAddV = element<HTMLButtonElement>('guide-add-v')
const guideAddH = element<HTMLButtonElement>('guide-add-h')
const selectedCount = element<HTMLSpanElement>('selected-count')
const snapStatus = element<HTMLSpanElement>('snap-status')
const cursorStatus = element<HTMLSpanElement>('cursor-status')
const fitSelectionButton = element<HTMLButtonElement>('fit-selection')
const actualSizeButton = element<HTMLButtonElement>('actual-size')
const zoomInButton = element<HTMLButtonElement>('zoom-in')
const zoomOutButton = element<HTMLButtonElement>('zoom-out')
const duplicateScreenButton = element<HTMLButtonElement>('duplicate-screen')
const deleteScreenButton = element<HTMLButtonElement>('delete-screen')
const renameScreenButton = element<HTMLButtonElement>('rename-screen')
const screenDialog = element<HTMLDialogElement>('screen-dialog')
const screenForm = element<HTMLFormElement>('screen-form')
const emptyAddScreenButton = element<HTMLButtonElement>('empty-add-screen')
const treeScreenCount = element<HTMLSpanElement>('tree-screen-count')
const screenFormError = element<HTMLParagraphElement>('screen-form-error')
const layoutModeButton = element<HTMLButtonElement>('layout-mode')
const mappingModeButton = element<HTMLButtonElement>('mapping-mode')
const outputMappingModeButton = element<HTMLButtonElement>('output-mapping-mode')
const layoutToolbar = element<HTMLDivElement>('layout-toolbar')
const mappingToolbar = element<HTMLDivElement>('mapping-toolbar')
const outputMappingToolbar = element<HTMLDivElement>('output-mapping-toolbar')
const layoutWorkspace = element<HTMLElement>('layout-workspace')
const mappingWorkspaceElement = element<HTMLElement>('mapping-workspace')
const outputMappingWorkspaceElement = element<HTMLElement>('output-mapping-workspace')
const hardwareModeButton = element<HTMLButtonElement>('hardware-mode')
const hardwareToolbar = element<HTMLDivElement>('hardware-toolbar')
const hardwareWorkspaceElement = element<HTMLElement>('hardware-workspace')
const testModeButton = element<HTMLButtonElement>('test-mode')
const testToolbar = element<HTMLDivElement>('test-toolbar')
const testWorkspaceElement = element<HTMLElement>('test-workspace')
const exportModeButton = element<HTMLButtonElement>('export-mode')
const exportToolbar = element<HTMLDivElement>('export-toolbar')
const exportWorkspaceElement = element<HTMLElement>('export-workspace')

let documentSerial = 0
const documentController = new ProjectDocumentController(() => `document-${++documentSerial}`)
const autosave = new AutosaveCoordinator(() => documentController.session, window.ledmapDesktop,
  error => showDocumentError(error, 'Recovery snapshot is currently unavailable.'))
autosave.attach(documentController.session, null)

function currentProject(): Project {
  return sessionWorkspaceProject(documentController.session)
}
type AppMode = 'layout' | 'mapping' | 'output-mapping' | 'hardware' | 'test' | 'export'
let appMode: AppMode = 'layout'
let mappingWorkspace: MappingWorkspace | null = null
let outputMappingWorkspace: OutputMappingWorkspace | null = null
let hardwareWorkspace: HardwareWorkspace | null = null
let testWorkspace: TestWorkspace | null = null
let liveOutputController: LiveOutputController | null = null
let exportWorkspace: ExportWorkspace | null = null
let viewMode: 'all' | 'active' = 'all'
let selection: SelectedObject | null = null
let selectedScreenIds: readonly string[] = []
let activeScreenId: string | null = currentProject().screens[0]?.screen.id ?? null
let camera: Camera = fitCamera(projectBounds(currentProject()), 1, 1)
let snapEnabled = true
let snapSources: SnapSources = { grid: false, edges: true, centers: true, guides: true }
let gridStep = 10
let projectGuides: readonly ProjectGuide[] = []
let selectedGuideId: string | null = null
let alignmentGuides: readonly AlignmentGuide[] = []
let marqueeBox: SelectionBox | null = null
let overlays: OverlayVisibility = { cabinets: true, modules: false, coordinates: true }
let spaceDown = false
type PointerMode = 'none' | 'drag' | 'pan' | 'resize' | 'marquee' | 'guide'
let pointerMode: PointerMode = 'none'
let dragState: {
  screenIds: readonly string[]
  startProject: Point
  positions: Readonly<Record<string, LayoutPoint>>
  bounds: LayoutRect
  targets: readonly LayoutRect[]
  appliedDx: number
  appliedDy: number
} | null = null
let dragHistoryGroupId: number | null = null
let arrowHistoryGroupId: number | null = null
let arrowHistoryKey: string | null = null
let panState: { lastX: number; lastY: number } | null = null
let marqueeGesture: { start: Point; baseSelection: readonly string[] } | null = null
let guideGesture: { id: string; previous: number; moved: boolean } | null = null
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

function applyV2(command: (project: LedMapProjectV2) => LedMapProjectV2, groupId?: number): void {
  const before = documentController.session
  documentController.transactV2(command, groupId)
  autosave.mutation(before, documentController.session)
  syncDocumentState()
}

function finishHistoryGroup(groupId?: number): void {
  const before = documentController.session
  documentController.endHistoryGroup(groupId)
  autosave.mutation(before, documentController.session)
  syncDocumentState()
  if (before !== documentController.session) render()
}

function finishArrowHistoryGroup(): void {
  if (arrowHistoryGroupId === null) return
  const groupId = arrowHistoryGroupId
  arrowHistoryGroupId = null
  arrowHistoryKey = null
  finishHistoryGroup(groupId)
}

function syncDocumentState(): void {
  const session = documentController.session
  const dirty = sessionDirty(session)
  window.ledmapDesktop.setDocumentState({
    currentFilePath: session.currentFilePath,
    dirty,
  })
  saveProjectButton.disabled = !dirty && session.sourceSchemaVersion === 4
  undoProjectButton.disabled = !documentController.canUndo
  redoProjectButton.disabled = !documentController.canRedo
}

function restoreHistory(redo: boolean): void {
  endPointerGesture()
  mappingWorkspace?.finishGesture()
  outputMappingWorkspace?.finishGesture()
  finishArrowHistoryGroup()
  const before = documentController.session
  const restored = redo ? documentController.redo() : documentController.undo()
  autosave.mutation(before, documentController.session)
  syncDocumentState()
  if (!restored) return
  const project = currentProject()
  const knownScreens = new Set<string>(project.screens.map(screen => screen.screen.id))
  selectedScreenIds = selectedScreenIds.filter(id => knownScreens.has(id))
  if (activeScreenId && !knownScreens.has(activeScreenId)) activeScreenId = project.screens[0]?.screen.id ?? null
  const selected = selection
  if (selected?.type === 'screen' && !knownScreens.has(selected.id)) selection = null
  if (selected?.type === 'cabinetGrid' && !project.screens.some(screen => screen.grid.id === selected.id)) selection = null
  if (selected?.type === 'cabinet' && !project.screens.some(screen =>
    screen.screen.id === selected.screenId && screen.cabinets.some(cabinet => cabinet.id === selected.id))) selection = null
  render()
}

function showDocumentError(error: unknown, fallback: string): void {
  documentError.textContent = error instanceof Error ? error.message : fallback
  documentError.hidden = false
}

function clearDocumentError(): void {
  documentError.textContent = ''
  documentError.hidden = true
}

function replaceDocument(next: ProjectSession): void {
  mappingWorkspace?.finishGesture()
  outputMappingWorkspace?.finishGesture()
  finishArrowHistoryGroup()
  sessionWorkspaceProject(next)
  documentController.replace(next)
  selection = null
  selectedScreenIds = []
  activeScreenId = currentProject().screens[0]?.screen.id ?? null
  viewMode = 'all'
  endPointerGesture()
  if (appMode === 'layout') fitToProject()
  syncDocumentState()
  render()
  if (appMode === 'mapping') mappingWorkspace?.activate()
  if (appMode === 'output-mapping') outputMappingWorkspace?.activate()
  if (appMode === 'hardware') hardwareWorkspace?.activate()
  if (appMode === 'test') testWorkspace?.activate()
  if (appMode === 'export') exportWorkspace?.activate()
}

async function saveDocument(saveAs: boolean): Promise<boolean> {
  endPointerGesture()
  mappingWorkspace?.finishGesture()
  outputMappingWorkspace?.finishGesture()
  finishArrowHistoryGroup()
  finishHistoryGroup()
  clearDocumentError()
  try {
    const saved = await documentController.save(saveAs, request => window.ledmapDesktop.saveProject(request),
      () => window.ledmapDesktop.confirmLegacyUpgrade(),
      async (snapshot, current, result) => {
        if (result.sha256) await autosave.saved(snapshot, current, result.sha256)
      })
    syncDocumentState()
    return saved
  } catch (error) {
    showDocumentError(error, 'Unable to save the project.')
    return false
  }
}

async function canReplaceDocument(): Promise<boolean> {
  await documentController.settleSaves()
  const started = documentController.session
  if (!sessionDirty(started)) {
    try {
      await autosave.settle()
      return documentController.session === started
    } catch (error) {
      showDocumentError(error, 'Unable to reconcile the recovery snapshot.')
      return false
    }
  }
  const choice = await window.ledmapDesktop.confirmUnsavedChanges()
  if (documentController.session !== started) return false
  if (choice === 'cancel') return false
  if (choice === 'discard') {
    try { await autosave.discard(); return true } catch (error) {
      showDocumentError(error, 'Unable to discard the recovery snapshot.')
      return false
    }
  }
  return await saveDocument(false) && !sessionDirty(documentController.session)
}

async function newDocument(): Promise<void> {
  if (!await canReplaceDocument()) return
  clearDocumentError()
  const next = createProjectSession(`document-${++documentSerial}`)
  replaceDocument(next)
  autosave.attach(next, null)
}

async function openDocument(): Promise<void> {
  if (!await canReplaceDocument()) return
  clearDocumentError()
  try {
    let baseline: string | null = null
    const result = await documentController.open(async () => {
      const opened = await window.ledmapDesktop.openProject()
      baseline = opened.sha256 ?? null
      return opened
    })
    if (result === 'stale') {
      showDocumentError(new Error('Project changed while Open was pending. Retry Open.'), 'Unable to open the project.')
      return
    }
    if (result === 'opened') {
      replaceDocument(documentController.session)
      autosave.attach(documentController.session, baseline)
    }
  } catch (error) {
    showDocumentError(error, 'Unable to open the project.')
  }
}

function render(): void {
  renderTree()
  renderProperties()
  renderStatus()
  if (appMode === 'layout') draw()
  mappingWorkspace?.projectChanged()
  outputMappingWorkspace?.projectChanged()
  hardwareWorkspace?.projectChanged()
  testWorkspace?.projectChanged()
  exportWorkspace?.projectChanged()
}

function draw(): void {
  const note = drawProject(canvas, currentProject(), {
    mode: viewMode,
    selection,
    selectedScreenIds,
    activeScreenId,
    resizePreview,
    alignmentGuides,
    projectGuides,
    selectedGuideId,
    marquee: marqueeBox,
    overlays,
  }, camera)
  zoomIndicator.textContent = `${Math.round(camera.zoom * 100)}%`
  canvasNote.textContent = note
  const active = activeScreenId ? findScreen(currentProject(), activeScreenId) : undefined
  canvasTitle.textContent = viewMode === 'all' ? 'All Screens' : active ? active.screen.name : 'Active Screen'
  const summaries = currentProject().screens.map(s => `${s.screen.name} at ${s.x}, ${s.y}`).join('; ')
  canvas.setAttribute('aria-label', `Project canvas. ${currentProject().screens.length} screens. ${summaries}.`)
  const hidden = currentProject().screens.length === 0
  canvas.hidden = hidden
  empty.hidden = !hidden
  toggleMode.disabled = currentProject().screens.length === 0
}

function fitTo(b: { left: number; top: number; right: number; bottom: number; width: number; height: number }): void {
  const { width, height } = canvas.getBoundingClientRect()
  camera = fitCamera({ left: b.left, top: b.top, right: b.right, bottom: b.bottom, width: b.width, height: b.height }, width, height)
  draw()
}

function fitToProject(): void {
  const active = activeScreenId ? findScreen(currentProject(), activeScreenId) : undefined
  if (viewMode === 'all') fitTo(projectBounds(currentProject()))
  else if (active) fitTo(screenBounds(active))
}

function chipText(): string {
  if (selectedGuideId !== null && selectedScreenIds.length === 0 && !selection) return 'Guide selected'
  if (selectedScreenIds.length > 1) return `${selectedScreenIds.length} Screens selected`
  const current = selection
  if (!current) return 'No selection'
  const screen = current.type === 'cabinet' ? findScreen(currentProject(), current.screenId) : (
    current.type === 'screen' ? findScreen(currentProject(), current.id) : findScreenByGrid(current.id)
  )
  const suffix = screen ? ` · ${screen.screen.name}` : ''
  if (current.type === 'screen') return `${screen?.screen.name ?? 'Screen'} selected`
  if (current.type === 'cabinetGrid') return `Cabinet Grid${suffix}`
  return `${current.id}${suffix}`
}

function findScreenByGrid(gridId: string): ScreenView | undefined {
  return currentProject().screens.find(s => s.grid.id === gridId)
}

function renderStatus(): void {
  chip.textContent = chipText()
  selectedCount.textContent = `${selectedScreenIds.length} selected`
  toggleMode.textContent = viewMode === 'all' ? 'Focus Screen' : 'Show All'
  toggleMode.setAttribute('aria-pressed', String(viewMode === 'active'))
  snapToggle.textContent = snapEnabled ? 'Snap ✓' : 'Snap off'
  snapToggle.setAttribute('aria-pressed', String(snapEnabled))
  const sourceButtons: ReadonlyArray<[keyof SnapSources, HTMLButtonElement]> = [
    ['grid', snapGridButton], ['edges', snapEdgesButton], ['centers', snapCentersButton], ['guides', snapGuidesButton],
  ]
  for (const [source, button] of sourceButtons) {
    button.setAttribute('aria-pressed', String(snapSources[source]))
  }
  const activeSources = (Object.keys(snapSources) as ReadonlyArray<keyof SnapSources>)
    .filter(source => snapSources[source])
    .map(source => source[0]!.toUpperCase() + source.slice(1))
  snapStatus.textContent = snapEnabled ? `Snap on: ${activeSources.join('+')}` : 'Snap off'
  fitSelectionButton.disabled = selectedScreenIds.length === 0
  renameScreenButton.disabled = selectedScreenIds.length !== 1
  duplicateScreenButton.disabled = selectedScreenIds.length === 0
  deleteScreenButton.disabled = selectedScreenIds.length === 0
  document.querySelectorAll<HTMLButtonElement>('[data-overlay]').forEach(button => {
    const key = button.dataset['overlay'] as keyof OverlayVisibility
    button.setAttribute('aria-pressed', String(overlays[key]))
  })
}

function fitToSelection(): void {
  const selected = selectionBounds(layoutRects(selectedScreenIds))
  if (!selected) return
  fitTo({
    left: selected.x,
    top: selected.y,
    right: selected.x + selected.width,
    bottom: selected.y + selected.height,
    width: selected.width,
    height: selected.height,
  })
}

function zoomCanvas(factor: number): void {
  const { width, height } = canvas.getBoundingClientRect()
  camera = zoomAt(camera, { x: width / 2, y: height / 2 }, factor)
  draw()
}

function setActualSize(): void {
  const { width, height } = canvas.getBoundingClientRect()
  const center = toProject(camera, { x: width / 2, y: height / 2 })
  camera = { zoom: 1, offsetX: width / 2 - center.x, offsetY: height / 2 - center.y }
  draw()
}

function renderTree(): void {
  tree.replaceChildren()
  treeScreenCount.textContent = String(currentProject().screens.length)
  if (currentProject().screens.length === 0) {
    const emptyTree = document.createElement('p')
    emptyTree.className = 'hint'
    emptyTree.textContent = 'No Screens in this project.'
    tree.append(emptyTree)
    return
  }
  for (const screen of currentProject().screens) {
    const resolution = `${format.format(screenWidth(screen))} × ${format.format(screenHeight(screen))}`
    const node = makeTreeNode('screen', screen.screen.id, screen.screen.name, '▦', resolution, isSelected('screen', screen.screen.id))
    node.addEventListener('click', event => selectScreen(screen.screen.id, event.shiftKey || event.ctrlKey || event.metaKey))
    node.addEventListener('dblclick', () => focusScreenName())
    tree.append(node)
  }
}

function isSelected(type: SelectedObject['type'], id: string): boolean {
  if (type === 'screen') return selectedScreenIds.includes(id)
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

function selectScreen(screenId: string, additive = false): void {
  selectedScreenIds = replaceOrToggleSelection(selectedScreenIds, screenId, additive)
  selection = selectedScreenIds.length === 1 ? { type: 'screen', id: selectedScreenIds[0]! } : null
  activeScreenId = screenId
  render()
}

function renderProperties(): void {
  properties.replaceChildren()
  const title = element<HTMLHeadingElement>('properties-title')
  if (selectedGuideId !== null && selectedScreenIds.length === 0 && !selection) {
    const guide = projectGuides.find(candidate => candidate.id === selectedGuideId)
    if (guide) {
      renderGuideProperties(guide)
      return
    }
    selectedGuideId = null
  }
  if (selectedScreenIds.length > 1) {
    renderMultiProperties(title)
    return
  }
  if (!selection) {
    title.textContent = 'Nothing selected'
    const hint = document.createElement('p')
    hint.className = 'hint'
    hint.textContent = 'Select a Screen, a Cabinet Grid or a Cabinet on the canvas or in the project tree.'
    properties.append(hint)
    return
  }
  if (selection.type === 'screen') {
    const screen = findScreen(currentProject(), selection.id)
    if (screen) renderScreenProperties(screen)
    return
  }
  if (selection.type === 'cabinetGrid') {
    const screen = findScreenByGrid(selection.id)
    if (screen) renderGridProperties(screen)
    return
  }
  const screen = findScreen(currentProject(), selection.screenId)
  if (screen) renderCabinetProperties(screen)
}

function renderGuideProperties(guide: ProjectGuide): void {
  element<HTMLHeadingElement>('properties-title').textContent = 'Guide'
  const container = document.createElement('div')
  container.className = 'properties-body'
  const positionInput = numberField(guide.position, 'Guide Position', value => {
    projectGuides = moveGuide(projectGuides, guide.id, value)
    render()
  })
  positionInput.removeAttribute('min')
  const box = document.createElement('div')
  box.append(
    propertyRow('Orientation', valueNode(guide.orientation === 'vertical' ? 'Vertical' : 'Horizontal')),
    propertyRow('Position', positionInput),
    propertyRow('Locked', toggleField(guide.locked, 'Guide Locked', value => {
      projectGuides = setGuideLocked(projectGuides, guide.id, value)
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

function numberField(
  initial: number,
  ariaLabel: string,
  onCommit: (value: number) => string | null | void,
  validate?: (value: number) => string | null,
): HTMLInputElement {
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
    const commitProblem = problem ?? onCommit(value) ?? null
    if (commitProblem) {
      input.setAttribute('aria-invalid', 'true')
      input.title = commitProblem
      input.value = String(initial)
      return
    }
    input.removeAttribute('aria-invalid')
    input.removeAttribute('title')
  })
  return input
}

function textField(initial: string, ariaLabel: string, onCommit: (value: string) => string | null | void): HTMLInputElement {
  const input = document.createElement('input')
  input.type = 'text'
  input.value = initial
  input.setAttribute('aria-label', ariaLabel)
  input.addEventListener('change', () => {
    const problem = onCommit(input.value) ?? null
    if (problem) {
      input.setAttribute('aria-invalid', 'true')
      input.title = problem
      input.value = initial
      return
    }
    input.removeAttribute('aria-invalid')
    input.removeAttribute('title')
  })
  return input
}

function toggleField(initial: boolean, ariaLabel: string, onCommit: (value: boolean) => void): HTMLButtonElement {
  const button = document.createElement('button')
  button.type = 'button'
  button.className = 'property-toggle'
  button.setAttribute('aria-label', ariaLabel)
  button.setAttribute('aria-pressed', String(initial))
  button.textContent = initial ? 'ON' : 'OFF'
  button.addEventListener('click', () => onCommit(!initial))
  return button
}

function gridValidator(label: string, limit: (value: number) => number): (value: number) => string | null {
  return value => {
    if (!Number.isSafeInteger(value) || value < 1) return `${label} must be a whole number of at least 1.`
    const max = limit(value)
    if (value > max) return `${label} is limited to ${format.format(max)} for this screen.`
    return null
  }
}

function cabinetConfigProblem(screenId: string, patch: ScreenCabinetConfigPatch): string | null {
  try {
    updateScreenCabinetConfigV2(documentController.session.project, screenId, patch)
    return null
  } catch (error) {
    return error instanceof Error ? error.message : 'Unable to update cabinet configuration.'
  }
}

function commitCabinetConfig(screenId: string, patch: ScreenCabinetConfigPatch): string | null {
  try {
    applyV2(project => updateScreenCabinetConfigV2(project, screenId, patch))
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to update cabinet configuration.'
    canvasNote.textContent = message
    return message
  }
  render()
  return null
}

type ModuleDimensionKey = 'moduleColumns' | 'moduleRows' | 'modulePixelWidth' | 'modulePixelHeight'

function moduleNumberField(screen: ScreenView, prefix: string, key: ModuleDimensionKey, label: string): HTMLInputElement {
  const patch = (value: number): ScreenCabinetConfigPatch => ({ [key]: value }) as ScreenCabinetConfigPatch
  return numberField(
    screen.config[key],
    `${prefix} ${label}`,
    value => commitCabinetConfig(screen.screen.id, patch(value)),
    value => {
      if (!Number.isSafeInteger(value) || value < 1) return `${label} must be a whole number of at least 1.`
      return cabinetConfigProblem(screen.screen.id, patch(value))
    },
  )
}

function appendCabinetConfigGroups(container: HTMLDivElement, screen: ScreenView, prefix: string): void {
  const modulesBox = document.createElement('div')
  modulesBox.append(
    propertyRow('Columns', moduleNumberField(screen, prefix, 'moduleColumns', 'Module Columns')),
    propertyRow('Rows', moduleNumberField(screen, prefix, 'moduleRows', 'Module Rows')),
  )
  container.append(group('Modules per Cabinet', modulesBox))

  const moduleResolutionBox = document.createElement('div')
  moduleResolutionBox.append(
    propertyRow('Width', moduleNumberField(screen, prefix, 'modulePixelWidth', 'Module Pixel Width')),
    propertyRow('Height', moduleNumberField(screen, prefix, 'modulePixelHeight', 'Module Pixel Height')),
  )
  container.append(group('Module Resolution', moduleResolutionBox))

  const calculatedCabinetBox = document.createElement('div')
  calculatedCabinetBox.append(
    propertyRow('Width', valueNode(`${format.format(screen.grid.cabinetWidth)} px`)),
    propertyRow('Height', valueNode(`${format.format(screen.grid.cabinetHeight)} px`)),
    propertyRow('Modules', valueNode(format.format(screen.modulesPerCabinet))),
  )
  container.append(group('Calculated Cabinet', calculatedCabinetBox))

  const calculatedScreenBox = document.createElement('div')
  calculatedScreenBox.append(
    propertyRow('Width', valueNode(`${format.format(screenWidth(screen))} px`)),
    propertyRow('Height', valueNode(`${format.format(screenHeight(screen))} px`)),
  )
  container.append(group('Calculated Screen', calculatedScreenBox))

  const totalsBox = document.createElement('div')
  totalsBox.append(
    propertyRow('Cabinets', valueNode(format.format(screen.cabinets.length))),
    propertyRow('Modules', valueNode(format.format(screen.totalModules))),
    propertyRow('Pixels', valueNode(format.format(screen.pixelCount))),
  )
  container.append(group('Totals', totalsBox))
}

function renderScreenProperties(screen: ScreenView): void {
  element<HTMLHeadingElement>('properties-title').textContent = 'Screen'
  const container = document.createElement('div')
  container.className = 'properties-body'
  const nameInput = textField(screen.screen.name, 'Screen name', value => {
    try {
      applyV2(project => renameScreenV2(project, screen.screen.id, value))
      render()
      return null
    } catch (error) {
      return error instanceof Error ? error.message : 'Unable to rename Screen.'
    }
  })
  container.append(propertyRow('Name', nameInput))

  const positionBox = document.createElement('div')
  const xInput = numberField(screen.x, 'Screen X position', value => {
    try {
      applyV2(project => setScreenPositionV2(project, screen.screen.id, value, screen.y))
    } catch (error) {
      showDocumentError(error, 'Unable to move Screen.')
    }
    render()
  }, nonnegativeCoordinateProblem)
  const yInput = numberField(screen.y, 'Screen Y position', value => {
    try {
      applyV2(project => setScreenPositionV2(project, screen.screen.id, screen.x, value))
    } catch (error) {
      showDocumentError(error, 'Unable to move Screen.')
    }
    render()
  }, nonnegativeCoordinateProblem)
  xInput.min = '0'
  yInput.min = '0'
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

  appendCabinetConfigGroups(container, screen, 'Screen')
  properties.append(container)
}

function renderMultiProperties(title: HTMLHeadingElement): void {
  title.textContent = `${selectedScreenIds.length} Screens`
  const screens = layoutRects(selectedScreenIds)
  const bounds = selectionBounds(screens)
  const container = document.createElement('div')
  container.className = 'properties-body'
  const selectionBox = document.createElement('div')
  selectionBox.append(
    propertyRow('Selected', valueNode(String(selectedScreenIds.length))),
    propertyRow('Bounds', valueNode(bounds ? `${format.format(bounds.width)} × ${format.format(bounds.height)} px` : '—')),
  )
  container.append(group('Selection', selectionBox))

  const alignBox = document.createElement('div')
  alignBox.className = 'inspector-actions'
  const actions: readonly [string, AlignMode][] = [
    ['Left', 'left'], ['Center X', 'horizontal-center'], ['Right', 'right'],
    ['Top', 'top'], ['Center Y', 'vertical-center'], ['Bottom', 'bottom'],
  ]
  for (const [label, mode] of actions) {
    const button = document.createElement('button')
    button.type = 'button'
    button.textContent = label
    button.addEventListener('click', () => arrangeSelection(mode, false))
    alignBox.append(button)
  }
  container.append(group('Align', alignBox))

  if (selectedScreenIds.length >= 3) {
    const distributeBox = document.createElement('div')
    distributeBox.className = 'inspector-actions'
    for (const [label, axis] of [['Horizontal', 'horizontal'], ['Vertical', 'vertical']] as const) {
      const button = document.createElement('button')
      button.type = 'button'
      button.textContent = label
      button.addEventListener('click', () => arrangeSelection(axis, true))
      distributeBox.append(button)
    }
    container.append(group('Distribute', distributeBox))
  }
  properties.append(container)
}

function focusScreenName(): void {
  if (selectedScreenIds.length !== 1) return
  const input = properties.querySelector<HTMLInputElement>('input[aria-label="Screen name"]')
  input?.focus()
  input?.select()
}

function layoutRects(screenIds: readonly string[] = currentProject().screens.map(screen => screen.screen.id)): LayoutRect[] {
  const included = new Set(screenIds)
  return currentProject().screens.filter(screen => included.has(screen.screen.id)).map(screen => ({
    id: screen.screen.id,
    x: screen.x,
    y: screen.y,
    width: screenWidth(screen),
    height: screenHeight(screen),
  }))
}

function selectedPositions(): Readonly<Record<string, LayoutPoint>> {
  return Object.fromEntries(currentProject().screens
    .filter(screen => selectedScreenIds.includes(screen.screen.id))
    .map(screen => [screen.screen.id, { x: screen.x, y: screen.y }]))
}

function applyScreenPositions(positions: Readonly<Record<string, LayoutPoint>>, groupId?: number): boolean {
  try {
    const before = documentController.session
    applyV2(project => setScreenPositionsV2(project, positions), groupId)
    return documentController.session !== before
  } catch (error) {
    showDocumentError(error, 'Unable to move the selected Screens.')
    return false
  }
}

function nonnegativeCoordinateProblem(value: number): string | null {
  return Number.isSafeInteger(value) && value >= 0 ? null : 'Position must be a non-negative whole number.'
}

function commitResize(screenId: string, columns: number, rows: number): string | null {
  try {
    applyV2(project => resizeScreenGridV2(project, screenId, columns, rows))
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to resize the cabinet grid.'
    canvasNote.textContent = message
    return message
  }
  render()
  return null
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

  appendCabinetConfigGroups(container, screen, 'Cabinet Grid')
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
  if (selection?.type !== 'screen' || selectedScreenIds.length !== 1) return null
  const screen = findScreen(currentProject(), selection.id)
  if (!screen) return null
  return { screen, shape: screenShape(screen, screen.grid.columns, screen.grid.rows) }
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
  if (dragHistoryGroupId !== null) {
    const groupId = dragHistoryGroupId
    dragHistoryGroupId = null
    finishHistoryGroup(groupId)
  }
  pointerMode = 'none'
  dragState = null
  panState = null
  marqueeGesture = null
  marqueeBox = null
  guideGesture = null
  alignmentGuides = []
  resizeGesture = null
  resizePreview = null
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
  const additive = event.shiftKey || event.ctrlKey || event.metaKey
  const resizeTarget = resizeTargetAt(px)
  if (resizeTarget) {
    const { screen, handle } = resizeTarget
    selection = { type: 'screen', id: screen.screen.id }
    selectedScreenIds = [screen.screen.id]
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
  const hit = hitTest(currentProject(), projectPoint)
  canvas.classList.add('dragging')
  if (hit) {
    const screenId = hit.screen.screen.id
    activeScreenId = screenId
    selectedGuideId = null
    const alreadySelected = selectedScreenIds.includes(screenId)
    if (additive) {
      selectedScreenIds = replaceOrToggleSelection(selectedScreenIds, screenId, true)
      if (alreadySelected) {
        selection = selectedScreenIds.length === 1 ? { type: 'screen', id: selectedScreenIds[0]! } : null
        endPointerGesture()
        render()
        return
      }
    } else if (!alreadySelected || selectedScreenIds.length === 0) {
      selectedScreenIds = [screenId]
    }
    selection = selectedScreenIds.length === 1 ? { type: 'screen', id: selectedScreenIds[0]! } : null
    const selectedRects = layoutRects(selectedScreenIds)
    const bounds = selectionBounds(selectedRects)
    if (!bounds) return
    pointerMode = 'drag'
    dragHistoryGroupId = documentController.beginHistoryGroup()
    dragState = {
      screenIds: [...selectedScreenIds],
      startProject: projectPoint,
      positions: selectedPositions(),
      bounds,
      targets: layoutRects(currentProject().screens.map(screen => screen.screen.id).filter(id => !selectedScreenIds.includes(id))),
      appliedDx: 0,
      appliedDy: 0,
    }
    canvas.setPointerCapture(event.pointerId)
  } else {
    const guide = !additive ? guideHitTest(projectGuides, projectPoint, 8 / camera.zoom) : null
    if (guide) {
      selection = null
      selectedScreenIds = []
      selectedGuideId = guide.id
      guideGesture = { id: guide.id, previous: guide.position, moved: false }
      pointerMode = 'guide'
      canvas.setPointerCapture(event.pointerId)
    } else {
      selection = null
      selectedScreenIds = additive ? selectedScreenIds : []
      selectedGuideId = null
      pointerMode = 'marquee'
      marqueeGesture = { start: projectPoint, baseSelection: additive ? [...selectedScreenIds] : [] }
      marqueeBox = normalizeSelectionBox(projectPoint, projectPoint)
      canvas.setPointerCapture(event.pointerId)
    }
  }
  render()
})

canvas.addEventListener('pointermove', event => {
  const cursor = toProject(camera, viewportPoint(event))
  cursorStatus.textContent = `X ${Math.round(cursor.x)} · Y ${Math.round(cursor.y)}`
  if (pointerMode === 'pan' && panState) {
    camera = { ...camera, offsetX: camera.offsetX + event.offsetX - panState.lastX, offsetY: camera.offsetY + event.offsetY - panState.lastY }
    panState = { lastX: event.offsetX, lastY: event.offsetY }
    draw()
    return
  }
  if (pointerMode === 'resize' && resizeGesture) {
    const screen = findScreen(currentProject(), resizeGesture.screenId)
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
  if (pointerMode === 'guide' && guideGesture) {
    const gesture = guideGesture
    const point = toProject(camera, viewportPoint(event))
    const guide = projectGuides.find(candidate => candidate.id === gesture.id)
    if (guide && !guide.locked) {
      const position = guide.orientation === 'vertical' ? point.x : point.y
      if (position !== guide.position) {
        guideGesture = { ...gesture, moved: true }
        projectGuides = moveGuide(projectGuides, guide.id, position)
      }
    }
    draw()
    return
  }
  if (pointerMode === 'marquee' && marqueeGesture) {
    const point = toProject(camera, viewportPoint(event))
    marqueeBox = normalizeSelectionBox(marqueeGesture.start, point)
    selectedScreenIds = marqueeSelection(layoutRects(), marqueeGesture.start, point, marqueeGesture.baseSelection)
    selection = selectedScreenIds.length === 1 ? { type: 'screen', id: selectedScreenIds[0]! } : null
    draw()
    renderStatus()
    return
  }
  if (pointerMode === 'drag' && dragState) {
    const projectPoint = toProject(camera, viewportPoint(event))
    const guideTargets = snapEnabled && snapSources.guides && projectGuides.length > 0
      ? guidePositions(projectGuides)
      : undefined
    const snapped = snapEnabled
      ? snapTranslation({
        moving: dragState.bounds,
        targets: dragState.targets,
        dx: projectPoint.x - dragState.startProject.x,
        dy: projectPoint.y - dragState.startProject.y,
        ...(snapSources.grid ? { gridStep } : {}),
        snapEdges: snapSources.edges,
        snapCenters: snapSources.centers,
        ...(guideTargets ? { guideTargets } : {}),
        tolerance: 8 / camera.zoom,
      })
      : {
        dx: projectPoint.x - dragState.startProject.x,
        dy: projectPoint.y - dragState.startProject.y,
        guides: [],
      }
    alignmentGuides = snapped.guides
    const clamped = clampTranslationToOrigin(dragState.bounds, snapped.dx, snapped.dy)
    if (clamped.dx !== dragState.appliedDx || clamped.dy !== dragState.appliedDy) {
      const positions = Object.fromEntries(dragState.screenIds.map(id => {
        const start = dragState!.positions[id]!
        return [id, { x: start.x + clamped.dx, y: start.y + clamped.dy }]
      }))
      if (applyScreenPositions(positions, dragHistoryGroupId ?? undefined)) {
        dragState.appliedDx = clamped.dx
        dragState.appliedDy = clamped.dy
      }
    }
    render()
    return
  }
  const target = resizeTargetAt(viewportPoint(event))
  canvas.style.cursor = target ? resizeHandleCursor(target.handle) : ''
})

canvas.addEventListener('pointerup', () => {
  if (pointerMode === 'resize') {
    const gesture = resizeGesture
    const screen = gesture ? findScreen(currentProject(), gesture.screenId) : undefined
    if (gesture && screen && (gesture.columns !== screen.grid.columns || gesture.rows !== screen.grid.rows)) {
      endPointerGesture()
      commitResize(gesture.screenId, gesture.columns, gesture.rows)
      return
    }
    endPointerGesture()
    render()
    return
  }
  if (pointerMode === 'marquee') {
    endPointerGesture()
    selection = selectedScreenIds.length === 1 ? { type: 'screen', id: selectedScreenIds[0]! } : null
    render()
    return
  }
  if (pointerMode === 'guide') {
    endPointerGesture()
    render()
    return
  }
  endPointerGesture()
  render()
})

canvas.addEventListener('pointercancel', () => {
  if (guideGesture) projectGuides = moveGuide(projectGuides, guideGesture.id, guideGesture.previous)
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
      const first = currentProject().screens[0]
      if (first) activeScreenId = first.screen.id
    }
    const active = activeScreenId ? findScreen(currentProject(), activeScreenId) : undefined
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

function finishAddingScreen(): void {
  const project = currentProject()
  const fresh = project.screens[project.screens.length - 1]
  if (!fresh) return
  selection = { type: 'screen', id: fresh.screen.id }
  selectedScreenIds = [fresh.screen.id]
  activeScreenId = fresh.screen.id
  if (currentProject().screens.length === 1) {
    viewMode = 'all'
    fitToProject()
  } else if (viewMode === 'all') {
    fitToProject()
  } else {
    fitTo(screenBounds(fresh))
  }
  render()
}

function dialogInput(id: string): HTMLInputElement {
  return element<HTMLInputElement>(id)
}

function openScreenDialog(): void {
  const previous = currentProject().screens[currentProject().screens.length - 1]
  dialogInput('new-screen-name').value = `Screen ${currentProject().screens.length + 1}`
  dialogInput('new-screen-x').value = String(previous ? previous.x + 100 : 0)
  dialogInput('new-screen-y').value = String(previous ? previous.y + 100 : 0)
  dialogInput('new-screen-columns').value = initialDraft.columns
  dialogInput('new-screen-rows').value = initialDraft.rows
  dialogInput('new-screen-module-columns').value = initialDraft.moduleColumns
  dialogInput('new-screen-module-rows').value = initialDraft.moduleRows
  dialogInput('new-screen-module-width').value = initialDraft.modulePixelWidth
  dialogInput('new-screen-module-height').value = initialDraft.modulePixelHeight
  screenFormError.hidden = true
  screenFormError.textContent = ''
  screenDialog.showModal()
  dialogInput('new-screen-name').select()
}

addScreenButton.addEventListener('click', openScreenDialog)
emptyAddScreenButton.addEventListener('click', openScreenDialog)
element<HTMLButtonElement>('screen-cancel').addEventListener('click', () => screenDialog.close())

screenForm.addEventListener('submit', event => {
  event.preventDefault()
  const draft: Draft = {
    columns: dialogInput('new-screen-columns').value,
    rows: dialogInput('new-screen-rows').value,
    moduleColumns: dialogInput('new-screen-module-columns').value,
    moduleRows: dialogInput('new-screen-module-rows').value,
    modulePixelWidth: dialogInput('new-screen-module-width').value,
    modulePixelHeight: dialogInput('new-screen-module-height').value,
    ordering: { ...initialDraft.ordering },
  }
  try {
    applyV2(project => addScreenV2(project, draft, {
      name: dialogInput('new-screen-name').value,
      position: {
        x: Number(dialogInput('new-screen-x').value),
        y: Number(dialogInput('new-screen-y').value),
      },
    }))
    screenDialog.close()
    finishAddingScreen()
  } catch (error) {
    screenFormError.textContent = error instanceof Error ? error.message : 'Unable to add Screen.'
    screenFormError.hidden = false
  }
})

function arrangeSelection(kind: AlignMode | DistributeAxis, distribute: boolean): void {
  const minimum = distribute ? 3 : 2
  if (selectedScreenIds.length < minimum) return
  const screens = layoutRects(selectedScreenIds)
  const positions = distribute
    ? distributeScreens(screens, kind as DistributeAxis)
    : alignScreens(screens, kind as AlignMode)
  if (applyScreenPositions(positions)) render()
}

document.querySelectorAll<HTMLButtonElement>('[data-align]').forEach(button => {
  button.addEventListener('click', () => arrangeSelection(button.dataset['align'] as AlignMode, false))
})

document.querySelectorAll<HTMLButtonElement>('[data-distribute]').forEach(button => {
  button.addEventListener('click', () => arrangeSelection(button.dataset['distribute'] as DistributeAxis, true))
})

snapToggle.addEventListener('click', () => {
  snapEnabled = !snapEnabled
  render()
})

function toggleSnapSource(source: keyof SnapSources): void {
  snapSources = { ...snapSources, [source]: !snapSources[source] }
  render()
}

snapGridButton.addEventListener('click', () => toggleSnapSource('grid'))
snapEdgesButton.addEventListener('click', () => toggleSnapSource('edges'))
snapCentersButton.addEventListener('click', () => toggleSnapSource('centers'))
snapGuidesButton.addEventListener('click', () => toggleSnapSource('guides'))

function addGuideAtCenter(orientation: ProjectGuide['orientation']): void {
  const rect = canvas.getBoundingClientRect()
  const center = toProject(camera, { x: rect.width / 2, y: rect.height / 2 })
  const position = orientation === 'vertical' ? center.x : center.y
  projectGuides = addGuide(projectGuides, orientation, position)
  const created = projectGuides[projectGuides.length - 1]!
  selection = null
  selectedScreenIds = []
  selectedGuideId = created.id
  render()
}

guideAddV.addEventListener('click', () => addGuideAtCenter('vertical'))
guideAddH.addEventListener('click', () => addGuideAtCenter('horizontal'))

function deleteSelectedGuide(): void {
  if (selectedGuideId === null) return
  const guide = projectGuides.find(candidate => candidate.id === selectedGuideId)
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
  projectGuides = removeGuide(projectGuides, guide.id)
  selectedGuideId = null
  render()
}

gridStepInput.addEventListener('change', () => {
  const value = Number(gridStepInput.value)
  if (!Number.isSafeInteger(value) || value < 1) {
    gridStepInput.value = String(gridStep)
    gridStepInput.setAttribute('aria-invalid', 'true')
    return
  }
  gridStep = value
  gridStepInput.removeAttribute('aria-invalid')
})

fitSelectionButton.addEventListener('click', fitToSelection)
actualSizeButton.addEventListener('click', setActualSize)
zoomInButton.addEventListener('click', () => zoomCanvas(1.2))
zoomOutButton.addEventListener('click', () => zoomCanvas(1 / 1.2))

document.querySelectorAll<HTMLButtonElement>('[data-overlay]').forEach(button => {
  button.addEventListener('click', () => {
    const key = button.dataset['overlay'] as keyof OverlayVisibility
    overlays = { ...overlays, [key]: !overlays[key] }
    renderStatus()
    draw()
  })
})

renameScreenButton.addEventListener('click', focusScreenName)

duplicateScreenButton.addEventListener('click', () => {
  const sourceIds = [...selectedScreenIds]
  if (sourceIds.length === 0) return
  const duplicates: string[] = []
  applyV2(original => {
    let next = original
    for (const screenId of sourceIds) {
      next = duplicateScreenV2(next, screenId)
      const fresh = next.design.screens[next.design.screens.length - 1]
      if (fresh) duplicates.push(fresh.id)
    }
    return next
  })
  selectedScreenIds = duplicates
  activeScreenId = duplicates[duplicates.length - 1] ?? null
  selection = duplicates.length === 1 ? { type: 'screen', id: duplicates[0]! } : null
  fitToSelection()
  render()
})

function deleteSelection(): void {
  if (selectedScreenIds.length === 0) return
  try {
    applyV2(project => deleteScreensV2(project, selectedScreenIds))
  } catch (error) {
    showDocumentError(error, 'Unable to delete the selected Screens.')
    return
  }
  selectedScreenIds = []
  selection = null
  activeScreenId = currentProject().screens[0]?.screen.id ?? null
  viewMode = 'all'
  fitToProject()
  render()
}

deleteScreenButton.addEventListener('click', deleteSelection)

newProjectButton.addEventListener('click', () => { void newDocument() })
openProjectButton.addEventListener('click', () => { void openDocument() })
undoProjectButton.addEventListener('click', () => restoreHistory(false))
redoProjectButton.addEventListener('click', () => restoreHistory(true))
saveProjectButton.addEventListener('click', () => { void saveDocument(false) })
saveProjectAsButton.addEventListener('click', () => { void saveDocument(true) })

window.ledmapDesktop.onRequestSaveBeforeClose(() => {
  void saveDocument(false).then(saved => window.ledmapDesktop.finishCloseAfterSave(saved && !sessionDirty(documentController.session)))
})
window.ledmapDesktop.onRequestDiscardBeforeClose(() => {
  let timeout: ReturnType<typeof setTimeout> | undefined
  const limited = Promise.race([autosave.discard().then(() => true), new Promise<boolean>(resolve => {
    timeout = setTimeout(() => resolve(false), 5_000)
  })])
  void limited.then(discarded => {
    if (timeout) clearTimeout(timeout)
    if (!discarded) showDocumentError(new Error('Recovery cleanup is still pending. Retry Close.'), 'Unable to discard recovery.')
    window.ledmapDesktop.finishCloseAfterDiscard(discarded)
  }).catch(error => {
    if (timeout) clearTimeout(timeout)
    showDocumentError(error, 'Unable to discard recovery.')
    window.ledmapDesktop.finishCloseAfterDiscard(false)
  })
})
window.ledmapDesktop.onRequestSettleBeforeClose(() => {
  const started = documentController.session
  let timeout: ReturnType<typeof setTimeout> | undefined
  const limited = Promise.race([autosave.settle().then(() => true), new Promise<boolean>(resolve => {
    timeout = setTimeout(() => resolve(false), 5_000)
  })])
  void limited.then(settled => {
    if (timeout) clearTimeout(timeout)
    const ready = settled && documentController.session === started && !sessionDirty(documentController.session)
    if (!ready && !settled) showDocumentError(new Error('Recovery cleanup is still pending. Retry Close.'),
      'Unable to reconcile recovery.')
    window.ledmapDesktop.finishCloseAfterSettle(ready)
  }).catch(error => {
    if (timeout) clearTimeout(timeout)
    showDocumentError(error, 'Unable to reconcile recovery.')
    window.ledmapDesktop.finishCloseAfterSettle(false)
  })
})

mappingWorkspace = createMappingWorkspace({
  getProject: () => currentProject(),
  runCommand: (command, groupId) => applyV2(command, groupId),
  beginHistoryGroup: () => documentController.beginHistoryGroup(),
  endHistoryGroup: groupId => finishHistoryGroup(groupId),
  showError: showDocumentError,
  clearError: clearDocumentError,
})

outputMappingWorkspace = createOutputMappingWorkspace({
  getProject: () => documentController.session.project,
  runCommand: (command, groupId) => applyV2(command, groupId),
  beginHistoryGroup: () => documentController.beginHistoryGroup(),
  endHistoryGroup: groupId => finishHistoryGroup(groupId),
  showError: showDocumentError,
  clearError: clearDocumentError,
})

hardwareWorkspace = createHardwareWorkspace({
  getProject: () => currentProject(),
  getProjectV2: () => documentController.session.project,
  getDocumentStamp: () => ({ documentId: documentController.session.documentId, revision: documentController.session.revision }),
  runCommand: command => applyV2(command),
  showError: showDocumentError,
  clearError: clearDocumentError,
})

testWorkspace = createTestWorkspace({
  getProjectV2: () => documentController.session.project,
  onFrameChanged: snapshot => liveOutputController?.frameChanged(snapshot),
  getOutputOverlays: () => liveOutputController?.overlays() ?? [],
})
liveOutputController = createLiveOutputController({
  getSelectedScreenBounds: () => {
    const id = selectedScreenIds[0] ?? activeScreenId
    const project = documentController.session.project
    const screen = project.design.screens.find(value => value.id === id)
    const grid = project.design.cabinetGrids.find(value => value.id === screen?.cabinetGridOrder[0])
    const placement = project.design.composition.placements.find(value => value.screenId === id)
    return grid && placement ? {
      x: placement.x, y: placement.y,
      width: grid.columns * grid.cabinetWidth, height: grid.rows * grid.cabinetHeight,
    } : null
  },
  onOverlaysChanged: () => testWorkspace?.redraw(),
})
liveOutputController.frameChanged(testWorkspace.snapshot())
exportWorkspace = createExportWorkspace({
  getProjectV2: () => documentController.session.project,
  getTestSnapshot: () => testWorkspace!.snapshot(),
  getSelectedScreenId: () => selectedScreenIds[0] ?? activeScreenId,
  showError: showDocumentError,
  clearError: clearDocumentError,
})

function setAppMode(mode: AppMode): void {
  if (appMode === mode) return
  appMode = mode
  const layoutActive = mode === 'layout'
  const mappingActive = mode === 'mapping'
  const outputMappingActive = mode === 'output-mapping'
  const hardwareActive = mode === 'hardware'
  const testActive = mode === 'test'
  const exportActive = mode === 'export'
  layoutModeButton.classList.toggle('active', layoutActive)
  mappingModeButton.classList.toggle('active', mappingActive)
  outputMappingModeButton.classList.toggle('active', outputMappingActive)
  hardwareModeButton.classList.toggle('active', hardwareActive)
  testModeButton.classList.toggle('active', testActive)
  exportModeButton.classList.toggle('active', exportActive)
  for (const [button, isActive] of [
    [layoutModeButton, layoutActive],
    [mappingModeButton, mappingActive],
    [outputMappingModeButton, outputMappingActive],
    [hardwareModeButton, hardwareActive],
    [testModeButton, testActive],
    [exportModeButton, exportActive],
  ] as const) {
    if (isActive) button.setAttribute('aria-current', 'page')
    else button.removeAttribute('aria-current')
  }
  layoutToolbar.hidden = !layoutActive
  mappingToolbar.hidden = !mappingActive
  outputMappingToolbar.hidden = !outputMappingActive
  hardwareToolbar.hidden = !hardwareActive
  testToolbar.hidden = !testActive
  exportToolbar.hidden = !exportActive
  layoutWorkspace.hidden = !layoutActive
  mappingWorkspaceElement.hidden = !mappingActive
  outputMappingWorkspaceElement.hidden = !outputMappingActive
  hardwareWorkspaceElement.hidden = !hardwareActive
  testWorkspaceElement.hidden = !testActive
  exportWorkspaceElement.hidden = !exportActive
  document.querySelectorAll<HTMLElement>('.layout-status').forEach(item => { item.hidden = !layoutActive })
  document.querySelectorAll<HTMLElement>('.mapping-status').forEach(item => { item.hidden = !mappingActive })
  document.querySelectorAll<HTMLElement>('.hardware-status').forEach(item => { item.hidden = !hardwareActive })
  document.querySelectorAll<HTMLElement>('.test-status').forEach(item => { item.hidden = !testActive })
  document.querySelectorAll<HTMLElement>('.export-status').forEach(item => { item.hidden = !exportActive })
  mappingWorkspace?.deactivate()
  outputMappingWorkspace?.deactivate()
  hardwareWorkspace?.deactivate()
  testWorkspace?.deactivate()
  exportWorkspace?.deactivate()
  finishArrowHistoryGroup()
  endPointerGesture()
  if (layoutActive) {
    requestAnimationFrame(() => draw())
  }
  if (mappingActive) mappingWorkspace?.activate()
  if (outputMappingActive) outputMappingWorkspace?.activate()
  if (hardwareActive) hardwareWorkspace?.activate()
  if (testActive) testWorkspace?.activate()
  if (exportActive) exportWorkspace?.activate()
}

layoutModeButton.addEventListener('click', () => setAppMode('layout'))
mappingModeButton.addEventListener('click', () => setAppMode('mapping'))
outputMappingModeButton.addEventListener('click', () => setAppMode('output-mapping'))
hardwareModeButton.addEventListener('click', () => setAppMode('hardware'))
testModeButton.addEventListener('click', () => setAppMode('test'))
exportModeButton.addEventListener('click', () => setAppMode('export'))

function isNativeTextEditingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof Element)) return false
  return target.closest('input, select, textarea') !== null ||
    (target instanceof HTMLElement && target.isContentEditable)
}

window.addEventListener('keydown', event => {
  if (appMode !== 'layout') return
  if (isNativeTextEditingTarget(event.target)) return
  const arrows: Readonly<Record<string, readonly [number, number]>> = {
    ArrowLeft: [-1, 0],
    ArrowRight: [1, 0],
    ArrowUp: [0, -1],
    ArrowDown: [0, 1],
  }
  const direction = arrows[event.key]
  if (direction && selectedScreenIds.length > 0) {
    if (arrowHistoryKey !== event.key) finishArrowHistoryGroup()
    if (arrowHistoryGroupId === null) {
      arrowHistoryKey = event.key
      arrowHistoryGroupId = documentController.beginHistoryGroup()
    }
    const step = event.shiftKey ? 10 : 1
    const positions = nudgePositions(selectedPositions(), selectedScreenIds, direction[0] * step, direction[1] * step)
    if (applyScreenPositions(positions, arrowHistoryGroupId)) render()
    event.preventDefault()
    return
  }
  if (event.code === 'Space') {
    spaceDown = true
    canvas.classList.add('space-grab')
    event.preventDefault()
  }
  if (event.key === 'Escape') {
    if (guideGesture) projectGuides = moveGuide(projectGuides, guideGesture.id, guideGesture.previous)
    endPointerGesture()
    selection = null
    selectedScreenIds = []
    selectedGuideId = null
    render()
  }
  if (event.key === 'Delete' || event.key === 'Backspace') {
    if (selectedGuideId !== null) {
      deleteSelectedGuide()
      event.preventDefault()
      return
    }
    deleteSelection()
    event.preventDefault()
    return
  }
})

window.addEventListener('keyup', event => {
  if (event.key === arrowHistoryKey) finishArrowHistoryGroup()
  if (appMode !== 'layout') return
  if (event.code === 'Space') {
    spaceDown = false
    canvas.classList.remove('space-grab')
  }
})

window.addEventListener('blur', () => {
  finishArrowHistoryGroup()
  endPointerGesture()
  mappingWorkspace?.finishGesture()
  outputMappingWorkspace?.finishGesture()
})

window.addEventListener('keydown', event => {
  if (event.defaultPrevented || event.isComposing || isNativeTextEditingTarget(event.target) ||
      event.altKey || (!event.ctrlKey && !event.metaKey)) return
  const key = event.key.toLowerCase()
  if (key === 'z') {
    event.preventDefault()
    restoreHistory(event.shiftKey)
  } else if (key === 'y' && event.ctrlKey && !event.shiftKey) {
    event.preventDefault()
    restoreHistory(true)
  }
})

function fitOnFirstPaint(): void {
  const { width, height } = canvas.getBoundingClientRect()
  if (width > 0 && height > 0) {
    camera = fitCamera(projectBounds(currentProject()), width, height)
    draw()
  }
}

new ResizeObserver(fitOnFirstPaint).observe(viewport)
window.addEventListener('resize', () => { if (appMode === 'layout') draw() })

function watchPixelRatio(): void {
  const query = window.matchMedia(`(resolution: ${window.devicePixelRatio}dppx)`)
  query.addEventListener('change', () => {
    draw()
    watchPixelRatio()
  }, { once: true })
}

watchPixelRatio()
fitOnFirstPaint()
syncDocumentState()
render()

const hook: LedmapHook = {
  dump: () => currentProject().screens.map(s => ({
    id: s.screen.id,
    name: s.screen.name,
    x: s.x,
    y: s.y,
    width: screenWidth(s),
    height: screenHeight(s),
    columns: s.grid.columns,
    rows: s.grid.rows,
    cabinetWidth: s.grid.cabinetWidth,
    cabinetHeight: s.grid.cabinetHeight,
    moduleColumns: s.config.moduleColumns,
    moduleRows: s.config.moduleRows,
    modulePixelWidth: s.config.modulePixelWidth,
    modulePixelHeight: s.config.modulePixelHeight,
    modulesPerCabinet: s.modulesPerCabinet,
    totalModules: s.totalModules,
    numbering: s.grid.ordering.numbering,
    direction: s.grid.ordering.direction,
    snake: s.grid.ordering.snake,
    nextCabinetSerial: s.nextCabinetSerial,
    cabinets: s.cabinets.map(c => ({ id: c.id, index: c.index, column: c.column, row: c.row })),
    order: s.cabinets.map(c => c.index + 1),
  })),
  bounds: () => projectBounds(currentProject()),
  camera: () => ({ ...camera }),
  selection: () => selection,
  viewMode: () => viewMode,
  screenCenterPx: id => {
    const screen = findScreen(currentProject(), id)
    if (!screen) return { x: 0, y: 0 }
    const center = { x: screen.x + screenWidth(screen) / 2, y: screen.y + screenHeight(screen) / 2 }
    return toScreen(camera, center)
  },
  projectToPx: point => toScreen(camera, point),
  preview: () => resizePreview,
  resizeHandlesPx: id => {
    const screen = findScreen(currentProject(), id)
    if (!screen) return []
    return screenResizeHandles(camera, screen, screenShape(screen, screen.grid.columns, screen.grid.rows))
      .map(({ handle, point }) => ({ handle, x: point.x, y: point.y }))
  },
  document: () => ({
    dirty: sessionDirty(documentController.session),
    currentFilePath: documentController.session.currentFilePath,
    sourceSchemaVersion: documentController.session.sourceSchemaVersion,
    revision: documentController.session.revision,
    savedRevision: documentController.session.savedRevision,
  }),
  projectSnapshot: () => JSON.stringify(documentController.session.project),
  selectedScreens: () => [...selectedScreenIds],
  snap: () => ({ enabled: snapEnabled, sources: { ...snapSources }, step: gridStep }),
  guides: () => [...alignmentGuides],
  projectGuides: () => projectGuides.map(guide => ({ ...guide })),
}

;(window as unknown as { __ledmap: LedmapHook }).__ledmap = hook

async function reviewStartupRecovery(): Promise<void> {
  const started = documentController.session
  try {
    const selected = await window.ledmapDesktop.reviewRecovery()
    if (!selected || documentController.session !== started) return
    const recovered = recoverProjectSession(selected.text, `document-${++documentSerial}`)
    replaceDocument(recovered)
    autosave.attach(recovered, null, selected.recoveryId)
  } catch (error) {
    showDocumentError(error, 'Unable to inspect recovery snapshots.')
  }
}

void reviewStartupRecovery()
