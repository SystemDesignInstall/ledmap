import type { TestBounds, TestFrame, TestPrimitive } from './test-engine.js'

function escapeXml(value: string): string {
  return value.replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' })[character]!)
}

function rect(bounds: TestBounds, attributes: string): string {
  return `<rect x="${bounds.x}" y="${bounds.y}" width="${bounds.width}" height="${bounds.height}" ${attributes}/>`
}

function primitiveSvg(primitive: TestPrimitive, index: number): string {
  if (primitive.kind === 'cabinet-border') {
    const { x, y, width, height } = primitive.bounds
    const fill = `fill="${escapeXml(primitive.color)}"`
    return [
      { x, y, width, height: 1 },
      { x, y: y + height - 1, width, height: 1 },
      { x, y, width: 1, height },
      { x: x + width - 1, y, width: 1, height },
    ].map(bounds => rect(bounds, fill)).join('')
  }
  if (primitive.kind === 'rect') {
    return rect(primitive.bounds, `fill="${escapeXml(primitive.fill ?? 'none')}"${primitive.opacity === undefined ? '' : ` opacity="${primitive.opacity}"`}${primitive.stroke ? ` stroke="${escapeXml(primitive.stroke)}" stroke-width="${primitive.lineWidth ?? 1}"` : ''}`)
  }
  if (primitive.kind === 'gradient') {
    return rect(primitive.bounds, `fill="url(#gradient-${index})"`)
  }
  if (primitive.kind === 'circle') {
    return `<circle cx="${primitive.center.x}" cy="${primitive.center.y}" r="${primitive.radius}" fill="none" stroke="${escapeXml(primitive.color)}" stroke-width="${primitive.lineWidth}"/>`
  }
  if (primitive.kind === 'line') {
    return `<line x1="${primitive.from.x}" y1="${primitive.from.y}" x2="${primitive.to.x}" y2="${primitive.to.y}" stroke="${escapeXml(primitive.color)}" stroke-width="${primitive.lineWidth}"${primitive.dash ? ` stroke-dasharray="${primitive.dash.join(' ')}"` : ''}/>`
  }
  if (primitive.kind === 'text') {
    const anchor = primitive.align === 'center' ? 'middle' : primitive.align === 'right' ? 'end' : 'start'
    return `<text x="${primitive.point.x}" y="${primitive.point.y}" fill="${escapeXml(primitive.color)}" font-family="Segoe UI, sans-serif" font-size="${primitive.size}" text-anchor="${anchor}" dominant-baseline="middle"${primitive.shadow ? ' filter="url(#text-shadow)"' : ''}>${escapeXml(primitive.text)}</text>`
  }
  if (primitive.kind === 'image') {
    return `<image x="${primitive.bounds.x}" y="${primitive.bounds.y}" width="${primitive.bounds.width}" height="${primitive.bounds.height}"${primitive.opacity === undefined ? '' : ` opacity="${primitive.opacity}"`} href="${escapeXml(primitive.dataUrl)}"/>`
  }
  return rect({ x: primitive.point.x, y: primitive.point.y, width: 1, height: 1 }, `fill="${escapeXml(primitive.color)}"`)
}

export function renderFrameSvg(frame: TestFrame, bounds: TestBounds): string {
  if (![bounds.x, bounds.y, bounds.width, bounds.height].every(Number.isSafeInteger) || bounds.width < 1 || bounds.height < 1) {
    throw new Error('SVG bounds must use positive whole-number dimensions.')
  }
  const gradients = frame.primitives.flatMap((primitive, index) => {
    if (primitive.kind !== 'gradient') return []
    const bounds = primitive.gradientBounds
    const geometry = bounds
      ? ` gradientUnits="userSpaceOnUse" x1="${bounds.x}" y1="${bounds.y}" x2="${primitive.direction === 'horizontal' ? bounds.x + bounds.width : bounds.x}" y2="${primitive.direction === 'vertical' ? bounds.y + bounds.height : bounds.y}"`
      : ` x1="0%" y1="0%" x2="${primitive.direction === 'horizontal' ? 100 : 0}%" y2="${primitive.direction === 'vertical' ? 100 : 0}%"`
    return [`<linearGradient id="gradient-${index}"${geometry}><stop offset="0%" stop-color="${escapeXml(primitive.from)}"/><stop offset="100%" stop-color="${escapeXml(primitive.to)}"/></linearGradient>`]
  })
  const clipIds = new Map<readonly TestBounds[], string>()
  const clips = frame.primitives.flatMap((primitive, index) => {
    if (!primitive.clip || clipIds.has(primitive.clip)) return []
    const id = `primitive-clip-${index}`
    clipIds.set(primitive.clip, id)
    return [`<clipPath id="${id}">${primitive.clip.map(bounds => rect(bounds, 'fill="white"')).join('')}</clipPath>`]
  })
  const definitions = `<defs><clipPath id="frame-clip">${rect(bounds, 'fill="white"')}</clipPath><filter id="text-shadow" x="-50%" y="-50%" width="200%" height="200%"><feDropShadow dx="1" dy="1" stdDeviation="2" flood-color="#000000" flood-opacity="0.8"/></filter>${gradients.join('')}${clips.join('')}</defs>`
  const background = frame.background === 'transparent' ? '' : rect(bounds, `fill="${escapeXml(frame.background)}"`)
  const shapes = frame.primitives.map((primitive, index) => {
    const body = primitiveSvg(primitive, index)
    return primitive.clip ? `<g clip-path="url(#${clipIds.get(primitive.clip)})">${body}</g>` : body
  }).join('')
  return `<?xml version="1.0" encoding="UTF-8"?>\n<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${bounds.width}" height="${bounds.height}" viewBox="${bounds.x} ${bounds.y} ${bounds.width} ${bounds.height}">${definitions}<g clip-path="url(#frame-clip)">${background}${shapes}</g></svg>\n`
}
