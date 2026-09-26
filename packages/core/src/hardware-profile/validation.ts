import { deriveCabinetGeometry, isNonNegativeSafeInteger, isPositiveSafeInteger } from './geometry.js'
import type {
  CabinetPhysicalGeometry, HardwareProfileValidationCode, HardwareProfileValidationReport,
  PortAddressingMode, ReceiverBaseAddressMode, TransportScanMode,
} from './types.js'

type ProfileRecord = Record<string, unknown>

interface MutableCheck {
  readonly code: HardwareProfileValidationCode
  readonly path: (string | number)[]
  readonly message: string
}

interface IdentityState {
  readonly id: string | null
  readonly version: string | null
  readonly valid: boolean
}

interface TransportState {
  readonly moduleProfileId: string | null
  readonly transportPixelCount: number | null
  readonly scanMode: TransportScanMode | null
  readonly mask: MaskState
}

interface MaskState {
  readonly present: boolean
  readonly width: number | null
  readonly height: number | null
  readonly activePixels: readonly number[] | null
  readonly valid: boolean
}

interface ModuleEntry {
  readonly index: number
  readonly id: string | null
  readonly version: string | null
  readonly physicalWidth: number | null
  readonly physicalHeight: number | null
  readonly moduleCountX: number | null
  readonly moduleCountY: number | null
  readonly valid: boolean
}

interface ReceiverEntry {
  readonly index: number
  readonly id: string | null
  readonly version: string | null
  readonly portProfileId: string | null
  readonly valid: boolean
}

interface PortEntry {
  readonly index: number
  readonly id: string | null
  readonly version: string | null
  readonly maxTransportPixels: number | null
  readonly maxReceivers: number | null
  readonly receiverProfileIds: readonly string[] | null
  readonly valid: boolean
}

interface ProcessorEntry {
  readonly index: number
  readonly id: string | null
  readonly version: string | null
  readonly maxPorts: number | null
  readonly portProfileIds: readonly string[] | null
  readonly addressingProfileId: string | null
  readonly valid: boolean
}

const BUNDLE_FIELDS = [
  'identity', 'manufacturer', 'family', 'model', 'pixelTransportProfile',
  'processorProfiles', 'portProfiles', 'receiverProfiles', 'moduleProfiles', 'addressingProfile',
]
const IDENTITY_FIELDS = ['id', 'version']
const TRANSPORT_FIELDS = ['moduleProfileId', 'transportPixelCountPerCabinet', 'scanMode', 'activePixelMask']
const MASK_FIELDS = ['width', 'height', 'activePixels']
const PROCESSOR_FIELDS = ['identity', 'maxPorts', 'portProfileIds', 'addressingProfileId']
const PORT_FIELDS = ['identity', 'maxTransportPixels', 'maxReceivers', 'receiverProfileIds', 'addressingMode']
const RECEIVER_FIELDS = ['identity', 'maxTransportPixels', 'maxCabinets', 'portProfileId']
const MODULE_FIELDS = ['identity', 'physicalWidth', 'physicalHeight', 'moduleCountX', 'moduleCountY']
const ADDRESSING_FIELDS = ['identity', 'receiverBaseAddressMode', 'portAddressingMode', 'addressWidthBits']
const SCAN_MODES: readonly string[] = ['ROW_MAJOR', 'COLUMN_MAJOR']
const PORT_ADDRESSING_MODES: readonly string[] = ['CONTINUOUS', 'INDEPENDENT']
const RECEIVER_BASE_ADDRESS_MODES: readonly string[] = ['RESERVED_CAPACITY', 'PACKED_USED']
const VERSION_PATTERN = /^(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)$/
const ABSENT_MASK: MaskState = Object.freeze({ present: false, width: null, height: null, activePixels: null, valid: false })

function compareUtf16(left: string, right: string): number {
  if (left < right) return -1
  if (left > right) return 1
  return 0
}

function isRecord(value: unknown): value is ProfileRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function add(
  checks: MutableCheck[],
  code: HardwareProfileValidationCode,
  path: readonly (string | number)[],
  message: string,
): void {
  checks.push({ code, path: [...path], message })
}

function checkClosedFields(
  checks: MutableCheck[],
  record: ProfileRecord,
  allowed: readonly string[],
  path: readonly (string | number)[],
  ignored: readonly string[] = [],
): void {
  const known = new Set([...allowed, ...ignored])
  const unknown = Object.keys(record).filter(key => !known.has(key)).sort(compareUtf16)
  for (const key of unknown) add(checks, 'PROFILE_FIELD_INVALID', [...path, key], `unknown field ${key}`)
}

