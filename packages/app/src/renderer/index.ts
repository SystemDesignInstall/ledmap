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
  addScreenV2, deleteScreensV2, duplicateScreenV2, renameScreenV2, resizeScreenGridV2, setCabinetLabelV2,
  setScreenPositionV2, setScreenPositionsV2, updateScreenCabinetConfigV2,
} from './v2-commands.js'
import { buildSnapshot, initialDraft, type Draft, type Snapshot } from './state.js'
import { manualScreenPosition, nextScreenPosition, screenCreationDraft } from './screen-authoring.js'
import { SCREEN_PRESETS_KEY } from './screen-presets.js'
import { builtInCabinetPresets, emptyPresetLibrary, type CabinetPreset, type DrawingPreset, type PresetLibrary } from '../shared/preset-library.js'
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
import { MAX_PROJECT_GUIDES, projectGuidesFromExtensions, withProjectGuides } from './project-guides.js'
import { createMappingWorkspace, type MappingWorkspace } from './mapping-workspace.js'
import { createOutputMappingWorkspace, type OutputMappingWorkspace } from './output-mapping-workspace.js'
import { createHardwareWorkspace, type HardwareWorkspace } from './hardware-workspace.js'
import { createTestWorkspace, type TestWorkspace } from './test-workspace.js'
import { buildV2TestScene } from './v2-test-project.js'
import { buildCompositionChartFrame } from '../shared/chart-engine.js'
import { buildChartInformation } from '../shared/chart-information.js'
import { compactInformationBadges } from './test-canvas.js'
import type { TestFrame } from '../shared/test-engine.js'
import { createLiveOutputController, type LiveOutputController } from './live-output.js'
import { createExportWorkspace, type ExportWorkspace } from './export-workspace.js'
import { selectCompositionGeometry, type Direction, type Numbering } from '@ledmap/core'
import { chartBounds, chartLogoBounds, chartSettingsFromExtensions, screenChartStyle, screenNameVisible, screenCabinetLabels, defaultChartGuides, defaultChartInformation, withChartSettings, type ChartSettings, type ChartPalette, type ChartLabels, type ChartAnchor, type ScreenChartStyle } from '../shared/chart-settings.js'
import { cabinetDisplayLabel, duplicateCabinetLabel, physicalCabinetLabel, type CabinetLabelMode } from '../shared/cabinet-labels.js'

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
    readonly cabinets: ReadonlyArray<{ readonly id: string; readonly label: string; readonly index: number; readonly column: number; readonly row: number }>
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
  document(): { readonly dirty: boolean; readonly currentFilePath: string | null; readonly sourceSchemaVersion: 1 | 2 | 3 | 4 | 5 | 6;
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
const arrowStepInput = element<HTMLInputElement>('arrow-step')
const guideAddV = element<HTMLButtonElement>('guide-add-v')
const guideAddH = element<HTMLButtonElement>('guide-add-h')
const selectedCount = element<HTMLSpanElement>('selected-count')
const snapStatus = element<HTMLSpanElement>('snap-status')
const cursorStatus = element<HTMLSpanElement>('cursor-status')
const compositionStatus = element<HTMLSpanElement>('composition-status')
const fitSelectionButton = element<HTMLButtonElement>('fit-selection')
const actualSizeButton = element<HTMLButtonElement>('actual-size')
const zoomInButton = element<HTMLButtonElement>('zoom-in')
const zoomOutButton = element<HTMLButtonElement>('zoom-out')
const cleanViewButton = element<HTMLButtonElement>('clean-view')
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

function chartSettings(): ChartSettings {
  return chartSettingsFromExtensions(documentController.session.extensions)
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
let arrowStep = 1
try {
  const saved = Number(localStorage.getItem('ledmap.arrowStep.v1'))
  if (Number.isSafeInteger(saved) && saved >= 1 && saved <= 8192) arrowStep = saved
} catch { arrowStep = 1 }
arrowStepInput.value = String(arrowStep)
let projectGuides: readonly ProjectGuide[] = projectGuidesFromExtensions(documentController.session.extensions)
let selectedGuideId: string | null = null
let alignmentGuides: readonly AlignmentGuide[] = []
let marqueeBox: SelectionBox | null = null
let overlays: OverlayVisibility = { cabinets: true, modules: false, coordinates: false, editorLabels: false }
let cleanView = false
let compositionDrawingCache: { session: ProjectSession; scopeId: string | null; frame: TestFrame } | null = null
let creationPreview: { frame: TestFrame; bounds: { x: number; y: number; width: number; height: number } } | null = null
let creationCamera: Camera | null = null
let presetLibrary: PresetLibrary = emptyPresetLibrary()
let legacyPresetRaw: string | null = null
try { legacyPresetRaw = localStorage.getItem(SCREEN_PRESETS_KEY) } catch { legacyPresetRaw = null }
const presetLibraryReady = window.ledmapDesktop.loadPresetLibrary(legacyPresetRaw).then(library => {
  presetLibrary = library
  render()
}).catch(error => showDocumentError(error, 'Unable to load preset library.'))
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

function applyV2AndChartSettings(
  command: (project: LedMapProjectV2) => LedMapProjectV2,
  settingsCommand: (settings: ChartSettings) => ChartSettings,
): void {
  const before = documentController.session
  documentController.transactV2AndExtensions(command, extensions =>
    withChartSettings(extensions, settingsCommand(chartSettingsFromExtensions(extensions))))
  autosave.mutation(before, documentController.session)
  syncDocumentState()
}

function applyProjectGuides(next: readonly ProjectGuide[]): void {
  const before = documentController.session
  documentController.transactExtensions(extensions => withProjectGuides(extensions, next))
  projectGuides = projectGuidesFromExtensions(documentController.session.extensions)
  autosave.mutation(before, documentController.session)
  syncDocumentState()
  render()
}

function applyChartSettings(settings: ChartSettings): void {
  const previous = chartSettings()
  const before = documentController.session
  documentController.transactExtensions(extensions => withChartSettings(extensions, settings))
  autosave.mutation(before, documentController.session)
  syncDocumentState()
  if (previous.frameMode !== settings.frameMode ||
      previous.frame.x !== settings.frame.x || previous.frame.y !== settings.frame.y ||
      previous.frame.width !== settings.frame.width || previous.frame.height !== settings.frame.height) fitToProject()
  render()
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
  saveProjectButton.disabled = !dirty && session.sourceSchemaVersion >= 5
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
  projectGuides = projectGuidesFromExtensions(documentController.session.extensions)
  if (selectedGuideId && !projectGuides.some(guide => guide.id === selectedGuideId)) selectedGuideId = null
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
  const nextGuides = projectGuidesFromExtensions(next.extensions)
  documentController.replace(next)
  projectGuides = nextGuides
  selectedPresetIds.clear()
  selectedGuideId = null
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

function compositionDrawing(): TestFrame {
  const session = documentController.session
  const scopeId = viewMode === 'active' ? activeScreenId : null
  if (compositionDrawingCache?.session === session && compositionDrawingCache.scopeId === scopeId) {
    return compositionDrawingCache.frame
  }
  const scene = buildV2TestScene(session.project)
  const scope = scopeId ? { kind: 'screen' as const, target: scopeId } : { kind: 'composition' as const, target: null }
  const frame = buildCompositionChartFrame(scene, scope, chartSettings())
  compositionDrawingCache = { session, scopeId, frame }
  return frame
}

function draw(): void {
  const project = currentProject()
  const hidden = project.screens.length === 0 && creationPreview === null
  canvas.hidden = hidden
  empty.hidden = !hidden
  const settings = chartSettings()
  const visible = viewMode === 'active' ? project.screens.filter(screen => screen.screen.id === activeScreenId) : project.screens
  const transparentScreens = visible.filter(screen => {
    const style = screenChartStyle(settings, screen.screen.id)
    return style.palette === 'screen-color' && style.fill === 'transparent'
  }).map(screen => ({ x: screen.x, y: screen.y, width: screenWidth(screen), height: screenHeight(screen) }))
  const note = drawProject(canvas, project, {
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
    chartFrame: settings.frameMode === 'fixed' ? settings.frame : null,
    drawing: compositionDrawing(),
    creationPreview,
    transparentScreens,
    cleanView,
    cabinetLines: Object.fromEntries(visible.map(screen => [screen.screen.id, screenChartStyle(settings, screen.screen.id).cabinetEdges])),
    cabinetLineColors: Object.fromEntries(visible.map(screen => [screen.screen.id, screenChartStyle(settings, screen.screen.id).cabinetLineColor])),
    cabinetLabelModes: Object.fromEntries(visible.map(screen => {
      const style = screenChartStyle(settings, screen.screen.id)
      return [screen.screen.id, style.labels === 'none' || style.labels === 'screen'
        ? style.cabinetLabelMode ?? 'row-coordinate' : null]
    })),
  }, camera)
  zoomIndicator.textContent = `${Math.round(camera.zoom * 100)}%`
  canvasNote.textContent = note
  const active = activeScreenId ? findScreen(currentProject(), activeScreenId) : undefined
  if (viewMode === 'all') {
    const bounds = projectBounds(currentProject())
    canvasTitle.textContent = currentProject().screens.length === 0
      ? 'All Screens'
      : `All Screens · ${format.format(bounds.width)} × ${format.format(bounds.height)} px`
  } else {
    canvasTitle.textContent = active ? active.screen.name : 'Active Screen'
  }
  const summaries = currentProject().screens.map(s => `${s.screen.name} at ${s.x}, ${s.y}`).join('; ')
  canvas.setAttribute('aria-label', `Project canvas. ${currentProject().screens.length} screens. ${summaries}.`)
  toggleMode.disabled = currentProject().screens.length === 0
}

function fitTo(b: { left: number; top: number; right: number; bottom: number; width: number; height: number }): void {
  const { clientWidth: width, clientHeight: height } = viewport
  camera = fitCamera({ left: b.left, top: b.top, right: b.right, bottom: b.bottom, width: b.width, height: b.height }, width, height)
  draw()
}

function fitToProject(): void {
  const active = activeScreenId ? findScreen(currentProject(), activeScreenId) : undefined
  if (viewMode === 'all') {
    const bounds = projectBounds(currentProject())
    const settings = chartSettings()
    if (settings.frameMode !== 'fixed') { fitTo(bounds); return }
    const left = Math.min(bounds.left, settings.frame.x)
    const top = Math.min(bounds.top, settings.frame.y)
    const right = Math.max(bounds.right, settings.frame.x + settings.frame.width)
    const bottom = Math.max(bounds.bottom, settings.frame.y + settings.frame.height)
    fitTo({ left, top, right, bottom, width: right - left, height: bottom - top })
  }
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
  if (current.type === 'screen') return '1 Screen selected'
  if (current.type === 'cabinetGrid') return `Cabinet Grid${suffix}`
  return `${current.id}${suffix}`
}

function findScreenByGrid(gridId: string): ScreenView | undefined {
  return currentProject().screens.find(s => s.grid.id === gridId)
}

function compositionStatusText(): string {
  try {
    const geometry = selectCompositionGeometry(currentProject().model)
    if (!geometry.bounds) return 'No composition'
    const bounds = geometry.bounds
    const screens = geometry.screenCount === 1 ? '1 screen' : `${format.format(geometry.screenCount)} screens`
    return `Composition ${format.format(bounds.width)} × ${format.format(bounds.height)} px · ${screens}`
  } catch {
    return 'Composition unavailable'
  }
}

function renderStatus(): void {
  chip.textContent = chipText()
  compositionStatus.textContent = compositionStatusText()
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
  guideAddV.disabled = projectGuides.length >= MAX_PROJECT_GUIDES
  guideAddH.disabled = projectGuides.length >= MAX_PROJECT_GUIDES
  renameScreenButton.disabled = selectedScreenIds.length !== 1
  duplicateScreenButton.disabled = selectedScreenIds.length === 0
  deleteScreenButton.disabled = selectedScreenIds.length === 0
  document.querySelectorAll<HTMLButtonElement>('[data-overlay]').forEach(button => {
    const key = button.dataset['overlay'] as keyof OverlayVisibility
    button.setAttribute('aria-pressed', String(overlays[key]))
  })
  cleanViewButton.setAttribute('aria-pressed', String(cleanView))
}

arrowStepInput.addEventListener('change', () => {
  const value = Number(arrowStepInput.value)
  if (!arrowStepInput.value.trim() || !Number.isSafeInteger(value) || value < 1 || value > 8192) {
    arrowStepInput.value = String(arrowStep)
    arrowStepInput.setAttribute('aria-invalid', 'true')
    return
  }
  finishArrowHistoryGroup()
  arrowStep = value
  arrowStepInput.removeAttribute('aria-invalid')
  try { localStorage.setItem('ledmap.arrowStep.v1', String(value)) } catch { arrowStepInput.title = 'Move step is active for this session.' }
})

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
  if (viewMode === 'active') {
    const screen = findScreen(currentProject(), screenId)
    if (screen) fitTo(screenBounds(screen))
  }
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
    hint.textContent = 'Choose a Screen in the list or on the canvas. Double-click a Cabinet on the canvas to inspect it.'
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
    applyProjectGuides(moveGuide(projectGuides, guide.id, value))
  }, value => Number.isSafeInteger(value) ? null : 'Guide position must be a safe whole number.')
  positionInput.removeAttribute('min')
  const box = document.createElement('div')
  box.append(
    propertyRow('Orientation', valueNode(guide.orientation === 'vertical' ? 'Vertical' : 'Horizontal')),
    propertyRow('Position', positionInput),
    propertyRow('Locked', toggleField(guide.locked, 'Guide Locked', value => {
      applyProjectGuides(setGuideLocked(projectGuides, guide.id, value))
    })),
  )
  container.append(group('Guide', box))
  const remove = document.createElement('button')
  remove.type = 'button'
  remove.textContent = 'Delete Guide'
  remove.setAttribute('aria-label', 'Delete Guide')
  remove.disabled = guide.locked
  if (guide.locked) remove.title = 'Unlock this guide before deleting it.'
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

const inspectorOpenSections = new Map<string, boolean>()
const selectedPresetIds = new Map<string, string>()

function collapsibleGroup(title: string, key: string, container: HTMLDivElement, open = false): HTMLDetailsElement {
  const section = document.createElement('details')
  section.className = 'property-group property-disclosure'
  section.open = inspectorOpenSections.get(key) ?? open
  const summary = document.createElement('summary')
  summary.textContent = title
  section.append(summary, container)
  section.addEventListener('toggle', () => inspectorOpenSections.set(key, section.open))
  return section
}

function propertyRow(label: string, valueNode: HTMLElement): HTMLDivElement {
  const row = document.createElement('div')
  row.className = 'property'
  const labelNode = document.createElement('label')
  labelNode.textContent = label
  if (valueNode.id) labelNode.htmlFor = valueNode.id
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

  const labelMode = screenChartStyle(chartSettings(), screen.screen.id).cabinetLabelMode ?? 'row-coordinate'
  const labelsBox = document.createElement('div')
  const labelChoices: readonly (readonly [CabinetLabelMode, string])[] = [
    ['row-coordinate', 'Rows A, B... / columns 1, 2...'],
    ['column-coordinate', 'Columns A, B... / rows 1, 2...'],
    ['coordinates', 'Coordinates 1,1'],
    ['row-sequential', 'Sequential by rows'],
    ['column-sequential', 'Sequential by columns'],
    ['row-snake', 'Alternating rows'],
    ['column-snake', 'Alternating columns'],
    ['row-reverse', 'Reverse by rows'],
    ['column-reverse', 'Reverse by columns'],
  ]
  labelsBox.append(propertyRow('Display', drawingSelect('cabinet-label-mode', labelMode, labelChoices,
    value => updateScreenDrawing(screen.screen.id, { cabinetLabelMode: value }))))
  const labelHint = document.createElement('p')
  labelHint.className = 'hint'
  labelHint.textContent = 'Double-click a Cabinet on the canvas to set a custom label.'
  labelsBox.append(labelHint)
  container.append(group('Cabinet labels', labelsBox))
}

function updateScreenDrawing(screenId: string, patch: Partial<ScreenChartStyle>): void {
  try {
    const settings = chartSettings()
    if (patch.cabinetLabelMode) {
      const screen = findScreen(currentProject(), screenId)
      if (screen) {
        const duplicate = duplicateCabinetLabel(patch.cabinetLabelMode, screen.grid.columns, screen.grid.rows, screen.cabinets)
        if (duplicate) throw new Error(`Cabinet label ${duplicate} is already used on this Screen.`)
      }
    }
    const previous = screenChartStyle(settings, screenId)
    const style = { ...previous, labels: screenCabinetLabels(previous), showScreenName: screenNameVisible(previous), ...patch }
    applyChartSettings({ ...settings, screenStyles: { ...settings.screenStyles, [screenId]: style } })
  } catch (error) {
    showDocumentError(error, 'Unable to update Screen drawing.')
    render()
  }
}

function drawingSelect<T extends string>(
  id: string, value: T, choices: readonly (readonly [T, string])[], onChange: (value: T) => void,
): HTMLSelectElement {
  const select = document.createElement('select')
  select.id = id
  for (const [choice, label] of choices) {
    const option = document.createElement('option')
    option.value = choice
    option.textContent = label
    select.append(option)
  }
  select.value = value
  select.addEventListener('change', () => onChange(select.value as T))
  return select
}

function drawingColor(id: string, value: string, onChange: (value: string) => void): HTMLInputElement {
  const input = document.createElement('input')
  input.id = id
  input.type = 'color'
  input.value = value
  input.addEventListener('change', () => onChange(input.value))
  return input
}

function drawingNumber(id: string, value: number, min: number, max: number, onChange: (value: number) => void): HTMLInputElement {
  const input = numberField(value, id, onChange, value =>
    Number.isSafeInteger(value) && value >= min && value <= max ? null : `Enter a whole number from ${min} to ${max}.`)
  input.id = id
  input.min = String(min)
  input.max = String(max)
  return input
}

function appendPatternControls(drawing: HTMLDivElement, screenId: string, style: ScreenChartStyle): void {
  if (style.palette === 'checkerboard' || style.palette === 'rgb-bars') {
    const key = style.palette === 'checkerboard' ? 'checkerColors' : 'bandColors'
    const colors = style[key] ?? (key === 'checkerColors' ? ['#e9edf0', '#202b39'] : ['#ff0000', '#00ff00', '#0000ff'])
    const limit = key === 'checkerColors' ? 4 : 10
    colors.forEach((color, index) => drawing.append(propertyRow(`Color ${index + 1}`,
      drawingColor(`screen-drawing-${key}-${index}`, color, value => updateScreenDrawing(screenId, {
        [key]: colors.map((entry, position) => position === index ? value : entry),
      })))))
    const actions = document.createElement('div')
    actions.className = 'drawing-actions'
    for (const [text, disabled, next] of [
      ['+ Color', colors.length >= limit, [...colors, '#ffffff']],
      ['− Color', colors.length <= 2, colors.slice(0, -1)],
    ] as const) {
      const button = document.createElement('button')
      button.type = 'button'
      button.textContent = text
      button.disabled = disabled
      button.id = `screen-drawing-${key}-${text.startsWith('+') ? 'add' : 'remove'}`
      button.addEventListener('click', () => updateScreenDrawing(screenId, { [key]: next }))
      actions.append(button)
    }
    drawing.append(actions)
  }
  if (style.palette === 'rgb-bars' || style.palette === 'gray-gradient') {
    drawing.append(propertyRow('Direction', drawingSelect('screen-drawing-direction', style.patternDirection ?? 'horizontal', [
      ['horizontal', 'Horizontal'], ['vertical', 'Vertical'],
    ], value => updateScreenDrawing(screenId, { patternDirection: value }))))
  }
  if (style.palette === 'gray-gradient') {
    drawing.append(
      propertyRow('Start color', drawingColor('screen-drawing-gradient-from', style.gradientFrom ?? '#000000', value =>
        updateScreenDrawing(screenId, { gradientFrom: value }))),
      propertyRow('End color', drawingColor('screen-drawing-gradient-to', style.gradientTo ?? '#ffffff', value =>
        updateScreenDrawing(screenId, { gradientTo: value }))),
    )
  }
}

async function persistPresetLibrary(next: PresetLibrary): Promise<void> {
  await presetLibraryReady
  try {
    presetLibrary = await window.ledmapDesktop.savePresetLibrary(next)
    render()
  } catch (error) {
    presetLibrary = await window.ledmapDesktop.loadPresetLibrary(null)
    render()
    throw error
  }
}

function cabinetPresetFromScreen(name: string, screen: ScreenView, id: string = crypto.randomUUID()): CabinetPreset {
  return { id, name: name.trim(), moduleColumns: screen.config.moduleColumns, moduleRows: screen.config.moduleRows,
    modulePixelWidth: screen.config.modulePixelWidth, modulePixelHeight: screen.config.modulePixelHeight }
}

function drawingPresetFromScreen(name: string, screenId: string, id: string = crypto.randomUUID()): DrawingPreset {
  return { id, name: name.trim(), drawing: screenChartStyle(chartSettings(), screenId) }
}

function applyDrawingPreset(screenId: string, preset: DrawingPreset): void {
  try {
    const screen = findScreen(currentProject(), screenId)
    if (screen && preset.drawing.cabinetLabelMode) {
      const duplicate = duplicateCabinetLabel(preset.drawing.cabinetLabelMode, screen.grid.columns, screen.grid.rows, screen.cabinets)
      if (duplicate) throw new Error(`Cabinet label ${duplicate} is already used on this Screen.`)
    }
    const settings = chartSettings()
    applyChartSettings({ ...settings, screenStyles: { ...settings.screenStyles, [screenId]: preset.drawing } })
  } catch (error) {
    showDocumentError(error, 'Unable to apply Drawing preset.')
  }
}

function presetPanel(kind: 'cabinet' | 'drawing', screen: ScreenView): HTMLDetailsElement {
  const cabinet = kind === 'cabinet'
  const screenId = screen.screen.id
  const label = cabinet ? 'Saved LED' : 'Drawing preset'
  const selectionKey = `${screenId}:${kind}`
  const box = document.createElement('div')
  const selector = document.createElement('select')
  selector.id = cabinet ? 'screen-led-preset' : 'screen-drawing-preset'
  selector.setAttribute('aria-label', label)
  selector.append(new Option('Choose a preset', ''))
  if (cabinet) {
    const builtIn = document.createElement('optgroup')
    builtIn.label = 'Built-in cabinets'
    for (const preset of builtInCabinetPresets) builtIn.append(new Option(preset.name, preset.id))
    selector.append(builtIn)
  }
  const saved = document.createElement('optgroup')
  saved.label = cabinet ? 'Saved LED' : 'Saved drawings'
  for (const preset of cabinet ? presetLibrary.cabinets : presetLibrary.drawings) {
    saved.append(new Option(preset.name, preset.id))
  }
  selector.append(saved)
  selector.value = selectedPresetIds.get(selectionKey) ?? ''
  if (selector.selectedIndex < 0) {
    selector.value = ''
    selectedPresetIds.delete(selectionKey)
  }
  box.append(propertyRow(label, selector))
  const hint = document.createElement('p')
  hint.className = 'hint'
  box.append(hint)
  const actions = document.createElement('div')
  actions.className = 'preset-actions'
  const buttons = Object.fromEntries(['Apply', 'Update', 'Rename', 'Delete'].map(text => {
    const button = document.createElement('button')
    button.type = 'button'
    button.textContent = text
    button.setAttribute('aria-label', `${text} ${label}`)
    actions.append(button)
    return [text, button]
  })) as Record<'Apply' | 'Update' | 'Rename' | 'Delete', HTMLButtonElement>
  box.append(actions)
  const selected = (): CabinetPreset | DrawingPreset | undefined => cabinet
    ? [...builtInCabinetPresets, ...presetLibrary.cabinets].find(preset => preset.id === selector.value)
    : presetLibrary.drawings.find(preset => preset.id === selector.value)
  const updateControls = (): void => {
    const preset = selected()
    const custom = preset && (cabinet ? presetLibrary.cabinets : presetLibrary.drawings).some(item => item.id === preset.id)
    buttons.Apply.disabled = !preset
    buttons.Update.disabled = !custom
    buttons.Rename.disabled = !custom
    buttons.Delete.disabled = !custom
    const led = cabinet ? preset as CabinetPreset | undefined : undefined
    hint.textContent = led ? `${led.moduleColumns * led.modulePixelWidth} x ${led.moduleRows * led.modulePixelHeight} px per cabinet; Screen becomes ${screen.grid.columns * led.moduleColumns * led.modulePixelWidth} x ${screen.grid.rows * led.moduleRows * led.modulePixelHeight} px.`
      : cabinet ? 'Save module geometry as a named LED cabinet. Grid columns and rows stay on this Screen.'
        : 'Saves pattern, text, guides, information and logo. Applying keeps Screen geometry.'
  }
  selector.addEventListener('change', () => {
    if (selector.value) selectedPresetIds.set(selectionKey, selector.value)
    else selectedPresetIds.delete(selectionKey)
    updateControls()
    nameInput.value = selected()?.name ?? ''
    buttons.Delete.textContent = 'Delete'
    delete buttons.Delete.dataset.confirm
  })
  updateControls()
  buttons.Apply.addEventListener('click', () => {
    const preset = selected()
    if (!preset) return
    if (cabinet) {
      const led = preset as CabinetPreset
      commitCabinetConfig(screenId, { moduleColumns: led.moduleColumns, moduleRows: led.moduleRows,
        modulePixelWidth: led.modulePixelWidth, modulePixelHeight: led.modulePixelHeight })
    } else applyDrawingPreset(screenId, preset as DrawingPreset)
  })
  buttons.Update.addEventListener('click', () => {
    const preset = selected()
    if (!preset) return
    void (async () => {
      try {
        const next = cabinet ? { ...presetLibrary, cabinets: presetLibrary.cabinets.map(item => item.id === preset.id
          ? cabinetPresetFromScreen(item.name, screen, item.id) : item) }
          : { ...presetLibrary, drawings: presetLibrary.drawings.map(item => item.id === preset.id
            ? drawingPresetFromScreen(item.name, screenId, item.id) : item) }
        await persistPresetLibrary(next)
      } catch (error) { showDocumentError(error, `Unable to update ${label}.`) }
    })()
  })
  buttons.Rename.addEventListener('click', () => {
    const preset = selected()
    if (!preset) return
    const newName = nameInput.value.trim()
    if (!newName || newName === preset.name) {
      canvasNote.textContent = `Enter a new ${label} name in the field below, then choose Rename.`
      return
    }
    void (async () => {
      try {
        const next = cabinet ? { ...presetLibrary, cabinets: presetLibrary.cabinets.map(item => item.id === preset.id
          ? { ...item, name: newName } : item) }
          : { ...presetLibrary, drawings: presetLibrary.drawings.map(item => item.id === preset.id
            ? { ...item, name: newName } : item) }
        await persistPresetLibrary(next)
      } catch (error) { showDocumentError(error, `Unable to rename ${label}.`) }
    })()
  })
  buttons.Delete.addEventListener('click', () => {
    const preset = selected()
    if (!preset) return
    if (buttons.Delete.dataset.confirm !== preset.id) {
      buttons.Delete.dataset.confirm = preset.id
      buttons.Delete.textContent = 'Confirm delete'
      return
    }
    void (async () => {
      try {
        const next = cabinet ? { ...presetLibrary, cabinets: presetLibrary.cabinets.filter(item => item.id !== preset.id) }
          : { ...presetLibrary, drawings: presetLibrary.drawings.filter(item => item.id !== preset.id) }
        await persistPresetLibrary(next)
      } catch (error) { showDocumentError(error, `Unable to delete ${label}.`) }
    })()
  })
  const saveRow = document.createElement('div')
  saveRow.className = 'screen-preset-save'
  const nameInput = document.createElement('input')
  nameInput.maxLength = 40
  nameInput.placeholder = cabinet ? 'Cabinet name' : 'Drawing name'
  nameInput.title = 'Enter a name to Save new or Rename the selected preset.'
  nameInput.setAttribute('aria-label', cabinet ? 'New Saved LED name' : 'New Drawing preset name')
  nameInput.value = selected()?.name ?? ''
  const saveButton = document.createElement('button')
  saveButton.type = 'button'
  saveButton.textContent = 'Save new'
  saveButton.setAttribute('aria-label', `Save new ${label}`)
  saveButton.addEventListener('click', () => {
    void (async () => {
      try {
        const next = cabinet ? { ...presetLibrary, cabinets: [...presetLibrary.cabinets, cabinetPresetFromScreen(nameInput.value, screen)] }
          : { ...presetLibrary, drawings: [...presetLibrary.drawings, drawingPresetFromScreen(nameInput.value, screenId)] }
        await persistPresetLibrary(next)
        canvasNote.textContent = `${label} saved for use in other projects.`
      } catch (error) { showDocumentError(error, `Unable to save ${label}. Use a unique name.`) }
    })()
  })
  saveRow.append(nameInput, saveButton)
  box.append(saveRow)
  return collapsibleGroup(label, `${screenId}:${kind}-preset`, box)
}

function appendScreenDrawingGroup(container: HTMLDivElement, screen: ScreenView): void {
  const screenId = screen.screen.id
  const style = screenChartStyle(chartSettings(), screenId)
  const drawing = document.createElement('div')
  const transparentToggle = toggleField(style.fill === 'transparent', 'Transparent Screen fill', value =>
    updateScreenDrawing(screenId, { fill: value ? 'transparent' : '#284a68' }))
  transparentToggle.disabled = style.palette !== 'screen-color'
  drawing.append(
    propertyRow('Pattern', drawingSelect<ChartPalette>('screen-drawing-palette', style.palette, [
      ['screen-color', 'Solid color'], ['white-grid', 'White grid'], ['checkerboard', 'Checkerboard'],
      ['gray-gradient', 'Gradient'], ['rgb-bars', 'Color bands'],
    ], value => updateScreenDrawing(screenId, { palette: value }))),
    ...(style.palette === 'screen-color' ? [propertyRow('Color', (() => {
      const input = document.createElement('input')
      input.id = 'screen-drawing-color'
      input.type = 'color'
      input.value = style.fill === 'transparent' ? '#284a68' : style.fill
      input.disabled = style.fill === 'transparent'
      input.addEventListener('change', () => updateScreenDrawing(screenId, { fill: input.value }))
      return input
    })())] : []),
    propertyRow('Transparent', transparentToggle),
    propertyRow('Cabinet lines', toggleField(style.cabinetEdges, 'Screen cabinet lines', value =>
      updateScreenDrawing(screenId, { cabinetEdges: value }))),
    ...(style.cabinetEdges ? [propertyRow('Line color', drawingColor('screen-drawing-cabinet-line-color',
      style.cabinetLineColor ?? '#4a5055', value => updateScreenDrawing(screenId, { cabinetLineColor: value })))] : []),
    propertyRow('Offset marker', toggleField(style.offsetMarkers ?? false, 'Screen offset marker', value =>
      updateScreenDrawing(screenId, { offsetMarkers: value }))),
  )
  appendPatternControls(drawing, screenId, style)
  const drawingSection = group('Screen drawing', drawing)
  const logoFile = document.createElement('input')
  logoFile.id = 'screen-drawing-logo-file'
  logoFile.type = 'file'
  logoFile.accept = 'image/png'
  logoFile.setAttribute('aria-label', 'Screen drawing logo PNG')
  logoFile.addEventListener('change', () => {
    const file = logoFile.files?.[0]
    if (!file) return
    void (async () => {
      try {
        if (file.type !== 'image/png' || file.size > 256 * 1024) throw new Error('Choose a PNG no larger than 256 KiB.')
        const bitmap = await createImageBitmap(file)
        const { width, height } = bitmap
        bitmap.close()
        if (width < 1 || height < 1 || width > 512 || height > 512) {
          throw new Error('Logo must be at most 512 × 512 px.')
        }
        const dataUrl = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader()
          reader.onload = () => typeof reader.result === 'string' ? resolve(reader.result) : reject(new Error('Unable to read logo.'))
          reader.onerror = () => reject(new Error('Unable to read logo.'))
          reader.readAsDataURL(file)
        })
        updateScreenDrawing(screenId, { logo: { dataUrl, width, height },
          logoLayout: { position: style.logoLayout?.position ?? 'top-right',
            width: style.logoLayout?.width ?? width, opacity: style.logoLayout?.opacity ?? 100 } })
      } catch (error) {
        showDocumentError(error, 'Unable to import Screen logo.')
      } finally {
        logoFile.value = ''
      }
    })()
  })
  const logoBox = document.createElement('div')
  logoBox.className = 'screen-drawing-logo'
  const logoLabel = document.createElement('label')
  logoLabel.htmlFor = logoFile.id
  logoLabel.textContent = 'Logo PNG'
  logoBox.append(logoLabel, logoFile)
  const logoStatus = valueNode(style.logo ? `${style.logo.width} × ${style.logo.height} px` : 'No logo')
  logoStatus.id = 'screen-drawing-logo-summary'
  logoBox.append(logoStatus)
  const removeLogo = document.createElement('button')
  removeLogo.type = 'button'
  removeLogo.id = 'screen-drawing-logo-remove'
  removeLogo.textContent = 'Remove logo'
  removeLogo.disabled = style.logo === null
  removeLogo.addEventListener('click', () => updateScreenDrawing(screenId, { logo: null }))
  logoBox.append(removeLogo)
  const logoLayout = style.logoLayout ?? { position: 'top-right' as const, width: style.logo?.width ?? 128, opacity: 100 }
  logoBox.append(
    propertyRow('Position', drawingSelect('screen-logo-position', logoLayout.position, [
      ['top-left', 'Top left'], ['top-right', 'Top right'], ['bottom-left', 'Bottom left'],
      ['bottom-right', 'Bottom right'], ['center', 'Center'],
    ], value => updateScreenDrawing(screenId, { logoLayout: { ...logoLayout, position: value } }))),
    propertyRow('Width', drawingNumber('screen-logo-width', logoLayout.width, 1, 8192, value =>
      updateScreenDrawing(screenId, { logoLayout: { ...logoLayout, width: value } }))),
    propertyRow('Opacity %', drawingNumber('screen-logo-opacity', logoLayout.opacity, 0, 100, value =>
      updateScreenDrawing(screenId, { logoLayout: { ...logoLayout, opacity: value } }))),
  )
  if (style.logo) {
    const bounds = chartLogoBounds({ x: screen.x, y: screen.y, width: screenWidth(screen), height: screenHeight(screen) },
      style.logo, style.logoLayout)
    logoBox.append(valueNode(`Displayed: ${Math.round(bounds.width)} × ${Math.round(bounds.height)} px`))
  }
  const logoSection = collapsibleGroup('Logo', `${screenId}:logo`, logoBox)
  const text = document.createElement('div')
  const screenName = toggleField(screenNameVisible(style), 'Screen name visibility', value =>
    updateScreenDrawing(screenId, { showScreenName: value }))
  screenName.id = 'screen-drawing-name'
  text.append(
    propertyRow('Screen name', screenName),
    propertyRow('Name size', drawingNumber('screen-drawing-name-size', style.screenNameSize ?? 24, 10, 48, value =>
      updateScreenDrawing(screenId, { screenNameSize: value }))),
    propertyRow('Cabinet labels', drawingSelect<ChartLabels>('screen-drawing-labels', screenCabinetLabels(style), [
      ['none', 'None'], ['cabinet', 'Cabinet labels'], ['cabinet-id', 'Physical IDs'], ['coordinates', 'Coordinates'],
      ['grid-address', 'Columns / rows'],
    ], value => updateScreenDrawing(screenId, { labels: value }))),
    propertyRow('Text color', drawingColor('screen-drawing-text-color', style.textColor ??
      (style.palette === 'white-grid' ? '#202b39' : '#ffffff'), value => updateScreenDrawing(screenId, { textColor: value }))),
    propertyRow('Text shadow', toggleField(style.textShadow, 'Screen text shadow', value =>
      updateScreenDrawing(screenId, { textShadow: value }))),
  )
  const textHint = document.createElement('p')
  textHint.className = 'hint'
  textHint.textContent = 'Drawing labels stay 14 px while zooming. The Editor labels toolbar switch controls fallback IDs and Screen tags separately.'
  text.append(textHint)
  const textSection = group('Text', text)
  const guideBox = document.createElement('div')
  const guides = style.guides ?? { ...defaultChartGuides, color: style.palette === 'white-grid' ? '#202b39' : '#ffffff' }
  for (const [key, label] of [
    ['diagonals', 'Diagonals'], ['horizontalCenter', 'Horizontal center'], ['verticalCenter', 'Vertical center'],
    ['centralCircle', 'Central circle'], ['cornerCircles', 'Corner circles'], ['outerBorder', 'Outer border'],
  ] as const) {
    const toggle = toggleField(guides[key], `Graphic guide ${label}`, value =>
      updateScreenDrawing(screenId, { guides: { ...guides, [key]: value } }))
    toggle.id = `screen-guide-${key}`
    guideBox.append(propertyRow(label, toggle))
  }
  guideBox.append(
    propertyRow('Color', drawingColor('screen-guide-color', guides.color, value =>
      updateScreenDrawing(screenId, { guides: { ...guides, color: value } }))),
    propertyRow('Thickness', drawingNumber('screen-guide-thickness', guides.thickness, 1, 8, value =>
      updateScreenDrawing(screenId, { guides: { ...guides, thickness: value } }))),
  )
  const guideSection = collapsibleGroup('Graphic guides', `${screenId}:guides`, guideBox)
  const information = style.information ?? defaultChartInformation
  const infoBox = document.createElement('div')
  const infoToggle = toggleField(information.enabled, 'Show information block', value =>
    updateScreenDrawing(screenId, { information: { ...information, enabled: value } }))
  infoToggle.id = 'screen-info-enabled'
  infoBox.append(
    propertyRow('Show block', infoToggle),
    propertyRow('Position', drawingSelect<ChartAnchor>('screen-info-position', information.position, [
      ['top-left', 'Top left'], ['top-right', 'Top right'],
      ['bottom-left', 'Bottom left'], ['bottom-right', 'Bottom right'],
    ], value => updateScreenDrawing(screenId, { information: { ...information, position: value } }))),
    propertyRow('Text size', drawingNumber('screen-info-size', information.size, 10, 32, value =>
      updateScreenDrawing(screenId, { information: { ...information, size: value } }))),
  )
  for (const [key, label] of [
    ['resolution', 'Resolution'], ['aspectRatio', 'Aspect ratio'], ['cabinetSize', 'Cabinet size'],
    ['grid', 'Grid dimensions'], ['cabinetCount', 'Cabinet count'], ['canvasPosition', 'Canvas position'],
  ] as const) {
    const toggle = toggleField(information[key], `Information ${label}`, value =>
      updateScreenDrawing(screenId, { information: { ...information, [key]: value } }))
    toggle.id = `screen-info-${key}`
    infoBox.append(propertyRow(label, toggle))
  }
  const infoHint = document.createElement('p')
  infoHint.className = 'hint'
  const scene = buildV2TestScene(documentController.session.project)
  const sceneScreen = scene.screens.find(value => value.id === screenId)
  const informationFields = [information.resolution, information.aspectRatio, information.cabinetSize,
    information.grid, information.cabinetCount, information.canvasPosition]
  if (information.enabled && !informationFields.some(Boolean)) {
    infoHint.textContent = 'Select at least one field to show the information block.'
  } else if (information.enabled && sceneScreen && buildChartInformation(sceneScreen,
    scene.cabinets.filter(value => value.screen === screenId), information, '#ffffff').length === 0) {
    infoHint.textContent = 'Information does not fit this Screen. Use fewer fields or enlarge the Screen.'
  } else {
    infoHint.textContent = 'At small zoom, hover over the Info badge to read all fields. Exports keep the full block.'
  }
  infoBox.append(infoHint)
  const infoSection = collapsibleGroup('Information block', `${screenId}:information`, infoBox)
  container.append(drawingSection, textSection, guideSection, infoSection, logoSection, presetPanel('drawing', screen))
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
  container.append(group('Cabinet Grid', gridBox), presetPanel('cabinet', screen))
  appendScreenDrawingGroup(container, screen)

  appendCabinetConfigGroups(container, screen, 'Screen')
  properties.append(container)
}

