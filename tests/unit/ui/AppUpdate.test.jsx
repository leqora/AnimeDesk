// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent, act, waitFor } from '@testing-library/react'
import App from '../../../src/renderer/App.jsx'
import { makeFakeApi } from './helpers.jsx'

const state = (over) => ({ status: 'idle', currentVersion: '0.3.0', version: '0.3.1', percent: null, notes: 'Bočni meni', lastCheckedAt: null, error: null, ...over })

describe('App updates', () => {
  it('shows the banner from pushed state and opens what\'s new', async () => {
    let push
    const api = makeFakeApi({ update: { onState: vi.fn((cb) => { push = cb; return () => {} }) } })
    render(<App api={api} sound={{ play: vi.fn() }} />)
    await waitFor(() => expect(push).toBeDefined())
    await screen.findByRole('button', { name: 'Početna' })
    act(() => push(state({ status: 'ready' })))
    expect(screen.getByText('Verzija 0.3.1 je spremna')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Šta je novo' }))
    expect(screen.getByRole('dialog', { name: 'Šta je novo u 0.3.1' })).toHaveTextContent('Bočni meni')
    fireEvent.click(screen.getByRole('button', { name: 'Zatvori' }))
    expect(screen.queryByRole('dialog', { name: 'Šta je novo u 0.3.1' })).not.toBeInTheDocument()
    expect(api.whatsNew.seen).not.toHaveBeenCalled()
  })
  it('shows "updated to" once after an update and marks it seen on close', async () => {
    const api = makeFakeApi({ whatsNew: { get: vi.fn(async () => ({ version: '0.3.1', notes: 'Novo' })) } })
    render(<App api={api} sound={{ play: vi.fn() }} />)
    const dialog = await screen.findByRole('dialog', { name: 'Ažurirano na 0.3.1' })
    expect(dialog).toHaveTextContent('Novo')
    fireEvent.click(screen.getByRole('button', { name: 'Zatvori' }))
    expect(api.whatsNew.seen).toHaveBeenCalledTimes(1)
  })
})
