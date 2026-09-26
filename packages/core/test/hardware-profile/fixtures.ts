import { LEDMAP_GENERIC_REF001, type HardwareProfileBundle, type TransportScanMode } from '../../src/index.js'

export type MutableRecord = Record<string, unknown>

export const MASK_ACTIVE_PIXELS: readonly number[] = [0, 1, 3, 4, 6, 9, 10, 12, 15]

export function mutableBundle(): MutableRecord {
  return {
    identity: { id: 'ledmap.test.bundle', version: '1.0.0' },
    manufacturer: 'ledmap',
    family: 'test',
    model: 'fixture',
    pixelTransportProfile: {
      moduleProfileId: 'ledmap.test.module',
      transportPixelCountPerCabinet: 16,
      scanMode: 'ROW_MAJOR',
    },
    processorProfiles: [{
      identity: { id: 'ledmap.test.processor', version: '1.0.0' },
      maxPorts: 1,
      portProfileIds: ['ledmap.test.port'],
      addressingProfileId: 'ledmap.test.addressing',
    }],
    portProfiles: [{
      identity: { id: 'ledmap.test.port', version: '1.0.0' },
      maxReceivers: 1,
      receiverProfileIds: ['ledmap.test.receiver'],
      addressingMode: 'CONTINUOUS',
    }],
    receiverProfiles: [{
      identity: { id: 'ledmap.test.receiver', version: '1.0.0' },
      portProfileId: 'ledmap.test.port',
    }],
    moduleProfiles: [{
      identity: { id: 'ledmap.test.module', version: '1.0.0' },
      physicalWidth: 4,
      physicalHeight: 2,
      moduleCountX: 2,
      moduleCountY: 1,
    }],
    addressingProfile: {
      identity: { id: 'ledmap.test.addressing', version: '1.0.0' },
      receiverBaseAddressMode: 'RESERVED_CAPACITY',
      portAddressingMode: 'CONTINUOUS',
      addressWidthBits: 16,
    },
  }
}

export function section(bundle: MutableRecord, key: string): MutableRecord {
  return bundle[key] as MutableRecord
}

export function entry(bundle: MutableRecord, key: string, index = 0): MutableRecord {
  return (section(bundle, key) as unknown as unknown[])[index] as MutableRecord
}

export function transportSection(bundle: MutableRecord): MutableRecord {
  return section(bundle, 'pixelTransportProfile')
}

export function maskSection(bundle: MutableRecord): MutableRecord {
  return transportSection(bundle)['activePixelMask'] as MutableRecord
}

export function refBundle(scanMode: TransportScanMode = 'ROW_MAJOR'): HardwareProfileBundle {
  return {
    ...LEDMAP_GENERIC_REF001,
    pixelTransportProfile: { ...LEDMAP_GENERIC_REF001.pixelTransportProfile, scanMode },
  }
}

export function maskedBundle(
  scanMode: TransportScanMode,
  activePixels: readonly number[] = MASK_ACTIVE_PIXELS,
): HardwareProfileBundle {
  return {
    identity: { id: 'ledmap.test.masked', version: '1.0.0' },
    manufacturer: 'ledmap',
    family: 'test',
    model: 'masked',
    pixelTransportProfile: {
      moduleProfileId: 'ledmap.test.masked.module',
      transportPixelCountPerCabinet: activePixels.length,
      scanMode,
      activePixelMask: { width: 4, height: 4, activePixels: [...activePixels] },
    },
    processorProfiles: [{
      identity: { id: 'ledmap.test.masked.processor', version: '1.0.0' },
      maxPorts: 1,
      portProfileIds: ['ledmap.test.masked.port'],
      addressingProfileId: 'ledmap.test.masked.addressing',
    }],
    portProfiles: [{
      identity: { id: 'ledmap.test.masked.port', version: '1.0.0' },
      maxReceivers: 1,
      receiverProfileIds: ['ledmap.test.masked.receiver'],
      addressingMode: 'CONTINUOUS',
    }],
    receiverProfiles: [{
      identity: { id: 'ledmap.test.masked.receiver', version: '1.0.0' },
      portProfileId: 'ledmap.test.masked.port',
    }],
    moduleProfiles: [{
      identity: { id: 'ledmap.test.masked.module', version: '1.0.0' },
      physicalWidth: 4,
      physicalHeight: 4,
      moduleCountX: 1,
      moduleCountY: 1,
    }],
    addressingProfile: {
      identity: { id: 'ledmap.test.masked.addressing', version: '1.0.0' },
      receiverBaseAddressMode: 'PACKED_USED',
      portAddressingMode: 'INDEPENDENT',
      addressWidthBits: 12,
    },
  }
}
