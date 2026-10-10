import assert from 'node:assert/strict'
import { mkdir, mkdtemp, rm } from 'node:fs/promises'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { _electron as electron } from 'playwright'

process.on('uncaughtException', error => {
  console.error(error)
  process.exit(1)
})
process.on('unhandledRejection', error => {
  console.error(error)
  process.exit(1)
})

const appRoot = resolve(fileURLToPath(new URL('../', import.meta.url)))
const output = fileURLToPath(new URL('../out/smoke/', import.meta.url))
const projectPath = resolve(output, '3d-lifecycle.ledmap')
await mkdir(output, { recursive: true })
const smokeUserData = await mkdtemp(resolve(output, 'user-data-3d-'))
await rm(projectPath, { force: true })

const env = {
  ...process.env,
  LEDMAP_SMOKE_PROJECT_PATH: projectPath,
  LEDMAP_SMOKE_SAVE_AS_PATH: projectPath,
  LEDMAP_SMOKE_USER_DATA: smokeUserData,
  LEDMAP_SMOKE_UNSAVED_ACTION: 'discard',
  LEDMAP_SMOKE_SIMULATED_DISPLAYS: '1',
  LEDMAP_SMOKE_UPGRADE_ACTION: 'upgrade',
}
delete env['ELECTRON_RUN_AS_NODE']
delete env['ELECTRON_RENDERER_URL']
const failures = []

async function launch() {
  const app = await electron.launch({ args: [appRoot, '--no-sandbox', '--disable-gpu'], env })
  const page = await app.firstWindow()
  page.on('pageerror', error => failures.push(`pageerror: ${error.message}`))
  page.on('console', message => { if (message.type() === 'error') failures.push(`console: ${message.text()}`) })
  await page.waitForLoadState('domcontentloaded')
  await page.waitForFunction(() => window.__ledmap !== undefined, null, { timeout: 60000 })
  return { app, page }
}

async function close(application) {
  const child = application.process()
  if (application.windows().length > 0) {
    const requestExit = application.evaluate(({ app }) => {
      setTimeout(() => app.exit(0), 0)
      return true
    }).catch(() => false)
    await Promise.race([
      requestExit,
      new Promise(resolvePromise => setTimeout(resolvePromise, 500)),
    ])
  }
  const deadline = Date.now() + 3000
  while (child.exitCode === null && Date.now() < deadline) {
    await new Promise(resolvePromise => setTimeout(resolvePromise, 25))
  }
  if (child.exitCode === null) child.kill()
}

const dump = page => page.evaluate(() => window.__ledmap.dump())
const sessionState = page => page.evaluate(() => ({
  project: window.__ledmap.projectSnapshot(),
  document: window.__ledmap.document(),
}))
const selectedIds = page => page.evaluate(() => window.__ledmap.selectedScreens())

async function addScreen(page) {
  const before = (await dump(page)).length
  await page.locator('#add-screen').click()
  await page.locator('#screen-dialog').waitFor({ state: 'visible' })
  await page.locator('#new-screen-geometry-mode').selectOption('advanced')
  await page.locator('#new-screen-module-columns').fill('4')
  await page.locator('#new-screen-module-rows').fill('4')
  await page.locator('#new-screen-module-width').fill('32')
  await page.locator('#new-screen-module-height').fill('32')
  await page.locator('#screen-form button[type="submit"]').click()
  await page.waitForFunction(count => window.__ledmap.dump().length === count + 1, before)
}

async function setScreenPosition(page, screenName, x, y) {
  await page.locator('#project-tree [role="treeitem"]').filter({ hasText: screenName }).click()
  const xInput = page.locator('input[aria-label="Screen X position"]')
  const yInput = page.locator('input[aria-label="Screen Y position"]')
  await xInput.fill(String(x))
  await xInput.blur()
  await yInput.fill(String(y))
  await yInput.blur()
}

async function canvasColorCount(page) {
  return page.evaluate(() => {
    const canvas = document.getElementById('stage3d-canvas')
    const data = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height).data
    const colors = new Set()
    for (let i = 0; i < data.length; i += 16384) {
      colors.add((data[i] << 16) | (data[i + 1] << 8) | data[i + 2])
      if (colors.size > 12) break
    }
    return { width: canvas.width, height: canvas.height, colors: colors.size }
  })
}

