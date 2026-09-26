import type { HardwareProfileBundle } from './types.js'

export const LEDMAP_GENERIC_REF001: HardwareProfileBundle = Object.freeze({
  identity: Object.freeze({ id: 'ledmap.generic.ref001', version: '1.0.0' }),
  manufacturer: 'ledmap',
  family: 'generic',
  model: 'ref001',

  pixelTransportProfile: Object.freeze({
    moduleProfileId: 'ledmap.generic.ref001.module',
    transportPixelCountPerCabinet: 16384,
    scanMode: 'ROW_MAJOR',
  }),

  processorProfiles: Object.freeze([
    Object.freeze({
      identity: Object.freeze({ id: 'ledmap.generic.ref001.processor', version: '1.0.0' }),
      maxPorts: 4,
      portProfileIds: Object.freeze([
        'ledmap.generic.ref001.port',
        'ledmap.generic.ref001.port',
        'ledmap.generic.ref001.port',
        'ledmap.generic.ref001.port',
      ]),
      addressingProfileId: 'ledmap.generic.ref001.addressing',
    }),
  ]),

  portProfiles: Object.freeze([
    Object.freeze({
      identity: Object.freeze({ id: 'ledmap.generic.ref001.port', version: '1.0.0' }),
      maxTransportPixels: 131072,
      maxReceivers: 2,
      receiverProfileIds: Object.freeze(['ledmap.generic.ref001.receiver']),
      addressingMode: 'CONTINUOUS',
    }),
  ]),

  receiverProfiles: Object.freeze([
    Object.freeze({
      identity: Object.freeze({ id: 'ledmap.generic.ref001.receiver', version: '1.0.0' }),
      maxTransportPixels: 65536,
      maxCabinets: 4,
      portProfileId: 'ledmap.generic.ref001.port',
    }),
  ]),

  moduleProfiles: Object.freeze([
    Object.freeze({
      identity: Object.freeze({ id: 'ledmap.generic.ref001.module', version: '1.0.0' }),
      physicalWidth: 32,
      physicalHeight: 32,
      moduleCountX: 4,
      moduleCountY: 4,
    }),
  ]),

  addressingProfile: Object.freeze({
    identity: Object.freeze({ id: 'ledmap.generic.ref001.addressing', version: '1.0.0' }),
    receiverBaseAddressMode: 'RESERVED_CAPACITY',
    portAddressingMode: 'CONTINUOUS',
    addressWidthBits: 23,
  }),
})