function requireObject(
  checks: MutableCheck[],
  value: unknown,
  path: readonly (string | number)[],
  label: string,
): ProfileRecord | null {
  if (!isRecord(value)) {
    add(checks, 'PROFILE_SHAPE_INVALID', path, `expected ${label}`)
    return null
  }
  return value
}

function requireField(
  checks: MutableCheck[],
  record: ProfileRecord,
  key: string,
  path: readonly (string | number)[],
): unknown {
  if (!Object.prototype.hasOwnProperty.call(record, key) || record[key] === undefined) {
    add(checks, 'PROFILE_FIELD_MISSING', [...path, key], `missing field ${key}`)
    return undefined
  }
  return record[key]
}

function checkString(
  checks: MutableCheck[],
  record: ProfileRecord,
  key: string,
  path: readonly (string | number)[],
): string | null {
  const value = requireField(checks, record, key, path)
  if (value === undefined) return null
  if (typeof value !== 'string') {
    add(checks, 'PROFILE_FIELD_INVALID', [...path, key], `expected a string for ${key}`)
    return null
  }
  if (value.length === 0) {
    add(checks, 'PROFILE_FIELD_INVALID', [...path, key], `expected a non-empty string for ${key}`)
    return null
  }
  return value
}

function checkIdentifier(
  checks: MutableCheck[],
  record: ProfileRecord,
  key: string,
  path: readonly (string | number)[],
): string | null {
  const value = checkString(checks, record, key, path)
  if (value === null) return null
  if (/\s/.test(value)) {
    add(checks, 'PROFILE_FIELD_INVALID', [...path, key], `expected a whitespace-free identifier for ${key}`)
    return null
  }
  return value
}

function checkEnum(
  checks: MutableCheck[],
  record: ProfileRecord,
  key: string,
  allowed: readonly string[],
  path: readonly (string | number)[],
): string | null {
  const value = requireField(checks, record, key, path)
  if (value === undefined) return null
  if (typeof value !== 'string' || !allowed.includes(value)) {
    add(checks, 'PROFILE_FIELD_INVALID', [...path, key], `expected one of ${allowed.join(', ')} for ${key}`)
    return null
  }
  return value
}

function checkPositiveInteger(
  checks: MutableCheck[],
  record: ProfileRecord,
  key: string,
  path: readonly (string | number)[],
): number | null {
  const value = requireField(checks, record, key, path)
  if (value === undefined) return null
  if (typeof value !== 'number' || !isPositiveSafeInteger(value)) {
    add(checks, 'PROFILE_FIELD_INVALID', [...path, key], `expected a positive safe integer for ${key}`)
    return null
  }
  return value
}

function checkDeclaredLimit(
  checks: MutableCheck[],
  record: ProfileRecord,
  key: string,
  path: readonly (string | number)[],
  required = false,
): number | null {
  if (!Object.prototype.hasOwnProperty.call(record, key) || record[key] === undefined) {
    if (required) add(checks, 'PROFILE_FIELD_MISSING', [...path, key], `missing required ${key}`)
    return null
  }
  const value = record[key]
  if (typeof value !== 'number') {
    add(checks, 'PROFILE_FIELD_INVALID', [...path, key], `expected a number for ${key}`)
    return null
  }
  if (!isNonNegativeSafeInteger(value)) {
    add(checks, 'PROFILE_CAPACITY_INVALID', [...path, key], `expected a non-negative safe integer for ${key}, got ${value}`)
    return null
  }
  return value
}

function checkStringArray(
  checks: MutableCheck[],
  record: ProfileRecord,
  key: string,
  path: readonly (string | number)[],
): readonly string[] | null {
  const value = requireField(checks, record, key, path)
  if (value === undefined) return null
  if (!Array.isArray(value)) {
    add(checks, 'PROFILE_FIELD_INVALID', [...path, key], `expected an array of strings for ${key}`)
    return null
  }
  const result: string[] = []
  let valid = true
  for (let index = 0; index < value.length; index += 1) {
    const item: unknown = value[index]
    if (typeof item !== 'string' || item.length === 0) {
      add(checks, 'PROFILE_FIELD_INVALID', [...path, key, index], `expected a non-empty string in ${key}`)
      valid = false
      continue
    }
    result.push(item)
  }
  return valid ? result : null
}

