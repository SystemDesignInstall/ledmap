import assert from 'node:assert/strict'
import { resolve } from 'node:path'

export async function verifyCabinetLabelOverlays(page, { output, addScreen, setScreenPosition }) {
  await page.locator('#new-project').click()
  await page.locator('#layout-mode').click()
  const toggle = async (selector, value) => {
    if (await page.locator(selector).getAttribute('aria-pressed') !== String(value)) await page.locator(selector).click()
  }
  await toggle('#clean-view', false)
  await toggle('[data-overlay="cabinets"]', true)
  await toggle('[data-overlay="modules"]', false)
  await toggle('[data-overlay="editorLabels"]', false)
  await addScreen(page)
  await page.locator('#screen-drawing-labels').selectOption('cabinet')
  await page.locator('#screen-drawing-name').click()
  await addScreen(page)
  await setScreenPosition(page, 'Screen 2', 640, 0)
  await page.locator('#screen-drawing-labels').selectOption('none')
  await page.locator('#screen-drawing-name').click()
  const screens = await page.evaluate(() => window.__ledmap.dump())
  await page.locator('#project-tree [role="treeitem"]').filter({ hasText: 'Screen 1' }).click()
  await page.evaluate(() => {
    const proto = CanvasRenderingContext2D.prototype
    for (const method of ['fillText', 'strokeText']) {
      const original = proto[method]
      proto[method] = function (text, x, y, ...rest) {
        window.__cabinetLabelDraws.push({ method, text, x, y, font: this.font })
        return original.call(this, text, x, y, ...rest)
      }
    }
    window.__cabinetLabelDraws = []
  })
  const renderLabels = async (zoom, clean) => {
    await toggle('#clean-view', clean)
    return page.evaluate(({ zoom, screens }) => {
      window.__cabinetLabelDraws = []
      const canvas = document.querySelector('#project-canvas')
      canvas.dispatchEvent(new WheelEvent('wheel', { bubbles: true, cancelable: true, ctrlKey: true,
        deltaY: -Math.log(zoom / window.__ledmap.camera().zoom) / 0.0015 }))
      return screens.map(screen => screen.cabinets.map(cabinet => {
        const point = window.__ledmap.projectToPx({
          x: screen.x + (cabinet.column + 0.5) * screen.cabinetWidth,
          y: screen.y + (cabinet.row + 0.5) * screen.cabinetHeight,
        })
        return window.__cabinetLabelDraws.filter(draw => Math.abs(draw.x - point.x) < 1e-6 && Math.abs(draw.y - point.y) < 1e-6)
      }))
    }, { zoom, screens })
  }
  const defaultLabels = await renderLabels(1, false)
  assert.ok(defaultLabels[1].every(draws => draws.length === 0), 'Labels=None hides editor IDs by default')
  await toggle('[data-overlay="editorLabels"]', true)
  assert.ok((await page.evaluate(() => window.__cabinetLabelDraws)).some(draw => String(draw.text).startsWith('Screen 1')), 'Editor tags are opt-in')
  for (const labels of ['cabinet', 'cabinet-id', 'coordinates', 'grid-address']) {
    await page.locator('#screen-drawing-labels').selectOption(labels)
    const session = await page.evaluate(() => ({ project: window.__ledmap.projectSnapshot(), document: window.__ledmap.document() }))
    for (const zoom of [0.47, 1, 2.07, 8]) {
      for (const clean of [false, true]) {
        const draws = await renderLabels(zoom, clean)
        for (const cabinet of draws[0]) {
          const fills = cabinet.filter(draw => draw.method === 'fillText')
          assert.ok(fills.length <= 1, `${labels}, zoom ${zoom}, clean ${clean}: no duplicate label`)
          if (labels !== 'cabinet-id' || zoom >= 2.07) assert.equal(fills.length, 1, 'Readable label is visible')
          for (const draw of fills) assert.match(draw.font, /14px/, 'Constant viewport font')
          assert.equal(cabinet.filter(draw => draw.method === 'strokeText').length, 0, 'No small outlined overlay above drawing label')
        }
        for (const cabinet of draws[1]) {
          assert.equal(cabinet.filter(draw => draw.method === 'fillText').length, clean ? 0 : 1, 'Independent overlay on Screen with Labels=None')
          assert.equal(cabinet.filter(draw => draw.method === 'strokeText').length, 0, 'Editor ID has no outline or shadow')
          for (const draw of cabinet) assert.match(draw.font, /14px/, 'Overlay uses the same viewport font')
        }
      }
    }
    assert.deepEqual(await page.evaluate(() => ({ project: window.__ledmap.projectSnapshot(), document: window.__ledmap.document() })), session)
  }
  await page.locator('#screen-drawing-labels').selectOption('cabinet')
  await toggle('[data-overlay="cabinets"]', false)
  const withoutOverlay = await renderLabels(1, false)
  assert.ok(withoutOverlay[0].every(draws => draws.length === 1 && draws[0].method === 'fillText'))
  assert.ok(withoutOverlay[1].every(draws => draws.some(draw => draw.method === 'fillText')), 'Editor IDs are independent of Cabinet lines')
  await toggle('[data-overlay="editorLabels"]', false)
  const withoutEditorLabels = await renderLabels(1, false)
  assert.ok(withoutEditorLabels[1].every(draws => draws.length === 0), 'Editor IDs toggle hides fallback labels')
  assert.ok(withoutEditorLabels[0].every(draws => draws.some(draw => draw.method === 'fillText')), 'Drawing labels stay visible')
  const tiny = await renderLabels(0.1, false)
  assert.ok(tiny.flat().every(draws => draws.length === 0), 'Labels are hidden when cells cannot fit 14px text')
  await toggle('[data-overlay="cabinets"]', true)
  await toggle('#clean-view', false)
  await page.locator('#fit-project').click()
  await page.screenshot({ path: resolve(output, 'cabinet-labels-without-overlay.png') })
  console.log('Cabinet labels passed: one drawing label per cabinet, four label modes, zoom 47/100/207/800%, editor/Clean View, separate Drawing and editor overlays.')
}
