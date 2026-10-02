// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react'
import App from '../../../src/renderer/App.jsx'
import { makeFakeApi } from './helpers.jsx'
import { EMPTY_STATS } from '../../../src/shared/stats.js'
import { DEFAULT_SETTINGS } from '../../../src/main/settings.js'

describe('App', () => {
  it('opens the wizard automatically when tools are missing', async () => {
    const api = makeFakeApi({ health: { get: vi.fn(async () => ({ light: 'red', reason: 'missing-tools', missing: ['mpv'] })) } })
    render(<App api={api} />)
    await waitFor(() => expect(screen.getByRole('heading', { name: 'Podešavanje' })).toBeInTheDocument())
  })
  it('switches language when settings change and navigates', async () => {
    const api = makeFakeApi()
    render(<App api={api} />)
    await waitFor(() => screen.getByRole('button', { name: 'Podešavanja' }))
    fireEvent.click(screen.getByRole('button', { name: 'Podešavanja' }))
    fireEvent.change(screen.getByLabelText('Jezik'), { target: { value: 'en' } })
    await waitFor(() => expect(screen.getByRole('button', { name: 'Settings' })).toBeInTheDocument())
  })
  it('asks whether to mark an episode as watched', async () => {
    let ask
    const api = makeFakeApi({ watch: { onAsk: vi.fn((cb) => { ask = cb; return () => {} }) } })
    render(<App api={api} />)
    await waitFor(() => expect(ask).toBeDefined())
    act(() => ask({ aniCliTitle: 'Show', episode: '5' }))
    expect(screen.getByText('Označi epizodu 5 (Show) kao odgledanu?')).toBeInTheDocument()
  })
  it('warns when the watchlist file was corrupt', async () => {
    const api = makeFakeApi({ library: { wasCorrupt: vi.fn(async () => true) } })
    render(<App api={api} />)
    await waitFor(() => expect(screen.getByText(/bio oštećen/)).toBeInTheDocument())
  })
  it('shows the profile card from stats and opens the profile page', async () => {
    const api = makeFakeApi({ stats: { get: vi.fn(async () => ({ ...EMPTY_STATS, level: 11, title: 'veteran', xp: 3000 })) } })
    api.settings.get.mockResolvedValue({ ...DEFAULT_SETTINGS, profileName: null, systemName: 'nikola' })
    render(<App api={api} />)
    const card = await screen.findByRole('button', { name: /LV 11/ })
    expect(card).toHaveTextContent('N')
    fireEvent.click(card)
    expect(await screen.findByRole('heading', { name: 'nikola' })).toBeInTheDocument()
    expect(api.stats.get.mock.calls.length).toBeGreaterThanOrEqual(2)
  })
})