function checkIdentity(
  checks: MutableCheck[],
  value: unknown,
  path: readonly (string | number)[],
): IdentityState {
  const record = requireObject(checks, value, path, 'a profile identity object')
  if (record === null) return { id: null, version: null, valid: false }
  checkClosedFields(checks, record, IDENTITY_FIELDS, path)
  const id = checkIdentifier(checks, record, 'id', path)
  const version = checkString(checks, record, 'version', path)
  return { id, version, valid: id !== null && version !== null }
}

function checkMask(checks: MutableCheck[], value: unknown, path: readonly (string | number)[]): MaskState {
  const record = requireObject(checks, value, path, 'an active pixel mask object')
  if (record === null) return { present: true, width: null, height: null, activePixels: null, valid: false }
  checkClosedFields(checks, record, MASK_FIELDS, path)
  const width = checkPositiveInteger(checks, record, 'width', path)
  const height = checkPositiveInteger(checks, record, 'height', path)
  const rawPixels = requireField(checks, record, 'activePixels', path)
  const activePixels: number[] = []
  let pixelsValid = rawPixels !== undefined
  if (rawPixels !== undefined) {
    if (!Array.isArray(rawPixels)) {
      add(checks, 'PROFILE_FIELD_INVALID', [...path, 'activePixels'], 'expected an array for activePixels')
      pixelsValid = false
    } else {
      for (let index = 0; index < rawPixels.length; index += 1) {
        const item: unknown = rawPixels[index]
        if (typeof item !== 'number' || !isNonNegativeSafeInteger(item)) {
          add(checks, 'PROFILE_FIELD_INVALID', [...path, 'activePixels', index], 'expected a non-negative safe integer in activePixels')
          pixelsValid = false
          continue
        }
        const previous = activePixels[activePixels.length - 1]
        if (previous !== undefined && item <= previous) {
          add(checks, 'PROFILE_MASK_INVALID', [...path, 'activePixels', index], 'activePixels must be unique and strictly increasing in row-major order')
          pixelsValid = false
          continue
        }
        activePixels.push(item)
      }
    }
  }
  if (pixelsValid && width !== null && height !== null) {
    const total = width * height
    for (let index = 0; index < activePixels.length; index += 1) {
      const item = activePixels[index]!
      if (item >= total) {
        add(checks, 'PROFILE_MASK_INVALID', [...path, 'activePixels', index], `activePixels entry ${item} is outside the mask range [0, ${total})`)
        pixelsValid = false
      }
    }
  }
  if (pixelsValid && activePixels.length === 0) {
    add(checks, 'PROFILE_TRANSPORT_INCONSISTENT', [...path, 'activePixels'], 'empty transport set is not supported in v1: activePixels must contain at least one entry')
    pixelsValid = false
  }
  return {
    present: true,
    width,
    height,
    activePixels: pixelsValid ? activePixels : null,
    valid: pixelsValid && width !== null && height !== null,
  }
}

function checkPixelTransportProfile(
  checks: MutableCheck[],
  value: unknown,
  path: readonly (string | number)[],
): TransportState {
  const record = requireObject(checks, value, path, 'a pixel transport profile object')
  if (record === null) return { moduleProfileId: null, transportPixelCount: null, scanMode: null, mask: ABSENT_MASK }
  checkClosedFields(checks, record, TRANSPORT_FIELDS, path)
  const moduleProfileId = checkIdentifier(checks, record, 'moduleProfileId', path)
  const transportPixelCount = checkPositiveInteger(checks, record, 'transportPixelCountPerCabinet', path)
  const scanMode = checkEnum(checks, record, 'scanMode', SCAN_MODES, path) as TransportScanMode | null
  const mask = Object.prototype.hasOwnProperty.call(record, 'activePixelMask') && record['activePixelMask'] !== undefined
    ? checkMask(checks, record['activePixelMask'], [...path, 'activePixelMask'])
    : ABSENT_MASK
  return { moduleProfileId, transportPixelCount, scanMode, mask }
}

