import type { RemappedPixelMap, ResolveRemapInput } from './types.js'
import { assertEmptyRules, validateResolveRemapInput } from './validation.js'

export function resolveRemap(input: ResolveRemapInput): RemappedPixelMap {
  const { mapping, rules } = validateResolveRemapInput(input)
  assertEmptyRules(rules)
  return Object.freeze({ source: mapping, rules: Object.freeze([]) })
}
