import {
  integerRect, resolumeWarpChanges, RESOLUME_SAMPLE_VERSION, type ResolumeNativeDocument, type ResolumePoint,
} from './resolume-types.js'

function escape(value: string): string {
  if (typeof value !== 'string' || value.length > 1024 || /[\u0000-\u0008\u000B\u000C\u000E-\u001F\uD800-\uDFFF\uFFFE\uFFFF]/u.test(value)) {
    throw new Error('Invalid XML name text')
  }
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&apos;').replace(/\t/g, '&#9;').replace(/\n/g, '&#10;').replace(/\r/g, '&#13;')
}

function decimal(value: number): string {
  if (!Number.isFinite(value) || Math.abs(value) > 1_000_000_000) throw new Error('Invalid Resolume vertex value')
  return String(Number(value.toFixed(6)))
}

export function buildResolumeNativePreset(document: ResolumeNativeDocument): string {
  const blocking = document.diagnostics.find(issue => issue.blocking)
  if (blocking) throw new Error(blocking.message)
  const composition = document.composition
  if (!composition || !Number.isSafeInteger(composition.width) || composition.width < 1 || composition.width > 1_000_000_000 ||
      !Number.isSafeInteger(composition.height) || composition.height < 1 || composition.height > 1_000_000_000) {
    throw new Error('Explicit Composition dimensions are required for Resolume export')
  }
  if (document.screens.length === 0) throw new Error('Resolume export requires Media Outputs')
  if (document.screens.length + document.screens.reduce((sum, screen) => sum + screen.slices.length, 0) > 250) {
    throw new Error('Resolume preset exceeds the 250 screen/slice export limit')
  }
  const lines: string[] = []
  const line = (depth: number, value: string) => lines.push('  '.repeat(depth) + value)
  const vertices = (depth: number, values: readonly ResolumePoint[]) => values.forEach(point =>
    line(depth, `<v x="${decimal(point.x)}" y="${decimal(point.y)}"/>`))
  let nextId = 1800000000000
  line(0, '<?xml version="1.0" encoding="utf-8"?>')
  line(0, `<XmlState name="${escape(document.name)}">`)
  const version = RESOLUME_SAMPLE_VERSION
  line(1, `<versionInfo name="${version.name}" majorVersion="${version.major}" minorVersion="${version.minor}" microVersion="${version.micro}" revision="${version.revision}"/>`)
  line(1, '<ScreenSetup name="ScreenSetup">')
  line(2, '<Params name="ScreenSetupParams"/>')
  line(2, `<CurrentCompositionTextureSize width="${composition.width}" height="${composition.height}"/>`)
  line(2, '<screens>')
  for (const screen of document.screens) {
    if (!screen.raster || !Number.isSafeInteger(screen.raster.width) || screen.raster.width < 1 || screen.raster.width > 1_000_000_000 ||
        !Number.isSafeInteger(screen.raster.height) || screen.raster.height < 1 || screen.raster.height > 1_000_000_000) {
      throw new Error(`Explicit output raster dimensions are required for ${screen.name}`)
    }
    if (screen.slices.length === 0) throw new Error(`Resolume output ${screen.name} has no slices`)
    line(3, `<Screen name="${escape(screen.name)}" uniqueId="${nextId++}">`)
    line(4, '<Params name="Params">')
    line(5, `<Param name="Name" T="STRING" default="" value="${escape(screen.name)}"/>`)
    line(5, `<Param name="Enabled" T="BOOL" default="1" value="${screen.enabled ? 1 : 0}"/>`)
    line(5, '<Param name="Hidden" T="BOOL" default="0" value="0"/>')
    line(4, '</Params>')
    line(4, '<layers>')
    for (const slice of screen.slices) {
      if (slice.inputOrientation !== 0 || slice.outputOrientation !== 0 || slice.flip !== 0 || slice.inputSource !== '0:1') {
        throw new Error(`Slice ${slice.name} has unsupported orientation, flip or source`)
      }
      if (slice.warp) {
        const changes = resolumeWarpChanges(slice.warp, slice.output)
        if (slice.warp.mode !== 'PM_LINEAR' || slice.warp.flip !== 0 || slice.warp.columns < 2 || slice.warp.rows < 2 ||
            slice.warp.columns * slice.warp.rows !== slice.warp.points.length || changes.lattice || changes.homography) {
          throw new Error(`Slice ${slice.name} has an unsupported warp`)
        }
      }
      const input = integerRect(slice.input)
      const output = integerRect(slice.output)
      if (!input || !output || input.x < 0 || input.y < 0 || input.x + input.width > composition.width || input.y + input.height > composition.height ||
          output.x < 0 || output.y < 0 || output.x + output.width > screen.raster.width || output.y + output.height > screen.raster.height) {
        throw new Error(`Slice ${slice.name} has unsupported, clipped or out-of-bounds geometry`)
      }
      line(5, `<Slice uniqueId="${nextId++}">`)
      line(6, '<Params name="Common">')
      line(7, `<Param name="Name" T="STRING" default="Layer" value="${escape(slice.name)}"/>`)
      line(7, `<Param name="Enabled" T="BOOL" default="1" value="${slice.enabled ? 1 : 0}"/>`)
      line(6, '</Params>')
      line(6, '<Params name="Input">')
      line(7, '<ParamChoice name="Input Source" default="0:1" value="0:1" storeChoices="0"/>')
      line(6, '</Params>')
      line(6, '<Params name="Output">')
      line(7, '<Param name="Flip" T="UINT8" default="0" value="0"/>')
      line(6, '</Params>')
      for (const [name, points] of [['InputRect', slice.input], ['OutputRect', slice.output]] as const) {
        line(6, `<${name} orientation="0">`)
        vertices(7, points)
        line(6, `</${name}>`)
      }
      line(6, '<Warper>')
      line(7, '<Params name="Warper">')
      line(8, '<ParamChoice name="Point Mode" default="PM_LINEAR" value="PM_LINEAR" storeChoices="0"/>')
      line(8, '<Param name="Flip" T="UINT8" default="0" value="0"/>')
      line(7, '</Params>')
      line(7, '<BezierWarper controlWidth="4" controlHeight="4">')
      line(8, '<vertices>')
      for (let row = 0; row < 4; row += 1) for (let column = 0; column < 4; column += 1) {
        vertices(9, [{ x: output.x + output.width * column / 3, y: output.y + output.height * row / 3 }])
      }
      line(8, '</vertices>')
      line(7, '</BezierWarper>')
      line(7, '<Homography>')
      for (const tag of ['src', 'dst']) {
        line(8, `<${tag}>`)
        vertices(9, slice.output)
        line(8, `</${tag}>`)
      }
      line(7, '</Homography>')
      line(6, '</Warper>')
      line(5, '</Slice>')
    }
    line(4, '</layers>')
    line(4, '<OutputDevice>')
    line(5, `<OutputDeviceVirtual name="${escape(screen.name)}" deviceId="Virtual${escape(screen.name)}" width="${screen.raster.width}" height="${screen.raster.height}"/>`)
    line(4, '</OutputDevice>')
    line(3, '</Screen>')
  }
  line(2, '</screens>')
  line(1, '</ScreenSetup>')
  line(0, '</XmlState>')
  const text = lines.join('\n') + '\n'
  if (new TextEncoder().encode(text).length > 2 * 1024 * 1024) throw new Error('Resolume preset exceeds the 2 MiB export limit')
  return text
}