function checkAddressingProfile(checks: MutableCheck[], value: unknown, path: readonly (string | number)[]): IdentityState {
  const record = requireObject(checks, value, path, 'an addressing profile object')
  if (record === null) return { id: null, version: null, valid: false }
  checkClosedFields(checks, record, ADDRESSING_FIELDS, path)
  const identity = checkIdentity(checks, record['identity'], [...path, 'identity'])
  const baseAddressMode = checkEnum(checks, record, 'receiverBaseAddressMode', RECEIVER_BASE_ADDRESS_MODES, path) as ReceiverBaseAddressMode | null
  const addressingMode = checkEnum(checks, record, 'portAddressingMode', PORT_ADDRESSING_MODES, path) as PortAddressingMode | null
  const addressWidthBits = checkPositiveInteger(checks, record, 'addressWidthBits', path)
  return {
    id: identity.id,
    version: identity.version,
    valid: identity.valid && baseAddressMode !== null && addressingMode !== null && addressWidthBits !== null,
  }
}

function checkModuleProfiles(checks: MutableCheck[], value: unknown, path: readonly (string | number)[]): ModuleEntry[] | null {
  if (!Array.isArray(value)) {
    add(checks, 'PROFILE_FIELD_INVALID', path, 'expected an array of module profiles')
    return null
  }
  const entries: ModuleEntry[] = []
  for (let index = 0; index < value.length; index += 1) {
    const itemPath = [...path, index]
    const record = requireObject(checks, value[index], itemPath, 'a module profile object')
    if (record === null) {
      entries.push({ index, id: null, version: null, physicalWidth: null, physicalHeight: null, moduleCountX: null, moduleCountY: null, valid: false })
      continue
    }
    checkClosedFields(checks, record, MODULE_FIELDS, itemPath)
    const identity = checkIdentity(checks, record['identity'], [...itemPath, 'identity'])
    const physicalWidth = checkPositiveInteger(checks, record, 'physicalWidth', itemPath)
    const physicalHeight = checkPositiveInteger(checks, record, 'physicalHeight', itemPath)
    const moduleCountX = checkPositiveInteger(checks, record, 'moduleCountX', itemPath)
    const moduleCountY = checkPositiveInteger(checks, record, 'moduleCountY', itemPath)
    entries.push({
      index,
      id: identity.id,
      version: identity.version,
      physicalWidth,
      physicalHeight,
      moduleCountX,
      moduleCountY,
      valid: identity.valid && physicalWidth !== null && physicalHeight !== null && moduleCountX !== null && moduleCountY !== null,
    })
  }
  return entries
}

function checkReceiverProfiles(checks: MutableCheck[], value: unknown, path: readonly (string | number)[]): ReceiverEntry[] | null {
  if (!Array.isArray(value)) {
    add(checks, 'PROFILE_FIELD_INVALID', path, 'expected an array of receiver profiles')
    return null
  }
  const entries: ReceiverEntry[] = []
  for (let index = 0; index < value.length; index += 1) {
    const itemPath = [...path, index]
    const record = requireObject(checks, value[index], itemPath, 'a receiver profile object')
    if (record === null) {
      entries.push({ index, id: null, version: null, portProfileId: null, valid: false })
      continue
    }
    checkClosedFields(checks, record, RECEIVER_FIELDS, itemPath)
    const identity = checkIdentity(checks, record['identity'], [...itemPath, 'identity'])
    checkDeclaredLimit(checks, record, 'maxTransportPixels', itemPath)
    checkDeclaredLimit(checks, record, 'maxCabinets', itemPath)
    const portProfileId = checkIdentifier(checks, record, 'portProfileId', itemPath)
    entries.push({ index, id: identity.id, version: identity.version, portProfileId, valid: identity.valid && portProfileId !== null })
  }
  return entries
}

function checkPortProfiles(checks: MutableCheck[], value: unknown, path: readonly (string | number)[]): PortEntry[] | null {
  if (!Array.isArray(value)) {
    add(checks, 'PROFILE_FIELD_INVALID', path, 'expected an array of port profiles')
    return null
  }
  const entries: PortEntry[] = []
  for (let index = 0; index < value.length; index += 1) {
    const itemPath = [...path, index]
    const record = requireObject(checks, value[index], itemPath, 'a port profile object')
    if (record === null) {
      entries.push({ index, id: null, version: null, maxTransportPixels: null, maxReceivers: null, receiverProfileIds: null, valid: false })
      continue
    }
    checkClosedFields(checks, record, PORT_FIELDS, itemPath)
    const identity = checkIdentity(checks, record['identity'], [...itemPath, 'identity'])
    const maxTransportPixels = checkDeclaredLimit(checks, record, 'maxTransportPixels', itemPath)
    const maxReceivers = checkDeclaredLimit(checks, record, 'maxReceivers', itemPath)
    const receiverProfileIds = checkStringArray(checks, record, 'receiverProfileIds', itemPath)
    const addressingMode = checkEnum(checks, record, 'addressingMode', PORT_ADDRESSING_MODES, itemPath)
    entries.push({
      index,
      id: identity.id,
      version: identity.version,
      maxTransportPixels,
      maxReceivers,
      receiverProfileIds,
      valid: identity.valid && receiverProfileIds !== null && addressingMode !== null,
    })
  }
  return entries
}

