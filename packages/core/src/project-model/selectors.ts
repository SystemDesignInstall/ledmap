import type { CabinetGridId, CabinetId, MappingRegionId, PortId, ProcessorId, ReceiverId, ScreenId } from '../model/ids.js'
import { DomainError } from '../model/errors.js'
import { assertProjectV2HardwareContract, assertProjectV2ReferenceOrderContract } from './validate.js'
import type {
  CompositionPlacement,
  HardwareAssignment,
  LedMapProjectV2,
  ProjectCabinet,
  ProjectCabinetGrid,
  ProjectInputCanvas,
  ProjectMappingRegion,
  ProjectPort,
  ProjectPortReceiverOrder,
  ProjectProcessor,
  ProjectReceiver,
  ProjectScreen,
  SignalRoute,
} from './types.js'

function frozen<T>(values: readonly T[]): readonly T[] {
  return Object.freeze([...values])
}

function required<T>(value: T | undefined, label: string, id: string): T {
  if (value === undefined) throw new DomainError('PROJECT_UNKNOWN_REFERENCE', `Unknown ${label} ${id}`)
  return value
}

export function selectProjectScreens(project: LedMapProjectV2): readonly ProjectScreen[] {
  return frozen(project.design.screens)
}

export function selectProjectScreen(project: LedMapProjectV2, screenId: ScreenId): ProjectScreen | undefined {
  return project.design.screens.find(screen => screen.id === screenId)
}

export function selectCompositionPlacement(project: LedMapProjectV2, screenId: ScreenId): CompositionPlacement | undefined {
  return project.design.composition.placements.find(value => value.screenId === screenId)
}

export function selectCabinetGridsForScreen(project: LedMapProjectV2, screenId: ScreenId): readonly ProjectCabinetGrid[] {
  assertProjectV2ReferenceOrderContract(project)
  const screen = selectProjectScreen(project, screenId)
  return frozen((screen?.cabinetGridOrder ?? []).map(id => required(project.design.cabinetGrids.find(grid => grid.id === id), 'CabinetGrid', id)))
}

export function selectCabinetsForGrid(project: LedMapProjectV2, gridId: CabinetGridId): readonly ProjectCabinet[] {
  return frozen(project.design.cabinets.filter(cabinet => cabinet.gridId === gridId)
    .sort((a, b) => a.row - b.row || a.column - b.column))
}

export function selectMappingRegionsForScreen(project: LedMapProjectV2, screenId: ScreenId): readonly ProjectMappingRegion[] {
  assertProjectV2ReferenceOrderContract(project)
  const screen = selectProjectScreen(project, screenId)
  return frozen((screen?.mappingRegionOrder ?? []).map(id => required(project.content.mappingRegions.find(region => region.id === id), 'MappingRegion', id)))
}

export function selectInputCanvasForMappingRegion(project: LedMapProjectV2, regionId: MappingRegionId): ProjectInputCanvas | undefined {
  const region = project.content.mappingRegions.find(value => value.id === regionId)
  return region && project.content.inputCanvases.find(canvas => canvas.id === region.inputCanvasId)
}

export function selectProcessors(project: LedMapProjectV2): readonly ProjectProcessor[] {
  assertProjectV2HardwareContract(project)
  return frozen(project.hardware.processorOrder.map(id => required(project.hardware.processors.find(processor => processor.id === id), 'Processor', id)))
}

export function selectPortsForProcessor(project: LedMapProjectV2, processorId: ProcessorId): readonly ProjectPort[] {
  return frozen(project.hardware.ports.filter(port => port.processorId === processorId).sort((a, b) => a.index - b.index))
}

export function selectPortReceiverOrder(project: LedMapProjectV2, portId: PortId): ProjectPortReceiverOrder | undefined {
  assertProjectV2HardwareContract(project)
  return project.hardware.receiverOrder.find(order => order.portId === portId)
}

export function selectReceiversForPort(project: LedMapProjectV2, portId: PortId): readonly ProjectReceiver[] {
  const order = selectPortReceiverOrder(project, portId)
  return frozen((order?.receiverIds ?? []).map(id => required(project.hardware.receivers.find(receiver => receiver.id === id), 'Receiver', id)))
}

export function selectAssignmentForCabinet(project: LedMapProjectV2, cabinetId: CabinetId): HardwareAssignment | undefined {
  assertProjectV2HardwareContract(project)
  return project.hardware.assignments.find(value => value.target.kind === 'cabinet' && value.target.cabinetId === cabinetId)
}

export function selectSignalRouteForReceiver(project: LedMapProjectV2, receiverId: ReceiverId): SignalRoute | undefined {
  assertProjectV2HardwareContract(project)
  return project.operations.signalRoutes.find(route => route.receiverId === receiverId)
}

export function selectReceiverCabinetChain(project: LedMapProjectV2, receiverId: ReceiverId): readonly ProjectCabinet[] {
  assertProjectV2HardwareContract(project)
  if (!project.hardware.receivers.some(receiver => receiver.id === receiverId)) {
    throw new DomainError('PROJECT_UNKNOWN_RECEIVER', `Unknown Receiver ${receiverId}`)
  }
  const route = selectSignalRouteForReceiver(project, receiverId)
  return frozen((route?.orderedCabinetIds ?? []).map(id => required(project.design.cabinets.find(cabinet => cabinet.id === id), 'Cabinet', id)))
}
