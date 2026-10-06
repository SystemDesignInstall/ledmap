import { describe, expect, it } from 'vitest'
import { addScreenV2 } from '../src/renderer/v2-commands.js'
import { ProjectDocumentController } from '../src/renderer/document.js'
import { loadProjectSession, serializeProjectSession, sessionDirty } from '../src/renderer/project-session.js'
import {
  chartFrameProblem, chartSettingsFromExtensions, defaultChartSettings, withChartSettings,
} from '../src/shared/chart-settings.js'
import { buildPngExportPlan } from '../src/shared/png-export.js'
import { buildCompositionChartFrame } from '../src/shared/chart-engine.js'
import { renderFrameSvg } from '../src/shared/svg-export.js'
import type { TestScene } from '../src/shared/test-engine.js'

const scene: TestScene = {
  bounds: { x: -100, y: 20, width: 500, height: 200 },
  screens: [
    { id: 'left', name: 'Left', bounds: { x: -100, y: 20, width: 200, height: 200 } },
    { id: 'right', name: 'Right', bounds: { x: 200, y: 20, width: 200, height: 200 } },
  ],
  cabinets: [
    { id: 'left/C01', screen: 'left', logicalOrder: 1, bounds: { x: -100, y: 20, width: 100, height: 100 }, hardware: null },
    { id: 'right/C01', screen: 'right', logicalOrder: 1, bounds: { x: 200, y: 20, width: 100, height: 100 }, hardware: null },
  ],
  modules: [], signalPaths: [], hardwareReady: false, mappingReady: false, hardwareReason: null, mappingReason: null,
}