function renderMultiProperties(title: HTMLHeadingElement): void {
  title.textContent = `${selectedScreenIds.length} Screens selected`
  const screens = layoutRects(selectedScreenIds)
  const bounds = selectionBounds(screens)
  const container = document.createElement('div')
  container.className = 'properties-body'
  const selectionBox = document.createElement('div')
  selectionBox.append(
    propertyRow('Screens', valueNode(String(selectedScreenIds.length))),
    propertyRow('Bounds', valueNode(bounds ? `${format.format(bounds.width)} × ${format.format(bounds.height)} px` : '—')),
  )
  container.append(group('Selection', selectionBox))

  const arrangeBox = document.createElement('div')
  arrangeBox.className = 'arrange-panel'
  appendArrangeRow(arrangeBox, 'Align horizontal', [
    ['Left', 'left', 'Align left'],
    ['Center', 'horizontal-center', 'Align horizontal centers'],
    ['Right', 'right', 'Align right'],
  ], false)
  appendArrangeRow(arrangeBox, 'Align vertical', [
    ['Top', 'top', 'Align top'],
    ['Middle', 'vertical-center', 'Align vertical centers'],
    ['Bottom', 'bottom', 'Align bottom'],
  ], false)
  appendArrangeRow(arrangeBox, 'Distribute', [
    ['Horizontal', 'horizontal', 'Distribute horizontally'],
    ['Vertical', 'vertical', 'Distribute vertically'],
  ], true)
  container.append(group('Arrange', arrangeBox))

  const common = (values: readonly number[]): string =>
    values.every(value => value === values[0]) ? `${format.format(values[0]!)} px` : 'Mixed'
  const positionBox = document.createElement('div')
  positionBox.append(
    propertyRow('X', valueNode(common(screens.map(screen => screen.x)))),
    propertyRow('Y', valueNode(common(screens.map(screen => screen.y)))),
  )
  container.append(group('Position', positionBox))
  const sizeBox = document.createElement('div')
  sizeBox.append(
    propertyRow('Width', valueNode(common(screens.map(screen => screen.width)))),
    propertyRow('Height', valueNode(common(screens.map(screen => screen.height)))),
  )
  container.append(group('Size', sizeBox))
  properties.append(container)
}

