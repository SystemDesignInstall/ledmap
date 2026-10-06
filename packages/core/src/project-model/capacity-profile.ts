import { DomainError } from '../model/errors.js'
import type { LedMapProjectV2, ProjectPort } from './types.js'

export interface HardwareCapacityMode {
  readonly frameRateHz: number
  readonly bitDepth: 8 | 10 | 12
  readonly linkRateGbps: 1 | 5 | 10
}

export interface HardwareCapacityProfile {
  readonly name: string
  readonly source: { readonly kind: 'manual' | 'manufacturer'; readonly reference: string; readonly revision: string }
  readonly mode: HardwareCapacityMode
  readonly portPixelCapacity?: number
  readonly processorPixelCapacity?: number
}

export interface PortPixelCapacityOverride {
  readonly pixelCapacity: number
  readonly reason: string
  readonly mode: HardwareCapacityMode
}

function invalid(message: string): never { throw new DomainError('HARDWARE_CAPACITY_PROFILE_INVALID', message) }

function record(value: object, fields: readonly string[], label: string): void {
  if (!value || typeof value !== 'object' || ![Object.prototype, null].includes(Object.getPrototypeOf(value)) ||
      Object.getOwnPropertySymbols(value).length > 0) invalid(`${label} must be a plain record`)
  for (const key of Object.getOwnPropertyNames(value)) {
    const descriptor = Object.getOwnPropertyDescriptor(value, key)!
    if (!fields.includes(key) || !('value' in descriptor) || !descriptor.enumerable) invalid(`${label} has an unsupported field ${key}`)
  }
}

function text(value: string, label: string, max: number): void {
  if (typeof value !== 'string' || value.trim() === '' || value.length > max) invalid(`${label} needs 1–${max} characters`)
}

function limit(value: number | undefined): void {
  if (value !== undefined && (!Number.isSafeInteger(value) || value < 1)) invalid('Pixel capacity must be a positive safe integer')
}

export function validateCapacityMode(mode: HardwareCapacityMode): void {
  record(mode, ['frameRateHz', 'bitDepth', 'linkRateGbps'], 'Capacity mode')
  if (!mode || !Number.isFinite(mode.frameRateHz) || mode.frameRateHz <= 0 || mode.frameRateHz > 1000 ||
      ![8, 10, 12].includes(mode.bitDepth) || ![1, 5, 10].includes(mode.linkRateGbps)) {
    invalid('Capacity mode needs a frame rate in (0, 1000], 8/10/12 bits and a 1/5/10 Gbit/s link')
  }
}

export function validateCapacityProfile(profile: HardwareCapacityProfile): void {
  record(profile, ['name', 'source', 'mode', 'portPixelCapacity', 'processorPixelCapacity'], 'Capacity profile')
  if (!profile || !profile.source) invalid('Capacity profile and source must be records')
  record(profile.source, ['kind', 'reference', 'revision'], 'Capacity source')
  text(profile.name, 'Profile name', 256)
  if (!['manual', 'manufacturer'].includes(profile.source.kind)) invalid('Capacity source must be manual or manufacturer')
  text(profile.source.reference, 'Capacity source reference', 2048)
  text(profile.source.revision, 'Capacity source revision', 256)
  if (profile.source.kind === 'manufacturer' && !/^https:\/\/[^\s]+$/.test(profile.source.reference)) {
    invalid('Manufacturer reference must be an HTTPS documentation URL')
  }
  validateCapacityMode(profile.mode)
  limit(profile.portPixelCapacity)
  limit(profile.processorPixelCapacity)
}

export function validatePortCapacityOverride(override: PortPixelCapacityOverride): void {
  record(override, ['pixelCapacity', 'reason', 'mode'], 'Port override')
  if (!override) invalid('Port override must be a record')
  limit(override.pixelCapacity)
  if (override.pixelCapacity === undefined) invalid('Port override needs a pixel capacity')
  text(override.reason, 'Override reason', 2048)
  validateCapacityMode(override.mode)
}

export function cloneCapacityProfile(profile: HardwareCapacityProfile): HardwareCapacityProfile {
  validateCapacityProfile(profile)
  return Object.freeze({ name: profile.name, source: Object.freeze({ ...profile.source }), mode: Object.freeze({ ...profile.mode }),
    ...(profile.portPixelCapacity === undefined ? {} : { portPixelCapacity: profile.portPixelCapacity }),
    ...(profile.processorPixelCapacity === undefined ? {} : { processorPixelCapacity: profile.processorPixelCapacity }) })
}

export function clonePortCapacityOverride(override: PortPixelCapacityOverride): PortPixelCapacityOverride {
  validatePortCapacityOverride(override)
  return Object.freeze({ pixelCapacity: override.pixelCapacity, reason: override.reason, mode: Object.freeze({ ...override.mode }) })
}

export function sameCapacityMode(left: HardwareCapacityMode, right: HardwareCapacityMode): boolean {
  return left.frameRateHz === right.frameRateHz && left.bitDepth === right.bitDepth && left.linkRateGbps === right.linkRateGbps
}

export function portPixelCapacity(project: LedMapProjectV2, port: ProjectPort): number | null {
  const profile = project.hardware.processors.find(value => value.id === port.processorId)?.capacityProfile
  if (!profile) return null
  const override = port.pixelCapacityOverride
  return override && sameCapacityMode(override.mode, profile.mode) ? override.pixelCapacity : profile.portPixelCapacity ?? null
}

export function projectHasCapacityIntent(project: LedMapProjectV2): boolean {
  return project.hardware.processors.some(value => value.capacityProfile !== undefined) ||
    project.hardware.ports.some(value => value.pixelCapacityOverride !== undefined)
}