describe('Composition chart contract', () => {
  it('preserves app chart settings through document save, open, undo and redo', async () => {
    let serial = 0
    const document = new ProjectDocumentController(() => `document-${++serial}`)
    document.transactV2(project => addScreenV2(project))
    await document.save(false, async () => ({ canceled: false, filePath: 'chart.ledmap' }))
    const settings = {
      ...defaultChartSettings,
      frameMode: 'fixed' as const,
      frame: { x: -20, y: 10, width: 1920, height: 1080 },
      screenColors: { 'screen-1': '#aabbcc' },
      screenStyles: { 'screen-1': { palette: 'white-grid' as const, labels: 'grid-address' as const,
        fill: '#aabbcc', cabinetEdges: true, textShadow: false, caption: 'Main', logo: null } },
      background: 'transparent',
    }
    const preserved = withChartSettings({ otherTool: { value: 'keep' } }, settings)
    expect(preserved['otherTool']).toEqual({ value: 'keep' })
    document.transactExtensions(extensions => withChartSettings(extensions, settings))
    expect(sessionDirty(document.session)).toBe(true)
    expect(chartSettingsFromExtensions(document.session.extensions)).toMatchObject(settings)
    document.undo()
    expect(sessionDirty(document.session)).toBe(false)
    expect(chartSettingsFromExtensions(document.session.extensions)).toEqual(defaultChartSettings)
    document.redo()
    expect(chartSettingsFromExtensions(document.session.extensions)).toMatchObject(settings)
    const reopened = loadProjectSession(serializeProjectSession(document.session), 'chart.ledmap', 'reopened')
    expect(chartSettingsFromExtensions(reopened.extensions)).toMatchObject(settings)
    expect(reopened.project.design.screens).toHaveLength(1)
  })

  it('uses a fixed pixel frame for chart PNG, preserving the gap and negative origin', () => {
    const settings = { ...defaultChartSettings, frameMode: 'fixed' as const,
      frame: { x: -120, y: 0, width: 640, height: 240 }, labels: 'none' as const,
      screenColors: { left: '#ff0000', right: '#0000ff' } }
    const chart = buildPngExportPlan(scene, { pattern: 'composition-chart', chartSettings: settings,
      currentScope: { kind: 'composition', target: null }, walkPixel: null, mode: 'composition', screenId: null })
    expect(chart.ready).toBe(true)
    expect(chart.jobs[0]?.bounds).toEqual(settings.frame)
    expect(chart.jobs[0]?.frame.primitives).toContainEqual({ kind: 'rect', bounds: scene.screens[0]?.bounds, fill: '#ff0000' })
    expect(chart.jobs[0]?.frame.primitives).toContainEqual({ kind: 'rect', bounds: scene.screens[1]?.bounds, fill: '#0000ff' })
    const mask = buildPngExportPlan(scene, { pattern: 'composition-mask', chartSettings: settings,
      currentScope: { kind: 'composition', target: null }, walkPixel: null, mode: 'composition', screenId: null })
    expect(mask.jobs[0]?.frame.background).toBe('transparent')
    expect(mask.jobs[0]?.frame.primitives).toEqual(scene.screens.map(screen =>
      ({ kind: 'rect', bounds: screen.bounds, fill: '#ffffff' })))
    expect(mask.jobs[0]?.bounds).toEqual(chart.jobs[0]?.bounds)
  })

  it('blocks a fixed frame that clips a screen and rejects invalid saved colors', () => {
    const settings = { ...defaultChartSettings, frameMode: 'fixed' as const,
      frame: { x: 0, y: 0, width: 300, height: 200 } }
    expect(chartFrameProblem(scene, settings)).toMatch(/outside/)
    const plan = buildPngExportPlan(scene, { pattern: 'composition-chart', chartSettings: settings,
      currentScope: { kind: 'composition', target: null }, walkPixel: null, mode: 'composition', screenId: null })
    expect(plan.ready).toBe(false)
    expect(() => withChartSettings({}, { ...defaultChartSettings, screenColors: { left: 'red' } })).toThrow(/color/)
  })

  it('rejects malformed PNG logo headers and mismatched dimensions', () => {
    const dataUrl = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9rkT8AAAAASUVORK5CYII='
    expect(() => withChartSettings({}, { ...defaultChartSettings,
      logo: { dataUrl: 'data:image/png;base64,AA==', width: 1, height: 1 },
    })).toThrow(/invalid PNG/)
    expect(() => withChartSettings({}, { ...defaultChartSettings,
      logo: { dataUrl, width: 2, height: 1 },
    })).toThrow(/dimensions/)
    expect(() => withChartSettings({}, { ...defaultChartSettings,
      logo: { dataUrl, width: 1, height: 1 },
    })).not.toThrow()
    const saved = JSON.parse(serializeProjectSession(new ProjectDocumentController(() => 'logo').session))
    saved.extensions = { 'ledmap.compositionChart': { ...defaultChartSettings, version: 1,
      logo: { dataUrl: 'data:image/png;base64,AA==', width: 1, height: 1 } } }
    expect(() => loadProjectSession(JSON.stringify(saved), 'broken.ledmap', 'reopened')).toThrow(/invalid PNG/)
  })

  it('checks the fixed frame in Current scope and checks logos only for drawing exports', () => {
    const clipped = { ...defaultChartSettings, frameMode: 'fixed' as const,
      frame: { x: 0, y: 0, width: 300, height: 200 } }
    const current = buildPngExportPlan(scene, { pattern: 'composition-chart', chartSettings: clipped,
      currentScope: { kind: 'composition', target: null }, walkPixel: null, mode: 'current-scope', screenId: null })
    expect(current.ready).toBe(false)
    expect(current.diagnostics).toContain('A Screen lies outside the fixed chart frame.')

    const logo = { dataUrl: 'data:image/png;base64,AA==', width: 190, height: 20 }
    const settings = { ...defaultChartSettings, screenStyles: { right: {
      palette: 'screen-color' as const, labels: 'none' as const, fill: '#284a68',
      cabinetEdges: false, textShadow: false, caption: '', logo,
    } } }
    const drawing = buildPngExportPlan(scene, { pattern: 'composition-chart', chartSettings: settings,
      currentScope: { kind: 'screen', target: 'right' }, walkPixel: null, mode: 'screen', screenId: 'right' })
    expect(drawing.ready).toBe(false)
    expect(drawing.diagnostics).toContain('The logo does not fit inside Screen Right.')
    const mask = buildPngExportPlan(scene, { pattern: 'composition-mask', chartSettings: settings,
      currentScope: { kind: 'screen', target: 'right' }, walkPixel: null, mode: 'screen', screenId: 'right' })
    expect(mask.ready).toBe(true)
  })

  it('derives letter and row labels from cabinet geometry without changing identities', () => {
    const frame = buildCompositionChartFrame(scene, { kind: 'screen', target: 'right' },
      { ...defaultChartSettings, labels: 'grid-address' })
    expect(frame.primitives).toContainEqual({ kind: 'text', point: { x: 250, y: 70 },
      text: 'A1', color: '#ffffff', size: 16, align: 'center', shadow: true })
    expect(frame.scopedCabinets).toEqual(['right/C01'])
  })

  it('renders each Screen with its own drawing and keeps labels above the pattern', () => {
    const settings = { ...defaultChartSettings, screenStyles: {
      left: { palette: 'white-grid' as const, labels: 'screen' as const, fill: '#ffffff',
        cabinetEdges: true, textShadow: false, caption: 'Main wall', logo: null },
      right: { palette: 'screen-color' as const, labels: 'none' as const, fill: '#ff0000',
        cabinetEdges: false, textShadow: true, caption: '', logo: null },
    } }
    const frame = buildCompositionChartFrame(scene, { kind: 'composition', target: null }, settings)
    expect(frame.background).toBe('transparent')
    expect(frame.primitives).toContainEqual({ kind: 'rect', bounds: scene.screens[0]?.bounds, fill: '#ffffff' })
    expect(frame.primitives).toContainEqual({ kind: 'rect', bounds: scene.screens[1]?.bounds, fill: '#ff0000' })
    expect(frame.primitives).toContainEqual({ kind: 'text', point: { x: 0, y: 120 },
      text: 'Left · 200×200', color: '#202b39', size: 24, align: 'center', shadow: false, role: 'screen-title' })
    const borderIndex = frame.primitives.findIndex(primitive => primitive.kind === 'cabinet-border' && primitive.color === '#202b39')
    expect(borderIndex).toBeGreaterThanOrEqual(0)
    expect(frame.primitives.findIndex(primitive => primitive.kind === 'text' && primitive.text === 'Left · 200×200'))
      .toBeGreaterThan(borderIndex)
    expect(frame.primitives.at(-1)).toMatchObject({ kind: 'text', role: 'screen-title', text: 'Left · 200×200' })
    expect(frame.primitives.filter(primitive => primitive.kind === 'text' && primitive.text === 'Right · 200×200')).toHaveLength(0)
    expect(() => withChartSettings({}, settings)).not.toThrow()
  })

  it('draws all Screen names and resolutions after every Screen drawing and logo', () => {
    const frame = buildCompositionChartFrame(scene, { kind: 'composition', target: null }, {
      ...defaultChartSettings, logoText: 'Composition',
    })
    expect(frame.primitives.slice(-2)).toMatchObject([
      { kind: 'text', role: 'screen-title', text: 'Left · 200×200' },
      { kind: 'text', role: 'screen-title', text: 'Right · 200×200' },
    ])
    expect(frame.primitives.slice(0, -2).some(primitive =>
      primitive.kind === 'text' && primitive.text === 'Composition')).toBe(true)
  })

  it('keeps project and Screen drawing edits atomic', () => {
    const document = new ProjectDocumentController(() => 'document')
    const before = document.session
    expect(() => document.transactV2AndExtensions(addScreenV2, () =>
      withChartSettings({}, { ...defaultChartSettings, screenStyles: {
        broken: { palette: 'screen-color', labels: 'none', fill: 'red', cabinetEdges: false,
          textShadow: true, caption: '', logo: null },
      } }))).toThrow(/fill/)
    expect(document.session).toBe(before)
    expect(document.canUndo).toBe(false)
    document.transactV2AndExtensions(addScreenV2, extensions => withChartSettings(extensions, defaultChartSettings))
    expect(document.session.project.design.screens).toHaveLength(1)
    document.undo()
    expect(document.session.project.design.screens).toHaveLength(0)
    expect(chartSettingsFromExtensions(document.session.extensions)).toEqual(defaultChartSettings)
  })

  it('uses saved offset markers and mask offsets across chart frames', () => {
    const style = { palette: 'screen-color' as const, labels: 'none' as const, fill: '#aabbcc',
      cabinetEdges: false, textShadow: true, caption: '', logo: null,
      offsetMarkers: true, maskOffsetX: 12, maskOffsetY: -7 }
    const settings = { ...defaultChartSettings, screenStyles: { left: style } }
    const loaded = chartSettingsFromExtensions(withChartSettings({}, settings))
    const chart = buildCompositionChartFrame(scene, { kind: 'composition', target: null }, loaded)
    expect(chart.primitives).toContainEqual({ kind: 'text', point: { x: -80, y: 206 },
      text: 'X -100 · Y 20', color: '#ffffff', size: 12, align: 'left', shadow: true })
    const mask = buildCompositionChartFrame(scene, { kind: 'composition', target: null }, loaded, true)
    expect(mask.primitives[0]).toEqual({ kind: 'rect', bounds: { x: -88, y: 13, width: 200, height: 200 }, fill: '#ffffff' })
    expect(() => withChartSettings({}, { ...settings, screenStyles: { left: { ...style, maskOffsetX: 9000 } } })).toThrow(/mask offsets/)
  })

  it('exports the same drawing and mask geometry as SVG with escaped text', () => {
    const settings = { ...defaultChartSettings, screenStyles: { left: {
      fill: '#ff0000', palette: 'screen-color' as const,
      labels: 'none' as const, cabinetEdges: false, textShadow: false,
      caption: 'A & B <LED>', logo: null, maskOffsetX: 12,
    } } }
    const chart = buildCompositionChartFrame(scene, { kind: 'composition', target: null }, settings)
    const svg = renderFrameSvg(chart, chart.bounds)
    expect(svg).toContain('viewBox="-100 20 500 200"')
    expect(svg).toContain('fill="#ff0000"')
    expect(svg).toContain('A &amp; B &lt;LED&gt;')
    const mask = buildCompositionChartFrame(scene, { kind: 'composition', target: null }, settings, true)
    expect(renderFrameSvg(mask, mask.bounds)).toContain('x="-88" y="20" width="200" height="200" fill="#ffffff"')
  })
})
