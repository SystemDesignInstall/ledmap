import { describe, expect, it } from 'vitest'
import { addScreenV2, duplicateScreenV2, resizeScreenGridV2, setCabinetLabelV2 } from '../src/renderer/v2-commands.js'
import { buildV2TestScene } from '../src/renderer/v2-test-project.js'
import { commitProjectV2, createProjectSession, loadProjectSession, serializeProjectSession } from '../src/renderer/project-session.js'
import { buildCompositionChartFrame } from '../src/shared/chart-engine.js'
import { chartSettingsFromExtensions, defaultChartSettings, withChartSettings } from '../src/shared/chart-settings.js'
import { automaticCabinetLabel, cabinetDisplayLabel, duplicateCabinetLabel, type CabinetLabelMode } from '../src/shared/cabinet-labels.js'
import { cabinetCenterPx, cabinetLabelHit, cabinetLabelVisible } from '../src/renderer/canvas.js'
import { projectV2WorkspaceReadModel } from '../src/renderer/v2-view-model.js'
import { initialDraft } from '../src/renderer/state.js'

const project = () => addScreenV2(createProjectSession('labels').project)
const screenId = 'screen-1'
const mode: CabinetLabelMode = 'row-coordinate'

describe('Cabinet display labels', () => {
  it('keeps in-cell labels visible at 20% without overlapping the next cabinet', () => {
    const source = addScreenV2(createProjectSession('labels').project,
      { ...initialDraft, moduleColumns: '4', moduleRows: '4' })
    const screen = projectV2WorkspaceReadModel(source).screens[0]!
    const cabinet = screen.cabinets[0]!
    const camera = { zoom: .2, offsetX: 0, offsetY: 0 }
    const center = cabinetCenterPx(camera, screen, cabinet)
    expect(cabinetLabelVisible(camera, screen)).toBe(true)
    expect(cabinetLabelHit(camera, screen, cabinet, center)).toBe(true)
    expect(cabinetLabelHit(camera, screen, cabinet, { x: center.x + screen.grid.cabinetWidth * camera.zoom, y: center.y })).toBe(false)
    expect(cabinetLabelVisible({ ...camera, zoom: .15 }, screen)).toBe(false)
  })

  it('keeps row-letter labels anchored to cells when columns or rows grow', () => {
    const initial = project()
    const wider = resizeScreenGridV2(initial, screenId, 5, 3)
    const taller = resizeScreenGridV2(wider, screenId, 5, 4)
    const labels = (source: typeof initial) => source.design.cabinets.map(cabinet =>
      cabinetDisplayLabel(mode, source.design.cabinetGrids[0]!.columns, source.design.cabinetGrids[0]!.rows, cabinet))
    expect(labels(initial)).toEqual(['A1', 'A2', 'A3', 'A4', 'B1', 'B2', 'B3', 'B4', 'C1', 'C2', 'C3', 'C4'])
    expect(labels(wider)).toEqual(['A1', 'A2', 'A3', 'A4', 'A5', 'B1', 'B2', 'B3', 'B4', 'B5', 'C1', 'C2', 'C3', 'C4', 'C5'])
    expect(labels(taller).slice(-5)).toEqual(['D1', 'D2', 'D3', 'D4', 'D5'])
    expect(wider.design.cabinets[0]!.id).toBe(initial.design.cabinets[0]!.id)
    expect(wider.design.cabinets[4]!.id).not.toBe(initial.design.cabinets[4]!.id)
  })

  it('supports column, sequential, snake, reverse and coordinate schemes', () => {
    expect(automaticCabinetLabel('column-coordinate', 3, 2, 1, 1)).toBe('B2')
    expect(automaticCabinetLabel('coordinates', 3, 2, 1, 1)).toBe('2,2')
    expect(automaticCabinetLabel('row-sequential', 3, 2, 0, 1)).toBe('04')
    expect(automaticCabinetLabel('column-sequential', 3, 2, 1, 0)).toBe('03')
    expect(automaticCabinetLabel('row-snake', 3, 2, 0, 1)).toBe('06')
    expect(automaticCabinetLabel('column-snake', 3, 2, 1, 0)).toBe('04')
    expect(automaticCabinetLabel('row-reverse', 3, 2, 0, 0)).toBe('03')
    expect(automaticCabinetLabel('column-reverse', 3, 2, 0, 0)).toBe('02')
    expect(automaticCabinetLabel('row-coordinate', 1, 27, 0, 26)).toBe('AA1')
  })

  it('preserves manual labels on resize, prevents duplicates, and resets to automatic', () => {
    const initial = project()
    const first = initial.design.cabinets[0]!.id
    const renamed = setCabinetLabelV2(initial, first, 'Main-left', mode)
    expect(renamed.design.cabinets[0]!.label).toBe('Main-left')
    expect(() => setCabinetLabelV2(renamed, renamed.design.cabinets[1]!.id, 'main-LEFT', mode)).toThrow(/already used/)
    expect(() => setCabinetLabelV2(renamed, renamed.design.cabinets[1]!.id, 'A1', mode)).not.toThrow()
    expect(() => setCabinetLabelV2(initial, initial.design.cabinets[1]!.id, 'A1', mode)).toThrow(/already used/)
    expect(() => setCabinetLabelV2(initial, first, ' '.repeat(33), mode)).toThrow(/1 to 32/)
    const wider = resizeScreenGridV2(renamed, screenId, 5, 3)
    expect(wider.design.cabinets.find(cabinet => cabinet.id === first)?.label).toBe('Main-left')
    const reset = setCabinetLabelV2(wider, first, null, mode)
    expect(cabinetDisplayLabel(mode, 5, 3, reset.design.cabinets.find(cabinet => cabinet.id === first)!)).toBe('A1')
    expect(duplicateCabinetLabel(mode, 5, 3, reset.design.cabinets)).toBeNull()
  })

  it('restores manual labels and the selected scheme from a saved project', () => {
    const initial = project()
    const cabinetId = initial.design.cabinets[0]!.id
    const session = commitProjectV2(createProjectSession('labels'), () =>
      setCabinetLabelV2(initial, cabinetId, 'Main-left', mode))
    const settings = withChartSettings(session.extensions, {
      ...defaultChartSettings,
      screenStyles: { [screenId]: { ...chartSettingsFromExtensions(session.extensions).screenStyles[screenId],
        ...{ palette: 'screen-color' as const, labels: 'cabinet' as const, fill: '#284a68',
          cabinetEdges: true, textShadow: true, caption: '', logo: null }, cabinetLabelMode: 'column-coordinate' } },
    })
    const reopened = loadProjectSession(serializeProjectSession({ ...session, extensions: settings }), 'labels.ledmap', 'reopened')
    expect(reopened.project.design.cabinets[0]!.label).toBe('Main-left')
    expect(chartSettingsFromExtensions(reopened.extensions).screenStyles[screenId]?.cabinetLabelMode).toBe('column-coordinate')
  })

  it('copies manual labels when duplicating a Screen', () => {
    const initial = project()
    const renamed = setCabinetLabelV2(initial, initial.design.cabinets[0]!.id, 'Main-left', mode)
    const copied = duplicateScreenV2(renamed, screenId)
    const duplicateGrid = copied.design.cabinetGrids.find(grid => grid.screenId === 'screen-2')!
    const duplicatedCabinets = copied.design.cabinets.filter(cabinet => cabinet.gridId === duplicateGrid.id)
    expect(duplicatedCabinets[0]!.label).toBe('Main-left')
    expect(duplicatedCabinets[0]!.id).not.toBe(renamed.design.cabinets[0]!.id)
    expect(copied.design.cabinets[0]!.label).toBe('Main-left')
  })

  it('uses the same visible label in Screen drawing and keeps physical IDs available', () => {
    const initial = project()
    const first = initial.design.cabinets[0]!.id
    const renamed = setCabinetLabelV2(initial, first, 'Main-left', mode)
    const scene = buildV2TestScene(renamed)
    const style = {
      palette: 'screen-color' as const, labels: 'cabinet' as const, fill: '#284a68',
      cabinetEdges: true, textShadow: true, caption: '', logo: null, cabinetLabelMode: mode,
    }
    const settings = { ...defaultChartSettings, screenStyles: { [screenId]: style } }
    const frame = buildCompositionChartFrame(scene, { kind: 'composition', target: null }, settings)
    expect(frame.primitives).toContainEqual(expect.objectContaining({ kind: 'text', text: 'Main-left' }))
    expect(frame.primitives).toContainEqual(expect.objectContaining({ kind: 'text', text: 'A2' }))
    const physical = buildCompositionChartFrame(scene, { kind: 'composition', target: null }, {
      ...settings, screenStyles: { [screenId]: { ...style, labels: 'cabinet-id' } },
    })
    expect(physical.primitives).toContainEqual(expect.objectContaining({ kind: 'text', text: first }))
  })
})
