import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'

export async function verifyCabinetBorders(page, { output, exportDirectory, addScreen, runExport }) {
  await page.locator('#new-project').click()
  await page.locator('#layout-mode').click()
  await addScreen(page)
  await page.locator('#screen-drawing-labels').selectOption('none')
  await page.locator('#screen-drawing-name').click()
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
  await toggle('#clean-view', false)
  await page.screenshot({ path: resolve(output, 'cabinet-borders-100.png') })
  assert.deepEqual(await page.evaluate(() => ({ project: window.__ledmap.projectSnapshot(), document: window.__ledmap.document() })), session)
  await page.getByLabel('Screen cabinet lines', { exact: true }).click()
  assert.equal(await page.locator('#screen-drawing-cabinet-line-color').count(), 0)
  const noBorder = await page.evaluate(value => {
    const canvas = document.querySelector('#project-canvas')
    const point = window.__ledmap.projectToPx({ x: value.x + value.cabinetWidth, y: value.y + value.cabinetHeight * 1.5 })
    return [...canvas.getContext('2d').getImageData(Math.round(point.x * window.devicePixelRatio), Math.round(point.y * window.devicePixelRatio), 1, 1).data]
  }, screen)
  assert.deepEqual(noBorder, fill, 'Inspector hides lines in normal Composition view')
  await toggle('#clean-view', true)
  const cleanNoBorder = await page.evaluate(value => {
    const canvas = document.querySelector('#project-canvas')
    const point = window.__ledmap.projectToPx({ x: value.x + value.cabinetWidth, y: value.y + value.cabinetHeight * 1.5 })
    return [...canvas.getContext('2d').getImageData(Math.round(point.x * window.devicePixelRatio), Math.round(point.y * window.devicePixelRatio), 1, 1).data]
  }, screen)
  assert.deepEqual(cleanNoBorder, fill, 'Inspector hides lines in Clean View')
  await toggle('#clean-view', false)
  await page.getByLabel('Screen cabinet lines', { exact: true }).click()
  assert.equal(await page.locator('#screen-drawing-cabinet-line-color').count(), 1)
  await toggle('[data-overlay="cabinets"]', false)
  const toolbarNoBorder = await page.evaluate(value => {
    const canvas = document.querySelector('#project-canvas')
    const point = window.__ledmap.projectToPx({ x: value.x + value.cabinetWidth, y: value.y + value.cabinetHeight * 1.5 })
    return [...canvas.getContext('2d').getImageData(Math.round(point.x * window.devicePixelRatio), Math.round(point.y * window.devicePixelRatio), 1, 1).data]
  }, screen)
  assert.deepEqual(toolbarNoBorder, fill, 'Cabinets toolbar hides viewport lines')
  await toggle('[data-overlay="cabinets"]', true)
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
  await page.locator('#layout-mode').click()
  await page.locator('#project-tree [data-id="screen-1"]').click()
  const chosenColor = '#dc517b'
  await page.locator('#screen-drawing-cabinet-line-color').fill(chosenColor)
  const chosenEdge = [220, 81, 123, 255]
  const viewportEdge = () => page.evaluate(value => {
    const canvas = document.querySelector('#project-canvas')
    const point = window.__ledmap.projectToPx({ x: value.x + value.cabinetWidth, y: value.y + value.cabinetHeight * 1.5 })
    return [...canvas.getContext('2d').getImageData(Math.round(point.x * window.devicePixelRatio),
      Math.round(point.y * window.devicePixelRatio), 1, 1).data]
  }, screen)
  assert.deepEqual(await viewportEdge(), chosenEdge, 'Chosen Cabinet line color appears in Composition')
  await toggle('#clean-view', true)
  assert.deepEqual(await viewportEdge(), chosenEdge, 'Chosen Cabinet line color appears in Clean View')
  await toggle('#clean-view', false)
  await page.locator('#export-mode').click()
  await runExport(page, '#export-png-run', 'Exported 1 PNG')
  const chosenPng = await readFile(resolve(exportDirectory, 'screen-drawings.png'))
  const pngEdge = await page.evaluate(async data => {
    const image = new Image()
    image.src = `data:image/png;base64,${data}`
    await image.decode()
    const canvas = document.createElement('canvas')
    canvas.width = image.width; canvas.height = image.height
    const ctx = canvas.getContext('2d')
    ctx.drawImage(image, 0, 0)
    return [...ctx.getImageData(128, 192, 1, 1).data]
  }, chosenPng.toString('base64'))
  assert.deepEqual(pngEdge, chosenEdge, 'Chosen Cabinet line color appears in PNG')
  await runExport(page, '#export-svg-run', 'Exported 1 SVG')
  const chosenSvg = await readFile(resolve(exportDirectory, 'screen-drawings.svg'), 'utf8')
  assert.match(chosenSvg, /x="128" y="0" width="1" height="128" fill="#dc517b"/)
  await page.locator('#layout-mode').click()
  await page.locator('#project-tree [data-id="' + screen.id + '"]').click()
  await page.locator('#screen-drawing-palette').selectOption('checkerboard')
  for (const [index, color] of ['#ff0000', '#00ff00'].entries()) {
    await page.locator('#screen-drawing-checkerColors-' + index).fill(color)
    await page.locator('#screen-drawing-checkerColors-' + index).blur()
  }
  const cabinetLines = page.getByLabel('Screen cabinet lines', { exact: true })
  if (await cabinetLines.getAttribute('aria-pressed') === 'true') await cabinetLines.click()
  const textShadow = page.getByLabel('Screen text shadow', { exact: true })
  if (await textShadow.getAttribute('aria-pressed') === 'false') await textShadow.click()
  const seamMetrics = await page.context().newCDPSession(page)
  try {
    await seamMetrics.send('Emulation.setDeviceMetricsOverride', { width: 1583, height: 849, deviceScaleFactor: 1.25, mobile: false })
    await page.waitForFunction(() => {
      const canvas = document.querySelector('#project-canvas')
      return Math.abs(window.devicePixelRatio - 1.25) < 1e-6 &&
        canvas.width === Math.round(canvas.getBoundingClientRect().width * window.devicePixelRatio)
    })
    const zoomAnchor = await page.evaluate(value => {
      const canvas = document.querySelector('#project-canvas')
      const rect = canvas.getBoundingClientRect()
      const point = window.__ledmap.projectToPx(value)
      return { zoom: window.__ledmap.camera().zoom, x: rect.x + point.x, y: rect.y + point.y }
    }, { x: screen.x + screen.cabinetWidth, y: screen.y + screen.cabinetHeight / 2 })
    await page.evaluate(anchor => document.querySelector('#project-canvas').dispatchEvent(new WheelEvent('wheel', {
      bubbles: true, cancelable: true, ctrlKey: true, clientX: anchor.x, clientY: anchor.y,
      deltaY: -Math.log(8 / anchor.zoom) / .0015,
    })), zoomAnchor)
    await page.waitForFunction(() => Math.abs(window.__ledmap.camera().zoom - 8) < 1e-9)
    const verifySeam = async (axis, world) => {
      await page.evaluate(point => {
        const canvas = document.querySelector('#project-canvas')
        const rect = canvas.getBoundingClientRect()
        const dpr = window.devicePixelRatio
        const current = window.__ledmap.projectToPx(point)
        const targetX = (Math.floor(rect.width * dpr / 2) + .37) / dpr
        const targetY = (Math.floor(rect.height * dpr / 2) + .43) / dpr
        canvas.dispatchEvent(new WheelEvent('wheel', { bubbles: true, cancelable: true,
          deltaX: current.x - targetX, deltaY: current.y - targetY }))
      }, world)
      const screenshot = await page.locator('#project-canvas').screenshot({ path: resolve(output, 'checkerboard-seam-' + axis + '.png') })
      const visibleColors = await page.evaluate(async ({ point, data }) => {
        const canvas = document.querySelector('#project-canvas')
        const rect = canvas.getBoundingClientRect()
        const seam = window.__ledmap.projectToPx(point)
        const image = new Image()
        image.src = 'data:image/png;base64,' + data
        await image.decode()
        const sample = document.createElement('canvas')
        sample.width = image.width
        sample.height = image.height
        const context = sample.getContext('2d')
        context.drawImage(image, 0, 0)
        const x = Math.round(seam.x * image.width / rect.width)
        const y = Math.round(seam.y * image.height / rect.height)
        const pixels = context.getImageData(x - 6, y - 6, 13, 13).data
        return [...new Set(Array.from({ length: 169 }, (_, index) =>
          [...pixels.slice(index * 4, index * 4 + 4)].join(',')))].sort()
      }, { point: world, data: screenshot.toString('base64') })
      assert.deepEqual(visibleColors, ['0,255,0,255', '255,0,0,255'], axis + ' seam stays pure in the displayed window')
      const strip = await page.evaluate(({ point, axis }) => {
        const canvas = document.querySelector('#project-canvas')
        const ctx = canvas.getContext('2d')
        const dpr = window.devicePixelRatio
        const seam = window.__ledmap.projectToPx(point)
        const x = Math.round(seam.x * dpr)
        const y = Math.round(seam.y * dpr)
        const bytes = axis === 'vertical' ? ctx.getImageData(x - 3, y, 7, 1).data : ctx.getImageData(x, y - 3, 1, 7).data
        return { fractional: (axis === 'vertical' ? seam.x : seam.y) * dpr,
          colors: Array.from({ length: 7 }, (_, index) => [...bytes.slice(index * 4, index * 4 + 4)].join(',')) }
      }, { point: world, axis })
      assert.ok(Math.abs(strip.fractional - Math.round(strip.fractional)) > .1, axis + ' seam is subpixel')
      assert.deepEqual([...new Set(strip.colors)].sort(), ['0,255,0,255', '255,0,0,255'], axis + ' seam has no dark fringe')
      assert.equal(strip.colors.slice(1).filter((color, index) => color !== strip.colors[index]).length, 1)
    }
    await verifySeam('vertical', { x: screen.x + screen.cabinetWidth, y: screen.y + screen.cabinetHeight / 8 })
    await verifySeam('horizontal', { x: screen.x + screen.cabinetWidth / 2, y: screen.y + screen.cabinetHeight })
  } finally {
    await seamMetrics.send('Emulation.clearDeviceMetricsOverride')
    await seamMetrics.detach()
  }
  await page.locator('#layout-mode').click()
  await page.locator('#project-tree [data-id="' + screen.id + '"]').click()
  await page.locator('#screen-drawing-labels').selectOption('coordinates')
  const guideDetails = page.locator('details.property-disclosure').filter({ has: page.locator('#screen-guide-diagonals') })
  if (await guideDetails.getAttribute('open') === null) await guideDetails.locator('summary').click()
  await page.locator('#screen-guide-diagonals').click()
  await page.locator('#screen-guide-centralCircle').click()
  await page.locator('#screen-guide-outerBorder').click()
  await page.getByLabel('Screen cabinet lines', { exact: true }).click()
  await page.locator('#export-mode').click()
  await runExport(page, '#export-png-run', 'Exported 1 PNG')
  const crispPng = await readFile(resolve(exportDirectory, 'screen-drawings.png'))
  const crispPixels = await page.evaluate(async data => {
    const image = new Image()
    image.src = `data:image/png;base64,${data}`
    await image.decode()
    const canvas = document.createElement('canvas')
    canvas.width = image.width
    canvas.height = image.height
    const ctx = canvas.getContext('2d')
    ctx.drawImage(image, 0, 0)
    const bytes = ctx.getImageData(0, 0, image.width, image.height).data
    const colors = new Set()
    for (let index = 0; index < bytes.length; index += 4) {
      colors.add(`${bytes[index]},${bytes[index + 1]},${bytes[index + 2]},${bytes[index + 3]}`)
    }
    const seam = Array.from({ length: 4 }, (_, index) =>
      [...ctx.getImageData(126 + index, 192, 1, 1).data])
    return { width: image.width, height: image.height, colors: [...colors].sort(), seam }
  }, crispPng.toString('base64'))
  assert.deepEqual([crispPixels.width, crispPixels.height], [screen.width, screen.height])
  assert.deepEqual(crispPixels.colors, ['0,255,0,255', '220,81,123,255', '255,0,0,255', '255,255,255,255'])
  assert.deepEqual(crispPixels.seam, [[0, 255, 0, 255], chosenEdge, chosenEdge, [255, 0, 0, 255]])
  console.log('Checkerboard seams passed: pure adjacent colors at 800% zoom and DPR 1.25 with Cabinet lines OFF.')
  console.log('Cabinet borders passed: exactly two solid pixels at every seam, zoom 47/50/100/200%, DPR 1/2, editor and Clean View, PNG/SVG.')
  console.log('PNG pixel-perfect export passed: guides, labels, text shadow and Cabinet borders use only pure palette colors.')
}