function checkProcessorProfiles(checks: MutableCheck[], value: unknown, path: readonly (string | number)[]): ProcessorEntry[] | null {
  if (!Array.isArray(value)) {
    add(checks, 'PROFILE_FIELD_INVALID', path, 'expected an array of processor profiles')
    return null
  }
  const entries: ProcessorEntry[] = []
  for (let index = 0; index < value.length; index += 1) {
    const itemPath = [...path, index]
    const record = requireObject(checks, value[index], itemPath, 'a processor profile object')
    if (record === null) {
      entries.push({ index, id: null, version: null, maxPorts: null, portProfileIds: null, addressingProfileId: null, valid: false })
      continue
    }
    checkClosedFields(checks, record, PROCESSOR_FIELDS, itemPath)
    const identity = checkIdentity(checks, record['identity'], [...itemPath, 'identity'])
    const maxPorts = checkDeclaredLimit(checks, record, 'maxPorts', itemPath, true)
    const portProfileIds = checkStringArray(checks, record, 'portProfileIds', itemPath)
    const addressingProfileId = checkIdentifier(checks, record, 'addressingProfileId', itemPath)
    entries.push({
      index,
      id: identity.id,
      version: identity.version,
      maxPorts,
      portProfileIds,
      addressingProfileId,
      valid: identity.valid && portProfileIds !== null && addressingProfileId !== null,
    })
  }
  return entries
}

function checkDuplicateIds(
  checks: MutableCheck[],
  bundleId: string | null,
  groups: readonly { readonly path: string; readonly entries: readonly { readonly index: number; readonly id: string | null }[] | null }[],
): void {
  for (const group of groups) {
    if (group.entries === null) continue
    const seen = new Set<string>()
    for (const entry of group.entries) {
      if (entry.id === null) continue
      if (entry.id === bundleId) {
        add(checks, 'PROFILE_DUPLICATE_ID', [group.path, entry.index, 'identity', 'id'], `profile id ${entry.id} collides with the bundle identity id`)
      }
      if (seen.has(entry.id)) {
        add(checks, 'PROFILE_DUPLICATE_ID', [group.path, entry.index, 'identity', 'id'], `duplicate profile id ${entry.id} in ${group.path}`)
      }
      seen.add(entry.id)
    }
  }
}

function checkAddressingIdentityCollision(
  checks: MutableCheck[],
  bundleId: string | null,
  addressingId: string | null,
): void {
  if (bundleId === null || addressingId === null || addressingId !== bundleId) return
  add(checks, 'PROFILE_DUPLICATE_ID', ['addressingProfile', 'identity', 'id'], `profile id ${addressingId} collides with the bundle identity id`)
}

function isFullyReadable(entries: readonly { readonly id: string | null }[] | null): boolean {
  return entries !== null && entries.every(entry => entry.id !== null)
}

