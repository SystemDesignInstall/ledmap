import { describe, expect, it } from 'vitest'
import { asPortId, asProcessorId, createReceiver } from '../../src/index.js'

const input = { id: 'R', index: 0, port: asPortId('P:0'), processor: asProcessorId('P') }

describe('Receiver pixel capacity', () => {
  it('omits an unspecified limit and accepts positive safe integer limits', () => {
    expect(createReceiver(input)).not.toHaveProperty('pixelCapacity')
    for (const pixelCapacity of [1, 65536, Number.MAX_SAFE_INTEGER]) {
      expect(createReceiver({ ...input, pixelCapacity }).pixelCapacity).toBe(pixelCapacity)
    }
  })

  it.each([0, -1, 0.5, NaN, Infinity, -Infinity, Number.MAX_SAFE_INTEGER + 1])('rejects invalid pixelCapacity %s', pixelCapacity => {
    expect(() => createReceiver({ ...input, pixelCapacity })).toThrowError(/INVALID_DIMENSION/)
  })
})
