import {
  asCabinetGridId, asCabinetId, asInputCanvasId, asMappingRegionId, asModuleId,
  asPortId, asProcessorId, asReceiverId, asScreenId,
} from '../model/ids.js'
import { createProjectV2 } from '../project-model/create.js'
import {
  asBackupRouteId, asHardwareAssignmentId, asLiveOutputTargetId, asMediaOutputCanvasId,
  asOutputMappingId, asSignalRouteId,
} from '../project-model/ids.js'
import type { LedMapProjectV2, QuarterTurn } from '../project-model/types.js'
import { validateProjectV2Structural } from '../project-model/read-projections.js'
import { writeDocument } from './canonical.js'
import { SerializationError } from './errors.js'
import { cloneJsonValue, compareUtf16, deepFreeze, isPlainRecord, parseJsonText } from './json.js'
import { assertOwnDataProperties, checkExtensionsPayload } from './schema.js'
import type { JsonObject } from './types.js'
import { checkProjectV5Wire } from './v5-schema.js'
import type { LedMapDocumentV5, ProjectV5Wire } from './v5-types.js'
import type { ProjectV3Wire } from './v3-types.js'
import type { ProjectV4Wire } from './v4-types.js'

export interface LoadedProjectV5 {
  readonly project: LedMapProjectV2
  readonly extensions: JsonObject
  readonly sourceSchemaVersion: 5
}

function invalid(path: readonly (string | number)[], message: string): never {
  throw new SerializationError('SERIALIZATION_INVALID_SCHEMA', message, path)
}

export function fromV5Wire(wire: ProjectV5Wire): LedMapProjectV2 {
  return {
    metadata: { ...wire.metadata },
    design: {
      screens: wire.design.screens.map(value => ({
        ...value, id: asScreenId(value.id),
        cabinetGridOrder: value.cabinetGridOrder.map(asCabinetGridId),
        mappingRegionOrder: value.mappingRegionOrder.map(asMappingRegionId),
      })),
      cabinetGrids: wire.design.cabinetGrids.map(value => ({ ...value,
        id: asCabinetGridId(value.id), screenId: asScreenId(value.screenId) })),
      cabinets: wire.design.cabinets.map(value => ({ ...value,
        id: asCabinetId(value.id), gridId: asCabinetGridId(value.gridId) })),
      modules: wire.design.modules.map(value => ({ ...value,
        id: asModuleId(value.id), cabinetId: asCabinetId(value.cabinetId) })),
      composition: { placements: wire.design.composition.placements.map(value => ({ ...value,
        screenId: asScreenId(value.screenId) })) },
      ...(wire.design.stage === undefined ? {} : { stage: { placements: wire.design.stage.placements.map(value => ({
        ...value, screenId: asScreenId(value.screenId),
      })) } }),
    },
    content: {
      inputCanvases: wire.content.inputCanvases.map(value => ({ ...value, id: asInputCanvasId(value.id) })),
      mappingRegions: wire.content.mappingRegions.map(value => ({ ...value,
        id: asMappingRegionId(value.id), inputCanvasId: asInputCanvasId(value.inputCanvasId),
        screenId: asScreenId(value.screenId), gridId: asCabinetGridId(value.gridId),
      })),
      mediaOutputs: wire.content.mediaOutputs.map(value => ({ ...value,
        id: asMediaOutputCanvasId(value.id), mappingOrder: value.mappingOrder.map(asOutputMappingId),
      })),
      outputMappings: wire.content.outputMappings.map(value => ({ ...value,
        id: asOutputMappingId(value.id), screenId: asScreenId(value.screenId),
        mediaOutputId: asMediaOutputCanvasId(value.mediaOutputId),
        inputRotation: value.inputRotation as QuarterTurn, outputRotation: value.outputRotation as QuarterTurn,
      })),
    },
    hardware: {
      processors: wire.hardware.processors.map(value => ({ ...value, id: asProcessorId(value.id) })),
      ports: wire.hardware.ports.map(value => ({ ...value,
        id: asPortId(value.id), processorId: asProcessorId(value.processorId) })),
      receivers: wire.hardware.receivers.map(value => ({ ...value,
        id: asReceiverId(value.id), processorId: asProcessorId(value.processorId), portId: asPortId(value.portId) })),
      assignments: wire.hardware.assignments.map(value => ({ ...value,
        id: asHardwareAssignmentId(value.id), target: { kind: 'cabinet', cabinetId: asCabinetId(value.target.cabinetId) },
        receiverId: asReceiverId(value.receiverId),
      })),
      processorOrder: wire.hardware.processorOrder.map(asProcessorId),
      receiverOrder: wire.hardware.receiverOrder.map(value => ({
        portId: asPortId(value.portId), receiverIds: value.receiverIds.map(asReceiverId),
      })),
    },
    operations: {
      signalRoutes: wire.operations.signalRoutes.map(value => ({
        id: asSignalRouteId(value.id), receiverId: asReceiverId(value.receiverId),
        orderedCabinetIds: value.orderedCabinetIds.map(asCabinetId),
      })),
      backupRoutes: wire.operations.backupRoutes.map(value => ({ id: asBackupRouteId(value.id) })),
      liveOutputTargets: wire.operations.liveOutputTargets.map(value => ({ id: asLiveOutputTargetId(value.id) })),
    },
    remap: { rules: wire.remap.rules.map(value => ({ ...value })) },
  }
}