function checkReferences(
  checks: MutableCheck[],
  transport: TransportState,
  modules: readonly ModuleEntry[] | null,
  processors: readonly ProcessorEntry[] | null,
  ports: readonly PortEntry[] | null,
  receivers: readonly ReceiverEntry[] | null,
  addressingId: string | null,
): void {
  if (transport.moduleProfileId !== null && isFullyReadable(modules) && modules !== null) {
    if (!modules.some(entry => entry.id === transport.moduleProfileId)) {
      add(checks, 'PROFILE_REFERENCE_UNKNOWN', ['pixelTransportProfile', 'moduleProfileId'], `unknown module profile id ${transport.moduleProfileId}`)
    }
  }
  if (addressingId !== null && processors !== null) {
    for (const processor of processors) {
      if (!processor.valid || processor.addressingProfileId === null) continue
      if (processor.addressingProfileId !== addressingId) {
        add(checks, 'PROFILE_REFERENCE_UNKNOWN', ['processorProfiles', processor.index, 'addressingProfileId'], `addressingProfileId ${processor.addressingProfileId} does not match bundle.addressingProfile.identity.id ${addressingId}`)
      }
    }
  }
  if (isFullyReadable(ports) && ports !== null && receivers !== null && processors !== null) {
    for (const receiver of receivers) {
      if (!receiver.valid || receiver.portProfileId === null) continue
      if (!ports.some(entry => entry.id === receiver.portProfileId)) {
        add(checks, 'PROFILE_REFERENCE_UNKNOWN', ['receiverProfiles', receiver.index, 'portProfileId'], `unknown port profile id ${receiver.portProfileId}`)
      }
    }
    for (const processor of processors) {
      if (!processor.valid || processor.portProfileIds === null) continue
      for (let position = 0; position < processor.portProfileIds.length; position += 1) {
        const id = processor.portProfileIds[position]!
        if (!ports.some(entry => entry.id === id)) {
          add(checks, 'PROFILE_REFERENCE_UNKNOWN', ['processorProfiles', processor.index, 'portProfileIds', position], `unknown port profile id ${id}`)
        }
      }
    }
  }
  if (isFullyReadable(receivers) && receivers !== null && ports !== null) {
    for (const port of ports) {
      if (!port.valid || port.receiverProfileIds === null) continue
      for (let position = 0; position < port.receiverProfileIds.length; position += 1) {
        const id = port.receiverProfileIds[position]!
        if (!receivers.some(entry => entry.id === id)) {
          add(checks, 'PROFILE_REFERENCE_UNKNOWN', ['portProfiles', port.index, 'receiverProfileIds', position], `unknown receiver profile id ${id}`)
        }
      }
    }
  }
}

function checkDerivedGeometry(
  checks: MutableCheck[],
  transport: TransportState,
  modules: readonly ModuleEntry[] | null,
): CabinetPhysicalGeometry | null {
  if (transport.moduleProfileId === null || modules === null) return null
  const module = modules.find(entry => entry.id === transport.moduleProfileId)
  if (module === undefined || !module.valid) return null
  const { physicalWidth, physicalHeight, moduleCountX, moduleCountY } = module
  if (physicalWidth === null || physicalHeight === null || moduleCountX === null || moduleCountY === null) return null
  const geometry = deriveCabinetGeometry(physicalWidth, physicalHeight, moduleCountX, moduleCountY)
  if (geometry === null) {
    add(checks, 'PROFILE_TRANSPORT_INCONSISTENT', ['pixelTransportProfile'], 'derived cabinet geometry must be positive safe integers')
    return null
  }
  return geometry
}

function checkDeclaredCapacity(
  checks: MutableCheck[],
  processors: readonly ProcessorEntry[] | null,
  ports: readonly PortEntry[] | null,
): void {
  for (const processor of processors ?? []) {
    if (!processor.valid || processor.maxPorts === null || processor.portProfileIds === null) continue
    if (processor.portProfileIds.length > processor.maxPorts) {
      add(checks, 'PROFILE_CAPACITY_INVALID', ['processorProfiles', processor.index, 'maxPorts'], `declared maxPorts ${processor.maxPorts} is below the referenced port count ${processor.portProfileIds.length}`)
    }
  }
  for (const port of ports ?? []) {
    if (!port.valid || port.maxReceivers === null || port.receiverProfileIds === null) continue
    if (port.receiverProfileIds.length > port.maxReceivers) {
      add(checks, 'PROFILE_CAPACITY_INVALID', ['portProfiles', port.index, 'maxReceivers'], `declared maxReceivers ${port.maxReceivers} is below the referenced receiver count ${port.receiverProfileIds.length}`)
    }
  }
}

function checkTransportInvariants(
  checks: MutableCheck[],
  transport: TransportState,
  mask: MaskState,
  geometry: CabinetPhysicalGeometry | null,
): void {
  if (transport.transportPixelCount === null || geometry === null) return
  if (!mask.present) {
    const total = geometry.width * geometry.height
    if (transport.transportPixelCount !== total) {
      add(checks, 'PROFILE_TRANSPORT_INCONSISTENT', ['pixelTransportProfile', 'transportPixelCountPerCabinet'], `transportPixelCountPerCabinet ${transport.transportPixelCount} does not match the cabinet pixel count ${total}`)
    }
    return
  }
  if (!mask.valid || mask.width === null || mask.height === null || mask.activePixels === null) return
  if (mask.width !== geometry.width || mask.height !== geometry.height) {
    add(checks, 'PROFILE_MASK_INVALID', ['pixelTransportProfile', 'activePixelMask'], `mask ${mask.width}x${mask.height} does not match the derived cabinet geometry ${geometry.width}x${geometry.height}`)
    return
  }
  if (transport.transportPixelCount !== mask.activePixels.length) {
    add(checks, 'PROFILE_TRANSPORT_INCONSISTENT', ['pixelTransportProfile', 'transportPixelCountPerCabinet'], `transportPixelCountPerCabinet ${transport.transportPixelCount} does not match the active pixel count ${mask.activePixels.length}`)
  }
}

