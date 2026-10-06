import { DOMParser, type Element as XmlElement, type Node as XmlNode } from '@xmldom/xmldom'
import {
  freezeResolume, integerRect, resolumeWarpChanges, type ResolumeDiagnostic, type ResolumeNativeDocument,
  type ResolumePoint, type ResolumeQuad, type ResolumeWarp,
} from './resolume-types.js'

export const RESOLUME_XML_MAX_BYTES = 2 * 1024 * 1024

function children(node: XmlNode): XmlElement[] {
  return Array.from(node.childNodes).filter((value): value is XmlElement => value.nodeType === 1)
}

function child(node: XmlNode, name: string, required = false): XmlElement | null {
  const matches = children(node).filter(value => value.tagName === name)
  if (matches.length > 1 || (required && matches.length !== 1)) throw new Error(`Resolume XML requires one ${name} element`)
  return matches[0] ?? null
}

function number(value: string | null, label: string, integer = false): number {
  if (value === null || !/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$/.test(value)) throw new Error(`Invalid Resolume ${label}`)
  const parsed = Number(value)
  if (!Number.isFinite(parsed) || Math.abs(parsed) > 1_000_000_000 || (integer && !Number.isSafeInteger(parsed))) {
    throw new Error(`Invalid Resolume ${label}`)
  }
  return parsed
}

function size(node: XmlElement | null) {
  if (!node) return null
  const width = number(node.getAttribute('width'), 'width', true)
  const height = number(node.getAttribute('height'), 'height', true)
  if (width < 1 || height < 1) throw new Error('Resolume raster dimensions must be positive')
  return { width, height }
}

function points(node: XmlElement): ResolumePoint[] {
  return children(node).filter(value => value.tagName === 'v').map(value => ({
    x: number(value.getAttribute('x'), 'vertex x'), y: number(value.getAttribute('y'), 'vertex y'),
  }))
}

function quad(node: XmlElement): ResolumeQuad {
  const values = points(node)
  if (values.length !== 4) throw new Error('Resolume rectangle requires four ordered vertices')
  return values as unknown as ResolumeQuad
}

function param(node: XmlElement, group: string, name: string): string | null {
  const groups = children(node).filter(value => value.tagName === 'Params' && value.getAttribute('name') === group)
  if (groups.length > 1) throw new Error(`Repeated Resolume Params group ${group}`)
  const values = groups[0] ? children(groups[0]).filter(value => value.getAttribute('name') === name) : []
  if (values.length > 1) throw new Error(`Repeated Resolume parameter ${name}`)
  if (values[0] && !values[0].hasAttribute('value')) throw new Error(`Missing Resolume parameter value ${name}`)
  return values[0]?.getAttribute('value') ?? null
}

function enabled(node: XmlElement, group: string): boolean {
  const value = param(node, group, 'Enabled')
  if (value !== null && value !== '0' && value !== '1') throw new Error('Invalid Resolume Enabled parameter')
  return value !== '0'
}

