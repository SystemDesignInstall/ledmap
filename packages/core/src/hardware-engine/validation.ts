import { DomainError } from '../model/errors.js'

export function fail(code: string, message: string): never {
  throw new DomainError(`HARDWARE_${code}`, message)
}

export function assertSafeInteger(label: string, value: number, minimum = 0): void {
  if (!Number.isSafeInteger(value) || value < minimum) {
    fail('INVALID_VALUE', `${label} must be a safe integer >= ${minimum}, got ${value}`)
  }
}

export function safeAdd(label: string, left: number, right: number): number {
  const sum = left + right
  if (!Number.isSafeInteger(sum) || sum < 0) fail('OVERFLOW', `${label} exceeds the safe integer range`)
  return sum
}

export function safeProduct(label: string, left: number, right: number): number {
  const product = left * right
  if (!Number.isSafeInteger(product) || product <= 0) fail('OVERFLOW', `${label} exceeds the safe integer range`)
  return product
}

export function claim(seen: Set<string>, id: string, label: string): void {
  if (seen.has(id)) fail('DUPLICATE', `${label}: ${id}`)
  seen.add(id)
}

export function indexEntities<T extends { readonly id: string }>(values: readonly T[], label: string): Map<string, T> {
  const result = new Map<string, T>()
  for (const value of values) {
    if (result.has(value.id)) fail('DUPLICATE', `${label}: ${value.id}`)
    result.set(value.id, value)
  }
  return result
}

export function reference<T>(values: ReadonlyMap<string, T>, id: string, label: string): T {
  const value = values.get(id)
  if (value === undefined) fail('UNKNOWN_REFERENCE', `${label}: ${id}`)
  return value
}

export function assertComplete(seen: ReadonlySet<string>, expected: ReadonlyMap<string, unknown>, label: string): void {
  for (const id of expected.keys()) {
    if (!seen.has(id)) fail('INCOMPLETE', `${label}: missing ${id}`)
  }
}