function checkVersion(
  checks: MutableCheck[],
  version: string | null,
  path: readonly (string | number)[],
): void {
  if (version === null) return
  if (!VERSION_PATTERN.test(version)) {
    add(checks, 'PROFILE_VERSION_INVALID', [...path, 'version'], `expected a MAJOR.MINOR.PATCH version, got ${version}`)
  }
}

function report(checks: readonly MutableCheck[]): HardwareProfileValidationReport {
  const frozen = Object.freeze(checks.map(check => Object.freeze({
    code: check.code,
    path: Object.freeze([...check.path]),
    message: check.message,
  })))
  return Object.freeze({ valid: frozen.length === 0, checks: frozen })
}

export function validateHardwareProfile(input: unknown): HardwareProfileValidationReport {
  const checks: MutableCheck[] = []
  if (!isRecord(input)) return report([{ code: 'PROFILE_SHAPE_INVALID', path: [], message: 'expected a hardware profile bundle object' }])

  const declaredSplitLevel = input['splitLevel']
  const splitLevelUnsupported = Object.prototype.hasOwnProperty.call(input, 'splitLevel') && declaredSplitLevel !== 'CABINET'
  if (splitLevelUnsupported) {
    add(checks, 'PROFILE_SPLIT_LEVEL_UNSUPPORTED', ['splitLevel'], `split level ${String(declaredSplitLevel)} is not supported: the assignment unit in v1 is a whole CABINET`)
  }
  checkClosedFields(checks, input, BUNDLE_FIELDS, [], splitLevelUnsupported ? ['splitLevel'] : [])
  const bundleIdentity = checkIdentity(checks, input['identity'], ['identity'])
  checkString(checks, input, 'manufacturer', [])
  checkString(checks, input, 'family', [])
  checkString(checks, input, 'model', [])
  const transport = checkPixelTransportProfile(checks, input['pixelTransportProfile'], ['pixelTransportProfile'])
  const processors = checkProcessorProfiles(checks, input['processorProfiles'], ['processorProfiles'])
  const ports = checkPortProfiles(checks, input['portProfiles'], ['portProfiles'])
  const receivers = checkReceiverProfiles(checks, input['receiverProfiles'], ['receiverProfiles'])
  const modules = checkModuleProfiles(checks, input['moduleProfiles'], ['moduleProfiles'])
  const addressing = checkAddressingProfile(checks, input['addressingProfile'], ['addressingProfile'])

  checkDuplicateIds(checks, bundleIdentity.id, [
    { path: 'processorProfiles', entries: processors },
    { path: 'portProfiles', entries: ports },
    { path: 'receiverProfiles', entries: receivers },
    { path: 'moduleProfiles', entries: modules },
  ])
  checkAddressingIdentityCollision(checks, bundleIdentity.id, addressing.id)
  checkReferences(checks, transport, modules, processors, ports, receivers, addressing.id)
  const geometry = checkDerivedGeometry(checks, transport, modules)
  checkDeclaredCapacity(checks, processors, ports)
  checkTransportInvariants(checks, transport, transport.mask, geometry)

  checkVersion(checks, bundleIdentity.version, ['identity'])
  for (const processor of processors ?? []) checkVersion(checks, processor.version, ['processorProfiles', processor.index, 'identity'])
  for (const port of ports ?? []) checkVersion(checks, port.version, ['portProfiles', port.index, 'identity'])
  for (const receiver of receivers ?? []) checkVersion(checks, receiver.version, ['receiverProfiles', receiver.index, 'identity'])
  for (const module of modules ?? []) checkVersion(checks, module.version, ['moduleProfiles', module.index, 'identity'])
  checkVersion(checks, addressing.version, ['addressingProfile', 'identity'])

  return report(checks)
}
