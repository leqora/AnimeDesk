// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest'
import { screen, fireEvent, waitFor } from '@testing-library/react'
import { renderUi, makeFakeApi } from './helpers.jsx'
import { SettingsPage } from '../../../src/renderer/pages/SettingsPage.jsx'
import { DEFAULT_SETTINGS } from '../../../src/main/settings.js'

describe('SettingsPage', () => {
  it('changes every setting through onSettings', async () => {
    const onSettings = vi.fn()
    renderUi(<SettingsPage settings={{ ...DEFAULT_SETTINGS }} onSettings={onSettings} />)
    fireEvent.change(screen.getByLabelText('Jezik'), { target: { value: 'en' } })
    expect(onSettings).toHaveBeenLastCalledWith({ language: 'en' })
    fireEvent.click(screen.getByLabelText('Automatsko praćenje gledanja'))
    expect(onSettings).toHaveBeenLastCalledWith({ autoTrack: false })
    fireEvent.change(screen.getByLabelText('Epizoda je odgledana posle (%)'), { target: { value: '90' } })
    expect(onSettings).toHaveBeenLastCalledWith({ watchedThreshold: 90 })
    fireEvent.click(screen.getByLabelText('Pitaj pri zatvaranju plejera (umesto praga)'))
    expect(onSettings).toHaveBeenLastCalledWith({ askOnClose: true })
    fireEvent.change(screen.getByLabelText('Kvalitet'), { target: { value: '720' } })
    expect(onSettings).toHaveBeenLastCalledWith({ quality: '720' })
    fireEvent.change(screen.getByLabelText('Audio'), { target: { value: 'dub' } })
    expect(onSettings).toHaveBeenLastCalledWith({ mode: 'dub' })
    fireEvent.click(screen.getByLabelText('Automatsko ažuriranje ani-cli i yt-dlp'))
    expect(onSettings).toHaveBeenLastCalledWith({ autoUpdateTools: false })
  })
  it('picks and clears the download folder', async () => {
    const onSettings = vi.fn()
    const api = makeFakeApi({ dialog: { pickFolder: vi.fn(async () => 'D:\\Anime') } })
    const { rerender } = renderUi(<SettingsPage settings={{ ...DEFAULT_SETTINGS }} onSettings={onSettings} />, { api })
    expect(screen.getByText('Nije postavljen (pita svaki put)')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Promeni' }))
    await waitFor(() => expect(onSettings).toHaveBeenCalledWith({ downloadDir: 'D:\\Anime' }))
  })
  it('shows tool versions and checks for updates', async () => {
    const api = makeFakeApi({ tools: { status: vi.fn(async () => ({ 'ani-cli': { installed: true, version: 'v5.1' } })) } })
    renderUi(<SettingsPage settings={{ ...DEFAULT_SETTINGS }} onSettings={() => {}} />, { api })
    await waitFor(() => expect(screen.getByText(/v5\.1/)).toBeInTheDocument())
    fireEvent.click(screen.getByRole('button', { name: 'Proveri ažuriranja' }))
    await waitFor(() => expect(api.tools.checkUpdates).toHaveBeenCalled())
  })
})
