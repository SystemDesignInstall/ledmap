import { describe, expect, it } from 'vitest'
import {
  MAX_LIVE_OUTPUTS,
  calculateLiveOutputCamera,
  displayPickerLabel,
  liveOutputId,
  validateLiveOutputId,
  validateLiveOutputRegion,
  validateLiveOutputScaleMode,
} from '../src/shared/live-output.js'

describe('Live Output session model', () => {
  it('limits routing to four stable output identities', () => {
    expect(MAX_LIVE_OUTPUTS).toBe(4)
    expect(Array.from({ length: 4 }, (_, index) => liveOutputId(index + 1))).toEqual([
      'output-1', 'output-2', 'output-3', 'output-4',
    ])
    expect(validateLiveOutputId('output-4')).toBe('output-4')
    expect(() => liveOutputId(5)).toThrow(/between 1 and 4/)
    expect(() => validateLiveOutputId('output-5')).toThrow(/identity/)
  })

  it('accepts signed integer source coordinates and rejects invalid size', () => {
    expect(validateLiveOutputRegion({ x: -1920, y: -240, width: 1920, height: 1080 })).toEqual({
      x: -1920, y: -240, width: 1920, height: 1080,
    })
    expect(() => validateLiveOutputRegion({ x: .5, y: 0, width: 10, height: 10 })).toThrow(/signed whole numbers/)
    expect(() => validateLiveOutputRegion({ x: 0, y: 0, width: 0, height: 10 })).toThrow(/positive whole numbers/)
    expect(validateLiveOutputScaleMode('actual')).toBe('actual')
    expect(validateLiveOutputScaleMode('fit')).toBe('fit')
  })

  it('maps source pixels 1:1 to physical pixels in Actual mode', () => {
    expect(calculateLiveOutputCamera(
      { width: 800, height: 600 },
      { x: -100, y: 20, width: 400, height: 200 },
      'actual',
      2,
    )).toEqual({ zoom: .5, offsetX: 350, offsetY: 240 })
  })

  it('centers a fitted source region with deterministic black letterbox space', () => {
    expect(calculateLiveOutputCamera(
      { width: 1920, height: 1080 },
      { x: 100, y: 200, width: 1000, height: 1000 },
      'fit',
      1,
    )).toEqual({ zoom: 1.08, offsetX: 312, offsetY: -216 })
  })

  it('formats display identity, physical resolution, bounds, scale and Primary state', () => {
    expect(displayPickerLabel({
      id: '42',
      bounds: { x: -1280, y: 0, width: 1024, height: 768 },
      resolution: { width: 1280, height: 960 },
      scaleFactor: 1.25,
      primary: true,
    })).toBe('42 · 1280×960 · bounds -1280,0 1024×768 · 1.25× · Primary')
  })
})
