export const CABINET_LABEL_FONT = '600 14px "Segoe UI", sans-serif'

export function drawViewportCabinetLabel(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  width: number,
  height: number,
  color: string,
  shadow = false,
  outline = false,
): boolean {
  ctx.save()
  ctx.font = CABINET_LABEL_FONT
  const metrics = ctx.measureText(text)
  const textHeight = Math.max(14, metrics.actualBoundingBoxAscent + metrics.actualBoundingBoxDescent)
  if (metrics.width + 6 > width || textHeight + 6 > height) {
    ctx.restore()
    return false
  }
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillStyle = color
  ctx.shadowColor = shadow ? '#000000' : 'transparent'
  ctx.shadowBlur = shadow ? 3 : 0
  ctx.shadowOffsetX = shadow ? 1 : 0
  ctx.shadowOffsetY = shadow ? 1 : 0
  if (outline) {
    ctx.lineJoin = 'round'
    ctx.lineWidth = 2.5
    ctx.strokeStyle = 'rgba(15, 20, 25, .9)'
    ctx.strokeText(text, x, y)
  }
  ctx.fillText(text, x, y)
  ctx.restore()
  return true
}
