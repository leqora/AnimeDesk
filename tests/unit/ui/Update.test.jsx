// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest'
import { screen, fireEvent } from '@testing-library/react'
import { renderUi } from './helpers.jsx'
import { UpdateBanner } from '../../../src/renderer/components/UpdateBanner.jsx'
import { WhatsNewDialog } from '../../../src/renderer/components/WhatsNewDialog.jsx'

const st = (over) => ({ status: 'idle', currentVersion: '0.3.0', version: '0.3.1', percent: null, notes: 'Novo', lastCheckedAt: null, error: null, ...over })

describe('UpdateBanner', () => {
  it('offers download when auto-download is off', () => {
    const onWhatsNew = vi.fn()
    const { api } = renderUi(<UpdateBanner state={st({ status: 'available' })} onWhatsNew={onWhatsNew} />)
    expect(screen.getByRole('status')).toHaveTextContent('Dostupna je verzija 0.3.1')
    fireEvent.click(screen.getByRole('button', { name: 'Preuzmi' }))
    expect(api.update.download).toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: 'Šta je novo' }))
    expect(onWhatsNew).toHaveBeenCalled()
  })
  it('shows download progress', () => {
    renderUi(<UpdateBanner state={st({ status: 'downloading', percent: 42 })} onWhatsNew={() => {}} />)
    expect(screen.getByRole('status')).toHaveTextContent('Verzija 0.3.1 se preuzima… 42%')
    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '42')
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
  })
  it('restarts and updates when ready', () => {
    const { api } = renderUi(<UpdateBanner state={st({ status: 'ready' })} onWhatsNew={() => {}} />)
    expect(screen.getByRole('status')).toHaveTextContent('Verzija 0.3.1 je spremna')
    fireEvent.click(screen.getByRole('button', { name: 'Restartuj i ažuriraj' }))
    expect(api.update.install).toHaveBeenCalled()
  })
  it('hides on error and in every other state', () => {
    for (const status of ['idle', 'checking', 'none', 'error', 'disabled']) {
      const { container, unmount } = renderUi(<UpdateBanner state={st({ status })} onWhatsNew={() => {}} />)
      expect(container).toBeEmptyDOMElement()
      unmount()
    }
  })
})

describe('WhatsNewDialog', () => {
  it('shows notes before updating with the install button when ready', () => {
    const onClose = vi.fn()
    const { api } = renderUi(<WhatsNewDialog mode="before" version="0.3.1" notes={'Prvi red\nDrugi red'} status="ready" onClose={onClose} />)
    expect(screen.getByRole('dialog', { name: 'Šta je novo u 0.3.1' })).toBeInTheDocument()
    expect(screen.getByText(/Prvi red/)).toHaveTextContent('Prvi red Drugi red')
    fireEvent.click(screen.getByRole('button', { name: 'Restartuj i ažuriraj' }))
    expect(api.update.install).toHaveBeenCalled()
  })
  it('offers download before updating when only available', () => {
    const { api } = renderUi(<WhatsNewDialog mode="before" version="0.3.1" notes="x" status="available" onClose={() => {}} />)
    fireEvent.click(screen.getByRole('button', { name: 'Preuzmi' }))
    expect(api.update.download).toHaveBeenCalled()
  })
  it('after an update only offers close, and Escape closes', () => {
    const onClose = vi.fn()
    renderUi(<WhatsNewDialog mode="after" version="0.3.1" notes={null} status="none" onClose={onClose} />)
    expect(screen.getByRole('dialog', { name: 'Ažurirano na 0.3.1' })).toBeInTheDocument()
    expect(screen.getByText('Nema beležaka za ovu verziju.')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Restartuj i ažuriraj' })).not.toBeInTheDocument()
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(onClose).toHaveBeenCalledTimes(1)
    fireEvent.click(screen.getByRole('button', { name: 'Zatvori' }))
    expect(onClose).toHaveBeenCalledTimes(2)
  })
  it('renders notes as text, never HTML', () => {
    const { container } = renderUi(<WhatsNewDialog mode="before" version="0.3.1" notes={'<img src=x onerror="alert(1)">'} status="available" onClose={() => {}} />)
    expect(container.querySelector('img')).toBeNull()
    expect(screen.getByText('<img src=x onerror="alert(1)">')).toBeInTheDocument()
  })
})
