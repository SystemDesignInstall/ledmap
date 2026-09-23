import type { CabinetId, ModuleId, PortId, ProcessorId, ReceiverId, SignalPathId } from './ids.js'
import type { PixelCoordinate } from './coordinates.js'

export interface HardwareAddress {
  readonly processor: ProcessorId
  readonly port: PortId
  readonly receiver: ReceiverId
}

export interface SignalPath {
  readonly id: SignalPathId
  readonly hardware: HardwareAddress
  readonly cabinet: CabinetId
}

export interface PixelAddress {
  readonly hardware: HardwareAddress
  readonly cabinet: CabinetId
  readonly module: ModuleId
  readonly coordinate: PixelCoordinate
  readonly dataIndex: number
}