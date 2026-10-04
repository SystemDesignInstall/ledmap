import assert from 'node:assert/strict'
import { mkdir, mkdtemp, readFile, readdir } from 'node:fs/promises'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { _electron as electron } from 'playwright'

const appRoot = resolve(fileURLToPath(new URL('../', import.meta.url)))
const output = resolve(appRoot, 'out', 'signal-chain-smoke')
await mkdir(output, { recursive: true })
const userData = await mkdtemp(resolve(output, 'user-data-'))
const projectPath = resolve(output, 'signal-chain.ledmap')
const exportDirectory = resolve(output, 'exports')
const manifests = resolve(userData, 'recovery', 'v1', 'manifests')
await mkdir(exportDirectory, { recursive: true })

const errors = []
async function launch(recoveryAction = 'later') {
  const env = { ...process.env,
    LEDMAP_SMOKE_PROJECT_PATH: projectPath,
    LEDMAP_SMOKE_USER_DATA: userData,
    LEDMAP_SMOKE_UNSAVED_ACTION: 'discard',
    LEDMAP_SMOKE_RECOVERY_ACTION: recoveryAction,
    LEDMAP_SMOKE_EXPORT_DIR: exportDirectory,
  }
  delete env.ELECTRON_RUN_AS_NODE
  delete env.ELECTRON_RENDERER_URL
  const app = await electron.launch({ args: [appRoot], env })
  const page = await app.firstWindow()
  page.on('pageerror', error => errors.push(error.message))
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()) })
  await page.waitForFunction(() => window.__ledmapHardware !== undefined)
  return { app, page }
}

async function exit(app) {
  const child = app.process()
  if (child.exitCode === null && child.signalCode === null) child.kill()
  const deadline = Date.now() + 3_000
  while (child.exitCode === null && child.signalCode === null && Date.now() < deadline) {
    await new Promise(resolvePromise => setTimeout(resolvePromise, 25))
  }
  if (child.exitCode === null && child.signalCode === null) throw new Error('Electron smoke process did not exit.')
}

async function waitForRecovery() {
  const deadline = Date.now() + 12_000
  while (Date.now() < deadline) {
    try {
      for (const name of (await readdir(manifests)).filter(value => value.endsWith('.json'))) {
        const manifest = JSON.parse(await readFile(resolve(manifests, name), 'utf8'))
        const payload = JSON.parse(await readFile(resolve(userData, 'recovery', 'v1', 'payloads', manifest.payloadFile), 'utf8'))
        if (payload.project.operations.signalRoutes[0]?.orderedCabinetIds[0] === 'screen-1/C02') return
      }
    } catch { }
    await new Promise(resolvePromise => setTimeout(resolvePromise, 100))
  }
  throw new Error('Signal Chain autosave manifest was not created.')
}

const chain = page => page.evaluate(() => window.__ledmapHardware.dump().receivers.map(value => value.cabinets))
const row = (page, cabinetId) => page.locator(`[data-signal-cabinet-id="${cabinetId}"]`)

