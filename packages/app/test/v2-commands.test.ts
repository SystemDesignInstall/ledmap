import { describe, expect, it } from 'vitest'
import {
  convertEditableProjectToV2, createProjectV2, projectV2GeometryMapping, projectV2HardwareMapping,
  type LedMapProjectV2,
} from '@ledmap/core'
import {
  addScreen, createProject, deleteScreens, duplicateScreen, renameScreen, resizeScreenGrid,
  setScreenPosition, setScreenPositions, updateScreenCabinetConfig, type Project,
} from '../src/renderer/project.js'
import {
  addMappingRegion, deleteMappingRegion, mapFromLayoutPosition, setInputCanvasResolution,
  updateMappingRegion,
} from '../src/renderer/mapping-project.js'
import { addPort, addProcessor, addReceiver, assignCabinets } from '../src/renderer/hardware-project.js'
import { initialDraft } from '../src/renderer/state.js'
import { commitProjectV2, createProjectSession, loadProjectSession, serializeProjectSession, sessionDirty } from '../src/renderer/project-session.js'
import { projectV2WorkspaceReadModel } from '../src/renderer/v2-read-model.js'
import {
  addMappingRegionV2, addScreenV2, deleteMappingRegionV2, deleteScreensV2, duplicateScreenV2,
  mapFromLayoutPositionV2, renameScreenV2, resizeScreenGridV2, setInputCanvasResolutionV2,
  setScreenPositionV2, setScreenPositionsV2, updateMappingRegionV2, updateScreenCabinetConfigV2,
} from '../src/renderer/v2-commands.js'
import { createTestProject, ref001Draft } from './project-fixtures.js'

function parity(legacy: Project, v2: LedMapProjectV2): void {
  const canonical = createProjectV2(v2)
  expect(canonical).toEqual(convertEditableProjectToV2(legacy.source))
  expect(projectV2WorkspaceReadModel(canonical).screens.map(view => ({
    id: view.screen.id, name: view.screen.name, resolution: view.screen.resolution,
    columns: view.grid.columns, rows: view.grid.rows, ordering: view.grid.ordering,
    config: view.config, x: view.x, y: view.y, cabinets: view.cabinets,
    nextCabinetSerial: view.nextCabinetSerial, path: view.path,
    modulesPerCabinet: view.modulesPerCabinet, totalModules: view.totalModules, pixelCount: view.pixelCount,
  }))).toEqual(legacy.screens.map(view => ({
    id: view.screen.id, name: view.screen.name, resolution: view.screen.resolution,
    columns: view.grid.columns, rows: view.grid.rows, ordering: view.grid.ordering,
    config: view.config, x: view.x, y: view.y, cabinets: view.cabinets,
    nextCabinetSerial: view.nextCabinetSerial, path: view.path,
    modulesPerCabinet: view.modulesPerCabinet, totalModules: view.totalModules, pixelCount: view.pixelCount,
  })))
}

function assignedTwoCabinets(): LedMapProjectV2 {
  const draft = { ...initialDraft, columns: '2', rows: '1', moduleColumns: '1', moduleRows: '1', modulePixelWidth: '2', modulePixelHeight: '2' }
  let legacy = addScreen(createProject(), draft)
  legacy = addProcessor(legacy)
  legacy = addPort(legacy, 'processor-1')
  legacy = addReceiver(legacy, 'port-1')
  legacy = assignCabinets(legacy, 'receiver-1', legacy.source.hardwareTopology.cabinets.map(value => value.id))
  return convertEditableProjectToV2(legacy.source)
}

