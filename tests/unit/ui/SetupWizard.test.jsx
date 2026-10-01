// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest'
import { screen, fireEvent, waitFor } from '@testing-library/react'
import { renderUi, makeFakeApi } from './helpers.jsx'
import { SetupWizard, toolView } from '../../../src/renderer/pages/SetupWizard.jsx'

const missingAll = { bash: { installed: true, version: 'system' }, 'ani-cli': { installed: false }, mpv: { installed: false }, 'yt-dlp': { installed: false }, ffmpeg: { installed: false } }
const allOk = Object.fromEntries(Object.keys(missingAll).map((k) => [k, { installed: true, version: 'v1' }]))

describe('toolView', () => {
  it('derives light and state', () => {
    expect(toolView({ installed: true }, null, null, false)).toEqual({ light: 'green', state: 'installed', percent: null })
    expect(toolView({ installed: false }, null, 'boom', false)).toEqual({ light: 'red', state: 'error', percent: null })
    expect(toolView({ installed: false }, { phase: 'download', received: 50, total: 200 }, null, true)).toEqual({ light: 'yellow', state: 'installing', percent: 25 })
    expect(toolView({ installed: false }, { phase: 'extract' }, null, true)).toEqual({ light: 'yellow', state: 'installing', percent: null })
    expect(toolView({ installed: false }, null, null, false)).toEqual({ light: 'red', state: 'missing', percent: null })
  })
})

describe('SetupWizard', () => {
  it('lists components with red/green lights and installs missing ones', async () => {
    let status = missingAll
    const api = makeFakeApi({ tools: { status: vi.fn(async () => status), installMissing: vi.fn(async () => { status = allOk; return {} }) } })
    renderUi(<SetupWizard health={{ light: 'red', reason: 'missing-tools' }} onClose={() => {}} />, { api })
    expect(screen.getByRole('heading', { name: 'Podešavanje' })).toBeInTheDocument()
    await waitFor(() => expect(screen.getByTestId('tool-mpv')).toHaveAttribute('data-light', 'red'))
    expect(screen.getByTestId('tool-bash')).toHaveAttribute('data-light', 'green')
    fireEvent.click(screen.getByRole('button', { name: 'Instaliraj sve' }))
    await waitFor(() => expect(screen.getByText('Sve je instalirano')).toBeInTheDocument())
    expect(api.tools.installMissing).toHaveBeenCalled()
    expect(screen.getByTestId('tool-mpv')).toHaveAttribute('data-light', 'green')
  })
  it('offers retry after an error and shows the health message', async () => {
    const api = makeFakeApi({ tools: { status: vi.fn(async () => missingAll), installMissing: vi.fn(async () => ({ mpv: 'HTTP 404' })) } })
    renderUi(<SetupWizard health={{ light: 'red', reason: 'offline' }} onClose={() => {}} />, { api })
    expect(screen.getByText('Nema internet konekcije')).toBeInTheDocument()
    await waitFor(() => screen.getByRole('button', { name: 'Instaliraj sve' }))
    fireEvent.click(screen.getByRole('button', { name: 'Instaliraj sve' }))
    await waitFor(() => expect(screen.getByRole('button', { name: 'Pokušaj ponovo' })).toBeEnabled())
    expect(screen.getByTestId('tool-mpv')).toHaveAttribute('data-light', 'red')
  })
  it('re-checks health and closes', async () => {
    const onClose = vi.fn()
    const { api } = renderUi(<SetupWizard health={{ light: 'green', reason: 'ok' }} onClose={onClose} />)
    fireEvent.click(screen.getByRole('button', { name: 'Proveri ponovo' }))
    expect(api.health.recheck).toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: 'Zatvori' }))
    expect(onClose).toHaveBeenCalled()
  })
})
