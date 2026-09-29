import { describe, expect, it } from 'vitest'
import {
  TEST_PATTERN_DEFINITIONS,
  evaluateTestPattern,
  testPatternAvailability,
  type TestPatternConfig,
  type TestScene,
  type TestWalkPixel,
} from '../src/shared/test-engine.js'

const scene: TestScene = {
  bounds: { x: -100, y: 0, width: 500, height: 200 },
  screens: [
    { id: 'screen-1', name: 'Left', bounds: { x: -100, y: 0, width: 200, height: 200 } },
    { id: 'screen-2', name: 'Right', bounds: { x: 200, y: 0, width: 200, height: 200 } },
  ],
  cabinets: [
    {
      id: 'screen-1/C01', screen: 'screen-1', logicalOrder: 1,
      bounds: { x: -100, y: 0, width: 100, height: 100 },
      hardware: { receiver: 'receiver-1', port: 'port-1', processor: 'processor-1', processorName: 'Main' },
    },
    {
      id: 'screen-2/C01', screen: 'screen-2', logicalOrder: 1,
      bounds: { x: 200, y: 0, width: 100, height: 100 },
      hardware: { receiver: 'receiver-2', port: 'port-1', processor: 'processor-1', processorName: 'Main' },
    },
  ],
  modules: [
    { id: 'screen-1/C01/M1', cabinet: 'screen-1/C01', screen: 'screen-1', bounds: { x: -100, y: 0, width: 50, height: 50 } },
    { id: 'screen-2/C01/M1', cabinet: 'screen-2/C01', screen: 'screen-2', bounds: { x: 200, y: 0, width: 50, height: 50 } },
  ],
  signalPaths: [{
    receiver: 'receiver-1', port: 'port-1', processor: 'processor-1',
    cabinets: ['screen-1/C01', 'screen-2/C01'], points: [{ x: -50, y: 50 }, { x: 250, y: 50 }],
  }],
  hardwareReady: true,
  mappingReady: true,
  hardwareReason: null,
  mappingReason: null,
}

function config(pattern: TestPatternConfig['pattern'], scope: TestPatternConfig['scope'] = { kind: 'composition', target: null }): TestPatternConfig {
  return { pattern, scope, walkPixel: null }
}