function appendArrangeRow(
  container: HTMLDivElement,
  label: string,
  actions: readonly (readonly [string, AlignMode | DistributeAxis, string])[],
  distribute: boolean,
): void {
  const row = document.createElement('div')
  row.className = distribute ? 'arrange-row distribute' : 'arrange-row'
  const heading = document.createElement('span')
  heading.className = 'arrange-label'
  heading.textContent = label
  const buttons = document.createElement('div')
  buttons.className = 'arrange-buttons'
  for (const [text, kind, tooltip] of actions) {
    const button = document.createElement('button')
    button.type = 'button'
    button.textContent = text
    button.title = tooltip
    button.dataset[distribute ? 'distribute' : 'align'] = kind
    button.disabled = distribute && selectedScreenIds.length < 3
    button.addEventListener('click', () => arrangeSelection(kind, distribute))
    buttons.append(button)
  }
  row.append(heading, buttons)
  container.append(row)
}

function focusScreenName(): void {
  if (selectedScreenIds.length !== 1) return
  const input = properties.querySelector<HTMLInputElement>('input[aria-label="Screen name"]')
  input?.focus()
  input?.select()
}

function visibleScreenIds(): readonly string[] {
  return viewMode === 'active' ? activeScreenId ? [activeScreenId] : []
    : currentProject().screens.map(screen => screen.screen.id)
}

