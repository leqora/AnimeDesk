import { test, expect, _electron as electron } from '@playwright/test'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

test('starts and shows the setup wizard when tools are missing', async () => {
  const userData = fs.mkdtempSync(path.join(os.tmpdir(), 'animedesk-e2e-'))
  const app = await electron.launch({ args: ['.'], env: { ...process.env, ANIMEDESK_USER_DATA: userData } })
  const win = await app.firstWindow()
  await expect(win.getByRole('heading', { name: 'Podešavanje' })).toBeVisible()
  await expect(win.getByTestId('tool-mpv')).toHaveAttribute('data-light', 'red')
  await app.close()
})

// Real network is allowed here: the page may end in any state (loading/ok/stale/error), it only must open cleanly.
test('opens the schedule page from the menu', async () => {
  const userData = fs.mkdtempSync(path.join(os.tmpdir(), 'animedesk-e2e-'))
  const app = await electron.launch({ args: ['.'], env: { ...process.env, ANIMEDESK_USER_DATA: userData } })
  const win = await app.firstWindow()
  const errors = []
  win.on('pageerror', (err) => errors.push(err.message))
  win.on('console', (msg) => { if (msg.type() === 'error') errors.push(msg.text()) })
  await expect(win.getByRole('heading', { name: 'Podešavanje' })).toBeVisible()
  await win.getByRole('button', { name: 'Zatvori' }).click()
  await win.getByRole('button', { name: 'Raspored' }).click()
  await expect(win.getByRole('heading', { name: 'Raspored', level: 2 })).toBeVisible()
  await win.waitForTimeout(1500)
  expect(errors).toEqual([])
  await app.close()
})
