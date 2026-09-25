import { DomainError, type ValidateProjectInput } from '../../src/index.js'
import { smallMapping } from '../mapping-engine/fixtures.js'

export function projectFixture(): ValidateProjectInput {
  return copy({ mapping: smallMapping(1, 1, 1, 1, 2, 3), rules: [] })
}

export function copy<T>(value: T): T {
  if (value === null || typeof value !== 'object') return value
  if (Array.isArray(value)) return value.map(copy) as T
  return Object.fromEntries(Object.entries(value).map(([key, child]) => [key, copy(child)])) as T
}

export function parentAt(input: unknown, path: readonly (string | number)[]): { parent: Record<string | number, unknown>; key: string | number } {
  let parent = input as Record<string | number, unknown>
  for (const key of path.slice(0, -1)) parent = parent[key] as Record<string | number, unknown>
  return { parent, key: path[path.length - 1]! }
}

export function setAt(input: ValidateProjectInput, path: readonly (string | number)[], value: unknown): ValidateProjectInput {
  const { parent, key } = parentAt(input, path)
  parent[key] = value
  return input
}

export function domainError(action: () => unknown): DomainError {
  try {
    action()
  } catch (error) {
    if (error instanceof DomainError) return error
    throw error
  }
  throw new Error('Expected DomainError')
}

export const inputFailed = [
  { stage: 'input', status: 'failed' },
  { stage: 'mapping', status: 'blocked', blockedBy: 'input' },
  { stage: 'remap', status: 'blocked', blockedBy: 'input' },
]

export const mappingFailed = [
  { stage: 'input', status: 'passed' },
  { stage: 'mapping', status: 'failed' },
  { stage: 'remap', status: 'blocked', blockedBy: 'mapping' },
]

export const remapFailed = [
  { stage: 'input', status: 'passed' },
  { stage: 'mapping', status: 'passed' },
  { stage: 'remap', status: 'failed' },
]

export const passed = [
  { stage: 'input', status: 'passed' },
  { stage: 'mapping', status: 'passed' },
  { stage: 'remap', status: 'passed' },
]
