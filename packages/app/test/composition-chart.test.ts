import { describe, expect, it } from 'vitest'
import { addScreenV2, setCabinetCellsV2 } from '../src/renderer/v2-commands.js'
import { createProjectSession } from '../src/renderer/project-session.js'
import { buildV2TestScene } from '../src/renderer/v2-test-project.js'
import { ProjectDocumentController } from '../src/renderer/document.js'
import { loadProjectSession, serializeProjectSession, sessionDirty } from '../src/renderer/project-session.js'
import {
  chartFrameProblem, chartLogoBounds, chartSettingsFromExtensions, defaultChartSettings, defaultChartGuides, defaultChartInformation, screenChartStyle, withChartSettings, withChartFrameBounds,
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
  it('leaves missing Cabinet cells transparent in chart fills and the export mask', () => {
    const full = addScreenV2(createProjectSession('chart-sparse').project)
    const sparse = setCabinetCellsV2(full, 'screen-1', [{ column: 1, row: 0 }], false)
    const sparseScene = buildV2TestScene(sparse)
    const scope = { kind: 'screen' as const, target: 'screen-1' }
    const settings = { ...defaultChartSettings, screenStyles: { 'screen-1': {
      ...screenChartStyle(defaultChartSettings, 'screen-1'), palette: 'screen-color' as const, fill: '#ff0000',
      cabinetEdges: false, labels: 'none' as const, showScreenName: false,
    } } }
    const chart = buildCompositionChartFrame(sparseScene, scope, settings)
    const mask = buildCompositionChartFrame(sparseScene, scope, settings, true)
    const hole = { x: 32, y: 0, width: 32, height: 32 }
    expect(chart.primitives.some(value => value.kind === 'rect' && value.fill === '#ff0000' &&
      value.bounds.x === hole.x && value.bounds.y === hole.y)).toBe(false)
    expect(mask.primitives).toHaveLength(11)
    expect(mask.primitives.some(value => value.kind === 'rect' && value.bounds.x === hole.x && value.bounds.y === hole.y)).toBe(false)
    expect(renderFrameSvg(mask, mask.bounds)).not.toContain('<rect x="32" y="0" width="32" height="32" fill="#ffffff"')
  })

  it('makes intentional Canvas cropping explicit while keeping document geometry and Undo atomic', () => {
    const document = new ProjectDocumentController(() => 'frame')
    document.transactV2(addScreenV2)
    const geometry = document.session.project
    const settings = withChartFrameBounds(defaultChartSettings, scene.screens[0]!.bounds, true)
    expect(chartFrameProblem(scene, settings)).toBeNull()
    expect(chartFrameProblem(scene, { ...settings, allowFrameCrop: false })).toMatch(/outside/)
    document.transactExtensions(extensions => withChartSettings(extensions, settings))
    expect(document.session.project).toBe(geometry)
    expect(chartSettingsFromExtensions(document.session.extensions).frame).toEqual(scene.screens[0]!.bounds)
    document.undo()
    expect(chartSettingsFromExtensions(document.session.extensions)).toEqual(defaultChartSettings)
    document.redo()
    expect(chartSettingsFromExtensions(document.session.extensions).allowFrameCrop).toBe(true)
    const before = document.session
    expect(() => document.transactExtensions(extensions => withChartSettings(extensions,
      withChartFrameBounds(settings, { ...settings.frame, width: 0 })))).toThrow()
    expect(document.session).toBe(before)
  })

  it('saves an information block and proportionally positions a translucent logo', () => {
    const dataUrl = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9rkT8AAAAASUVORK5CYII='
    const style = { palette: 'screen-color' as const, labels: 'none' as const, fill: '#284a68',
      cabinetEdges: false, textShadow: false, caption: '', logo: { dataUrl, width: 1, height: 1 },
      showScreenName: false, logoLayout: { position: 'bottom-left' as const, width: 80, opacity: 50 },
      information: { ...defaultChartInformation, enabled: true, position: 'top-left' as const,
        aspectRatio: false, cabinetSize: false, grid: false, canvasPosition: false } }
    const saved = chartSettingsFromExtensions(withChartSettings({}, { ...defaultChartSettings, screenStyles: { right: style } }))
    const frame = buildCompositionChartFrame(scene, { kind: 'screen', target: 'right' }, saved)
    expect(frame.primitives.filter(value => value.kind === 'text').map(value => value.text)).toEqual([
      'Resolution: 200×200 px', 'Cabinets: 1',
    ])
    expect(frame.primitives).toContainEqual({ kind: 'image', bounds: { x: 216, y: 124, width: 80, height: 80 },
      dataUrl, opacity: 0.5 })
    expect(frame.primitives).toContainEqual(expect.objectContaining({ kind: 'rect', opacity: 0.85 }))
    const svg = renderFrameSvg(frame, frame.bounds)
    expect(svg).toContain('opacity="0.5"')
    expect(svg).toContain('opacity="0.85"')
    expect(svg).toContain('Resolution: 200×200 px')
    expect(chartLogoBounds({ x: 0, y: 0, width: 120, height: 80 }, { dataUrl, width: 2, height: 1 },
      { position: 'bottom-right', width: 160, opacity: 50 })).toEqual({ x: 16, y: 20, width: 88, height: 44 })
    expect(() => withChartSettings({}, { ...saved, screenStyles: { right: {
      ...style, information: { ...style.information, enabled: 'yes' as unknown as boolean },
    } } })).toThrow(/enabled/)
    expect(() => withChartSettings({}, { ...saved, screenStyles: { right: {
      ...style, logoLayout: { ...style.logoLayout, opacity: 101 },
    } } })).toThrow(/opacity/)
  })

  it('shares saved graphics across Canvas and SVG without changing cabinet geometry', () => {
    const style = { palette: 'screen-color' as const, labels: 'none' as const, fill: '#284a68',
      cabinetEdges: false, textShadow: false, caption: '', logo: null,
      guides: { ...defaultChartGuides, diagonals: true, centralCircle: true, cornerCircles: true,
        horizontalCenter: true, verticalCenter: true, outerBorder: true, thickness: 2, color: '#abcdef' } }
    const before = structuredClone(scene)
    const settings = chartSettingsFromExtensions(withChartSettings({}, { ...defaultChartSettings, screenStyles: { right: style } }))
    const frame = buildCompositionChartFrame(scene, { kind: 'screen', target: 'right' }, settings)
    expect(frame.primitives.filter(value => value.kind === 'circle')).toHaveLength(5)
    expect(frame.primitives).toContainEqual({ kind: 'circle', center: { x: 300, y: 120 }, radius: 99, color: '#abcdef', lineWidth: 2, role: 'screen-guide' })
    expect(frame.primitives).toContainEqual({ kind: 'line', from: { x: 201, y: 120 }, to: { x: 399, y: 120 }, color: '#abcdef', lineWidth: 2, role: 'screen-center-guide' })
    expect(frame.primitives).toContainEqual({ kind: 'line', from: { x: 300, y: 21 }, to: { x: 300, y: 219 }, color: '#abcdef', lineWidth: 2, role: 'screen-center-guide' })
    expect(renderFrameSvg(frame, frame.bounds)).toContain('<circle cx="300" cy="120" r="99"')
    expect(scene).toEqual(before)
    expect(frame.scopedCabinets).toEqual(['right/C01'])
    expect(() => withChartSettings({}, { ...settings, screenStyles: { right: { ...style, guides: { ...style.guides, thickness: 0 } } } }))
      .toThrow(/thickness/)
  })

  it('round-trips custom palettes and partitions color bands without pixel gaps', () => {
    const style = { palette: 'rgb-bars' as const, labels: 'none' as const, fill: '#284a68',
      cabinetEdges: false, textShadow: false, caption: '', logo: null,
      bandColors: ['#ff0000', '#00ff00', '#0000ff'], patternDirection: 'vertical' as const }
    const settings = chartSettingsFromExtensions(withChartSettings({}, { ...defaultChartSettings, screenStyles: { right: style } }))
    const frame = buildCompositionChartFrame(scene, { kind: 'screen', target: 'right' }, settings)
    expect(frame.primitives).toEqual([
      { kind: 'rect', bounds: { x: 200, y: 20, width: 200, height: 66 }, fill: '#ff0000', pixelAligned: true },
      { kind: 'rect', bounds: { x: 200, y: 86, width: 200, height: 67 }, fill: '#00ff00', pixelAligned: true },
      { kind: 'rect', bounds: { x: 200, y: 153, width: 200, height: 67 }, fill: '#0000ff', pixelAligned: true },
    ])
    const gradient = buildCompositionChartFrame(scene, { kind: 'screen', target: 'right' }, {
      ...settings, screenStyles: { right: { ...style, palette: 'gray-gradient', gradientFrom: '#123456', gradientTo: '#abcdef' } },
    })
    expect(renderFrameSvg(gradient, gradient.bounds)).toContain('y2="100%"')
    expect(gradient.primitives[0]).toMatchObject({ kind: 'gradient', from: '#123456', to: '#abcdef', direction: 'vertical' })
    for (const bandColors of [[], ['#ffffff'], Array(11).fill('#ffffff'), ['red', '#ffffff']]) {
      expect(() => withChartSettings({}, { ...settings, screenStyles: { right: { ...style, bandColors } } })).toThrow()
    }
  })

  it('uses four checkerboard colors as repeating two by two cells', () => {
    const cabinets = Array.from({ length: 16 }, (_, index) => ({ id: `right/C${index}`, screen: 'right', logicalOrder: index,
      bounds: { x: 200 + index % 4 * 50, y: 20 + Math.floor(index / 4) * 50, width: 50, height: 50 }, hardware: null }))
    const style = { palette: 'checkerboard' as const, labels: 'none' as const, fill: '#284a68',
      cabinetEdges: false, textShadow: false, caption: '', logo: null, checkerColors: ['#ff0000', '#00ff00', '#0000ff', '#ffffff'] }
    const frame = buildCompositionChartFrame({ ...scene, cabinets }, { kind: 'screen', target: 'right' }, {
      ...defaultChartSettings, screenStyles: { right: style },
    })
    expect(frame.primitives.slice(1).map(value => value.kind === 'rect' ? value.fill : null)).toEqual([
      '#ff0000', '#00ff00', '#ff0000', '#00ff00', '#0000ff', '#ffffff', '#0000ff', '#ffffff',
      '#ff0000', '#00ff00', '#ff0000', '#00ff00', '#0000ff', '#ffffff', '#0000ff', '#ffffff',
    ])
  })

  it('keeps legacy title behavior and independently saves screen names and cabinet labels', () => {
    const style = { palette: 'screen-color' as const, labels: 'cabinet' as const, fill: '#284a68',
      cabinetEdges: false, textShadow: false, caption: '', logo: null,
      showScreenName: true, screenNameSize: 32, textColor: '#fedcba' }
    const saved = chartSettingsFromExtensions(withChartSettings({}, { ...defaultChartSettings, screenStyles: { right: style } }))
    const frame = buildCompositionChartFrame(scene, { kind: 'screen', target: 'right' }, saved)
    expect(frame.primitives.filter(value => value.kind === 'text')).toMatchObject([
      { text: 'A1', role: 'cabinet-label', color: '#fedcba' },
      { text: 'Right · 200×200', role: 'screen-title', size: 32, color: '#fedcba',
        point: { x: 212, y: 40 }, align: 'left' },
    ])
    const hidden = buildCompositionChartFrame(scene, { kind: 'screen', target: 'right' }, {
      ...saved, screenStyles: { right: { ...style, showScreenName: false } },
    })
    expect(hidden.primitives.filter(value => value.kind === 'text')).toHaveLength(1)
    expect(buildCompositionChartFrame(scene, { kind: 'screen', target: 'right' }, defaultChartSettings).primitives.at(-1))
      .toMatchObject({ role: 'screen-title', text: 'Right · 200×200' })
    expect(() => withChartSettings({}, { ...saved, screenStyles: { right: { ...style, screenNameSize: 0 } } })).toThrow(/size/)
    expect(() => withChartSettings({}, { ...saved, screenStyles: { right: { ...style, textColor: 'white' } } })).toThrow(/color/)
  })

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
      text: 'A1', color: '#ffffff', size: 16, align: 'center', shadow: true,
      role: 'cabinet-label', cellBounds: scene.cabinets[1]?.bounds })
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

  it('applies a chosen Cabinet line color to the chart and serialized settings', () => {
    const style = { ...screenChartStyle(defaultChartSettings, 'left'), labels: 'none' as const,
      showScreenName: false, cabinetLineColor: '#dc517b' }
    const settings = { ...defaultChartSettings, screenStyles: { left: style } }
    const restored = chartSettingsFromExtensions(withChartSettings({}, settings))
    expect(restored.screenStyles['left']?.cabinetLineColor).toBe('#dc517b')
    const frame = buildCompositionChartFrame(scene, { kind: 'screen', target: 'left' }, restored)
    expect(frame.primitives).toContainEqual({ kind: 'cabinet-border', bounds: scene.cabinets[0]?.bounds, color: '#dc517b' })
    expect(renderFrameSvg(frame, frame.bounds)).toContain('fill="#dc517b"')
    expect(() => withChartSettings({}, { ...settings, screenStyles: { left: { ...style, cabinetLineColor: 'pink' } } }))
      .toThrow(/Cabinet line color/)
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
    expect(mask.primitives[0]).toEqual({ kind: 'rect', bounds: { x: -100, y: 20, width: 200, height: 200 }, fill: '#ffffff' })
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
    expect(svg).not.toContain('A &amp; B &lt;LED&gt;')
    const mask = buildCompositionChartFrame(scene, { kind: 'composition', target: null }, settings, true)
    expect(renderFrameSvg(mask, mask.bounds)).toContain('x="-100" y="20" width="200" height="200" fill="#ffffff"')
  })
})
