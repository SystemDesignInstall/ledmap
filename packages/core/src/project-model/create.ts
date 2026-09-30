import { DomainError } from '../model/errors.js'
import type {
  LedMapProjectV2,
  OutputMapping,
  PolygonMask,
  ProjectCabinet,
  ProjectCabinetGrid,
  ProjectMappingRegion,
  ProjectReceiver,
  StageModel,
} from './types.js'

function freezeArray<T>(values: readonly T[]): readonly T[] {
  return Object.freeze([...values])
}

function cloneCabinetGrid(grid: ProjectCabinetGrid): ProjectCabinetGrid {
  return Object.freeze({ ...grid, ordering: Object.freeze({ ...grid.ordering }) })
}

function cloneCabinet(cabinet: ProjectCabinet): ProjectCabinet {
  return Object.freeze({ ...cabinet, origin: Object.freeze({ ...cabinet.origin }) })
}

function cloneMappingRegion(region: ProjectMappingRegion): ProjectMappingRegion {
  return Object.freeze({
    ...region,
    position: Object.freeze({ ...region.position }),
    size: Object.freeze({ ...region.size }),
  })
}

function cloneReceiver(receiver: ProjectReceiver): ProjectReceiver {
  return Object.freeze({ ...receiver, cabinetIds: freezeArray(receiver.cabinetIds) })
}

function clonePolygonMask(mask: PolygonMask): PolygonMask {
  return Object.freeze({
    points: Object.freeze(mask.points.map(point => Object.freeze({ ...point }))),
  })
}

function cloneOutputMapping(mapping: OutputMapping): OutputMapping {
  return Object.freeze({
    ...mapping,
    ...(mapping.mask === undefined ? {} : { mask: clonePolygonMask(mapping.mask) }),
  })
}

function cloneStage(stage: StageModel): StageModel {
  return Object.freeze({ placements: Object.freeze(stage.placements.map(placement => Object.freeze({
    ...placement,
    positionMm: Object.freeze({ ...placement.positionMm }),
  }))) })
}

function assertUniqueCompositionPlacements(project: LedMapProjectV2): void {
  const screenIds = new Set<string>()
  for (const placement of project.design.composition.placements) {
    if (screenIds.has(placement.screenId)) {
      throw new DomainError(
        'PROJECT_DUPLICATE_COMPOSITION_PLACEMENT',
        `Screen ${placement.screenId} has more than one CompositionPlacement`,
      )
    }
    screenIds.add(placement.screenId)
  }
}

export function createProjectV2(input: LedMapProjectV2): LedMapProjectV2 {
  assertUniqueCompositionPlacements(input)
  return Object.freeze({
    metadata: Object.freeze({ ...input.metadata }),
    design: Object.freeze({
      screens: Object.freeze(input.design.screens.map(screen => Object.freeze({
        ...screen,
        resolution: Object.freeze({ ...screen.resolution }),
      }))),
      cabinetGrids: Object.freeze(input.design.cabinetGrids.map(cloneCabinetGrid)),
      cabinets: Object.freeze(input.design.cabinets.map(cloneCabinet)),
      modules: Object.freeze(input.design.modules.map(module => Object.freeze({ ...module }))),
      composition: Object.freeze({
        placements: Object.freeze(input.design.composition.placements.map(placement => Object.freeze({ ...placement }))),
      }),
      ...(input.design.stage === undefined ? {} : { stage: cloneStage(input.design.stage) }),
    }),
    content: Object.freeze({
      inputCanvases: Object.freeze(input.content.inputCanvases.map(canvas => Object.freeze({
        ...canvas,
        resolution: Object.freeze({ ...canvas.resolution }),
      }))),
      mappingRegions: Object.freeze(input.content.mappingRegions.map(cloneMappingRegion)),
      mediaOutputs: Object.freeze(input.content.mediaOutputs.map(output => Object.freeze({
        ...output,
        resolution: Object.freeze({ ...output.resolution }),
      }))),
      outputMappings: Object.freeze(input.content.outputMappings.map(cloneOutputMapping)),
    }),
    hardware: Object.freeze({
      processors: Object.freeze(input.hardware.processors.map(processor => Object.freeze({ ...processor }))),
      ports: Object.freeze(input.hardware.ports.map(port => Object.freeze({ ...port }))),
      receivers: Object.freeze(input.hardware.receivers.map(cloneReceiver)),
      processorOrder: freezeArray(input.hardware.processorOrder),
      receiverOrder: Object.freeze(input.hardware.receiverOrder.map(order => Object.freeze({
        ...order,
        receiverIds: freezeArray(order.receiverIds),
      }))),
    }),
    operations: Object.freeze({
      signalRoutes: Object.freeze(input.operations.signalRoutes.map(route => Object.freeze({ ...route }))),
      backupRoutes: Object.freeze(input.operations.backupRoutes.map(route => Object.freeze({ ...route }))),
      liveOutputTargets: Object.freeze(input.operations.liveOutputTargets.map(target => Object.freeze({ ...target }))),
    }),
    remap: Object.freeze({
      rules: Object.freeze(input.remap.rules.map(rule => Object.freeze({ ...rule }))),
    }),
  })
}

export function createEmptyProjectV2(): LedMapProjectV2 {
  return createProjectV2({
    metadata: {},
    design: {
      screens: [],
      cabinetGrids: [],
      cabinets: [],
      modules: [],
      composition: { placements: [] },
    },
    content: {
      inputCanvases: [],
      mappingRegions: [],
      mediaOutputs: [],
      outputMappings: [],
    },
    hardware: {
      processors: [],
      ports: [],
      receivers: [],
      processorOrder: [],
      receiverOrder: [],
    },
    operations: {
      signalRoutes: [],
      backupRoutes: [],
      liveOutputTargets: [],
    },
    remap: { rules: [] },
  })
}