async function canvasCenter(page) {
  const box = await page.locator('#stage3d-canvas').boundingBox()
  assert.ok(box.width > 200 && box.height > 200)
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 }
}

async function orbit(page, center, dx, dy) {
  await page.mouse.move(center.x, center.y)
  await page.mouse.down()
  await page.mouse.move(center.x + dx, center.y + dy, { steps: 8 })
  await page.mouse.up()
}

const { app, page } = await launch()
try {
  assert.equal(await page.locator('#stage3d-toggle').count(), 1)
  assert.equal(await page.locator('#stage3d-toggle').isVisible(), true)
  assert.equal(await page.locator('#stage3d-fit').isHidden(), true)

  await page.locator('#new-project').click()
  await page.waitForFunction(() => window.__ledmap.dump().length === 0)
  await page.locator('#stage3d-toggle').click()
  await page.waitForFunction(() => document.getElementById('stage3d-toggle').textContent === '2D View')
  assert.equal(await page.locator('#empty').isVisible(), true)
  assert.equal(await page.locator('#project-canvas').isHidden(), true)
  assert.equal(await page.locator('#stage3d-canvas').isHidden(), true)
  await page.screenshot({ path: resolve(output, '3d-empty.png') })
  await page.locator('#stage3d-toggle').click()
  await page.waitForFunction(() => document.getElementById('stage3d-toggle').textContent === '3D View')

  await addScreen(page)
  assert.equal((await dump(page)).length, 1)
  await page.locator('#stage3d-toggle').click()
  await page.waitForFunction(() => document.getElementById('stage3d-canvas').hidden === false)
  assert.equal(await page.locator('#canvas-title').innerText(), '3D Composition · 1 Screens')
  assert.equal(await page.locator('#canvas-note').innerText(), '3D geometry preview · cabinet depth is illustrative')
  const rendered = await canvasColorCount(page)
  assert.ok(rendered.width > 0 && rendered.height > 0)
  assert.ok(rendered.colors > 4, `expected rendered 3D pixels, got ${rendered.colors} colors`)
  await page.screenshot({ path: resolve(output, '3d-single.png') })

  const center = await canvasCenter(page)
  await page.mouse.click(center.x, center.y)
  await page.waitForFunction(() => window.__ledmap.selectedScreens().length === 1)
  assert.equal(await page.locator('#selection-chip').innerText(), '1 Screen selected')
  assert.equal(await page.locator('#properties-title').innerText(), 'Screen')
  assert.equal((await selectedIds(page))[0], (await dump(page))[0].id)
  await page.screenshot({ path: resolve(output, '3d-single-selected.png') })

  const beforeCameraOps = await sessionState(page)
  const undoBeforeCameraOps = await page.locator('#undo-project').isDisabled()
  const shotInitial = await page.locator('#stage3d-canvas').screenshot()
  await orbit(page, center, 140, 60)
  const shotOrbited = await page.locator('#stage3d-canvas').screenshot()
  assert.ok(!shotInitial.equals(shotOrbited), 'orbit must change the rendered image')
  await page.mouse.move(center.x, center.y)
  await page.mouse.wheel(0, -480)
  await page.locator('#stage3d-fit').click()
  const shotReset = await page.locator('#stage3d-canvas').screenshot()
  assert.ok(shotInitial.equals(shotReset), 'Reset 3D must restore the initial camera image')
  await page.locator('#stage3d-toggle').click()
  await page.waitForFunction(() => document.getElementById('project-canvas').hidden === false)
  assert.deepEqual(await sessionState(page), beforeCameraOps)
  assert.equal(await page.locator('#undo-project').isDisabled(), undoBeforeCameraOps)

  await page.locator('#project-tree [role="treeitem"]').filter({ hasText: 'Screen 1' }).click()
  await page.locator('#edit-cabinet-cells').click()
  const first = (await dump(page))[0]
  const cellPoint = async (column, row) => page.evaluate(([screen, c, r]) => window.__ledmap.projectToPx({
    x: screen.x + screen.cabinetWidth * (c + 0.5), y: screen.y + screen.cabinetHeight * (r + 0.5),
  }), [first, column, row])
  const canvasBox = await page.locator('#project-canvas').boundingBox()
  const cellA = await cellPoint(1, 0)
  const cellB = await cellPoint(2, 0)
  await page.mouse.click(canvasBox.x + cellA.x, canvasBox.y + cellA.y)
  await page.mouse.click(canvasBox.x + cellB.x, canvasBox.y + cellB.y)
  await page.locator('#remove-cabinet-cells').click()
  await page.waitForFunction(() => window.__ledmap.dump()[0].cabinets.length === 10)
  await page.locator('#stage3d-toggle').click()
  await page.waitForFunction(() => document.getElementById('stage3d-canvas').hidden === false)
  const sparseRendered = await canvasColorCount(page)
  assert.ok(sparseRendered.colors > 4)
  await page.screenshot({ path: resolve(output, '3d-sparse.png') })
  await page.locator('#undo-project').click()
  await page.waitForFunction(() => window.__ledmap.dump()[0].cabinets.length === 12)
  await page.locator('#stage3d-toggle').click()
  await page.waitForFunction(() => document.getElementById('project-canvas').hidden === false)

  await addScreen(page)
  assert.equal((await dump(page)).length, 2)
  await setScreenPosition(page, 'Screen 2', 50, 30)
  await page.locator('#stage3d-toggle').click()
  await page.waitForFunction(() => document.getElementById('stage3d-canvas').hidden === false)
  assert.equal(await page.locator('#canvas-title').innerText(), '3D Composition · 2 Screens')
  const overlapCenter = await canvasCenter(page)
  await page.mouse.click(overlapCenter.x, overlapCenter.y)
  await page.waitForFunction(() => window.__ledmap.selectedScreens().length === 1)
  const picked = await selectedIds(page)
  const screens = await dump(page)
  assert.equal(picked[0], screens[1].id)
  assert.equal(await page.locator('#properties-title').innerText(), 'Screen')
  await page.screenshot({ path: resolve(output, '3d-multi.png') })
  await page.locator('#stage3d-toggle').click()
  await page.waitForFunction(() => document.getElementById('project-canvas').hidden === false)

  await page.locator('#save-project-as').click()
  await page.waitForFunction(() => window.__ledmap.document().dirty === false)
  await page.locator('#new-project').click()
  await page.waitForFunction(() => window.__ledmap.dump().length === 0)
  await page.locator('#stage3d-toggle').click()
  await page.waitForFunction(() => document.getElementById('stage3d-toggle').textContent === '2D View')
  assert.equal(await page.locator('#empty').isVisible(), true)
  assert.equal(await page.locator('#project-canvas').isHidden(), true)
  assert.equal(await page.locator('#stage3d-canvas').isHidden(), true)
  await page.screenshot({ path: resolve(output, '3d-empty-reload.png') })
  await page.locator('#open-project').click()
  await page.waitForFunction(() => window.__ledmap.document().dirty === false && window.__ledmap.dump().length === 2)
  assert.equal((await dump(page))[0].cabinets.length, 12)
  assert.equal(await page.locator('#stage3d-canvas').isVisible(), true)

  const overlapAgain = await canvasCenter(page)
  await page.mouse.click(overlapAgain.x, overlapAgain.y)
  await page.waitForFunction(() => window.__ledmap.selectedScreens().length === 1)
  const victim = (await selectedIds(page))[0]
  assert.equal(await page.locator('#delete-screen').isDisabled(), false)
  await page.locator('#delete-screen').click()
  await page.waitForFunction(() => window.__ledmap.dump().length === 1)
  assert.ok(!(await dump(page)).some(screen => screen.id === victim))
  assert.equal(await page.locator('#selection-chip').innerText(), 'No selection')
  assert.equal(await page.locator('#stage3d-canvas').isVisible(), true)
  await page.locator('#undo-project').click()
  await page.waitForFunction(() => window.__ledmap.dump().length === 2)
  await page.locator('#redo-project').click()
  await page.waitForFunction(() => window.__ledmap.dump().length === 1)
  await page.locator('#undo-project').click()
  await page.waitForFunction(() => window.__ledmap.dump().length === 2)
  await page.screenshot({ path: resolve(output, '3d-lifecycle.png') })

  assert.deepEqual(failures, [])
  console.log('Stage 3D smoke passed: toggle, render, overlap pick, sparse, save/load, delete/undo/redo, camera purity.')
} finally {
  await close(app)
}
