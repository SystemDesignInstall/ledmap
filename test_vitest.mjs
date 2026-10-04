import { describe, expect, it } from 'vitest'
import { packageName, packageVersion } from './packages/core/src/index.js'

describe('core skeleton', () => {
  it('exposes package identity', () => {
    expect(packageName).toBe('@ledmap/core')
    expect(packageVersion).toBe('0.1.0')
  })
})