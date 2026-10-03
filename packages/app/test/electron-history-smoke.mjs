import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { _electron as electron } from 'playwright'

const appRoot = resolve(fileURLToPath(new URL('../', import.meta.url)))
const output = fileURLToPath(new URL('../out/history-smoke/', import.meta.url))
const fixture = fileURLToPath(new URL('../../core/test/serialization/fixtures/full-v3.ledmap', import.meta.url))
const projectPath = resolve(output, 'history.ledmap')
await mkdir(output, { recursive: true })
const userData = await mkdtemp(resolve(output, 'user-data-'))
const source = JSON.parse(await readFile(fixture, 'utf8'))
source.project.design.composition.placements[0] = { screenId: 'screen-a', x: 0, y: 0, locked: false }
await writeFile(projectPath, JSON.stringify(source))

const env = {
  ...process.env,
  LEDMAP_SMOKE_PROJECT_PATH: projectPath,
  LEDMAP_SMOKE_USER_DATA: userData,
  LEDMAP_SMOKE_UNSAVED_ACTION: 'discard',
  LEDMAP_SMOKE_SIMULATED_DISPLAYS: '1',
}
delete env['ELECTRON_RUN_AS_NODE']
delete env['ELECTRON_RENDERER_URL']

const errors = []
const app = await electron.launch({ args: [appRoot], env })
try {
  const page = await app.firstWindow()
  page.on('pageerror', error => errors.push(error.message))
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()) })
  await page.waitForFunction(() => window.__ledmap !== undefined)
  await page.locator('#open-project').click()
  await page.waitForFunction(() => window.__ledmap.dump()[0]?.id === 'screen-a')
  const state = () => page.evaluate(() => ({
    screen: window.__ledmap.dump()[0],
    document: window.__ledmap.document(),
  }))
  assert.equal((await state()).screen.x, 0)
  assert.equal(await page.locator('#undo-project').isDisabled(), true)
  await page.locator('#project-tree [role="treeitem"]').filter({ hasText: 'Screen A' }).click()
  const xInput = page.locator('input[aria-label="Screen X position"]')
  await xInput.fill('1')
  await xInput.blur()
  assert.equal((await state()).screen.x, 1)
  assert.equal(await page.locator('#undo-project').isEnabled(), true)
  await page.locator('#undo-project').click()
  assert.equal((await state()).screen.x, 0)
  await page.locator('#redo-project').click()
  assert.equal((await state()).screen.x, 1)

  const revisionBeforeNative = (await state()).document.revision
  const inputShortcut = await xInput.evaluate(element => {
    element.focus()
    const event = new KeyboardEvent('keydown', { key: 'z', ctrlKey: true, bubbles: true, cancelable: true })
    element.dispatchEvent(event)
    return event.defaultPrevented
  })
  assert.equal(inputShortcut, false)
  const compositionShortcut = await page.evaluate(() => {
    const event = new KeyboardEvent('keydown', { key: 'z', ctrlKey: true, isComposing: true, bubbles: true, cancelable: true })
    window.dispatchEvent(event)
    return event.defaultPrevented
  })
  assert.equal(compositionShortcut, false)
  assert.equal((await state()).document.revision, revisionBeforeNative)

  await page.locator('#project-tree [role="treeitem"]').filter({ hasText: 'Screen A' }).click()
  await page.evaluate(() => {
    for (let index = 0; index < 3; index++) window.dispatchEvent(new KeyboardEvent('keydown', {
      key: 'ArrowRight', bubbles: true, cancelable: true, repeat: index > 0,
    }))
    window.dispatchEvent(new KeyboardEvent('keyup', { key: 'ArrowRight', bubbles: true }))
  })
  assert.equal((await state()).screen.x, 4)
  await page.locator('#undo-project').click()
  assert.equal((await state()).screen.x, 1)
  await page.locator('#redo-project').click()
  assert.equal((await state()).screen.x, 4)
  await page.locator('#undo-project').click()
  assert.equal((await state()).screen.x, 1)
  await page.keyboard.press('Control+z')
  assert.equal((await state()).screen.x, 0)
  await page.keyboard.press('Control+Shift+z')
  assert.equal((await state()).screen.x, 1)
  await page.keyboard.press('Control+z')
  await page.keyboard.press('Control+y')
  assert.equal((await state()).screen.x, 1)

  await page.locator('#test-mode').click()
  await page.locator('[data-test-pattern="white"]').click()
  await page.locator('#live-output-open').click()
  await page.waitForFunction(() => window.__ledmapLiveOutput.dump().displays.length === 2)
  const outputCard = page.locator('[data-output-id="output-1"]')
  await outputCard.locator('select[aria-label="output-1 Windows Display"]').selectOption('sim-display-2')
  const outputWindow = app.waitForEvent('window')
  await outputCard.getByRole('button', { name: 'Start', exact: true }).click()
  const outputPage = await outputWindow
  outputPage.on('pageerror', error => errors.push(error.message))
  await outputPage.waitForFunction(() => window.__ledmapOutput?.dump()?.pattern === 'white')
  await page.locator('#live-output-close').click()
  const raster = () => outputPage.evaluate(() => document.querySelector('canvas').toDataURL())
  const atOne = await raster()
  await page.locator('#undo-project').click()
  await outputPage.waitForFunction(() => window.__ledmapOutput.dump().revision >= 2)
  const atZero = await raster()
  assert.notEqual(atOne, atZero)
  await page.locator('#redo-project').click()
  await outputPage.waitForFunction(() => window.__ledmapOutput.dump().revision >= 3)
  assert.equal(await raster(), atOne)

  for (let index = 0; index < 8; index++) {
    await page.locator('#undo-project').click()
    await page.locator('#redo-project').click()
  }
  await page.locator('#undo-project').click()
  await outputPage.waitForTimeout(400)
  assert.equal((await state()).screen.x, 0)
  assert.equal(await raster(), atZero)
  await page.locator('#redo-project').click()
  await outputPage.waitForTimeout(400)
  assert.equal((await state()).screen.x, 1)
  assert.equal(await raster(), atOne)

  await page.locator('#save-project').click()
  await page.waitForFunction(() => !window.__ledmap.document().dirty)
  const saved = JSON.parse(await readFile(projectPath, 'utf8'))
  assert.equal(saved.schemaVersion, 3)
  assert.equal(saved.project.design.composition.placements[0].x, 1)
  await page.locator('#undo-project').click()
  assert.equal((await state()).document.dirty, true)
  await page.locator('#redo-project').click()
  assert.equal((await state()).document.dirty, false)
  assert.deepEqual(errors, [])
  console.log('History smoke: active-Live and Save assertions passed; closing output.')
  await page.locator('#live-output-open').click()
  const outputClose = outputPage.waitForEvent('close')
  await page.locator('[data-output-id="output-1"]').getByRole('button', { name: 'Stop', exact: true }).click()
  await outputClose
  await page.locator('#live-output-close').click()
  console.log('History smoke: output stopped; requesting clean editor close.')
  await app.evaluate(({ BrowserWindow }) => {
    setTimeout(() => BrowserWindow.getAllWindows()[0]?.close(), 0)
    return true
  })
  await Promise.race([page.waitForEvent('close'), new Promise(resolvePromise => setTimeout(resolvePromise, 3_000))])
  assert.equal(page.isClosed(), true, page.isClosed() ? '' : await page.locator('#document-error').innerText())
  console.log('History smoke: clean editor close passed.')
  const windows = await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().map(window => window.getTitle()))
  assert.deepEqual(windows, [])
  console.log('Electron HISTORY-1 Undo/Redo, grouping, native shortcuts, Save identity, and active-Live final-frame smoke passed.')
} finally {
  const child = app.process()
  if (child.exitCode === null) {
    if (process.platform === 'win32' && child.pid) {
      try { execFileSync('taskkill', ['/PID', String(child.pid), '/T', '/F'], { stdio: 'ignore' }) }
      catch { child.kill() }
    } else child.kill()
  }
}
