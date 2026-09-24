import { resolveMapping, type ResolvedPixelMap } from '../../src/index.js'
import { deepFreeze } from '../hardware-engine/fixtures.js'
import { referenceMapping } from '../mapping-engine/fixtures.js'

export function resolvedReferenceMapping(offset = false): ResolvedPixelMap {
  return resolveMapping(deepFreeze(referenceMapping(offset)))
}