function visibleProject(): Project {
  const project = currentProject()
  return viewMode === 'all' ? project : { ...project, screens: project.screens.filter(screen => screen.screen.id === activeScreenId) }
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
    const mode = screenChartStyle(chartSettings(), screenId).cabinetLabelMode ?? 'row-coordinate'
    applyV2(project => {
      const resized = resizeScreenGridV2(project, screenId, columns, rows)
      const grid = resized.design.cabinetGrids.find(value => value.screenId === screenId)
      if (grid) {
        const duplicate = duplicateCabinetLabel(mode, grid.columns, grid.rows,
          resized.design.cabinets.filter(value => value.gridId === grid.id))
        if (duplicate) throw new Error(`Cabinet label ${duplicate} is already used on this Screen.`)
      }
      return resized
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to resize the cabinet grid.'
    draw()
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
  const mode = screenChartStyle(chartSettings(), screen.screen.id).cabinetLabelMode ?? 'row-coordinate'
  const label = cabinetDisplayLabel(mode, screen.grid.columns, screen.grid.rows, cabinet)
  const manual = cabinet.label.trim().length > 0 && cabinet.label !== physicalCabinetLabel(cabinet.sourceId)
  const commitLabel = (value: string | null): string | null => {
    try {
      applyV2(project => setCabinetLabelV2(project, cabinet.sourceId, value, mode))
      render()
      return null
    } catch (error) {
      return error instanceof Error ? error.message : 'Unable to update Cabinet label.'
    }
  }
  const labelInput = textField(manual ? cabinet.label : '', 'Cabinet custom label', value => commitLabel(value || null))
  labelInput.placeholder = label
  const resetLabel = document.createElement('button')
  resetLabel.type = 'button'
  resetLabel.textContent = 'Use automatic label'
  resetLabel.disabled = !manual
  resetLabel.addEventListener('click', () => { commitLabel(null) })
  box.append(
    propertyRow('Display label', valueNode(label)),
    propertyRow('Custom label', labelInput),
    resetLabel,
    propertyRow('Physical ID', valueNode(cabinet.id)),
    propertyRow('Resolution', valueNode(`${format.format(screen.grid.cabinetWidth)} × ${format.format(screen.grid.cabinetHeight)} px`)),
    propertyRow('Modules', valueNode(format.format(screen.modulesPerCabinet))),
    propertyRow('Pixels', valueNode(format.format(screen.grid.cabinetWidth * screen.grid.cabinetHeight))),
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

function guideTargetAt(px: Point): ProjectGuide | null {
  return cleanView ? null : guideHitTest(projectGuides, toProject(camera, px), 5 / camera.zoom)
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
    selectedGuideId = null
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
  const guide = !additive ? guideTargetAt(px) : null
  if (guide) {
    selection = null
    selectedScreenIds = []
    selectedGuideId = guide.id
    if (!guide.locked) {
      guideGesture = { id: guide.id, previous: guide.position, moved: false }
      pointerMode = 'guide'
      canvas.classList.add('dragging')
      canvas.style.cursor = ''
      canvas.setPointerCapture(event.pointerId)
    }
    render()
    return
  }
  const hit = hitTest(visibleProject(), projectPoint)
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
      targets: layoutRects(visibleScreenIds().filter(id => !selectedScreenIds.includes(id))),
      appliedDx: 0,
      appliedDy: 0,
    }
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
  render()
})

canvas.addEventListener('dblclick', event => {
  if (event.button !== 0 || cleanView) return
  const hit = hitTest(visibleProject(), toProject(camera, viewportPoint(event)))
  if (!hit?.cabinet) return
  selection = { type: 'cabinet', id: hit.cabinet.id, screenId: hit.screen.screen.id }
  selectedScreenIds = [hit.screen.screen.id]
  activeScreenId = hit.screen.screen.id
  render()
})

canvas.addEventListener('pointermove', event => {
  const position = viewportPoint(event)
  const cursor = toProject(camera, position)
  const target = pointerMode === 'none' ? resizeTargetAt(position) : null
  const hoveredGuide = pointerMode === 'none' && !target ? guideTargetAt(position) : null
  const hovered = !cleanView && pointerMode === 'none' ? hitTest(visibleProject(), cursor) : null
  const informationBadge = compactInformationBadges(compositionDrawing(), camera).find(badge =>
    position.x >= badge.bounds.x && position.x <= badge.bounds.x + badge.bounds.width &&
    position.y >= badge.bounds.y && position.y <= badge.bounds.y + badge.bounds.height)
  if (informationBadge) {
    canvas.title = informationBadge.title
  } else if (hoveredGuide) {
    canvas.title = `${hoveredGuide.orientation === 'vertical' ? 'Vertical' : 'Horizontal'} guide · ${hoveredGuide.orientation === 'vertical' ? 'X' : 'Y'} ${hoveredGuide.position} px${hoveredGuide.locked ? ' · locked' : ''}`
  } else if (hovered?.cabinet && (viewMode === 'all' || hovered.screen.screen.id === activeScreenId)) {
    const mode = screenChartStyle(chartSettings(), hovered.screen.screen.id).cabinetLabelMode ?? 'row-coordinate'
    const label = cabinetDisplayLabel(mode, hovered.screen.grid.columns, hovered.screen.grid.rows, hovered.cabinet)
    canvas.title = `${label} · ${hovered.cabinet.id}`
  } else {
    canvas.title = ''
  }
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
        maxRowsForColumns(screen, columns),
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
    selectedScreenIds = marqueeSelection(layoutRects(visibleScreenIds()), marqueeGesture.start, point, marqueeGesture.baseSelection)
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
  canvas.style.cursor = target ? resizeHandleCursor(target.handle) : hoveredGuide ? hoveredGuide.locked ? 'pointer' : 'grab' : ''
})

canvas.addEventListener('pointerleave', () => {
  canvas.title = ''
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
    const moved = guideGesture?.moved ? projectGuides : null
    endPointerGesture()
    if (moved) applyProjectGuides(moved)
    else render()
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
    if (active) {
      selectedScreenIds = [active.screen.id]
      selection = { type: 'screen', id: active.screen.id }
      fitTo(screenBounds(active))
    }
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

function selectedCreationCabinetPreset(): CabinetPreset | undefined {
  const id = element<HTMLSelectElement>('new-screen-led-preset').value
  return [...builtInCabinetPresets, ...presetLibrary.cabinets].find(preset => preset.id === id)
}

function selectedCreationDrawingPreset(): DrawingPreset | undefined {
  const id = element<HTMLSelectElement>('new-screen-drawing-preset').value
  return presetLibrary.drawings.find(preset => preset.id === id)
}

function refreshCreationPresets(): void {
  const led = element<HTMLSelectElement>('new-screen-led-preset')
  const drawing = element<HTMLSelectElement>('new-screen-drawing-preset')
  led.replaceChildren(new Option('Custom cabinet', ''))
  const builtIn = document.createElement('optgroup')
  builtIn.label = 'Built-in cabinets'
  for (const preset of builtInCabinetPresets) builtIn.append(new Option(preset.name, preset.id))
  led.append(builtIn)
  if (presetLibrary.cabinets.length > 0) {
    const saved = document.createElement('optgroup')
    saved.label = 'Saved LED'
    for (const preset of presetLibrary.cabinets) saved.append(new Option(preset.name, preset.id))
    led.append(saved)
  }
  drawing.replaceChildren(new Option('Custom drawing', ''))
  for (const preset of presetLibrary.drawings) drawing.append(new Option(preset.name, preset.id))
  for (const kind of ['led', 'drawing'] as const) {
    const button = element<HTMLButtonElement>(`new-screen-${kind}-delete`)
    button.disabled = true
    button.textContent = 'Delete'
    delete button.dataset.confirm
  }
}

function applyCreationCabinetPreset(): void {
  const preset = selectedCreationCabinetPreset()
  const deleteButton = element<HTMLButtonElement>('new-screen-led-delete')
  deleteButton.disabled = !preset || !presetLibrary.cabinets.some(value => value.id === preset.id)
  deleteButton.textContent = 'Delete'
  delete deleteButton.dataset.confirm
  if (!preset) return
  element<HTMLSelectElement>('new-screen-geometry-mode').value = 'advanced'
  dialogInput('new-screen-module-columns').value = String(preset.moduleColumns)
  dialogInput('new-screen-module-rows').value = String(preset.moduleRows)
  dialogInput('new-screen-module-width').value = String(preset.modulePixelWidth)
  dialogInput('new-screen-module-height').value = String(preset.modulePixelHeight)
  updateCreationPreview()
}

function applyCreationDrawingPreset(): void {
  const preset = selectedCreationDrawingPreset()
  const deleteButton = element<HTMLButtonElement>('new-screen-drawing-delete')
  deleteButton.disabled = !preset
  deleteButton.textContent = 'Delete'
  delete deleteButton.dataset.confirm
  if (!preset) return
  element<HTMLSelectElement>('new-screen-palette').value = preset.drawing.palette
  dialogInput('new-screen-color').value = preset.drawing.fill === 'transparent' ? '#284a68' : preset.drawing.fill
  dialogInput('new-screen-transparent').checked = preset.drawing.fill === 'transparent'
  updateCreationPreview()
}

function creationDetails(): {
  draft: Draft
  snapshot: Snapshot
  position: { x: number; y: number }
  name: string
  palette: ChartPalette
  color: string
} {
  const advanced = element<HTMLSelectElement>('new-screen-geometry-mode').value === 'advanced'
  const draft = screenCreationDraft(
    dialogInput('new-screen-columns').value,
    dialogInput('new-screen-rows').value,
    advanced ? {
      mode: 'advanced',
      moduleColumns: dialogInput('new-screen-module-columns').value,
      moduleRows: dialogInput('new-screen-module-rows').value,
      moduleWidth: dialogInput('new-screen-module-width').value,
      moduleHeight: dialogInput('new-screen-module-height').value,
    } : {
      mode: 'basic', width: dialogInput('new-screen-cabinet-width').value,
      height: dialogInput('new-screen-cabinet-height').value,
    },
    initialDraft.ordering,
  )
  const built = buildSnapshot(null, draft)
  const problem = built.errors.form ?? Object.values(built.errors)[0]
  if (problem || !built.snapshot) throw new Error(problem ?? 'Unable to calculate Screen resolution.')
  const name = dialogInput('new-screen-name').value.trim()
  if (!name) throw new Error('Screen name cannot be empty.')
  const position = element<HTMLSelectElement>('new-screen-position-mode').value === 'manual'
    ? manualScreenPosition(dialogInput('new-screen-x').value, dialogInput('new-screen-y').value)
    : nextScreenPosition(currentProject().screens)
  return {
    draft, snapshot: built.snapshot, position, name,
    palette: element<HTMLSelectElement>('new-screen-palette').value as ChartPalette,
    color: element<HTMLSelectElement>('new-screen-palette').value === 'screen-color' && dialogInput('new-screen-transparent').checked
      ? 'transparent' : dialogInput('new-screen-color').value,
  }
}

function updateCreationPreview(): void {
  if (!screenDialog.open) return
  const advanced = element<HTMLSelectElement>('new-screen-geometry-mode').value === 'advanced'
  element<HTMLElement>('new-screen-basic').hidden = advanced
  element<HTMLElement>('new-screen-advanced').hidden = !advanced
  dialogInput('new-screen-cabinet-width').disabled = advanced
  dialogInput('new-screen-cabinet-height').disabled = advanced
  const manual = element<HTMLSelectElement>('new-screen-position-mode').value === 'manual'
  element<HTMLElement>('new-screen-manual').hidden = !manual
  dialogInput('new-screen-x').disabled = !manual
  dialogInput('new-screen-y').disabled = !manual
  const solid = element<HTMLSelectElement>('new-screen-palette').value === 'screen-color'
  element<HTMLElement>('new-screen-color-field').hidden = !solid
  element<HTMLElement>('new-screen-transparent-field').hidden = !solid
  dialogInput('new-screen-transparent').disabled = !solid
  dialogInput('new-screen-color').disabled = !solid || dialogInput('new-screen-transparent').checked
  try {
    const details = creationDetails()
    const { snapshot, position, name, palette, color } = details
    const bounds = { x: position.x, y: position.y,
      width: snapshot.screen.resolution.width, height: snapshot.screen.resolution.height }
    const scene = {
      ...buildV2TestScene(documentController.session.project),
      bounds,
      screens: [{ id: 'creation-preview', name, bounds }],
      cabinets: snapshot.cabinets.map(cabinet => ({
        id: cabinet.id, screen: 'creation-preview', logicalOrder: cabinet.index + 1,
        bounds: {
          x: position.x + cabinet.column * snapshot.grid.cabinetWidth,
          y: position.y + cabinet.row * snapshot.grid.cabinetHeight,
          width: snapshot.grid.cabinetWidth, height: snapshot.grid.cabinetHeight,
        },
        hardware: null,
      })),
      modules: [], signalPaths: [],
    }
    const settings = chartSettings()
    const style = { ...screenChartStyle(settings, 'creation-preview'), ...selectedCreationDrawingPreset()?.drawing, palette, fill: color }
    const frame = buildCompositionChartFrame(scene, { kind: 'screen', target: 'creation-preview' }, {
      ...settings, frameMode: 'fit', background: 'transparent', logoText: '', logo: null,
      screenStyles: { 'creation-preview': style },
    })
    creationPreview = { frame, bounds }
    element<HTMLElement>('new-screen-resolution').textContent =
      `${snapshot.grid.columns} × ${snapshot.grid.rows} cabinets · ${bounds.width} × ${bounds.height} px · ${snapshot.pixelCount.toLocaleString('en-US')} pixels`
    const screens = currentProject().screens
    const left = Math.min(bounds.x, ...screens.map(screen => screen.x))
    const top = Math.min(bounds.y, ...screens.map(screen => screen.y))
    const right = Math.max(bounds.x + bounds.width, ...screens.map(screen => screen.x + screenWidth(screen)))
    const bottom = Math.max(bounds.y + bounds.height, ...screens.map(screen => screen.y + screenHeight(screen)))
    const viewportRect = viewport.getBoundingClientRect()
    const dialogRect = screenDialog.getBoundingClientRect()
    const previewWidth = Math.max(200, Math.min(viewport.clientWidth, dialogRect.left - viewportRect.left - 16))
    camera = fitCamera({ left, top, right, bottom, width: right - left, height: bottom - top }, previewWidth, viewport.clientHeight)
  } catch (error) {
    creationPreview = null
    element<HTMLElement>('new-screen-resolution').textContent = error instanceof Error ? error.message : 'Invalid Screen geometry.'
  }
  draw()
}

async function openScreenDialog(): Promise<void> {
  await presetLibraryReady
  creationCamera = camera
  dialogInput('new-screen-name').value = `Screen ${currentProject().screens.length + 1}`
  dialogInput('new-screen-x').value = '0'
  dialogInput('new-screen-y').value = '0'
  dialogInput('new-screen-columns').value = initialDraft.columns
  dialogInput('new-screen-rows').value = initialDraft.rows
  dialogInput('new-screen-cabinet-width').value = '128'
  dialogInput('new-screen-cabinet-height').value = '128'
  dialogInput('new-screen-module-columns').value = '1'
  dialogInput('new-screen-module-rows').value = '1'
  dialogInput('new-screen-module-width').value = '128'
  dialogInput('new-screen-module-height').value = '128'
  element<HTMLSelectElement>('new-screen-geometry-mode').value = 'basic'
  const positionMode = element<HTMLSelectElement>('new-screen-position-mode')
  positionMode.value = 'auto'
  positionMode.options[0]!.textContent = currentProject().screens.length === 0 ? 'At origin (0, 0)' : 'After existing screens (64 px gap)'
  element<HTMLSelectElement>('new-screen-palette').value = 'screen-color'
  dialogInput('new-screen-color').value = '#284a68'
  dialogInput('new-screen-transparent').checked = false
  refreshCreationPresets()
  screenFormError.hidden = true
  screenFormError.textContent = ''
  screenDialog.showModal()
  updateCreationPreview()
  dialogInput('new-screen-name').select()
}

addScreenButton.addEventListener('click', () => { void openScreenDialog() })
emptyAddScreenButton.addEventListener('click', () => { void openScreenDialog() })
element<HTMLButtonElement>('screen-cancel').addEventListener('click', () => screenDialog.close())
element<HTMLSelectElement>('new-screen-led-preset').addEventListener('change', applyCreationCabinetPreset)
element<HTMLSelectElement>('new-screen-drawing-preset').addEventListener('change', applyCreationDrawingPreset)
for (const kind of ['led', 'drawing'] as const) {
  element<HTMLButtonElement>(`new-screen-${kind}-delete`).addEventListener('click', () => {
    const preset = kind === 'led' ? selectedCreationCabinetPreset() : selectedCreationDrawingPreset()
    if (!preset) return
    const button = element<HTMLButtonElement>(`new-screen-${kind}-delete`)
    if (button.dataset.confirm !== preset.id) {
      button.dataset.confirm = preset.id
      button.textContent = 'Confirm delete'
      return
    }
    void (async () => {
      try {
        const next = kind === 'led' ? { ...presetLibrary, cabinets: presetLibrary.cabinets.filter(value => value.id !== preset.id) }
          : { ...presetLibrary, drawings: presetLibrary.drawings.filter(value => value.id !== preset.id) }
        await persistPresetLibrary(next)
        refreshCreationPresets()
        updateCreationPreview()
      } catch (error) { showDocumentError(error, 'Unable to delete preset.') }
    })()
  })
}
screenForm.addEventListener('input', updateCreationPreview)
screenForm.addEventListener('change', updateCreationPreview)
screenDialog.addEventListener('close', () => {
  creationPreview = null
  if (creationCamera) camera = creationCamera
  creationCamera = null
  draw()
})

screenForm.addEventListener('submit', event => {
  event.preventDefault()
  try {
    const { draft, position, name, palette, color } = creationDetails()
    const preset = selectedCreationDrawingPreset()
    let createdId = ''
    applyV2AndChartSettings(project => {
      const next = addScreenV2(project, draft, { name, position })
      createdId = next.design.screens.at(-1)?.id ?? ''
      return next
    }, settings => ({
      ...settings,
      screenStyles: {
        ...settings.screenStyles,
        [createdId]: { ...screenChartStyle(settings, createdId), ...preset?.drawing, palette, fill: color },
      },
    }))
    creationCamera = null
    creationPreview = null
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
  if (projectGuides.length >= MAX_PROJECT_GUIDES) return
  try {
    const rect = canvas.getBoundingClientRect()
    const center = toProject(camera, { x: rect.width / 2, y: rect.height / 2 })
    const position = orientation === 'vertical' ? center.x : center.y
    applyProjectGuides(addGuide(projectGuides, orientation, position))
    const created = projectGuides[projectGuides.length - 1]!
    selection = null
    selectedScreenIds = []
    selectedGuideId = created.id
    render()
  } catch (error) {
    showDocumentError(error, 'Unable to add guide.')
  }
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
  selectedGuideId = null
  applyProjectGuides(removeGuide(projectGuides, guide.id))
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

cleanViewButton.addEventListener('click', () => {
  cleanView = !cleanView
  renderStatus()
  draw()
})

renameScreenButton.addEventListener('click', focusScreenName)

duplicateScreenButton.addEventListener('click', () => {
  const sourceIds = [...selectedScreenIds]
  if (sourceIds.length === 0) return
  const duplicates: string[] = []
  applyV2AndChartSettings(original => {
    let next = original
    for (const screenId of sourceIds) {
      next = duplicateScreenV2(next, screenId, 'after-screens')
      const fresh = next.design.screens[next.design.screens.length - 1]
      if (fresh) duplicates.push(fresh.id)
    }
    return next
  }, settings => ({ ...settings, screenStyles: {
    ...settings.screenStyles,
    ...Object.fromEntries(duplicates.map((id, index) => [id, screenChartStyle(settings, sourceIds[index]!)])),
  } }))
  selectedScreenIds = duplicates
  activeScreenId = duplicates[duplicates.length - 1] ?? null
  selection = duplicates.length === 1 ? { type: 'screen', id: duplicates[0]! } : null
  fitToSelection()
  render()
})

function deleteSelection(): void {
  if (selectedScreenIds.length === 0) return
  try {
    applyV2AndChartSettings(project => deleteScreensV2(project, selectedScreenIds), settings => ({
      ...settings,
      screenStyles: Object.fromEntries(Object.entries(settings.screenStyles).filter(([id]) => !selectedScreenIds.includes(id))),
      screenColors: Object.fromEntries(Object.entries(settings.screenColors).filter(([id]) => !selectedScreenIds.includes(id))),
    }))
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
  getDocumentStamp: () => ({ documentId: documentController.session.documentId, revision: documentController.session.revision }),
  getCompositionFrame: () => chartBounds(testWorkspace!.snapshot().scene, chartSettings()),
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
  getChartSettings: chartSettings,
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
  getChartSettings: chartSettings,
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
    const step = arrowStep * (event.shiftKey ? 10 : 1)
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
  const { clientWidth: width, clientHeight: height } = viewport
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
    cabinets: s.cabinets.map(c => ({ id: c.id, label: cabinetDisplayLabel(
      screenChartStyle(chartSettings(), s.screen.id).cabinetLabelMode ?? 'row-coordinate',
      s.grid.columns, s.grid.rows, c), index: c.index, column: c.column, row: c.row })),
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
