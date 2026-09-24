import type { ResolvedPixelMap } from '../mapping-engine/types.js'

export interface RemapRuleDescriptor {
  readonly id: string
  readonly version: string
  readonly type: string
}

export interface ResolveRemapInput {
  readonly mapping: ResolvedPixelMap
  readonly rules: readonly RemapRuleDescriptor[]
}

export interface RemappedPixelMap {
  readonly source: ResolvedPixelMap
  readonly rules: readonly RemapRuleDescriptor[]
}
