import {
  asMediaOutputCanvasId, asOutputMappingId, assertCompositionRasterFrame, assertProjectV2EditorStructure,
  compositionRasterRectToScreen, inspectMediaOutputMapping, screenRectToCompositionRaster,
  type LedMapProjectV2, type PixelRect, type Size,
} from '@ledmap/core'
import { buildResolumeNativePreset } from './resolume-export.js'
import {
  freezeResolume, integerRect, rectQuad, RESOLUME_COMPATIBILITY, RESOLUME_SAMPLE_VERSION,
  type ResolumeNativeDocument, type ResolumeNativeScreen,
} from './resolume-types.js'

export interface ResolumeExportPlan {
  readonly ready: boolean
  readonly diagnostics: readonly string[]
  readonly compatibility: string
  readonly document: ResolumeNativeDocument | null
}

export function planResolumeProjectExport(project: LedMapProjectV2, frame: PixelRect): ResolumeExportPlan {
  try {
    assertProjectV2EditorStructure(project)
    assertCompositionRasterFrame(project, frame)
    const mappings = new Map(project.content.outputMappings.map(value => [value.id, value]))
    const screens: ResolumeNativeScreen[] = project.content.mediaOutputs.map(output => {
      const inspection = inspectMediaOutputMapping(project, output.id)
      if (inspection.diagnostics.length > 0) throw new Error(`Media Output ${output.name}: ${inspection.diagnostics[0]!.code}`)
      const owned = project.content.outputMappings.filter(mapping => mapping.mediaOutputId === output.id)
      if (output.mappingOrder.length !== owned.length || new Set(output.mappingOrder).size !== owned.length ||
          output.mappingOrder.some(id => !owned.some(mapping => mapping.id === id))) {
        throw new Error(`Media Output ${output.name} requires a complete, unique mappingOrder`)
      }
      const slices = output.mappingOrder.map(id => {
        const mapping = mappings.get(id)!
        if (mapping.inputRotation !== 0 || mapping.outputRotation !== 0 || mapping.flipX || mapping.flipY || mapping.mask?.enabled) {
          throw new Error(`Slice ${mapping.name}: native export supports zero rotations/flips and no active mask`)
        }
        const input = screenRectToCompositionRaster(project, mapping.screenId, mapping.screenRect, frame)
        return { id: mapping.id, name: mapping.name, enabled: mapping.enabled,
          inputOrientation: 0, outputOrientation: 0, inputSource: '0:1', flip: 0,
          input: rectQuad(input), output: rectQuad(mapping.outputRect), warp: null }
      })
      return { id: output.id, name: output.name, enabled: true, raster: { ...output.resolution },
        deviceKind: 'OutputDeviceVirtual', slices }
    })
    const document = freezeResolume({ name: project.metadata.name ?? 'LedMAP', composition: { width: frame.width, height: frame.height },
      version: RESOLUME_SAMPLE_VERSION, screens, diagnostics: [] })
    buildResolumeNativePreset(document)
    return freezeResolume({ ready: true, diagnostics: [], compatibility: RESOLUME_COMPATIBILITY, document })
  } catch (error) {
    if (!(error instanceof Error)) throw error
    return freezeResolume({ ready: false, diagnostics: [error.message], compatibility: RESOLUME_COMPATIBILITY, document: null })
  }
}

export interface ResolumeSliceBinding {
  readonly sourceSliceId: string
  readonly screenId: string
}

export function applyResolumeOutputImport(
  project: LedMapProjectV2, source: ResolumeNativeDocument, frame: PixelRect,
  bindings: readonly ResolumeSliceBinding[], rasterOverrides: Readonly<Record<string, Size>> = {},
): LedMapProjectV2 {
  assertProjectV2EditorStructure(project)
  assertCompositionRasterFrame(project, frame)
  if (!source.composition || source.composition.width !== frame.width || source.composition.height !== frame.height) {
    throw new Error('Resolume Composition dimensions must match the explicitly selected chart frame')
  }
  if (source.screens.some(screen => !screen.enabled)) {
    throw new Error('Disabled Arena Screens cannot be imported without losing their independent enabled state')
  }
  const document = { ...source, screens: source.screens.map(screen => {
    const raster = screen.raster ?? rasterOverrides[screen.id]
    return { ...screen, raster: raster ? { ...raster } : null }
  }) }
  buildResolumeNativePreset(document)
  const sourceIds = document.screens.flatMap(screen => screen.slices.map(slice => slice.id))
  const bound = new Map(bindings.map(binding => [binding.sourceSliceId, binding.screenId]))
  if (bound.size !== bindings.length || bound.size !== sourceIds.length || sourceIds.some(id => !bound.has(id))) {
    throw new Error('Import requires one explicit existing Screen binding for every source slice')
  }
  const outputIds = new Set(project.content.mediaOutputs.map(output => String(output.id)))
  const mappingIds = new Set(project.content.outputMappings.map(mapping => String(mapping.id)))
  function nextId(ids: Set<string>, prefix: string): string {
    let serial = ids.size + 1
    while (ids.has(`${prefix}${serial}`)) serial += 1
    const id = `${prefix}${serial}`
    ids.add(id)
    return id
  }
  const outputs = [...project.content.mediaOutputs]
  const mappings = [...project.content.outputMappings]
  for (const screen of document.screens) {
    const mediaOutputId = asMediaOutputCanvasId(nextId(outputIds, 'media-output-'))
    const mappingOrder = screen.slices.map(slice => {
      const screenId = project.design.screens.find(value => value.id === bound.get(slice.id))?.id
      if (!screenId) throw new Error(`Unknown bound LedMAP Screen for slice ${slice.id}`)
      const id = asOutputMappingId(nextId(mappingIds, 'output-mapping-'))
      const screenRect = compositionRasterRectToScreen(project, screenId, integerRect(slice.input)!, frame)
      mappings.push({ id, name: slice.name, enabled: slice.enabled, screenId, mediaOutputId,
        screenRect, outputRect: integerRect(slice.output)!, inputRotation: 0, outputRotation: 0, flipX: false, flipY: false })
      return id
    })
    outputs.push({ id: mediaOutputId, name: screen.name, resolution: screen.raster!, mappingOrder })
  }
  const candidate = { ...project, content: { ...project.content, mediaOutputs: outputs, outputMappings: mappings } }
  assertProjectV2EditorStructure(candidate)
  for (const output of outputs.slice(project.content.mediaOutputs.length)) {
    const error = inspectMediaOutputMapping(candidate, output.id).diagnostics.find(issue => issue.severity === 'error')
    if (error) throw new Error(`Imported Media Output ${output.name}: ${error.code}`)
  }
  return candidate
}
