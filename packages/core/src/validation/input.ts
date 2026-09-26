import type { ProjectDiagnostic } from './types.js'

type Shape =
  | 'string' | 'number' | 'boolean'
  | { readonly kind: 'record'; readonly fields: readonly (readonly [string, Shape])[] }
  | { readonly kind: 'array'; readonly item?: Shape }
  | { readonly kind: 'enum'; readonly values: readonly string[] }
  | { readonly kind: 'optional'; readonly value: Shape }

const size: Shape = { kind: 'record', fields: [['width', 'number'], ['height', 'number']] }
const xy: Shape = { kind: 'record', fields: [['x', 'number'], ['y', 'number']] }
const rect: Shape = { kind: 'record', fields: [['x', 'number'], ['y', 'number'], ['width', 'number'], ['height', 'number']] }
const strings: Shape = { kind: 'array', item: 'string' }
const ordering: Shape = { kind: 'record', fields: [
  ['numbering', { kind: 'enum', values: ['row', 'column'] }],
  ['startCorner', { kind: 'enum', values: ['top-left', 'top-right', 'bottom-right', 'bottom-left'] }],
  ['direction', { kind: 'enum', values: ['left-to-right', 'right-to-left', 'top-to-bottom', 'bottom-to-top'] }],
  ['snake', 'boolean'],
] }
const processor: Shape = { kind: 'record', fields: [['id', 'string'], ['name', 'string'], ['portCount', 'number']] }
const port: Shape = { kind: 'record', fields: [
  ['id', 'string'], ['processor', 'string'], ['index', 'number'], ['receiverCapacity', 'number'],
] }
const receiver: Shape = { kind: 'record', fields: [
  ['id', 'string'], ['processor', 'string'], ['port', 'string'], ['index', 'number'], ['cabinets', strings],
  ['pixelCapacity', { kind: 'optional', value: 'number' }],
] }
const cabinet: Shape = { kind: 'record', fields: [
  ['id', 'string'], ['grid', 'string'], ['column', 'number'], ['row', 'number'], ['origin', xy],
  ['width', 'number'], ['height', 'number'], ['pixelWidth', 'number'], ['pixelHeight', 'number'],
  ['moduleColumns', 'number'], ['moduleRows', 'number'], ['rotation', 'number'], ['flipH', 'boolean'], ['flipV', 'boolean'],
] }
const module: Shape = { kind: 'record', fields: [
  ['id', 'string'], ['cabinet', 'string'], ['column', 'number'], ['row', 'number'],
  ['localX', 'number'], ['localY', 'number'], ['width', 'number'], ['height', 'number'],
  ['pixelWidth', 'number'], ['pixelHeight', 'number'],
] }
const topology: Shape = { kind: 'record', fields: [
  ['processors', { kind: 'array', item: processor }],
  ['ports', { kind: 'array', item: port }],
  ['receivers', { kind: 'array', item: receiver }],
  ['cabinets', { kind: 'array', item: cabinet }],
  ['modules', { kind: 'array', item: module }],
  ['processorOrder', strings],
  ['receiverOrder', { kind: 'array', item: { kind: 'record', fields: [['port', 'string'], ['receivers', strings]] } }],
] }
const mapping: Shape = { kind: 'record', fields: [
  ['inputCanvas', { kind: 'record', fields: [['id', 'string'], ['resolution', size]] }],
  ['screen', { kind: 'record', fields: [
    ['id', 'string'], ['name', 'string'], ['resolution', size], ['mappingRegions', strings], ['cabinetGrids', strings],
  ] }],
  ['grid', { kind: 'record', fields: [
    ['id', 'string'], ['screen', 'string'], ['name', 'string'], ['columns', 'number'], ['rows', 'number'],
    ['cabinetWidth', 'number'], ['cabinetHeight', 'number'], ['ordering', ordering],
  ] }],
  ['region', { kind: 'record', fields: [
    ['id', 'string'], ['inputCanvas', 'string'], ['screen', 'string'], ['grid', 'string'],
    ['inputRect', rect], ['screenRect', rect],
    ['transform', { kind: 'record', fields: [
      ['inputRotation', 'number'], ['screenRotation', 'number'], ['flipX', 'boolean'], ['flipY', 'boolean'],
      ['mask', { kind: 'optional', value: { kind: 'record', fields: [
        ['enabled', 'boolean'], ['points', { kind: 'array', item: xy }],
      ] } }],
    ] }],
  ] }],
  ['hardwareTopology', topology],
] }
const inputShape: Shape = { kind: 'record', fields: [['mapping', mapping], ['rules', { kind: 'array' }]] }

export function validateInputShape(input: unknown): ProjectDiagnostic[] {
  const diagnostics: ProjectDiagnostic[] = []

  function invalid(path: readonly (string | number)[], expected: string): void {
    diagnostics.push({ severity: 'error', stage: 'input', code: 'PROJECT_INVALID_INPUT', path, message: `Expected ${expected}` })
  }

  function property(object: object, key: string | number, shape: Shape, path: readonly (string | number)[]): void {
    const descriptor = Object.getOwnPropertyDescriptor(object, key)
    if (descriptor !== undefined && !('value' in descriptor)) {
      invalid(path, 'an own data property; accessors are not supported')
      return
    }
    visit(descriptor?.value, shape, path)
  }

  function visit(value: unknown, shape: Shape, path: readonly (string | number)[]): void {
    if (typeof shape === 'string') {
      if (typeof value !== shape) invalid(path, shape)
      return
    }
    if (shape.kind === 'optional') {
      if (value !== undefined) visit(value, shape.value, path)
      return
    }
    if (shape.kind === 'enum') {
      if (typeof value !== 'string' || !shape.values.includes(value)) invalid(path, shape.values.join(' | '))
      return
    }
    if (shape.kind === 'array') {
      if (!Array.isArray(value) || Object.getPrototypeOf(value) !== Array.prototype) {
        invalid(path, 'an array')
        return
      }
      if (shape.item !== undefined) {
        const length = Object.getOwnPropertyDescriptor(value, 'length')!.value as number
        for (let index = 0; index < length; index += 1) property(value, index, shape.item, [...path, index])
      }
      return
    }
    if (value === null || typeof value !== 'object' || Array.isArray(value)) {
      invalid(path, 'a plain record')
      return
    }
    const prototype: unknown = Object.getPrototypeOf(value)
    if (prototype !== Object.prototype && prototype !== null) {
      invalid(path, 'a plain record')
      return
    }
    for (const [key, child] of shape.fields) property(value, key, child, [...path, key])
  }

  visit(input, inputShape, [])
  return diagnostics
}