export function validateV5Structural(project: LedMapProjectV2): void {
  const diagnostic = validateProjectV2Structural(project)[0]
  if (diagnostic) {
    throw new SerializationError('SERIALIZATION_PROJECT_INVALID', `${diagnostic.code}: ${diagnostic.message}`, ['project', ...diagnostic.path])
  }
}

type LegacyMapping = {
  readonly id: string
  readonly screenId: string
  readonly mediaOutputId: string
  readonly position?: { readonly x: number; readonly y: number }
  readonly mask?: { readonly points: readonly { readonly x: number; readonly y: number }[] }
}

export function migrateLegacyWireToV5Wire(wire: ProjectV3Wire | ProjectV4Wire): ProjectV5Wire {
  const screens = new Map(wire.design.screens.map(screen => [screen.id, screen]))
  const outputMappings = wire.content.outputMappings.map((mapping: LegacyMapping) => {
    const screen = screens.get(mapping.screenId)
    if (!screen) {
      throw new SerializationError('SERIALIZATION_PROJECT_INVALID', `OutputMapping ${mapping.id} references unknown Screen ${mapping.screenId}`, ['project', 'content', 'outputMappings'])
    }
    const position = mapping.position
    const points = mapping.mask?.points ?? []
    return {
      id: mapping.id,
      name: mapping.id,
      enabled: true,
      screenId: mapping.screenId,
      mediaOutputId: mapping.mediaOutputId,
      screenRect: { x: 0, y: 0, width: screen.resolution.width, height: screen.resolution.height },
      outputRect: {
        x: position?.x ?? 0,
        y: position?.y ?? 0,
        width: screen.resolution.width,
        height: screen.resolution.height,
      },
      inputRotation: 0,
      outputRotation: 0,
      flipX: false,
      flipY: false,
      ...(mapping.mask === undefined ? {} : { mask: { enabled: points.length >= 3, points: [...points] } }),
    }
  })
  const mediaOutputs = wire.content.mediaOutputs.map(output => ({
    ...output,
    mappingOrder: outputMappings.filter(mapping => mapping.mediaOutputId === output.id).map(mapping => mapping.id),
  }))
  return { ...wire, content: { ...wire.content, mediaOutputs, outputMappings } } as ProjectV5Wire
}

export function downgradeV5WireToV4Wire(wire: ProjectV5Wire): ProjectV4Wire {
  const screens = new Map(wire.design.screens.map(screen => [screen.id, screen]))
  const outputMappings = wire.content.outputMappings.map(mapping => {
    const screen = screens.get(mapping.screenId)
    if (!screen) {
      throw new SerializationError('SERIALIZATION_INVALID_INPUT', `OutputMapping ${mapping.id} references unknown Screen`, ['project'])
    }
    const fullScreen = mapping.screenRect.x === 0 && mapping.screenRect.y === 0 &&
      mapping.screenRect.width === screen.resolution.width && mapping.screenRect.height === screen.resolution.height
    const sameSize = mapping.outputRect.width === screen.resolution.width && mapping.outputRect.height === screen.resolution.height
    if (!fullScreen || !sameSize || mapping.inputRotation !== 0 || mapping.outputRotation !== 0 ||
        mapping.flipX || mapping.flipY || !mapping.enabled) {
      throw new SerializationError('SERIALIZATION_INVALID_INPUT', `OutputMapping ${mapping.id} cannot be represented in schema v4`, ['project', 'content', 'outputMappings'])
    }
    return {
      id: mapping.id,
      screenId: mapping.screenId,
      mediaOutputId: mapping.mediaOutputId,
      position: { x: mapping.outputRect.x, y: mapping.outputRect.y },
      ...(mapping.mask === undefined || !mapping.mask.enabled ? {} : { mask: { points: [...mapping.mask.points] } }),
    }
  })
  const mediaOutputs = wire.content.mediaOutputs.map(output => ({ id: output.id, name: output.name, resolution: output.resolution }))
  return { ...wire, content: { ...wire.content, mediaOutputs, outputMappings } } as unknown as ProjectV4Wire
}