let running = await launch()
try {
  let page = running.page
  await page.locator('#add-screen').click()
  await page.locator('#new-screen-columns').fill('3')
  await page.locator('#new-screen-rows').fill('1')
  await page.locator('#new-screen-module-width').fill('8')
  await page.locator('#new-screen-module-height').fill('8')
  await page.locator('#screen-form button[type="submit"]').click()
  await page.waitForFunction(() => window.__ledmap.dump().length === 1)
  await page.locator('#mapping-mode').click()
  await page.locator('#mapping-apply-input').click()
  await page.locator('#mapping-tree [data-screen-id="screen-1"]').click()
  await page.locator('#mapping-create-region').click()
  await page.locator('#hardware-mode').click()
  await page.locator('#hardware-add-processor').click()
  await page.locator('#hardware-add-port').click()
  await page.locator('#hardware-add-receiver').click()
  await page.locator('#hardware-add-receiver').click()
  await page.locator('[data-hardware-type="receiver"][data-hardware-id="receiver-1"]').click()
  await page.locator('[data-cabinet-id="screen-1/C01"]').click()
  await page.locator('[data-cabinet-id="screen-1/C02"]').click({ modifiers: ['Control'] })
  await page.locator('[data-cabinet-id="screen-1/C03"]').click({ modifiers: ['Control'] })
  await page.locator('#hardware-assign').click()
  assert.deepEqual((await chain(page))[0], ['screen-1/C01', 'screen-1/C02', 'screen-1/C03'])
  assert.match(await row(page, 'screen-1/C01').innerText(), /1\. C01[\s\S]*FIRST/)
  assert.match(await row(page, 'screen-1/C03').innerText(), /3\. C03[\s\S]*LAST/)
  assert.match(await row(page, 'screen-1/C03').innerText(), /Screen 1[\s\S]*\(3, 1\)[\s\S]*64 px/)
  await row(page, 'screen-1/C03').click()
  await page.locator('[data-signal-action="move-up"]').click()
  await page.locator('[data-signal-action="move-up"]').click()
  assert.deepEqual((await chain(page))[0], ['screen-1/C03', 'screen-1/C01', 'screen-1/C02'])
  assert.equal(await row(page, 'screen-1/C03').getAttribute('aria-pressed'), 'true')
  assert.equal(await page.locator('[data-signal-action="move-up"]').isDisabled(), true)
  await page.locator('#undo-project').click()
  assert.deepEqual((await chain(page))[0], ['screen-1/C01', 'screen-1/C03', 'screen-1/C02'])
  await page.locator('#redo-project').click()
  assert.deepEqual((await chain(page))[0], ['screen-1/C03', 'screen-1/C01', 'screen-1/C02'])
  await row(page, 'screen-1/C01').click()
  const options = await page.locator('[data-signal-target] option').allTextContents()
  assert.equal(options.length, 2)
  assert.match(options[1], /Processor 1 → Port 1 → receiver-2/)
  await page.locator('[data-signal-target]').selectOption('receiver-2')
  assert.match(await page.locator('.signal-chain-hint').innerText(), /added to end/)
  await page.locator('[data-signal-action="transfer"]').click()
  assert.deepEqual(await chain(page), [['screen-1/C03', 'screen-1/C02'], ['screen-1/C01']])
  assert.equal(await page.locator('[data-hardware-type="receiver"][data-hardware-id="receiver-2"]').getAttribute('aria-pressed'), 'true')
  assert.equal(await row(page, 'screen-1/C01').getAttribute('aria-pressed'), 'true')
  await page.locator('#undo-project').click()
  assert.deepEqual(await chain(page), [['screen-1/C03', 'screen-1/C01', 'screen-1/C02'], []])
  await page.locator('#redo-project').click()
  assert.deepEqual(await chain(page), [['screen-1/C03', 'screen-1/C02'], ['screen-1/C01']])
  await page.locator('[data-signal-action="unassign"]').click()
  assert.deepEqual(await chain(page), [['screen-1/C03', 'screen-1/C02'], []])
  await page.locator('#undo-project').click()
  assert.deepEqual(await chain(page), [['screen-1/C03', 'screen-1/C02'], ['screen-1/C01']])
  await page.locator('[data-hardware-type="receiver"][data-hardware-id="receiver-1"]').click()
  await page.locator('#hardware-fit').click()
  await page.screenshot({ path: resolve(output, 'signal-chain-editor.png') })
  await page.locator('#save-project').click()
  await page.waitForFunction(() => window.__ledmap.document().dirty === false)
  const saved = JSON.parse(await readFile(projectPath, 'utf8'))
  assert.equal(saved.schemaVersion, 5)
  assert.deepEqual(saved.project.operations.signalRoutes.map(value => value.orderedCabinetIds), [
    ['screen-1/C03', 'screen-1/C02'], ['screen-1/C01'],
  ])
  const closed = page.waitForEvent('close')
  await running.app.evaluate(({ BrowserWindow }) => {
    setTimeout(() => BrowserWindow.getAllWindows()[0]?.close(), 0)
    return true
  })
  await closed
  await exit(running.app)
  running = await launch()
  page = running.page
  await page.locator('#open-project').click()
  await page.waitForFunction(() => window.__ledmapHardware.dump().receivers.length === 2)
  assert.deepEqual(await chain(page), [['screen-1/C03', 'screen-1/C02'], ['screen-1/C01']])
  await page.locator('#test-mode').click()
  await page.locator('[data-test-pattern="address-walk"]').click()
  assert.equal((await page.evaluate(() => window.__ledmapTest.dump())).walk.cabinet, 'screen-1/C03')
  await page.locator('#export-mode').click()
  await page.locator('#export-json-run').click()
  await page.waitForFunction(() => /Exported JSON/.test(window.__ledmapExport.dump().lastResult))
  const exported = JSON.parse(await readFile(resolve(exportDirectory, 'ledmap-generic-mapping.json'), 'utf8'))
  assert.equal(exported.rows[0].cabinet, 'screen-1/C03')
  await page.locator('#hardware-mode').click()
  await page.locator('[data-hardware-type="receiver"][data-hardware-id="receiver-1"]').click()
  await row(page, 'screen-1/C02').click()
  await row(page, 'screen-1/C02').focus()
  await page.keyboard.press('Alt+ArrowUp')
  assert.deepEqual((await chain(page))[0], ['screen-1/C02', 'screen-1/C03'])
  await page.locator('input[aria-label="Receiver index"]').focus()
  await page.keyboard.press('Alt+ArrowDown')
  assert.deepEqual((await chain(page))[0], ['screen-1/C02', 'screen-1/C03'])
  await waitForRecovery()
  assert.deepEqual(errors, [])
} finally { await exit(running.app) }

running = await launch('recover')
try {
  await running.page.waitForFunction(() => window.__ledmapHardware.dump().receivers[0]?.cabinets[0] === 'screen-1/C02')
  assert.deepEqual(await chain(running.page), [['screen-1/C02', 'screen-1/C03'], ['screen-1/C01']])
  assert.deepEqual(errors, [])
} finally { await exit(running.app) }

console.log('Electron Signal Chain smoke passed: reorder, transfer, Undo/Redo, V3 reopen, Address Walk, JSON export and recovery.')
process.exit(0)