describe('direct V2 Layout and Mapping commands', () => {
  it('creates a new Screen with one module per Cabinet by default', () => {
    const project = addScreenV2(createProjectSession('default').project)
    const screen = projectV2WorkspaceReadModel(project).screens[0]!
    expect(screen.config).toMatchObject({ moduleColumns: 1, moduleRows: 1, modulePixelWidth: 32, modulePixelHeight: 32 })
    expect(screen.screen.resolution).toEqual({ width: 128, height: 96 })
    expect(project.design.modules).toHaveLength(12)
  })

  it('duplicates an existing four-by-four Screen without applying the new default', () => {
    const original = addScreenV2(createProjectSession('reference').project, ref001Draft)
    const duplicate = duplicateScreenV2(original, 'screen-1')
    const screens = projectV2WorkspaceReadModel(duplicate).screens
    expect(screens[0]!.config).toMatchObject({ moduleColumns: 4, moduleRows: 4, modulePixelWidth: 32, modulePixelHeight: 32 })
    expect(screens[1]!.config).toEqual(screens[0]!.config)
    expect(screens[1]!.screen.resolution).toEqual({ width: 512, height: 384 })
  })

  it('matches every existing Layout mutation and derived ScreenView', () => {
    let legacy = createTestProject()
    let v2 = convertEditableProjectToV2(legacy.source)
    legacy = addScreen(legacy)
    v2 = addScreenV2(v2)
    parity(legacy, v2)
    legacy = renameScreen(legacy, 'screen-4', 'Lobby')
    v2 = renameScreenV2(v2, 'screen-4', 'Lobby')
    parity(legacy, v2)
    legacy = setScreenPosition(legacy, 'screen-4', -40, 80)
    v2 = setScreenPositionV2(v2, 'screen-4', -40, 80)
    parity(legacy, v2)
    const positions = { 'screen-1': { x: 30, y: 40 }, 'screen-2': { x: 700, y: -20 } }
    legacy = setScreenPositions(legacy, positions)
    v2 = setScreenPositionsV2(v2, positions)
    parity(legacy, v2)
    legacy = resizeScreenGrid(legacy, 'screen-1', 5, 3)
    v2 = resizeScreenGridV2(v2, 'screen-1', 5, 3)
    parity(legacy, v2)
    legacy = updateScreenCabinetConfig(legacy, 'screen-1', { direction: 'right-to-left', modulePixelWidth: 48 })
    v2 = updateScreenCabinetConfigV2(v2, 'screen-1', { direction: 'right-to-left', modulePixelWidth: 48 })
    parity(legacy, v2)
    legacy = duplicateScreen(legacy, 'screen-1')
    v2 = duplicateScreenV2(v2, 'screen-1')
    parity(legacy, v2)
    legacy = deleteScreens(legacy, ['screen-2', 'screen-4'])
    v2 = deleteScreensV2(v2, ['screen-2', 'screen-4'])
    parity(legacy, v2)
  })

  it('matches Input Canvas, Region create/update/delete and explicit Map from Layout', () => {
    let legacy = createTestProject()
    let v2 = convertEditableProjectToV2(legacy.source)
    legacy = setInputCanvasResolution(legacy, 1920, 1080)
    v2 = setInputCanvasResolutionV2(v2, 1920, 1080)
    parity(legacy, v2)
    legacy = addMappingRegion(legacy, 'screen-1', { x: 10, y: 20 })
    v2 = addMappingRegionV2(v2, 'screen-1', { x: 10, y: 20 })
    parity(legacy, v2)
    legacy = updateMappingRegion(legacy, 'region-1', { x: 120, y: 90, width: 500, height: 300 })
    v2 = updateMappingRegionV2(v2, 'region-1', { x: 120, y: 90, width: 500, height: 300 })
    parity(legacy, v2)
    legacy = setScreenPosition(legacy, 'screen-1', 320, 180)
    v2 = setScreenPositionV2(v2, 'screen-1', 320, 180)
    legacy = mapFromLayoutPosition(legacy, 'screen-1', 'region-1')
    v2 = mapFromLayoutPositionV2(v2, 'screen-1', 'region-1')
    parity(legacy, v2)
    legacy = deleteMappingRegion(legacy, 'region-1')
    v2 = deleteMappingRegionV2(v2, 'region-1')
    parity(legacy, v2)
  })

  it('changes Grid logical order without touching HardwareAssignment, SignalRoute or PortReceiverOrder', () => {
    const initial = assignedTwoCabinets()
    const before = projectV2WorkspaceReadModel(initial).screens[0]!.cabinets.map(value => value.index)
    const hardware = projectV2HardwareMapping(initial)
    const changed = updateScreenCabinetConfigV2(initial, 'screen-1', { direction: 'right-to-left' })
    const after = projectV2WorkspaceReadModel(createProjectV2(changed)).screens[0]!.cabinets.map(value => value.index)
    expect(after).not.toEqual(before)
    expect(changed.hardware).toBe(initial.hardware)
    expect(changed.hardware.assignments).toBe(initial.hardware.assignments)
    expect(changed.hardware.receiverOrder).toBe(initial.hardware.receiverOrder)
    expect(changed.operations.signalRoutes).toBe(initial.operations.signalRoutes)
    expect(projectV2HardwareMapping(changed)).toEqual(hardware)
  })

  it('blocks resize or Screen deletion when a removed Cabinet has a Hardware dependency', () => {
    const project = assignedTwoCabinets()
    expect(() => resizeScreenGridV2(project, 'screen-1', 1, 1)).toThrow(/PROJECT_CABINET_IN_USE/)
    expect(() => deleteScreensV2(project, ['screen-1'])).toThrow(/PROJECT_CABINET_IN_USE/)
    expect(project.design.cabinets).toHaveLength(2)
    const session = { ...createProjectSession('assigned'), project }
    expect(() => commitProjectV2(session, source => resizeScreenGridV2(source, 'screen-1', 1, 1)))
      .toThrow(/PROJECT_CABINET_IN_USE/)
    expect(session.revision).toBe(0)
    expect(session.project).toBe(project)
  })

  it('preserves assigned surviving Cabinet and Module IDs when the Grid grows', () => {
    const project = assignedTwoCabinets()
    const grown = resizeScreenGridV2(project, 'screen-1', 3, 1)
    expect(() => createProjectV2(grown)).not.toThrow()
    expect(grown.design.cabinets.slice(0, 2).map(value => value.id)).toEqual(project.design.cabinets.map(value => value.id))
    expect(grown.design.modules.slice(0, 2).map(value => value.id)).toEqual(project.design.modules.map(value => value.id))
    expect(grown.hardware).toBe(project.hardware)
    expect(grown.operations).toBe(project.operations)
    expect(grown.design.cabinets[2]!.id).not.toBe(project.design.cabinets[1]!.id)
  })

  it('cascades MappingRegions on Screen delete and preserves InputCanvas identity', () => {
    let project = convertEditableProjectToV2(createTestProject().source)
    project = setInputCanvasResolutionV2(project, 800, 600)
    project = addMappingRegionV2(project, 'screen-1')
    const canvasId = project.content.inputCanvases[0]!.id
    project = deleteScreensV2(project, ['screen-1'])
    expect(project.content.mappingRegions).toEqual([])
    expect(project.content.inputCanvases[0]!.id).toBe(canvasId)
    expect(project.design.screens.every(value => value.mappingRegionOrder.every(id => id !== 'region-1'))).toBe(true)
  })

  it('preserves V2-only fields on direct commands and blocks locked Layout placement', () => {
    const initial = convertEditableProjectToV2(createTestProject().source)
    const first = initial.design.cabinets[0]!
    const project = createProjectV2({
      ...initial,
      metadata: { name: 'Keep V2 metadata' },
      design: {
        ...initial.design,
        cabinets: initial.design.cabinets.map(cabinet => cabinet.id === first.id ? { ...cabinet, label: 'Custom label' } : cabinet),
        composition: { placements: initial.design.composition.placements.map(value => value.screenId === 'screen-1'
          ? { ...value, locked: true } : value) },
      },
    })
    const renamed = renameScreenV2(project, 'screen-1', 'Renamed')
    expect(renamed.metadata).toBe(project.metadata)
    expect(renamed.design.cabinets).toBe(project.design.cabinets)
    expect(renamed.design.composition).toBe(project.design.composition)
    expect(() => setScreenPositionV2(project, 'screen-1', 25, 30)).toThrow(/PROJECT_COMPAT_MUTATION_BLOCKED/)
    expect(setScreenPositionV2(project, 'screen-1', 0, 0)).toBe(project)
  })

  it('keeps out-of-bounds Mapping geometry diagnosable rather than blocking a valid edit', () => {
    let session = createProjectSession('mapping')
    session = commitProjectV2(session, project => addScreenV2(project))
    session = commitProjectV2(session, project => setInputCanvasResolutionV2(project, 800, 600))
    session = commitProjectV2(session, project => addMappingRegionV2(project, 'screen-1'))
    session = commitProjectV2(session, project => updateMappingRegionV2(project, 'region-1', { x: 700, y: 500 }))
    const regionId = session.project.content.mappingRegions[0]!.id
    const projection = projectV2GeometryMapping(session.project, regionId)
    expect(projection.status).toBe('incomplete')
    expect(projection.diagnostics[0]?.code).toBe('MAPPING_OUT_OF_RANGE')
    expect(session.revision).toBe(4)
  })

  it('rejects broken V2 references atomically at the transaction boundary', () => {
    const initial = commitProjectV2(createProjectSession('validation'), project => addScreenV2(project))
    const withCanvas = commitProjectV2(initial, project => setInputCanvasResolutionV2(project, 800, 600))
    const withRegion = commitProjectV2(withCanvas, project => addMappingRegionV2(project, 'screen-1'))
    expect(() => commitProjectV2(withRegion, project => ({
      ...project,
      content: { ...project.content, mappingRegions: project.content.mappingRegions.map(region => ({
        ...region, inputCanvasId: 'missing' as typeof region.inputCanvasId,
      })) },
    }))).toThrow(/PROJECT_UNKNOWN_INPUT_CANVAS/)
    expect(withRegion.revision).toBe(3)
    expect(withRegion.project.content.mappingRegions[0]!.inputCanvasId).toBe('input-1')
  })

  it('does not advance revision for semantic no-ops and saves/reopens direct V2 changes', () => {
    const initial = createProjectSession('c4')
    const added = commitProjectV2(initial, project => addScreenV2(project))
    expect(added.revision).toBe(1)
    expect(commitProjectV2(added, project => renameScreenV2(project, 'screen-1', 'Screen 1'))).toBe(added)
    expect(commitProjectV2(added, project => setScreenPositionV2(project, 'screen-1', 0, 0))).toBe(added)
    expect(commitProjectV2(added, project => resizeScreenGridV2(project, 'screen-1', 4, 3))).toBe(added)
    const mapped = commitProjectV2(added, project => setInputCanvasResolutionV2(project, 1920, 1080))
    const withRegion = commitProjectV2(mapped, project => addMappingRegionV2(project, 'screen-1'))
    expect(commitProjectV2(withRegion, project => updateMappingRegionV2(project, 'region-1', {}))).toBe(withRegion)
    expect(sessionDirty(withRegion)).toBe(true)
    const reopened = loadProjectSession(serializeProjectSession(withRegion), 'c4.ledmap', 'reopened')
    expect(reopened.project).toEqual(withRegion.project)
  })
})