export function downgradeV5WireToV3Wire(wire: ProjectV5Wire): ProjectV3Wire {
  const screens = new Map(wire.design.screens.map(screen => [screen.id, screen]))
  const outputMappings = wire.content.outputMappings.map(mapping => {
    const screen = screens.get(mapping.screenId)
    if (!screen) {
      throw new SerializationError('SERIALIZATION_INVALID_INPUT', `OutputMapping ${mapping.id} references unknown Screen`, ['project'])
    }
    const fullScreen = mapping.screenRect.x === 0 && mapping.screenRect.y === 0 &&
      mapping.screenRect.width === screen.resolution.width && mapping.screenRect.height === screen.resolution.height
    const atOrigin = mapping.outputRect.x === 0 && mapping.outputRect.y === 0 &&
      mapping.outputRect.width === screen.resolution.width && mapping.outputRect.height === screen.resolution.height
    if (!fullScreen || !atOrigin || mapping.inputRotation !== 0 || mapping.outputRotation !== 0 ||
        mapping.flipX || mapping.flipY || !mapping.enabled) {
      throw new SerializationError('SERIALIZATION_INVALID_INPUT', `OutputMapping ${mapping.id} cannot be represented in schema v3`, ['project', 'content', 'outputMappings'])
    }
    return {
      id: mapping.id,
      screenId: mapping.screenId,
      mediaOutputId: mapping.mediaOutputId,
      ...(mapping.mask === undefined || !mapping.mask.enabled ? {} : { mask: { points: [...mapping.mask.points] } }),
    }
  })
  const mediaOutputs = wire.content.mediaOutputs.map(output => ({ id: output.id, name: output.name, resolution: output.resolution }))
  return { ...wire, content: { ...wire.content, mediaOutputs, outputMappings } } as unknown as ProjectV3Wire
}

export function parseProjectV5Document(text: string): LedMapDocumentV5 {
  if (typeof text !== 'string') throw new SerializationError('SERIALIZATION_INVALID_INPUT', 'Expected JSON text', [])
  const value = parseJsonText(text)
  if (!isPlainRecord(value)) invalid([], 'Expected a plain JSON document')
  assertOwnDataProperties(value, [])
  if (value['format'] !== 'ledmap') invalid(['format'], 'format must equal ledmap')
  const version = value['schemaVersion']
  if (!Number.isSafeInteger(version) || (version as number) < 0) invalid(['schemaVersion'], 'schemaVersion must be a non-negative safe integer')
  if (version !== 5) {
    throw new SerializationError('SERIALIZATION_UNSUPPORTED_VERSION', `schemaVersion ${version} is unsupported by the V5 reader`, ['schemaVersion'])
  }
  const project = checkProjectV5Wire(value['project'], 'document')
  const extensions = checkExtensionsPayload(value['extensions'], ['extensions'], 'document')
  const unknown = Object.getOwnPropertyNames(value).filter(key => !['format', 'schemaVersion', 'project', 'extensions'].includes(key)).sort(compareUtf16)
  if (unknown.length > 0) invalid([unknown[0]!], `Unknown document field ${unknown[0]!}`)
  return deepFreeze({ format: 'ledmap', schemaVersion: 5, project, extensions })
}

export function loadProjectV5(text: string): LoadedProjectV5 {
  const document = parseProjectV5Document(text)
  const candidate = fromV5Wire(document.project)
  validateV5Structural(candidate)
  return Object.freeze({ project: createProjectV2(candidate), extensions: document.extensions, sourceSchemaVersion: 5 })
}

export function serializeProjectV5(input: { readonly project: LedMapProjectV2; readonly extensions?: JsonObject }): string {
  if (!isPlainRecord(input)) throw new SerializationError('SERIALIZATION_INVALID_INPUT', 'Expected a plain input record', [])
  assertOwnDataProperties(input, [])
  const unknown = Object.getOwnPropertyNames(input).filter(key => !['project', 'extensions'].includes(key)).sort(compareUtf16)
  if (unknown.length > 0) throw new SerializationError('SERIALIZATION_INVALID_INPUT', `Unknown input field ${unknown[0]!}`, [unknown[0]!])
  const project = checkProjectV5Wire(input.project, 'runtime')
  validateV5Structural(input.project)
  const extensions = input.extensions === undefined ? {} : checkExtensionsPayload(input.extensions, ['extensions'], 'runtime')
  return writeDocument({ format: 'ledmap', schemaVersion: 5, project,
    extensions: cloneJsonValue(extensions, ['extensions']) as JsonObject })
}
