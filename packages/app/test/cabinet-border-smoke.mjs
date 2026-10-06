import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'

export async function verifyCabinetBorders(page, { output, exportDirectory, addScreen, runExport }) {
  await page.locator('#new-project').click()
  await page.locator('#layout-mode').click()
  await addScreen(page)
  await page.locator('#screen-drawing-labels').selectOption('none')
  const toggle = async (selector, value) => {
    if (await page.locator(selector).getAttribute('aria-pressed') !== String(value)) await page.locator(selector).click()
  }
  await toggle('[data-overlay="cabinets"]', true)
  await toggle('[data-overlay="modules"]', false)
  const screen = (await page.evaluate(() => window.__ledmap.dump()))[0]
  const fill = [40, 74, 104, 255]
  const white = [255, 255, 255, 255]
  const session = await page.evaluate(() => ({ project: window.__ledmap.projectSnapshot(), document: window.__ledmap.document() }))
  const metrics = await page.context().newCDPSession(page)
  for (const ratio of [1, 2]) {
    await metrics.send('Emulation.setDeviceMetricsOverride', { width: 1583, height: 849, deviceScaleFactor: ratio, mobile: false })
    await page.locator('#actual-size').click()
    console.log('Cabinet border viewport:', await page.evaluate(() => ({ dpr: window.devicePixelRatio,
      width: document.querySelector('#project-canvas').width, cssWidth: document.querySelector('#project-canvas').getBoundingClientRect().width })))
    await page.waitForFunction(expected => {
      const canvas = document.querySelector('#project-canvas')
      return Math.abs(window.devicePixelRatio - expected) < 1e-6 && canvas.width === Math.round(canvas.getBoundingClientRect().width * expected)
    }, ratio)
    for (const zoom of [0.47, 0.5, 1, 2]) {
      await page.evaluate(target => {
        const canvas = document.querySelector('#project-canvas')
        const rect = canvas.getBoundingClientRect()
        canvas.dispatchEvent(new WheelEvent('wheel', { bubbles: true, cancelable: true,
          clientX: rect.x + rect.width / 2, clientY: rect.y + rect.height / 2, ctrlKey: true,
          deltaY: -Math.log(target / window.__ledmap.camera().zoom) / 0.0015 }))
      }, zoom)
      await page.waitForFunction(target => Math.abs(window.__ledmap.camera().zoom - target) < 1e-9, zoom)
      for (const clean of [false, true]) {
        await toggle('#clean-view', clean)
        const strips = await page.evaluate(value => {
          const canvas = document.querySelector('#project-canvas')
          const ctx = canvas.getContext('2d')
          const ratio = window.devicePixelRatio
          const vertical = window.__ledmap.projectToPx({ x: value.x + value.cabinetWidth, y: value.y + value.cabinetHeight * 1.5 })
          const horizontal = window.__ledmap.projectToPx({ x: value.x + value.cabinetWidth * 1.5, y: value.y + value.cabinetHeight })
          const pixels = bytes => Array.from({ length: bytes.length / 4 }, (_, index) => [...bytes.slice(index * 4, index * 4 + 4)])
          return {
            vertical: pixels(ctx.getImageData(Math.round(vertical.x * ratio) - 2, Math.round(vertical.y * ratio), 4, 1).data),
            horizontal: pixels(ctx.getImageData(Math.round(horizontal.x * ratio), Math.round(horizontal.y * ratio) - 2, 1, 4).data),
          }
        }, screen)
        const edge = clean ? white : [74, 80, 85, 255]
        assert.deepEqual(strips.vertical, [fill, edge, edge, fill], `vertical border DPR ${ratio}, zoom ${zoom}, clean ${clean}`)
        assert.deepEqual(strips.horizontal, [fill, edge, edge, fill], `horizontal border DPR ${ratio}, zoom ${zoom}, clean ${clean}`)
      }
    }
  }
  await metrics.send('Emulation.clearDeviceMetricsOverride')
  await metrics.detach()
  await page.locator('#actual-size').click()
  await page.screenshot({ path: resolve(output, 'cabinet-borders-100.png') })
  assert.deepEqual(await page.evaluate(() => ({ project: window.__ledmap.projectSnapshot(), document: window.__ledmap.document() })), session)
  await page.getByLabel('Screen cabinet lines', { exact: true }).click()
  const noBorder = await page.evaluate(value => {
    const canvas = document.querySelector('#project-canvas')
    const point = window.__ledmap.projectToPx({ x: value.x + value.cabinetWidth, y: value.y + value.cabinetHeight * 1.5 })
    return [...canvas.getContext('2d').getImageData(Math.round(point.x * window.devicePixelRatio), Math.round(point.y * window.devicePixelRatio), 1, 1).data]
  }, screen)
  assert.deepEqual(noBorder, fill)
  await page.getByLabel('Screen cabinet lines', { exact: true }).click()
  await page.locator('#export-mode').click()
  await page.locator('#export-png-pattern').selectOption('composition-chart')
  await page.locator('#export-png-scope').selectOption('composition')
  await runExport(page, '#export-png-run', 'Exported 1 PNG')
  const png = await readFile(resolve(exportDirectory, 'screen-drawings.png'))
  const exported = await page.evaluate(async data => {
    const image = new Image()
    image.src = `data:image/png;base64,${data}`
    await image.decode()
    const canvas = document.createElement('canvas')
    canvas.width = image.width; canvas.height = image.height
    const ctx = canvas.getContext('2d')
    ctx.drawImage(image, 0, 0)
    const pixels = bytes => Array.from({ length: bytes.length / 4 }, (_, index) => [...bytes.slice(index * 4, index * 4 + 4)])
    return { vertical: pixels(ctx.getImageData(126, 192, 4, 1).data),
      horizontal: pixels(ctx.getImageData(192, 126, 1, 4).data), outer: pixels(ctx.getImageData(0, 192, 3, 1).data) }
  }, png.toString('base64'))
  assert.deepEqual(exported.vertical, [fill, white, white, fill])
  assert.deepEqual(exported.horizontal, [fill, white, white, fill])
  assert.deepEqual(exported.outer, [white, fill, fill])
  await page.locator('#export-svg-run').click()
  await page.waitForFunction(() => window.__ledmapExport.dump().lastResult.includes('Exported 1 SVG'))
  const svg = await readFile(resolve(exportDirectory, 'screen-drawings.svg'), 'utf8')
  const borders = await page.evaluate(text => {
    const svg = new DOMParser().parseFromString(text, 'image/svg+xml')
    return [...svg.querySelectorAll('rect[fill="#ffffff"]')].map(rect => ({ x: Number(rect.getAttribute('x')),
      y: Number(rect.getAttribute('y')), width: Number(rect.getAttribute('width')), height: Number(rect.getAttribute('height')),
      filter: rect.getAttribute('filter') }))
  }, svg)
  const covering = x => borders.filter(rect => rect.x <= x && rect.x + rect.width > x && rect.y <= 192 && rect.y + rect.height > 192)
  assert.equal(covering(127).length, 1)
  assert.equal(covering(128).length, 1)
  assert.equal(covering(126).length, 0)
  assert.equal(borders.some(rect => rect.filter !== null), false)
  console.log('Cabinet borders passed: exactly two solid pixels at every seam, zoom 47/50/100/200%, DPR 1/2, editor and Clean View, PNG/SVG.')
}
