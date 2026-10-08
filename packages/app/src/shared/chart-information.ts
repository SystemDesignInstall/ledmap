import type { ChartInformation } from './chart-settings.js'
import type { TestCabinetNode, TestPrimitive, TestScreenNode } from './test-engine.js'

export function buildChartInformation(
  screen: TestScreenNode,
  cabinets: readonly TestCabinetNode[],
  information: ChartInformation,
  color: string,
): readonly TestPrimitive[] {
  if (!information.enabled) return []
  const { x, y, width, height } = screen.bounds
  const lines: string[] = []
  if (information.resolution) lines.push(`Resolution: ${width}×${height} px`)
  if (information.aspectRatio) {
    let divisor = width
    let remainder = height
    while (remainder !== 0) [divisor, remainder] = [remainder, divisor % remainder]
    lines.push(`Aspect ratio: ${width / divisor}:${height / divisor}`)
  }
  const cabinet = cabinets[0]
  if (cabinet && information.cabinetSize) lines.push(`Cabinet: ${cabinet.bounds.width}×${cabinet.bounds.height} px`)
  if (cabinet && information.grid) lines.push(`Grid: ${Math.round(width / cabinet.bounds.width)} columns × ${Math.round(height / cabinet.bounds.height)} rows`)
  if (information.cabinetCount) lines.push(`Cabinets: ${cabinets.length}`)
  if (information.canvasPosition) lines.push(`Position: ${x}, ${y}`)
  if (lines.length === 0) return []
  const margin = Math.min(12, width / 10, height / 10)
  const padding = 6
  const longest = Math.max(...lines.map(line => line.length))
  const size = Math.min(information.size, (width - margin * 2 - padding * 2) / (longest * 0.65),
    (height - margin * 2 - padding * 2) / (lines.length * 1.4))
  if (size < 4) return []
  const boxWidth = longest * size * 0.65 + padding * 2
  const boxHeight = lines.length * size * 1.4 + padding * 2
  const left = information.position.endsWith('right') ? x + width - margin - boxWidth : x + margin
  const top = information.position.startsWith('bottom') ? y + height - margin - boxHeight : y + margin
  const red = parseInt(color.slice(1, 3), 16)
  const green = parseInt(color.slice(3, 5), 16)
  const blue = parseInt(color.slice(5, 7), 16)
  return [
    { kind: 'rect', bounds: { x: left, y: top, width: boxWidth, height: boxHeight },
      fill: red * 0.299 + green * 0.587 + blue * 0.114 < 128 ? '#eef1f4' : '#101518', opacity: 0.85, role: 'screen-information' },
    ...lines.map((text, index): TestPrimitive => ({ kind: 'text',
      point: { x: left + padding, y: top + padding + size * 1.4 * (index + 0.5) },
      text, size, color, align: 'left', role: 'screen-information' })),
  ]
}
