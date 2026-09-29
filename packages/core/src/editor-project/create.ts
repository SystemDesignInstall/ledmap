import type { ValidateProjectInput } from '../validation/index.js'
import type { EditableProject, EditorPoint } from './types.js'

function freezeArray<T>(values: readonly T[]): readonly T[] {
  return Object.freeze([...values])
}

function cloneProjectInput(input: ValidateProjectInput): Omit<EditableProject, 'editorLayout'> {
  const { mapping } = input
  const inputCanvas = Object.freeze({
    ...mapping.inputCanvas,
    resolution: Object.freeze({ ...mapping.inputCanvas.resolution }),
  })
  const screen = Object.freeze({
    ...mapping.screen,
    resolution: Object.freeze({ ...mapping.screen.resolution }),
    mappingRegions: freezeArray(mapping.screen.mappingRegions),
    cabinetGrids: freezeArray(mapping.screen.cabinetGrids),
  })
  const grid = Object.freeze({
    ...mapping.grid,
    ordering: Object.freeze({ ...mapping.grid.ordering }),
  })
  const region = Object.freeze({
    ...mapping.region,
    position: Object.freeze({ ...mapping.region.position }),
    size: Object.freeze({ ...mapping.region.size }),
  })
  const topology = mapping.hardwareTopology

  return Object.freeze({
    inputCanvas,
    screens: Object.freeze([screen]),
    cabinetGrids: Object.freeze([grid]),
    mappingRegions: Object.freeze([region]),
    hardwareTopology: Object.freeze({
      processors: Object.freeze(topology.processors.map(processor => Object.freeze({ ...processor }))),
      ports: Object.freeze(topology.ports.map(port => Object.freeze({ ...port }))),
      receivers: Object.freeze(topology.receivers.map(receiver => Object.freeze({
        ...receiver,
        cabinets: freezeArray(receiver.cabinets),
      }))),
      cabinets: Object.freeze(topology.cabinets.map(cabinet => Object.freeze({
        ...cabinet,
        origin: Object.freeze({ ...cabinet.origin }),
      }))),
      modules: Object.freeze(topology.modules.map(module => Object.freeze({ ...module }))),
      processorOrder: freezeArray(topology.processorOrder),
      receiverOrder: Object.freeze(topology.receiverOrder.map(order => Object.freeze({
        port: order.port,
        receivers: freezeArray(order.receivers),
      }))),
    }),
    rules: Object.freeze(input.rules.map(rule => Object.freeze({ ...rule }))),
  })
}

export function createEditableProject(): EditableProject {
  return Object.freeze({
    inputCanvas: null,
    screens: Object.freeze([]),
    cabinetGrids: Object.freeze([]),
    mappingRegions: Object.freeze([]),
    hardwareTopology: Object.freeze({
      processors: Object.freeze([]),
      ports: Object.freeze([]),
      receivers: Object.freeze([]),
      cabinets: Object.freeze([]),
      modules: Object.freeze([]),
      processorOrder: Object.freeze([]),
      receiverOrder: Object.freeze([]),
    }),
    rules: Object.freeze([]),
    editorLayout: Object.freeze({ screenPositions: Object.freeze([]) }),
  })
}

export function editableProjectFromValidatedProject(
  input: ValidateProjectInput,
  position: EditorPoint = { x: 0, y: 0 },
): EditableProject {
  if (!Number.isSafeInteger(position.x) || !Number.isSafeInteger(position.y)) {
    throw new RangeError('Editor screen position must use signed safe integers')
  }
  const source = cloneProjectInput(input)
  return Object.freeze({
    ...source,
    editorLayout: Object.freeze({
      screenPositions: Object.freeze([Object.freeze({
        screen: source.screens[0]!.id,
        position: Object.freeze({ x: position.x, y: position.y }),
      })]),
    }),
  })
}
