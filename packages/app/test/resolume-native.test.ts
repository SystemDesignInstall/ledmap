import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { convertEditableProjectToV2, selectCompositionGeometry, type LedMapProjectV2 } from '@ledmap/core'
import { createRef001TestProject } from './project-fixtures.js'
import { addMediaOutputV2, addOutputMappingV2, updateOutputMappingV2 } from '../src/renderer/v2-output-commands.js'
import { ProjectDocumentController } from '../src/renderer/document.js'
import { createProjectSession, loadProjectSession, serializeProjectSession } from '../src/renderer/project-session.js'
import { parseResolumeAdvancedOutput, RESOLUME_XML_MAX_BYTES } from '../src/shared/resolume-import.js'
import { buildResolumeNativePreset } from '../src/shared/resolume-export.js'
import { applyResolumeOutputImport, planResolumeProjectExport } from '../src/shared/resolume-project.js'
import { integerRect } from '../src/shared/resolume-types.js'

function fixture(name: string): string {
  return readFileSync(new URL(`./fixtures/resolume/${name}`, import.meta.url), 'utf8')
}

export function nativeFixture() {
  const base = convertEditableProjectToV2(createRef001TestProject().source)
  let project = addMediaOutputV2(base, 800, 600, 'Virtual & Fixture')
  const output = project.content.mediaOutputs.at(-1)!.id
  const first = project.design.screens[0]!.id
  const second = project.design.screens[1]!.id
  project = addOutputMappingV2(project, first, output, { x: 10, y: 20 })
  project = updateOutputMappingV2(project, project.content.outputMappings.at(-1)!.id,
    { name: 'Left "crop"', screenRect: { x: 20, y: 30, width: 128, height: 64 }, outputRect: { x: 10, y: 20, width: 128, height: 64 } })
  project = addOutputMappingV2(project, second, output, { x: 300, y: 80 })
  project = updateOutputMappingV2(project, project.content.outputMappings.at(-1)!.id,
    { name: 'Right Ω', enabled: false, screenRect: { x: 5, y: 6, width: 64, height: 32 }, outputRect: { x: 300, y: 80, width: 64, height: 32 } })
  const frame = { x: -40, y: -20, width: 1200, height: 1000 }
  return { base, project, frame, first, second }
}

describe('resolume_import_valid_fixture', () => {
  it('reads actual Arena 7.27 preset corners, ordering and declared output raster', () => {
    const doc = parseResolumeAdvancedOutput(fixture('arena-preset.xml'))
    expect(doc.version).toEqual({ name: 'Resolume Arena', major: 7, minor: 27, micro: 0, revision: 14395 })
    expect(doc.composition).toEqual({ width: 2944, height: 1280 })
    expect(doc.screens[0]).toMatchObject({ name: 'Fixture Virtual', raster: { width: 3840, height: 1720 } })
    const slices = doc.screens[0]!.slices
    expect(slices.map(slice => slice.name)).toEqual(['Left', 'Right', 'Center'])
    expect(integerRect(slices[0]!.output)).toEqual({ x: 0, y: 0, width: 1024, height: 640 })
    expect(integerRect(slices[1]!.input)).toEqual({ x: 0, y: 640, width: 1024, height: 640 })
    expect(integerRect(slices[1]!.output)).toEqual({ x: 2816, y: 0, width: 1024, height: 640 })
    expect(doc.diagnostics).toEqual([])
    expect(Object.isFrozen(slices[0]!.input[0])).toBe(true)
  })

  it('keeps actual preferences capture raster unknown and preserves out-of-composition source edges', () => {
    const doc = parseResolumeAdvancedOutput(fixture('arena-preferences.xml'))
    expect(doc.composition).toEqual({ width: 1920, height: 1080 })
    expect(doc.screens[0]!.raster).toBeNull()
    expect(integerRect(doc.screens[0]!.slices[0]!.input)).toEqual({ x: 0, y: 0, width: 3840, height: 2160 })
    expect(doc.diagnostics.map(issue => issue.code)).toContain('RESOLUME_RASTER_UNKNOWN')
    expect(doc.diagnostics.map(issue => issue.code)).toContain('RESOLUME_UNSUPPORTED_SOFT_EDGING')
    expect(() => buildResolumeNativePreset(doc)).toThrow(/SoftEdging/)
  })

  it('reads the independent pixel-peeker writer fixture without calling it an Arena-generated file', () => {
    const doc = parseResolumeAdvancedOutput(fixture('pixel-peeker-generated.xml'))
    expect(doc.composition).toEqual({ width: 3200, height: 1800 })
    expect(doc.screens[0]!.raster).toEqual({ width: 3200, height: 1800 })
    expect(doc.screens[0]!.slices).toHaveLength(11)
    expect(new Set(doc.screens[0]!.slices.map(slice => slice.id)).size).toBe(11)
    expect(doc.diagnostics).toEqual([])
    const again = parseResolumeAdvancedOutput(buildResolumeNativePreset(doc))
    expect(again.screens[0]!.slices.map(slice => [slice.input, slice.output])).toEqual(doc.screens[0]!.slices.map(slice => [slice.input, slice.output]))
  })
})

