// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest'
import { screen, fireEvent } from '@testing-library/react'
import { renderUi } from './helpers.jsx'
import { Sidebar } from '../../../src/renderer/components/Sidebar.jsx'
import { EMPTY_STATS } from '../../../src/shared/stats.js'

const props = (over = {}) => ({ page: 'home', onNavigate: vi.fn(), health: { light: 'green', reason: 'ok' }, onSemaphoreClick: vi.fn(), profileName: 'Nikola', stats: EMPTY_STATS, ...over })

describe('Sidebar', () => {
  it('lists the five pages and marks the active one', () => {
    renderUi(<Sidebar {...props({ page: 'watchlist' })} />)
    for (const name of ['Početna', 'Watchlist', 'Preuzeto', 'Profil', 'Podešavanja']) expect(screen.getByRole('button', { name })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Watchlist' })).toHaveAttribute('aria-current', 'page')
    expect(screen.getByRole('button', { name: 'Početna' })).not.toHaveAttribute('aria-current')
  })
  it('navigates, opens the wizard from the semaphore and the profile from the card', () => {
    const p = props()
    renderUi(<Sidebar {...p} />)
    fireEvent.click(screen.getByRole('button', { name: 'Preuzeto' }))
    expect(p.onNavigate).toHaveBeenCalledWith('downloads')
    fireEvent.click(screen.getByRole('button', { name: /Sve radi/ }))
    expect(p.onSemaphoreClick).toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: /LV 1/ }))
    expect(p.onNavigate).toHaveBeenLastCalledWith('profile')
  })
  it('signs the app as by Leqora, with or without a version', () => {
    const { rerender } = renderUi(<Sidebar {...props({ version: '0.4.0' })} />)
    expect(screen.getByText('v0.4.0')).toBeInTheDocument()
    expect(screen.getByText(/by Leqora/)).toBeInTheDocument()
    rerender(<Sidebar {...props({ version: '' })} />)
    expect(screen.getByText('by Leqora')).toBeInTheDocument()
  })
  it('shows the app version at the bottom, and nothing until it is known', () => {
    const { rerender } = renderUi(<Sidebar {...props({ version: '0.3.1' })} />)
    expect(screen.getByText('v0.3.1')).toBeInTheDocument()
    rerender(<Sidebar {...props({ version: '' })} />)
    expect(screen.queryByText(/^v\d/)).not.toBeInTheDocument()
  })
  it('toggles fullscreen from the footer', () => {
    const onToggleFullscreen = vi.fn()
    const { rerender } = renderUi(<Sidebar {...props({ fullscreen: false, onToggleFullscreen })} />)
    fireEvent.click(screen.getByRole('button', { name: 'Ceo ekran (F11)' }))
    expect(onToggleFullscreen).toHaveBeenCalled()
    rerender(<Sidebar {...props({ fullscreen: true, onToggleFullscreen })} />)
    expect(screen.getByRole('button', { name: 'Izađi iz celog ekrana (Esc)' })).toBeInTheDocument()
  })
})
