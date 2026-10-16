// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest'
import { render, screen, act } from '@testing-library/react'
import App from '../../../src/renderer/App.jsx'
import { makeFakeApi } from './helpers.jsx'

describe('App open events from main', () => {
  it('open-anime goes to the series detail and open-page navigates', async () => {
    const cbs = {}
    const api = makeFakeApi({ library: { list: vi.fn(async () => [{ id: 'a1', title: 'Alpha', status: 'planned', episodes: 12 }]) } })
    api.onOpenAnime = vi.fn((cb) => { cbs.anime = cb; return () => {} })
    api.onOpenPage = vi.fn((cb) => { cbs.page = cb; return () => {} })
    render(<App api={api} />)
    await screen.findByRole('button', { name: 'Početna' })
    await act(async () => cbs.page({ page: 'downloads' }))
    expect((await screen.findByRole('button', { name: 'Preuzeto' })).getAttribute('aria-current')).toBe('page')
    await act(async () => cbs.anime({ animeId: 'a1' }))
    expect(screen.getByRole('button', { name: 'Watchlist' }).getAttribute('aria-current')).toBe('page')
  })
})
