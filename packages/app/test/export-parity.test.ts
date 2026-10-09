import { describe, expect, it } from 'vitest'
import { buildCompositionChartFrame } from '../src/shared/chart-engine.js'
import { defaultChartSettings } from '../src/shared/chart-settings.js'
import { renderFrameSvg } from '../src/shared/svg-export.js'
import type { TestFrame } from '../src/shared/test-engine.js'
import { drawFramePrimitives } from '../src/renderer/test-canvas.js'

const scene = {
  bounds: { x: 0, y: 0, width: 200, height: 200 },
  screens: [{ id: 's1', name: 'S1', bounds: { x: 0, y: 0, width: 200, height: 200 } }],
  cabinets: [
    { id: 's1/C01', screen: 's1', logicalOrder: 1, bounds: { x: 0, y: 0, width: 100, height: 100 }, hardware: null },
  ],
  modules: [], signalPaths: [], hardwareReady: false, mappingReady: false, hardwareReason: null, mappingReason: null,
}

function textFrame(shadow: boolean): TestFrame {
  return {
    pattern: 'composition-chart',
    scope: { kind: 'composition', target: null },
    bounds: { x: 0, y: 0, width: 200, height: 200 },
    scopeBounds: { x: 0, y: 0, width: 200, height: 200 },
    background: 'transparent',
    scopedCabinets: ['s1/C01'],
    primitives: [{
      kind: 'text', point: { x: 50, y: 50 }, text: 'A1', color: '#ffffff',
      size: 16, align: 'center', shadow, role: 'cabinet-label',
      cellBounds: { x: 0, y: 0, width: 100, height: 100 },
    }],
    walkPixel: null,
  }
}

interface MockCtx {
  fillTextCalls: { text: string; x: number; y: number }[]
  putImageDataCalls: number
  shadowColor: string
  shadowBlur: number
  shadowOffsetX: number
  shadowOffsetY: number
  fillStyle: string
  font: string
  textAlign: string
  textBaseline: string
  canvas: { width: number; height: number }
  save(): void
  restore(): void
  fillText(text: string, x: number, y: number): void
  measureText(): { width: number; actualBoundingBoxLeft: number; actualBoundingBoxRight: number; actualBoundingBoxAscent: number; actualBoundingBoxDescent: number }
  getImageData(x: number, y: number, width: number, height: number): { data: Uint8ClampedArray }
  putImageData(data: { data: Uint8ClampedArray }, x: number, y: number): void
}

function mockCtx(): MockCtx {
  return {
    fillTextCalls: [],
    putImageDataCalls: 0,
    shadowColor: 'transparent',
    shadowBlur: 0,
    shadowOffsetX: 0,
    shadowOffsetY: 0,
    fillStyle: '',
    font: '',
    textAlign: 'left',
    textBaseline: 'alphabetic',
    canvas: { width: 200, height: 200 },
    save(): void { /* no-op for mock */ },
    restore(): void { /* no-op for mock */ },
    fillText(text: string, x: number, y: number): void {
      this.fillTextCalls.push({ text, x, y })
    },
    measureText() {
      return { width: 40, actualBoundingBoxLeft: 20, actualBoundingBoxRight: 20, actualBoundingBoxAscent: 10, actualBoundingBoxDescent: 4 }
    },
    getImageData(x: number, y: number, width: number, height: number) {
      return { data: new Uint8ClampedArray(width * height * 4) }
    },
    putImageData(): void {
      this.putImageDataCalls += 1
    },
  }
}

function asCtx(mock: MockCtx): CanvasRenderingContext2D {
  return mock as unknown as CanvasRenderingContext2D
}

describe('export parity: text shadow', () => {
  it('keeps the SVG text-shadow filter with unchanged parameters and matches canvas weight', () => {
    const settings = {
      ...defaultChartSettings,
      screenStyles: {
        s1: {
          palette: 'screen-color' as const, labels: 'cabinet' as const, fill: '#284a68',
          cabinetEdges: false, textShadow: true, caption: '', logo: null, showScreenName: false,
        },
      },
    }
    const frame = buildCompositionChartFrame(scene, { kind: 'composition', target: null }, settings)
    const svg = renderFrameSvg(frame, frame.bounds)
    expect(svg).toContain('filter="url(#text-shadow)"')
    expect(svg).toContain('font-weight="600"')
    expect(svg).toContain('<feDropShadow dx="1" dy="1" stdDeviation="2" flood-color="#000000" flood-opacity="0.8"/>')
  })

  it('omits the SVG filter for text without shadow while keeping the weight', () => {
    const frame = textFrame(false)
    const svg = renderFrameSvg(frame, frame.bounds)
    expect(svg).toContain('font-weight="600"')
    expect(svg).not.toContain('filter="url(#text-shadow)"')
    expect(svg).toContain('>A1</text>')
  })

  it('draws shadow text directly in pixelPerfect export with canvas shadow parameters', () => {
    const ctx = mockCtx()
    drawFramePrimitives(asCtx(ctx), textFrame(true), { zoom: 1, offsetX: 0, offsetY: 0 }, null, 'all', false, true, true)
    expect(ctx.fillTextCalls).toEqual([{ text: 'A1', x: 50, y: 50 }])
    expect(ctx.shadowColor).toBe('#000000')
    expect(ctx.shadowBlur).toBe(3)
    expect(ctx.shadowOffsetX).toBe(1)
    expect(ctx.shadowOffsetY).toBe(1)
    expect(ctx.putImageDataCalls).toBe(0)
  })

  it('keeps shadow-free text on the crisp hard-mask path in pixelPerfect export', () => {
    const maskFills: { text: string; x: number; y: number }[] = []
    const maskCtx = {
      save(): void { /* no-op for mock */ },
      restore(): void { /* no-op for mock */ },
      fillStyle: '',
      font: '',
      textAlign: 'left',
      textBaseline: 'alphabetic',
      shadowBlur: 0,
      setTransform(): void { /* no-op for mock */ },
      fillText(text: string, x: number, y: number): void {
        maskFills.push({ text, x, y })
      },
      getImageData(width: number, height: number) {
        return { data: new Uint8ClampedArray(width * height * 4) }
      },
    }
    const holder = globalThis as unknown as { document?: unknown }
    const previous = holder.document
    holder.document = {
      createElement: () => ({
        width: 0,
        height: 0,
        getContext: () => maskCtx,
      }),
    }
    try {
      const ctx = mockCtx()
      drawFramePrimitives(asCtx(ctx), textFrame(false), { zoom: 1, offsetX: 0, offsetY: 0 }, null, 'all', false, true, true)
      expect(ctx.fillTextCalls).toEqual([])
      expect(ctx.putImageDataCalls).toBeGreaterThan(0)
      expect(maskFills).toEqual([{ text: 'A1', x: 50, y: 50 }])
      expect(maskCtx.shadowBlur).toBe(0)
    } finally {
      if (previous === undefined) delete holder.document
      else holder.document = previous
    }
  })
})
