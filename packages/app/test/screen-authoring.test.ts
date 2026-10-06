import { describe, expect, it } from 'vitest'
import { ProjectDocumentController } from '../src/renderer/document.js'
import { addScreenV2 } from '../src/renderer/v2-commands.js'
import { initialDraft } from '../src/renderer/state.js'
import { manualScreenPosition, nextScreenPosition, screenCreationDraft } from '../src/renderer/screen-authoring.js'
import { makeScreenPreset, parseScreenPresets, upsertScreenPreset } from '../src/renderer/screen-presets.js'
import { projectV2WorkspaceReadModel } from '../src/renderer/v2-view-model.js'
import { loadProjectSession, serializeProjectSession } from '../src/renderer/project-session.js'
import { chartSettingsFromExtensions, screenChartStyle, withChartSettings } from '../src/shared/chart-settings.js'

describe('Screen authoring', () => {
  it('derives basic cabinet geometry and chooses a non-overlapping position', () => {
    const draft = screenCreationDraft('4', '3', { mode: 'basic', width: '128', height: '96' }, initialDraft.ordering)
    const first = addScreenV2(new ProjectDocumentController(() => 'empty').session.project, draft,
      { position: nextScreenPosition([]) })
    const views = projectV2WorkspaceReadModel(first).screens
    expect(views[0]?.screen.resolution).toEqual({ width: 512, height: 288 })
    expect(views[0]?.modulesPerCabinet).toBe(1)
    expect(nextScreenPosition(views)).toEqual({ x: 576, y: 0 })
    expect(manualScreenPosition('11', '27')).toEqual({ x: 11, y: 27 })
    expect(() => manualScreenPosition('', '0')).toThrow(/non-negative/)
  })

  it('creates geometry and drawing in one history step and saves both', () => {
    const document = new ProjectDocumentController(() => 'authoring')
    const draft = screenCreationDraft('2', '1', {
      mode: 'advanced', moduleColumns: '4', moduleRows: '4', moduleWidth: '32', moduleHeight: '32',
    }, initialDraft.ordering)
    document.transactV2AndExtensions(project => addScreenV2(project, draft, {
      position: nextScreenPosition(projectV2WorkspaceReadModel(project).screens),
    }), extensions => {
      const settings = chartSettingsFromExtensions(extensions)
      return withChartSettings(extensions, { ...settings, screenStyles: {
        ...settings.screenStyles,
        'screen-1': { ...screenChartStyle(settings, 'screen-1'), fill: '#ef1200' },
      } })
    })
    expect(document.session.project.design.screens[0]?.resolution).toEqual({ width: 256, height: 128 })
    expect(screenChartStyle(chartSettingsFromExtensions(document.session.extensions), 'screen-1').fill).toBe('#ef1200')
    document.undo()
    expect(document.session.project.design.screens).toHaveLength(0)
    expect(chartSettingsFromExtensions(document.session.extensions).screenStyles).toEqual({})
    document.redo()
    const restored = loadProjectSession(serializeProjectSession(document.session), 'authored.ledmap', 'restored')
    expect(restored.project.design.screens[0]?.resolution).toEqual({ width: 256, height: 128 })
    expect(screenChartStyle(chartSettingsFromExtensions(restored.extensions), 'screen-1').fill).toBe('#ef1200')
  })

  it('round-trips reusable LED geometry and drawing presets without modifying a project', () => {
    const project = addScreenV2(new ProjectDocumentController(() => 'preset').session.project)
    const screen = projectV2WorkspaceReadModel(project).screens[0]!
    const style = { ...screenChartStyle(chartSettingsFromExtensions({}), screen.screen.id),
      fill: '#123456', caption: 'Wall A', cabinetLabelMode: 'column-coordinate' as const }
    const preset = makeScreenPreset('  Touring wall  ', screen, style)
    const list = upsertScreenPreset([], preset)
    expect(parseScreenPresets(JSON.stringify(list))).toEqual([{ ...preset, name: 'Touring wall' }])
    expect(preset.drawing.cabinetLabelMode).toBe('column-coordinate')
    expect(upsertScreenPreset(list, { ...preset, modulePixelWidth: 64 })).toHaveLength(1)
    expect(parseScreenPresets('[{"name":"Broken"}]')).toEqual([])
  })
})
