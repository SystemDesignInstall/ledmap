import { DomainError } from '../model/errors.js'
import type { ResolvedPixelMap } from '../mapping-engine/types.js'
import type { RemapRuleDescriptor, ResolveRemapInput } from './types.js'

function fail(code: string, message: string): never {
  throw new DomainError(`REMAP_${code}`, message)
}

export function validateResolveRemapInput(input: unknown): ResolveRemapInput {
  if (input === null || typeof input !== 'object' || Array.isArray(input)) fail('INVALID_VALUE', 'resolveRemap input must be an object')
  const { mapping, rules } = input as { mapping?: unknown; rules?: unknown }
  if (mapping === null || typeof mapping !== 'object' || Array.isArray(mapping)) fail('INVALID_VALUE', 'resolveRemap input.mapping must be a ResolvedPixelMap')
  if (!Array.isArray(rules)) fail('INVALID_VALUE', 'resolveRemap input.rules must be an array')
  assertImmutableMapping(mapping)
  return { mapping: mapping as ResolvedPixelMap, rules }
}

export function assertEmptyRules(rules: readonly RemapRuleDescriptor[]): void {
  if (rules.length > 0) {
    fail('UNSUPPORTED_RULE', 'Phase 7B v1 supports only the empty production rule set')
  }
}

function assertImmutableMapping(mapping: object): void {
  const pending: unknown[] = [mapping]
  const visited = new WeakSet<object>()
  while (pending.length > 0) {
    const value = pending.pop()
    if (typeof value === 'function') fail('INVALID_VALUE', 'mapping must contain immutable data only')
    if (value === null || typeof value !== 'object' || visited.has(value)) continue
    const prototype: unknown = Object.getPrototypeOf(value)
    if (prototype !== Object.prototype && prototype !== Array.prototype && prototype !== null) {
      fail('INVALID_VALUE', 'mapping must contain plain objects and arrays only')
    }
    if (!Object.isFrozen(value)) fail('INVALID_VALUE', 'mapping must be deeply immutable')
    visited.add(value)
    for (const key of Reflect.ownKeys(value)) {
      const descriptor = Object.getOwnPropertyDescriptor(value, key)!
      if (!('value' in descriptor)) fail('INVALID_VALUE', 'mapping must not contain accessors')
      pending.push(descriptor.value)
    }
  }
}
