// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest'
import { useState } from 'react'
import { screen, fireEvent, waitFor, act } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { renderUi } from './helpers.jsx'
import { EpisodeCard } from '../../../src/renderer/components/EpisodeCard.jsx'

const full = (over = {}) => ({ number: '4', runtime: 24, visibility: 'full', title: 'Naslov 4', hasThumb: true, overview: 'Tekst opisa', ...over })
const hidden = (over = {}) => ({ number: '6', runtime: 24, visibility: 'hidden', ...over })
const handlers = () => ({ onPlay: vi.fn(), onReveal: vi.fn(), onNote: vi.fn(), onToggleWatched: vi.fn() })

afterEach(() => { vi.unstubAllGlobals() })

describe('EpisodeCard', () => {
  it('click plays', () => {
    const h = handlers()
    renderUi(<EpisodeCard row={full()} loadThumb={async () => null} {...h} />)
    const play = screen.getByRole('button', { name: 'Pusti: Epizoda 4 · Naslov 4' })
    expect(screen.getByText('EP 4')).toBeInTheDocument()
    expect(screen.getByText('24 min')).toBeInTheDocument()
    expect(screen.getByText('Naslov 4')).toBeInTheDocument()
    fireEvent.click(play)
    expect(h.onPlay).toHaveBeenCalledWith('4')
  })
  it('next episode shows the progress bar and the time left', () => {
    const { container } = renderUi(<EpisodeCard row={full()} next progress={{ ratio: 0.4, remaining: 16 }} {...handlers()} />)
    expect(container.querySelector('.ep-card')).toHaveClass('ep-card--next')
    expect(container.querySelector('.ep-card__bar')).not.toBeNull()
    expect(screen.getByText('ostalo 16 min')).toBeInTheDocument()
  })
  it('watched and filler marks', () => {
    renderUi(<EpisodeCard row={full()} watched kind="filler" {...handlers()} />)
    expect(screen.getByText(/✓/)).toBeInTheDocument()
    expect(screen.getByText('F')).toBeInTheDocument()
  })
  it('a hidden episode is a locked tile that leaks nothing', () => {
    const h = handlers()
    const loadThumb = vi.fn(async () => 'data:x')
    const { container } = renderUi(<EpisodeCard row={hidden({ hasThumb: true, title: 'Tajna', overview: 'Spojler' })} poster="data:poster" loadThumb={loadThumb} {...h} />)
    expect(container.querySelector('img')).toBeNull()
    expect(loadThumb).not.toHaveBeenCalled()
    expect(screen.queryByText(/Tajna|Spojler/)).toBeNull()
    expect(screen.queryByRole('button', { name: /^Pusti/ })).toBeNull()
    expect(screen.getByText('EP 6')).toBeInTheDocument()
    expect(screen.getByText('24 min')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /Prikaži/ }))
    expect(h.onReveal).toHaveBeenCalledWith('6')
    fireEvent.click(screen.getByRole('button', { name: 'Još za epizodu 6' }))
    expect(screen.queryByRole('menuitem', { name: 'Opis' })).toBeNull()
    expect(screen.getByRole('menuitem', { name: 'Beleška…' })).toBeInTheDocument()
  })
  it('the more menu: note, mark and description', () => {
    const h = handlers()
    const a = renderUi(<EpisodeCard row={full()} {...h} />)
    fireEvent.click(screen.getByRole('button', { name: 'Još za epizodu 4' }))
    fireEvent.click(screen.getByRole('menuitem', { name: 'Beleška…' }))
    expect(h.onNote).toHaveBeenCalledWith('4')
    fireEvent.click(screen.getByRole('button', { name: 'Još za epizodu 4' }))
    fireEvent.click(screen.getByRole('menuitem', { name: 'Označi kao odgledano' }))
    expect(h.onToggleWatched).toHaveBeenCalledWith('4')
    fireEvent.click(screen.getByRole('button', { name: 'Još za epizodu 4' }))
    fireEvent.click(screen.getByRole('menuitem', { name: 'Opis' }))
    expect(screen.getByRole('dialog')).toHaveTextContent('Tekst opisa')
    a.unmount()
    renderUi(<EpisodeCard row={full()} watched {...h} />)
    fireEvent.click(screen.getByRole('button', { name: 'Još za epizodu 4' }))
    expect(screen.getByRole('menuitem', { name: 'Ukloni oznaku odgledano' })).toBeInTheDocument()
  })
  it('no description item without an overview or for a title-only row', () => {
    renderUi(<EpisodeCard row={full({ overview: undefined })} {...handlers()} />)
    fireEvent.click(screen.getByRole('button', { name: 'Još za epizodu 4' }))
    expect(screen.queryByRole('menuitem', { name: 'Opis' })).toBeNull()
  })
  it('the more button follows the play button in Tab order', async () => {
    const user = userEvent.setup()
    renderUi(<EpisodeCard row={full()} {...handlers()} />)
    await user.tab()
    expect(document.activeElement).toBe(screen.getByRole('button', { name: /^Pusti/ }))
    await user.tab()
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Još za epizodu 4' }))
  })
  it('asks for the thumb only once the card is visible', async () => {
    let cb
    class IO { constructor(f) { cb = f } observe() {} disconnect() {} }
    vi.stubGlobal('IntersectionObserver', IO)
    const loadThumb = vi.fn(async () => 'data:image/png;base64,T')
    const { container } = renderUi(<EpisodeCard row={full()} loadThumb={loadThumb} {...handlers()} />)
    expect(loadThumb).not.toHaveBeenCalled()
    await act(async () => { cb([{ isIntersecting: true }]) })
    expect(loadThumb).toHaveBeenCalledWith('4')
    await waitFor(() => expect(container.querySelector('img')).toHaveAttribute('src', 'data:image/png;base64,T'))
  })
  it('is not playable while the player is not ready', () => {
    const h = handlers()
    renderUi(<EpisodeCard row={full()} ready={false} {...h} />)
    const play = screen.getByRole('button', { name: /^Pusti/ })
    expect(play).toBeDisabled()
    fireEvent.click(play)
    expect(h.onPlay).not.toHaveBeenCalled()
  })
  it('hides menu items whose handler is missing', () => {
    renderUi(<EpisodeCard row={full()} onPlay={vi.fn()} />)
    fireEvent.click(screen.getByRole('button', { name: 'Još za epizodu 4' }))
    expect(screen.queryByRole('menuitem', { name: 'Označi kao odgledano' })).toBeNull()
    expect(screen.queryByRole('menuitem', { name: 'Beleška…' })).toBeNull()
    expect(screen.getByRole('menuitem', { name: 'Opis' })).toBeInTheDocument()
  })
  it('focus moves to the play button after a reveal, and is not lost when it stays hidden', () => {
    const Wrap = ({ reveals }) => {
      const [row, setRow] = useState(hidden())
      return <EpisodeCard row={row} onPlay={vi.fn()} onReveal={() => { if (reveals) setRow(full({ number: '6' })) }} />
    }
    const a = renderUi(<Wrap reveals />)
    const reveal = screen.getByRole('button', { name: /Prikaži/ })
    reveal.focus()
    fireEvent.click(reveal)
    expect(document.activeElement).toBe(screen.getByRole('button', { name: /^Pusti/ }))
    a.unmount()
    renderUi(<Wrap />)
    const again = screen.getByRole('button', { name: /Prikaži/ })
    again.focus()
    fireEvent.click(again)
    expect(document.activeElement).toBe(again)
  })
})