export function parseResolumeAdvancedOutput(text: string): ResolumeNativeDocument {
  if (typeof text !== 'string' || text.length > RESOLUME_XML_MAX_BYTES || new TextEncoder().encode(text).length > RESOLUME_XML_MAX_BYTES) {
    throw new Error('Resolume XML exceeds the 2 MiB limit')
  }
  if (/<!\s*(?:DOCTYPE|ENTITY)\b/i.test(text)) throw new Error('Resolume XML DTD and entity declarations are forbidden')
  let markers = 0
  for (const character of text) if (character === '<' && ++markers > 50000) throw new Error('Resolume XML exceeds the markup limit')
  const document = new DOMParser({ onError: (_level, message) => { throw new Error(`Malformed Resolume XML: ${message}`) } })
    .parseFromString(text, 'application/xml')
  const root = document.documentElement
  if (!root) throw new Error('Resolume XML has no root element')
  const stack: { node: XmlNode; depth: number }[] = [{ node: root, depth: 1 }]
  let count = 0
  while (stack.length > 0) {
    const { node, depth } = stack.pop()!
    if (++count > 25000 || depth > 64) throw new Error('Resolume XML exceeds the element/depth limit')
    if (node.nodeType === 1 && (node as XmlElement).attributes.length > 64) throw new Error('Resolume XML exceeds the attribute limit')
    for (const value of children(node)) stack.push({ node: value, depth: depth + 1 })
  }
  if (root.tagName !== 'ScreenSetup' && root.tagName !== 'XmlState') throw new Error('Not a Resolume Advanced Output preset or preferences file')
  const setup = root.tagName === 'ScreenSetup' ? root : child(root, 'ScreenSetup', true)!
  const diagnostics: ResolumeDiagnostic[] = []
  const warn = (code: string, path: string, message: string, blocking = true) => diagnostics.push({ code, path, message, blocking })
  function unknown(node: XmlElement, allowed: readonly string[], path: string): void {
    for (const value of children(node)) if (!allowed.includes(value.tagName)) {
      warn('RESOLUME_UNKNOWN_ELEMENT', path, `Unsupported ${value.tagName} element`)
    }
  }
  function parameters(node: XmlElement, allowed: Readonly<Record<string, readonly string[]>>, path: string): void {
    for (const group of children(node).filter(value => value.tagName === 'Params')) {
      const names = allowed[group.getAttribute('name') ?? ''] ?? []
      for (const value of children(group)) if (!names.includes(value.getAttribute('name') ?? '') ||
          !['Param', 'ParamChoice'].includes(value.tagName) || children(value).length > 0) {
        warn('RESOLUME_UNSUPPORTED_PARAMETER', path, `Unsupported ${value.getAttribute('name') ?? value.tagName} parameter`)
      }
    }
  }
  if (root !== setup) unknown(root, ['versionInfo', 'ScreenSetup'], 'document')
  unknown(setup, ['versionInfo', 'Params', 'CurrentCompositionTextureSize', 'screens', 'SoftEdging'], 'document')
  parameters(setup, { ScreenSetupParams: [] }, 'document')
  if (child(setup, 'SoftEdging')) {
    warn('RESOLUME_UNSUPPORTED_SOFT_EDGING', 'document', 'SoftEdging settings cannot be represented by rectangular Output Mappings')
  }
  const versionNode = child(root, 'versionInfo')
  const version = versionNode ? {
    name: versionNode.getAttribute('name') ?? 'Unknown',
    major: number(versionNode.getAttribute('majorVersion'), 'major version', true),
    minor: number(versionNode.getAttribute('minorVersion'), 'minor version', true),
    micro: number(versionNode.getAttribute('microVersion'), 'micro version', true),
    revision: number(versionNode.getAttribute('revision'), 'revision', true),
  } : null
  if (!version) warn('RESOLUME_VERSION_UNKNOWN', 'document', 'Source Arena version is not declared', false)
  const composition = size(child(setup, 'CurrentCompositionTextureSize'))
  if (!composition) warn('RESOLUME_COMPOSITION_UNKNOWN', 'document', 'Composition size is not declared', false)
  const ids = new Set<string>()
  function id(node: XmlElement): string {
    const value = node.getAttribute('uniqueId')
    if (!value || value.length > 256 || ids.has(value)) throw new Error('Missing, oversized or duplicate Resolume uniqueId')
    ids.add(value)
    return value
  }
  const screenContainer = child(setup, 'screens', true)!
  unknown(screenContainer, ['Screen'], 'document')
  const screenNodes = children(screenContainer).filter(value => value.tagName === 'Screen')
  if (screenNodes.length === 0) throw new Error('Resolume Advanced Output has no screens')
  const screens = screenNodes.map((screen, si) => {
    const screenId = id(screen)
    const path = `screen:${screenId}`
    unknown(screen, ['Params', 'guides', 'layers', 'OutputDevice'], path)
    parameters(screen, { Params: ['Name', 'Enabled', 'Hidden'] }, path)
    const deviceContainer = child(screen, 'OutputDevice')
    const devices = deviceContainer ? children(deviceContainer) : []
    if (devices.length > 1) throw new Error('Resolume Screen requires at most one output device')
    const device = devices[0] ?? null
    const raster = device && (device.hasAttribute('width') || device.hasAttribute('height')) ? size(device) : null
    if (!raster) warn('RESOLUME_RASTER_UNKNOWN', path, 'Output raster size is unknown; supply explicit dimensions before importing or exporting', false)
    const layers = child(screen, 'layers', true)!
    unknown(layers, ['Slice'], path)
    const slices = children(layers).filter(value => value.tagName === 'Slice').map((slice, li) => {
      const sliceId = id(slice)
      const slicePath = `slice:${sliceId}`
      unknown(slice, ['Params', 'InputRect', 'OutputRect', 'Warper'], slicePath)
      parameters(slice, { Common: ['Name', 'Enabled'], Input: ['Input Source'], Output: ['Flip'] }, slicePath)
      const inputNode = child(slice, 'InputRect', true)!
      const outputNode = child(slice, 'OutputRect', true)!
      unknown(inputNode, ['v'], slicePath)
      unknown(outputNode, ['v'], slicePath)
      const input = quad(inputNode)
      const output = quad(outputNode)
      if (!integerRect(input) || !integerRect(output)) warn('RESOLUME_UNSUPPORTED_QUAD', slicePath, 'Only axis-aligned, integer-edge rectangles can be applied/exported; original corners are retained')
      const inputOrientation = number(inputNode.getAttribute('orientation') ?? '0', 'input orientation', true)
      const outputOrientation = number(outputNode.getAttribute('orientation') ?? '0', 'output orientation', true)
      if (inputOrientation !== 0 || outputOrientation !== 0) warn('RESOLUME_UNSUPPORTED_ORIENTATION', slicePath, 'Non-zero rectangle orientation is unsupported')
      const inputSource = param(slice, 'Input', 'Input Source') ?? '0:1'
      if (inputSource !== '0:1') warn('RESOLUME_UNSUPPORTED_SOURCE', slicePath, 'Slice input source is not the composition')
      const flip = number(param(slice, 'Output', 'Flip') ?? '0', 'flip', true)
      if (flip !== 0) warn('RESOLUME_UNSUPPORTED_FLIP', slicePath, 'Slice flip is unsupported')
      let warp: ResolumeWarp | null = null
      const warper = child(slice, 'Warper')
      if (warper) {
        unknown(warper, ['Params', 'BezierWarper', 'Homography'], slicePath)
        parameters(warper, { Warper: ['Point Mode', 'Flip'] }, slicePath)
        const bezier = child(warper, 'BezierWarper', true)!
        unknown(bezier, ['vertices'], slicePath)
        const vertices = child(bezier, 'vertices', true)!
        unknown(vertices, ['v'], slicePath)
        const columns = number(bezier.getAttribute('controlWidth'), 'controlWidth', true)
        const rows = number(bezier.getAttribute('controlHeight'), 'controlHeight', true)
        const controls = points(vertices)
        if (columns < 2 || rows < 2 || columns * rows !== controls.length) throw new Error('Invalid Resolume control lattice dimensions')
        const mode = param(warper, 'Warper', 'Point Mode') ?? 'PM_LINEAR'
        if (mode !== 'PM_LINEAR') warn('RESOLUME_UNSUPPORTED_POINT_MODE', slicePath, `Unsupported Point Mode ${mode}`)
        const warpFlip = number(param(warper, 'Warper', 'Flip') ?? '0', 'warper flip', true)
        if (warpFlip !== 0) warn('RESOLUME_UNSUPPORTED_FLIP', slicePath, 'Warper flip is unsupported')
        const homography = child(warper, 'Homography')
        if (homography) unknown(homography, ['src', 'dst'], slicePath)
        const sourceNode = homography ? child(homography, 'src', true)! : null
        const destinationNode = homography ? child(homography, 'dst', true)! : null
        if (sourceNode) unknown(sourceNode, ['v'], slicePath)
        if (destinationNode) unknown(destinationNode, ['v'], slicePath)
        const sourceQuad = sourceNode ? quad(sourceNode) : null
        const destination = destinationNode ? quad(destinationNode) : null
        warp = { columns, rows, points: controls, mode, flip: warpFlip, source: sourceQuad, destination }
        const changes = resolumeWarpChanges(warp, output)
        if (changes.lattice) warn('RESOLUME_UNSUPPORTED_WARP', slicePath, 'Changed control lattice is retained for inspection and cannot be applied/exported')
        if (changes.homography) {
          warn('RESOLUME_UNSUPPORTED_HOMOGRAPHY', slicePath, 'Non-identity homography is retained and cannot be applied/exported')
        }
      }
      return { id: sliceId, name: param(slice, 'Common', 'Name') ?? `Slice ${li + 1}`, enabled: enabled(slice, 'Common'),
        inputOrientation, outputOrientation, inputSource, flip, input, output, warp }
    })
    return { id: screenId, name: param(screen, 'Params', 'Name') ?? screen.getAttribute('name') ?? `Screen ${si + 1}`,
      enabled: enabled(screen, 'Params'), raster, deviceKind: device?.tagName ?? null, slices }
  })
  return freezeResolume({ name: root.getAttribute('name') ?? 'Advanced Output', composition, version, screens, diagnostics })
}
