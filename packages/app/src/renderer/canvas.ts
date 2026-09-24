import type { Snapshot } from './state.js'

export function drawPreview(canvas: HTMLCanvasElement, snapshot: Snapshot): string {
  const { width, height } = canvas.getBoundingClientRect()
  const ratio = window.devicePixelRatio || 1
  canvas.width = Math.max(1, Math.round(width * ratio))
  canvas.height = Math.max(1, Math.round(height * ratio))
  const ctx = canvas.getContext('2d')
  if (!ctx) return 'Canvas is unavailable.'
  ctx.setTransform(ratio, 0, 0, ratio, 0, 0)
  const { grid, config, screen } = snapshot
  const scale = Math.min(Math.max(1, width - 64) / screen.resolution.width, Math.max(1, height - 64) / screen.resolution.height)
  const cw = grid.cabinetWidth * scale
  const ch = grid.cabinetHeight * scale
  const left = (width - screen.resolution.width * scale) / 2
  const top = (height - screen.resolution.height * scale) / 2
  const labelsVisible = cw >= 64 && ch >= 64
  const modulesVisible = cw / config.moduleColumns >= 5 && ch / config.moduleRows >= 5
  ctx.lineWidth = 1
  for (const cabinet of snapshot.cabinets) {
    const x = left + cabinet.column * cw
    const y = top + cabinet.row * ch
    ctx.fillStyle = cabinet.index === 0 ? '#173b39' : '#172331'
    ctx.fillRect(x, y, cw, ch)
    if (modulesVisible) {
      ctx.strokeStyle = '#2a3b4d'
      ctx.beginPath()
      for (let c = 1; c < config.moduleColumns; c += 1) {
        ctx.moveTo(x + c * cw / config.moduleColumns, y)
        ctx.lineTo(x + c * cw / config.moduleColumns, y + ch)
      }
      for (let r = 1; r < config.moduleRows; r += 1) {
        ctx.moveTo(x, y + r * ch / config.moduleRows)
        ctx.lineTo(x + cw, y + r * ch / config.moduleRows)
      }
      ctx.stroke()
    }
    ctx.strokeStyle = '#698095'
    ctx.strokeRect(x, y, cw, ch)
  }
  ctx.strokeStyle = '#74e0c2'
  ctx.fillStyle = '#74e0c2'
  ctx.lineWidth = 1.5
  const center = (column: number, row: number) => ({ x: left + (column + .5) * cw, y: top + (row + .5) * ch })
  for (let i = 1; i < snapshot.path.length; i += 1) {
    const before = snapshot.path[i - 1]!
    const after = snapshot.path[i]!
    const a = center(before.column, before.row)
    const b = center(after.column, after.row)
    ctx.beginPath()
    ctx.moveTo(a.x, a.y)
    ctx.lineTo(b.x, b.y)
    ctx.stroke()
    const angle = Math.atan2(b.y - a.y, b.x - a.x)
    const tip = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }
    const size = Math.min(6, cw * .15, ch * .15)
    ctx.beginPath()
    ctx.moveTo(tip.x, tip.y)
    ctx.lineTo(tip.x - size * Math.cos(angle - .5), tip.y - size * Math.sin(angle - .5))
    ctx.lineTo(tip.x - size * Math.cos(angle + .5), tip.y - size * Math.sin(angle + .5))
    ctx.closePath()
    ctx.fill()
  }
  for (const cabinet of snapshot.cabinets) {
    const p = center(cabinet.column, cabinet.row)
    if (labelsVisible) {
      ctx.fillStyle = '#101c28'
      ctx.fillRect(p.x - 28, p.y - 24, 56, 48)
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      ctx.font = '12px "Segoe UI", sans-serif'
      ctx.fillStyle = '#c7d6e6'
      ctx.fillText(cabinet.id, p.x, p.y - 10)
      ctx.font = '600 18px "Segoe UI", sans-serif'
      ctx.fillStyle = '#74e0c2'
      ctx.fillText(`#${cabinet.index + 1}`, p.x, p.y + 10)
    } else if (cabinet.index === 0 || cabinet.index === snapshot.cabinets.length - 1) {
      ctx.fillStyle = cabinet.index === 0 ? '#74e0c2' : '#e8ba79'
      ctx.beginPath()
      ctx.arc(p.x, p.y, 2.5, 0, Math.PI * 2)
      ctx.fill()
    }
  }
  return !labelsVisible || !modulesVisible
    ? 'Fit to window · Labels or module lines are hidden at this scale. Cabinet outlines and signal path remain visible.'
    : 'Fit to window · Pixel proportions preserved'
}