describe('headless Test pattern engine', () => {
  it('publishes every required pattern as deterministic metadata', () => {
    expect(TEST_PATTERN_DEFINITIONS).toHaveLength(22)
    expect(TEST_PATTERN_DEFINITIONS.map(value => value.id)).toEqual([
      'black', 'white', 'red', 'green', 'blue',
      'checkerboard', 'module-grid', 'borders', 'center-cross', 'diagonals', 'corner-markers',
      'horizontal-gradient', 'vertical-gradient',
      'screen-labels', 'cabinet-labels', 'cabinet-order', 'module-labels',
      'receiver-labels', 'port-labels', 'processor-labels', 'signal-flow', 'address-walk',
    ])
  })

  it('evaluates Basic and Geometry patterns without Hardware semantics', () => {
    const incomplete = { ...scene, hardwareReady: false, mappingReady: false }
    const white = evaluateTestPattern(incomplete, config('white', { kind: 'screen', target: 'screen-1' }))
    expect(white.scopedCabinets).toEqual(['screen-1/C01'])
    expect(white.primitives).toContainEqual({ kind: 'rect', bounds: scene.screens[0]!.bounds, fill: '#ffffff' })
    const checker = evaluateTestPattern(incomplete, config('checkerboard'))
    expect(checker.primitives.filter(value => value.kind === 'rect').length).toBeGreaterThan(20)
    expect(evaluateTestPattern(incomplete, config('borders'))).toEqual(evaluateTestPattern(incomplete, config('borders')))
    expect(testPatternAvailability(incomplete, 'checkerboard')).toBeNull()
  })

  it.each([
    ['black', '#000000'],
    ['white', '#ffffff'],
    ['red', '#ff2028'],
    ['green', '#20e070'],
    ['blue', '#2488ff'],
  ] as const)('evaluates %s as an exact deterministic solid', (pattern, color) => {
    const frame = evaluateTestPattern(scene, config(pattern, { kind: 'screen', target: 'screen-1' }))
    expect(frame.primitives).toContainEqual({ kind: 'rect', bounds: scene.screens[0]!.bounds, fill: color })
  })

  it('creates deterministic diagnostic labels, identity colors and signal paths', () => {
    const receivers = evaluateTestPattern(scene, config('receiver-labels'))
    const receiverColors = receivers.primitives.flatMap(value => value.kind === 'rect' && value.fill?.startsWith('hsl') ? [value.fill] : [])
    expect(receiverColors).toHaveLength(2)
    expect(receiverColors[0]).not.toBe(receiverColors[1])
    expect(receiverColors.every(color => /^hsl\(\d+ 62% 48% \/ 0\.73\)$/.test(color))).toBe(true)
    const signal = evaluateTestPattern(scene, config('signal-flow'))
    expect(signal.primitives).toContainEqual(expect.objectContaining({ kind: 'line', from: { x: -50, y: 50 }, to: { x: 250, y: 50 } }))
    const order = evaluateTestPattern(scene, config('cabinet-order', { kind: 'cabinet', target: 'screen-1/C01' }))
    expect(order.primitives).toContainEqual(expect.objectContaining({ kind: 'text', text: '#1' }))
  })

  it.each([
    ['module-grid', 'rect'],
    ['center-cross', 'line'],
    ['diagonals', 'line'],
    ['corner-markers', 'rect'],
    ['horizontal-gradient', 'gradient'],
    ['vertical-gradient', 'gradient'],
    ['screen-labels', 'text'],
    ['module-labels', 'text'],
    ['port-labels', 'text'],
    ['processor-labels', 'text'],
  ] as const)('evaluates %s into reusable %s primitives', (pattern, primitive) => {
    const frame = evaluateTestPattern(scene, config(pattern))
    expect(frame.primitives.some(value => value.kind === primitive)).toBe(true)
  })

  it('disables Hardware-dependent patterns with a diagnostic reason', () => {
    const incomplete = {
      ...scene,
      hardwareReady: false,
      mappingReady: false,
      hardwareReason: 'Assign every Cabinet.',
      mappingReason: 'Map every Screen.',
    }
    expect(testPatternAvailability(incomplete, 'receiver-labels')).toBe('Assign every Cabinet.')
    expect(testPatternAvailability({ ...incomplete, hardwareReady: true }, 'address-walk')).toBe('Map every Screen.')
    expect(testPatternAvailability(incomplete, 'white')).toBeNull()
  })

  it('renders Address Walk from a resolved path without deriving addresses in Canvas code', () => {
    const walkPixel: TestWalkPixel = {
      ordinal: 65536,
      total: 131072,
      input: { x: 720, y: 90 },
      screen: 'screen-2',
      screenName: 'Right',
      screenCoordinate: { x: 0, y: 0 },
      cabinet: 'screen-2/C01',
      cabinetCoordinate: { x: 0, y: 0 },
      module: 'screen-2/C01/M1',
      moduleCoordinate: { x: 0, y: 0 },
      receiver: 'receiver-2',
      port: 'port-1',
      processor: 'processor-1',
      dataIndex: 65536,
      compositionPoint: { x: 200, y: 0 },
    }
    const frame = evaluateTestPattern(scene, { ...config('address-walk'), walkPixel })
    expect(frame.walkPixel).toEqual(walkPixel)
    expect(frame.primitives).toContainEqual({ kind: 'pixel', point: { x: 200, y: 0 }, color: '#ffffff' })
    expect(frame.primitives).toContainEqual(expect.objectContaining({ kind: 'text', text: 'port-1 · 65536' }))
  })
})
