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