describe('resolume_import_unknown_elements_and_warp', () => {
  it('tolerates unknown elements, retains known slices and reports unsupported semantics', () => {
    const doc = parseResolumeAdvancedOutput(fixture('arena-preset.xml').replace('<ScreenSetup name="ScreenSetup">', '<ScreenSetup name="ScreenSetup"><FutureThing/>'))
    expect(doc.screens[0]!.slices).toHaveLength(3)
    expect(doc.diagnostics).toContainEqual(expect.objectContaining({ code: 'RESOLUME_UNKNOWN_ELEMENT', message: 'Unsupported FutureThing element' }))
  })

  it('preserves synthetic bowed lattice and rejects it for rectangular export', () => {
    const doc = parseResolumeAdvancedOutput(fixture('warp-synthetic.xml'))
    expect(doc.screens[0]!.slices[0]!.warp!.points[1]!.y).toBeCloseTo(-41.569219381653056)
    expect(doc.diagnostics.filter(issue => issue.code === 'RESOLUME_UNSUPPORTED_WARP')).toHaveLength(1)
    expect(() => buildResolumeNativePreset(doc)).toThrow(/Changed control lattice/)
  })

  it('detects an interior warp point when corners and homography stay unchanged', () => {
    const xml = fixture('arena-preset.xml').replace('y="213.33333333333334"', 'y="293.33333333333334"')
    expect(parseResolumeAdvancedOutput(xml).diagnostics.map(issue => issue.code)).toContain('RESOLUME_UNSUPPORTED_WARP')
  })

  it('retains skewed corners and non-identity homography without replacing them by bounds', () => {
    const skew = parseResolumeAdvancedOutput(fixture('arena-preset.xml').replace('<v x="1024" y="0"/>', '<v x="1000" y="0"/>'))
    expect(skew.screens[0]!.slices[0]!.input[1].x).toBe(1000)
    expect(skew.diagnostics.map(issue => issue.code)).toContain('RESOLUME_UNSUPPORTED_QUAD')
    const moved = fixture('arena-preset.xml').replace(/(<dst>\s*<v x=")0/, (_match, prefix: string) => prefix + '5')
    const homography = parseResolumeAdvancedOutput(moved)
    expect(homography.diagnostics.map(issue => issue.code)).toContain('RESOLUME_UNSUPPORTED_HOMOGRAPHY')
    expect(homography.screens[0]!.slices[0]!.warp!.destination![0].x).toBe(5)
  })

  it.each([
    ['orientation="0"', 'orientation="90"', 'RESOLUME_UNSUPPORTED_ORIENTATION'],
    ['value="0:1"', 'value="1:1"', 'RESOLUME_UNSUPPORTED_SOURCE'],
    ['name="Flip" T="UINT8" default="0" value="0"', 'name="Flip" T="UINT8" default="0" value="1"', 'RESOLUME_UNSUPPORTED_FLIP'],
    ['value="PM_LINEAR"', 'value="PM_BEZIER"', 'RESOLUME_UNSUPPORTED_POINT_MODE'],
    ['<Warper>', '<SliceMask/><Warper>', 'RESOLUME_UNKNOWN_ELEMENT'],
    ['<Params name="ScreenSetupParams"/>', '<Params name="ScreenSetupParams"><Param name="FutureBlend" value="1"/></Params>', 'RESOLUME_UNSUPPORTED_PARAMETER'],
    ['<screens>', '<SoftEdging><Params name="Soft Edge"/></SoftEdging><screens>', 'RESOLUME_UNSUPPORTED_SOFT_EDGING'],
    ['value="0:1" storeChoices="0"/>', 'value="0:1" storeChoices="0"><FutureAnimation/></ParamChoice>', 'RESOLUME_UNSUPPORTED_PARAMETER'],
    ['<src>', '<src><FutureTransform/>', 'RESOLUME_UNKNOWN_ELEMENT'],
  ])('reports unsupported %s and blocks export', (from, to, code) => {
    const doc = parseResolumeAdvancedOutput(fixture('arena-preset.xml').replace(from, to))
    expect(doc.diagnostics.map(issue => issue.code)).toContain(code)
    expect(() => buildResolumeNativePreset(doc)).toThrow()
  })
})

describe('resolume_import_malformed_xml', () => {
  it.each([
    'not XML <<<', '<ScreenSetup><screens/></ScreenSetup>', '<XmlState><ScreenSetup></XmlState>',
    '<Wrong><ScreenSetup/></Wrong>', '<ScreenSetup x="a" x="b"/>',
    '<ScreenSetup x=unquoted/>', '<ScreenSetup>&unknown;</ScreenSetup>', '<ScreenSetup>\u0000</ScreenSetup>',
    '<!DOCTYPE x [<!ENTITY boom "expansion">]><ScreenSetup/>',
    '<!DOCTYPE x SYSTEM "file:///private"><ScreenSetup/>',
  ])('rejects malformed or unsafe XML %s', text => expect(() => parseResolumeAdvancedOutput(text)).toThrow())

  it.each([
    ['x="1024"', 'x="NaN"'], ['x="1024"', 'x="1e309"'], ['x="1024"', 'x=""'],
    ['x="1024"', 'x="0x400"'], ['width="2944"', 'width="0"'], ['uniqueId="2003"', 'uniqueId="2002"'],
    ['controlWidth="4"', 'controlWidth="3"'], ['<v x="1024" y="0"/>', ''],
    ['<screens>', '<screens><Screen uniqueId="2001"><layers/></Screen>'],
  ])('rejects invalid required geometry or identity %s', (from, to) => {
    expect(() => parseResolumeAdvancedOutput(fixture('arena-preset.xml').replace(from, to))).toThrow()
  })

  it('enforces byte, depth, element and attribute limits', () => {
    expect(() => parseResolumeAdvancedOutput('Ω'.repeat(RESOLUME_XML_MAX_BYTES / 2 + 1))).toThrow(/2 MiB/)
    expect(() => parseResolumeAdvancedOutput('<x>'.repeat(65) + '</x>'.repeat(65))).toThrow(/depth limit/)
    expect(() => parseResolumeAdvancedOutput('<x>' + '<y/>'.repeat(25000) + '</x>')).toThrow(/element/)
    expect(() => parseResolumeAdvancedOutput('<x ' + Array.from({ length: 65 }, (_, i) => `a${i}="0"`).join(' ') + '/>')).toThrow(/attribute/)
  })
})

describe('resolume_export_golden_and_project_roundtrip', () => {
  it('matches a deterministic native golden with escaped names, exact source offsets and edge vertices', async () => {
    const { project, frame } = nativeFixture()
    const before = JSON.stringify(project)
    const plan = planResolumeProjectExport(project, frame)
    expect(plan.ready).toBe(true)
    expect(plan.compatibility).toContain('has not been verified')
    const xml = buildResolumeNativePreset(plan.document!)
    await expect(xml).toMatchFileSnapshot('./fixtures/resolume/ledmap-native-golden.xml')
    expect(buildResolumeNativePreset(plan.document!)).toBe(xml)
    const doc = parseResolumeAdvancedOutput(xml)
    expect(doc.diagnostics).toEqual([])
    expect(integerRect(doc.screens[0]!.slices[0]!.input)).toEqual({ x: 60, y: 50, width: 128, height: 64 })
    expect(integerRect(doc.screens[0]!.slices[1]!.input)).toEqual({ x: 745, y: 146, width: 64, height: 32 })
    expect(doc.screens[0]!.slices[0]!.name).toBe('Left "crop"')
    expect(doc.screens[0]!.slices[1]!.enabled).toBe(false)
    expect(JSON.stringify(project)).toBe(before)
    expect(Object.isFrozen(project.content.mediaOutputs[0]!.resolution)).toBe(false)
  })

  it('imports into explicitly bound real Screens as one saveable, undoable content transaction', () => {
    const { base, project, frame, first, second } = nativeFixture()
    const parsed = parseResolumeAdvancedOutput(buildResolumeNativePreset(planResolumeProjectExport(project, frame).document!))
    const bindings = parsed.screens[0]!.slices.map((slice, index) => ({ sourceSliceId: slice.id, screenId: index === 0 ? first : second }))
    const candidate = applyResolumeOutputImport(base, parsed, frame, bindings)
    expect(candidate.design).toBe(base.design)
    expect(candidate.hardware).toBe(base.hardware)
    expect(candidate.operations).toBe(base.operations)
    const controller = new ProjectDocumentController(() => 'native-import')
    controller.replace({ ...createProjectSession('native-import'), project: base })
    controller.transactV2(source => applyResolumeOutputImport(source, parsed, frame, bindings))
    const imported = controller.session.project
    expect(imported.content.mediaOutputs).toEqual(project.content.mediaOutputs)
    expect(imported.content.outputMappings).toEqual(project.content.outputMappings)
    expect(imported.design).toEqual(base.design)
    expect(imported.hardware).toEqual(base.hardware)
    expect(imported.operations).toEqual(base.operations)
    expect(controller.historyDepth).toBe(1)
    expect(loadProjectSession(serializeProjectSession(controller.session), 'native.ledmap', 'reopened').project).toEqual(imported)
    expect(controller.undo()).toBe(true)
    expect(controller.session.project).toEqual(base)
    expect(controller.redo()).toBe(true)
    expect(controller.session.project).toEqual(imported)
  })

  it('rejects missing, duplicate and wrong bindings atomically', () => {
    const { base, project, frame, first } = nativeFixture()
    const parsed = parseResolumeAdvancedOutput(buildResolumeNativePreset(planResolumeProjectExport(project, frame).document!))
    const ids = parsed.screens[0]!.slices.map(slice => slice.id)
    const controller = new ProjectDocumentController(() => 'invalid-import')
    controller.replace({ ...createProjectSession('invalid-import'), project: base })
    const session = controller.session
    for (const bindings of [[], [{ sourceSliceId: ids[0]!, screenId: first }, { sourceSliceId: ids[0]!, screenId: first }],
      ids.map(sourceSliceId => ({ sourceSliceId, screenId: first }))]) {
      expect(() => controller.transactV2(source => applyResolumeOutputImport(source, parsed, frame, bindings))).toThrow()
      expect(controller.session).toBe(session)
      expect(controller.historyDepth).toBe(0)
    }
  })

  it('requires explicit unknown-raster dimensions and rejects independent disabled Screen state', () => {
    const { base, project, frame, first, second } = nativeFixture()
    const parsed = parseResolumeAdvancedOutput(buildResolumeNativePreset(planResolumeProjectExport(project, frame).document!))
    const bindings = parsed.screens[0]!.slices.map((slice, index) => ({ sourceSliceId: slice.id, screenId: index === 0 ? first : second }))
    const unknown = { ...parsed, screens: parsed.screens.map(screen => ({ ...screen, raster: null })) }
    expect(() => applyResolumeOutputImport(base, unknown, frame, bindings)).toThrow(/Explicit output raster/)
    const overrides = { [parsed.screens[0]!.id]: { width: 800, height: 600 } }
    expect(applyResolumeOutputImport(base, unknown, frame, bindings, overrides).content).toEqual(project.content)
    expect(Object.isFrozen(overrides[parsed.screens[0]!.id])).toBe(false)
    const disabled = { ...parsed, screens: parsed.screens.map(screen => ({ ...screen, enabled: false })) }
    expect(() => applyResolumeOutputImport(base, disabled, frame, bindings)).toThrow(/independent enabled state/)
    expect(parseResolumeAdvancedOutput(buildResolumeNativePreset(disabled)).screens[0]!.enabled).toBe(false)
  })

  it('blocks unsupported project transforms and output clipping without changing project data', () => {
    const { project, frame } = nativeFixture()
    const id = project.content.outputMappings[0]!.id
    for (const patch of [{ outputRotation: 90 as const }, { flipY: true }, { outputRect: { x: -1, y: 0, width: 128, height: 64 } }]) {
      const changed = updateOutputMappingV2(project, id, patch)
      expect(planResolumeProjectExport(changed, frame).ready).toBe(false)
    }
    const geometry = selectCompositionGeometry(project)
    expect(planResolumeProjectExport(project, { x: 0, y: 0, width: geometry.bounds!.width, height: 1 }).ready).toBe(false)
    const noOrder: LedMapProjectV2 = { ...project, content: { ...project.content,
      mediaOutputs: project.content.mediaOutputs.map(output => ({ ...output, mappingOrder: [] })),
    } }
    expect(planResolumeProjectExport(noOrder, frame).ready).toBe(false)
  })

  it('blocks an unmapped Screen outside the fixed frame and does not infer its placement', () => {
    const { project, frame } = nativeFixture()
    const moved = { ...project, design: { ...project.design, composition: { placements:
      project.design.composition.placements.map((placement, index) => index === 2 ? { ...placement, x: 2000 } : placement) } } }
    expect(planResolumeProjectExport(moved, frame).diagnostics[0]).toMatch(/Screen lies outside/)
  })

  it('rejects unsupported stored warp even if an inspection diagnostic is removed by a caller', () => {
    const doc = parseResolumeAdvancedOutput(fixture('warp-synthetic.xml'))
    expect(() => buildResolumeNativePreset({ ...doc, diagnostics: [] })).toThrow(/unsupported warp/)
  })
})
