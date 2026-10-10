import { describe, expect, it } from 'vitest'
import { planNdiStreams } from '../src/shared/ndi-output-plan.js'
import type { TestScene } from '../src/shared/test-engine.js'

function scene(screens: Array<{ id: string; name: string; x: number; y: number; width: number; height: number }>): Pick<TestScene, 'screens'> {
  return { screens: screens.map(({ id, name, x, y, width, height }) => ({ id, name, bounds: { x, y, width, height } })) }
}

describe('NDI stream planning', () => {
  it('produces no senders for an empty project', () => {
    expect(planNdiStreams(scene([]))).toEqual([])
  })

  it('uses the exact composition union and independent Screen pixels', () => {
    const output = planNdiStreams(scene([
      { id: 'left', name: 'Main', x: -512, y: -20, width: 512, height: 384 },
      { id: 'right', name: 'Side', x: 300, y: 60, width: 128, height: 256 },
    ]))
    expect(output).toEqual([
      { id: 'composition', kind: 'composition', name: 'LedMAP / Composition', region: { x: -512, y: -20, width: 940, height: 384 } },
      { id: 'screen:left', kind: 'screen', name: 'LedMAP / Screen / Main', region: { x: -512, y: -20, width: 512, height: 384 } },
      { id: 'screen:right', kind: 'screen', name: 'LedMAP / Screen / Side', region: { x: 300, y: 60, width: 128, height: 256 } },
    ])
  })

  it('disambiguates duplicate screen names without changing stable identities', () => {
    const output = planNdiStreams(scene([
      { id: 'a', name: 'Wall', x: 0, y: 0, width: 128, height: 128 },
      { id: 'b', name: 'Wall', x: 128, y: 0, width: 128, height: 128 },
    ]))
    expect(output[1]?.name).toBe('LedMAP / Screen / Wall (a)')
    expect(output[2]?.name).toBe('LedMAP / Screen / Wall (b)')
  })

  it('rejects fractional or empty pixel geometry', () => {
    expect(() => planNdiStreams(scene([{ id: 'x', name: 'X', x: 0, y: 0, width: 0, height: 1 }]))).toThrow()
    expect(() => planNdiStreams(scene([{ id: 'x', name: 'X', x: 0.5, y: 0, width: 1, height: 1 }]))).toThrow()
  })
})
