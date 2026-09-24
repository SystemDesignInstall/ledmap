import type { Cabinet } from '../model/cabinet.js'
import type { Module } from '../model/module.js'
import type { Port } from '../model/port.js'
import type { Processor } from '../model/processor.js'
import type { Receiver } from '../model/receiver.js'
import type { CabinetId, ModuleId, PortId, ProcessorId, ReceiverId } from '../model/ids.js'
import type { PixelCoordinate } from '../model/coordinates.js'
import type { CabinetPixelLayoutConfig } from '../cabinet-engine/index.js'

export interface PortReceiverOrder {
  readonly port: PortId
  readonly receivers: readonly ReceiverId[]
}

export interface HardwareTopologyInput {
  readonly processors: readonly Processor[]
  readonly ports: readonly Port[]
  readonly receivers: readonly Receiver[]
  readonly cabinets: readonly Cabinet[]
  readonly modules: readonly Module[]
  readonly processorOrder: readonly ProcessorId[]
  readonly receiverOrder: readonly PortReceiverOrder[]
}

export interface CabinetPixelReference {
  readonly cabinet: CabinetId
  readonly coordinate: PixelCoordinate
}

export interface PortPixelKey {
  readonly processor: ProcessorId
  readonly port: PortId
  readonly dataIndex: number
}

export interface LocatedHardwarePixel {
  readonly cabinet: CabinetId
  readonly module: ModuleId
  readonly coordinate: PixelCoordinate
  readonly cabinetCoordinate: PixelCoordinate
}

export interface HardwareCabinetSpan {
  readonly cabinet: CabinetId
  readonly receiverBase: number
  readonly portBase: number
  readonly pixelCount: number
  readonly layout: CabinetPixelLayoutConfig
  readonly moduleIds: readonly ModuleId[]
}

export interface HardwareReceiverSpan {
  readonly receiver: ReceiverId
  readonly portBase: number
  readonly pixelCount: number
  readonly cabinets: readonly HardwareCabinetSpan[]
}

export interface HardwarePortSpan {
  readonly processor: ProcessorId
  readonly port: PortId
  readonly index: number
  readonly globalBase: number
  readonly pixelCount: number
  readonly receivers: readonly HardwareReceiverSpan[]
}

export interface ResolvedHardwareMapping {
  readonly pixelCount: number
  readonly ports: readonly HardwarePortSpan[]
}
