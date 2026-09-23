export type Brand<T extends string> = string & { readonly __brand: T }

export function brand<T extends string>(value: string): Brand<T> {
  return value as Brand<T>
}

export type ScreenId = Brand<'ScreenId'>
export type MappingRegionId = Brand<'MappingRegionId'>
export type CabinetGridId = Brand<'CabinetGridId'>
export type CabinetId = Brand<'CabinetId'>
export type ModuleId = Brand<'ModuleId'>
export type ProcessorId = Brand<'ProcessorId'>
export type PortId = Brand<'PortId'>
export type ReceiverId = Brand<'ReceiverId'>
export type SignalPathId = Brand<'SignalPathId'>

export const asScreenId = (value: string): ScreenId => brand<'ScreenId'>(value)
export const asMappingRegionId = (value: string): MappingRegionId => brand<'MappingRegionId'>(value)
export const asCabinetGridId = (value: string): CabinetGridId => brand<'CabinetGridId'>(value)
export const asCabinetId = (value: string): CabinetId => brand<'CabinetId'>(value)
export const asModuleId = (value: string): ModuleId => brand<'ModuleId'>(value)
export const asProcessorId = (value: string): ProcessorId => brand<'ProcessorId'>(value)
export const asPortId = (value: string): PortId => brand<'PortId'>(value)
export const asReceiverId = (value: string): ReceiverId => brand<'ReceiverId'>(value)
export const asSignalPathId = (value: string): SignalPathId => brand<'SignalPathId'>(value)