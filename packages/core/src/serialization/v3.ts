import {
  asCabinetGridId, asCabinetId, asInputCanvasId, asMappingRegionId, asModuleId,
  asPortId, asProcessorId, asReceiverId, asScreenId,
} from '../model/ids.js'
import { createProjectV2 } from '../project-model/create.js'
import {
  asBackupRouteId, asHardwareAssignmentId, asLiveOutputTargetId, asMediaOutputCanvasId,
  asOutputMappingId, asSignalRouteId,
} from '../project-model/ids.js'
import { validateProjectV2Structural } from '../project-model/read-projections.js'
import type { LedMapProjectV2 } from '../project-model/types.js'
import { writeDocument } from './canonical.js'
import { SerializationError } from './errors.js'
import { cloneJsonValue, compareUtf16, deepFreeze, isPlainRecord, parseJsonText } from './json.js'
import { assertOwnDataProperties, checkExtensionsPayload } from './schema.js'
import type { JsonObject } from './types.js'
import { checkProjectV3Wire } from './v3-schema.js'
import type { LedMapDocumentV3, ProjectV3Wire } from './v3-types.js'

export interface LoadedProjectV3 {
  readonly project: LedMapProjectV2
  readonly extensions: JsonObject
  readonly sourceSchemaVersion: 3
}

function invalid(path: readonly (string | number)[], message: string): never {
  throw new SerializationError('SERIALIZATION_INVALID_SCHEMA', message, path)
}

function validateStructural(project: LedMapProjectV2): void {
  const diagnostic = validateProjectV2Structural(project)[0]
  if (diagnostic) {
    throw new SerializationError('SERIALIZATION_PROJECT_INVALID', `${diagnostic.code}: ${diagnostic.message}`, ['project', ...diagnostic.path])
  }
}

function fromWire(wire: ProjectV3Wire): LedMapProjectV2 {
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
      mediaOutputs: wire.content.mediaOutputs.map(value => ({ ...value, id: asMediaOutputCanvasId(value.id) })),
      outputMappings: wire.content.outputMappings.map(value => ({ ...value,
        id: asOutputMappingId(value.id), screenId: asScreenId(value.screenId),
        mediaOutputId: asMediaOutputCanvasId(value.mediaOutputId),
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

export function parseProjectV3Document(text: string): LedMapDocumentV3 {
  if (typeof text !== 'string') throw new SerializationError('SERIALIZATION_INVALID_INPUT', 'Expected JSON text', [])
  const value = parseJsonText(text)
  if (!isPlainRecord(value)) invalid([], 'Expected a plain JSON document')
  assertOwnDataProperties(value, [])
  if (value['format'] !== 'ledmap') invalid(['format'], 'format must equal ledmap')
  const version = value['schemaVersion']
  if (!Number.isSafeInteger(version) || (version as number) < 0) invalid(['schemaVersion'], 'schemaVersion must be a non-negative safe integer')
  if (version !== 3) {
    throw new SerializationError('SERIALIZATION_UNSUPPORTED_VERSION', `schemaVersion ${version} is unsupported by the V3 reader`, ['schemaVersion'])
  }
  const project = checkProjectV3Wire(value['project'], 'document')
  const extensions = checkExtensionsPayload(value['extensions'], ['extensions'], 'document')
  const unknown = Object.getOwnPropertyNames(value).filter(key => !['format', 'schemaVersion', 'project', 'extensions'].includes(key)).sort(compareUtf16)
  if (unknown.length > 0) invalid([unknown[0]!], `Unknown document field ${unknown[0]!}`)
  return deepFreeze({ format: 'ledmap', schemaVersion: 3, project, extensions })
}

export function loadProjectV3(text: string): LoadedProjectV3 {
  const document = parseProjectV3Document(text)
  const candidate = fromWire(document.project)
  validateStructural(candidate)
  const project = createProjectV2(candidate)
  return Object.freeze({ project, extensions: document.extensions, sourceSchemaVersion: 3 })
}

export function serializeProjectV3(input: { readonly project: LedMapProjectV2; readonly extensions?: JsonObject }): string {
  if (!isPlainRecord(input)) throw new SerializationError('SERIALIZATION_INVALID_INPUT', 'Expected a plain input record', [])
  assertOwnDataProperties(input, [])
  const unknown = Object.getOwnPropertyNames(input).filter(key => !['project', 'extensions'].includes(key)).sort(compareUtf16)
  if (unknown.length > 0) throw new SerializationError('SERIALIZATION_INVALID_INPUT', `Unknown input field ${unknown[0]!}`, [unknown[0]!])
  const project = checkProjectV3Wire(input.project, 'runtime')
  validateStructural(input.project)
  const extensions = input.extensions === undefined ? {} : checkExtensionsPayload(input.extensions, ['extensions'], 'runtime')
  return writeDocument({ format: 'ledmap', schemaVersion: 3, project,
    extensions: cloneJsonValue(extensions, ['extensions']) as JsonObject })
}
