export interface ProfileIdentity {
  readonly id: string
  readonly version: string
}

export interface HardwareProfileRef {
  readonly profileId: string
  readonly profileVersion: string
}

export type TransportScanMode = 'ROW_MAJOR' | 'COLUMN_MAJOR'

export type PortAddressingMode = 'CONTINUOUS' | 'INDEPENDENT'

export type ReceiverBaseAddressMode = 'RESERVED_CAPACITY' | 'PACKED_USED'

export type SplitLevel = 'CABINET'

export interface ActivePixelMask {
  readonly width: number
  readonly height: number
  readonly activePixels: readonly number[]
}

export interface PixelTransportProfile {
  readonly moduleProfileId: string
  readonly transportPixelCountPerCabinet: number
  readonly scanMode: TransportScanMode
  readonly activePixelMask?: ActivePixelMask
}

export interface ModuleProfile {
  readonly identity: ProfileIdentity
  readonly physicalWidth: number
  readonly physicalHeight: number
  readonly moduleCountX: number
  readonly moduleCountY: number
}

export interface ReceiverProfile {
  readonly identity: ProfileIdentity
  readonly maxTransportPixels?: number
  readonly maxCabinets?: number
  readonly portProfileId: string
}

export interface PortProfile {
  readonly identity: ProfileIdentity
  readonly maxTransportPixels?: number
  readonly maxReceivers?: number
  readonly receiverProfileIds: readonly string[]
  readonly addressingMode: PortAddressingMode
}

export interface ProcessorProfile {
  readonly identity: ProfileIdentity
  readonly maxPorts: number
  readonly portProfileIds: readonly string[]
  readonly addressingProfileId: string
}

export interface AddressingProfile {
  readonly identity: ProfileIdentity
  readonly receiverBaseAddressMode: ReceiverBaseAddressMode
  readonly portAddressingMode: PortAddressingMode
  readonly addressWidthBits: number
}

export interface HardwareProfileBundle {
  readonly identity: ProfileIdentity
  readonly manufacturer: string
  readonly family: string
  readonly model: string

  readonly pixelTransportProfile: PixelTransportProfile
  readonly processorProfiles: readonly ProcessorProfile[]
  readonly portProfiles: readonly PortProfile[]
  readonly receiverProfiles: readonly ReceiverProfile[]
  readonly moduleProfiles: readonly ModuleProfile[]

  readonly addressingProfile: AddressingProfile
}

export interface CabinetPhysicalGeometry {
  readonly width: number
  readonly height: number
}

export interface TransportPixelResolution {
  readonly active: boolean
  readonly transportIndex: number | null
}

export interface TransportPixelCoordinate {
  readonly x: number
  readonly y: number
}

export type HardwareProfileValidationCode =
  | 'PROFILE_SHAPE_INVALID'
  | 'PROFILE_FIELD_MISSING'
  | 'PROFILE_FIELD_INVALID'
  | 'PROFILE_VERSION_INVALID'
  | 'PROFILE_REFERENCE_UNKNOWN'
  | 'PROFILE_DUPLICATE_ID'
  | 'PROFILE_CAPACITY_INVALID'
  | 'PROFILE_SPLIT_LEVEL_UNSUPPORTED'
  | 'PROFILE_MASK_INVALID'
  | 'PROFILE_TRANSPORT_INCONSISTENT'

export interface HardwareProfileValidationCheck {
  readonly code: HardwareProfileValidationCode
  readonly path: readonly (string | number)[]
  readonly message: string
}

export interface HardwareProfileValidationReport {
  readonly valid: boolean
  readonly checks: readonly HardwareProfileValidationCheck[]
}
