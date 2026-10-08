import type { ChartGuides } from './chart-settings.js'
import type { TestBounds, TestPrimitive } from './test-engine.js'

export function buildChartGuides(bounds: TestBounds, guides: ChartGuides): readonly TestPrimitive[] {
  const primitives: TestPrimitive[] = []
  const { x, y, width, height } = bounds
  const center = { x: x + width / 2, y: y + height / 2 }
  const inset = Math.min(guides.thickness / 2, width / 2, height / 2)
  const left = x + inset
  const right = x + width - inset
  const top = y + inset
  const bottom = y + height - inset
  const line = (x1: number, y1: number, x2: number, y2: number, centerGuide = false) => primitives.push({
    kind: 'line', from: { x: x1, y: y1 }, to: { x: x2, y: y2 }, color: guides.color, lineWidth: guides.thickness,
    role: centerGuide ? 'screen-center-guide' : 'screen-guide',
  })
  if (guides.diagonals) {
    line(left, top, right, bottom)
    line(left, bottom, right, top)
  }
  if (guides.horizontalCenter) line(left, center.y, right, center.y, true)
  if (guides.verticalCenter) line(center.x, top, center.x, bottom, true)
  if (guides.outerBorder) {
    primitives.push({ kind: 'rect', bounds: { x: left, y: top, width: right - left, height: bottom - top },
      stroke: guides.color, lineWidth: guides.thickness, role: 'screen-guide' })
  }
  const circle = (cx: number, cy: number, radius: number) => {
    if (radius > 0) primitives.push({ kind: 'circle', center: { x: cx, y: cy }, radius, color: guides.color, lineWidth: guides.thickness, role: 'screen-guide' })
  }
  if (guides.centralCircle) circle(center.x, center.y, Math.min(width, height) / 2 - inset)
  if (guides.cornerCircles) {
    const radius = Math.max(0, Math.min(width, height) / 10 - inset)
    for (const cx of [left + radius, right - radius]) {
      for (const cy of [top + radius, bottom - radius]) circle(cx, cy, radius)
    }
  }
  return primitives
}
