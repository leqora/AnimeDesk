// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest'
import { screen, fireEvent, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { renderUi, makeFakeApi } from './helpers.jsx'
import { DetailHero } from '../../../src/renderer/detail/DetailHero.jsx'

const entry = (over = {}) => ({ id: 'e1', title: 'Frieren', aniCliTitle: 'Frieren', aniListId: 154587, status: 'watching', pinnedAt: null, ...over })
const INFO = { id: 154587, match: 'exact', year: 2023, format: 'TV', episodes: 28, duration: 24, status: 'FINISHED', genres: ['Adventure', 'Drama', 'Fantasy'], description: 'X', poster: 'p.jpg' }
const mount = (props = {}, api = makeFakeApi()) => {
  const fns = { onContinue: vi.fn(), onTogglePin: vi.fn(), onStatus: vi.fn(), onRemove: vi.fn(), onPickAniList: vi.fn(), onBack: vi.fn() }
  const r = renderUi(
    <DetailHero entry={entry()} info={INFO} ready nextEp={4} saved={null} finished={false} fresh={0} now={Date.now()} metaToggle={null} {...fns} {...props} />,
    { api },
  )
  return { ...r, ...fns }
}

describe('DetailHero', () => {
  it('banner from the banner IPC', async () => {
    const api = makeFakeApi({ anilist: { banner: vi.fn(async () => 'animedesk-img://banner/ab') } })
    const { container } = mount({}, api)
    await waitFor(() => expect(container.querySelector('.home-hero__banner')).not.toBeNull())
    expect(container.querySelector('.home-hero__banner').style.backgroundImage).toContain('animedesk-img://banner/ab')
    expect(api.anilist.banner).toHaveBeenCalledWith({ kind: 'series', entryId: 'e1', info: 154587 })
    expect(container.querySelector('section.detail-hero')).toHaveClass('page-banner')
  })
  it('falls back to the blurred poster when there is no banner', async () => {
    const api = makeFakeApi()
    const { container } = mount({}, api)
    await waitFor(() => expect(api.anilist.banner).toHaveBeenCalled())
    expect(container.querySelector('.hero__bg')).not.toBeNull()
    expect(container.querySelector('.home-hero__banner')).toBeNull()
  })
  it('meta row', () => {
    const { container, onStatus } = mount()
    expect(screen.getByRole('heading', { level: 1, name: 'Frieren' })).toBeInTheDocument()
    const text = container.querySelector('.detail-hero').textContent
    for (const s of ['2023', 'TV', '28 EP', '24 min', 'Završena']) expect(text).toContain(s)
    const status = screen.getByRole('combobox', { name: 'Status' })
    expect(status).toHaveValue('watching')
    fireEvent.change(status, { target: { value: 'completed' } })
    expect(onStatus).toHaveBeenCalledWith('completed')
    const chips = container.querySelectorAll('li.chip')
    expect([...chips].map((c) => c.textContent)).toEqual(['Adventure', 'Drama', 'Fantasy'])
  })
  it('close match shows poster-level data only', () => {
    const { container } = mount({ info: { ...INFO, match: 'close', description: 'SECRET' } })
    const text = container.textContent
    expect(text).toContain('2023')
    expect(text).not.toContain('TV')
    expect(text).not.toContain('24 min')
    expect(text).not.toContain('Završena')
    expect(text).not.toContain('SECRET')
    expect(screen.queryByRole('button', { name: 'Prikaži opis' })).toBeNull()
    expect(container.querySelectorAll('li.chip')).toHaveLength(3)
  })
  it('description is shown only on click, below the banner', () => {
    const { container } = mount()
    expect(container.querySelector('.description')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Prikaži opis' }))
    const desc = container.querySelector('p.description')
    expect(desc).toHaveTextContent('X')
    expect(container.querySelector('.detail-hero').contains(desc)).toBe(false)
    fireEvent.click(screen.getByRole('button', { name: 'Sakrij opis' }))
    expect(container.querySelector('.description')).toBeNull()
  })
  it('continue button', () => {
    const a = mount({ saved: { position: 495 } })
    fireEvent.click(screen.getByRole('button', { name: /Nastavi EP 4 od 8:15/ }))
    expect(a.onContinue).toHaveBeenCalled()
    a.unmount()
    const b = mount({ finished: true })
    expect(screen.getByRole('button', { name: /Gledaj ponovo/ })).toBeInTheDocument()
    b.unmount()
    mount({ ready: false })
    expect(screen.getByRole('button', { name: /Nastavi EP 4/ })).toBeDisabled()
  })
  it('back and pin buttons', () => {
    const { onBack, onTogglePin } = mount({ entry: entry({ pinnedAt: 'now' }) })
    fireEvent.click(screen.getByRole('button', { name: 'Nazad' }))
    expect(onBack).toHaveBeenCalled()
    const pin = screen.getByRole('button', { name: /Ukloni iz omiljenih/ })
    expect(pin).toHaveAttribute('aria-pressed', 'true')
    fireEvent.click(pin)
    expect(onTogglePin).toHaveBeenCalled()
  })
  describe('more menu', () => {
    it('is keyboard operable: Enter opens on the first item, Escape returns to the button', async () => {
      const user = userEvent.setup()
      mount({ metaToggle: { off: false, onChange: vi.fn() } })
      const more = screen.getByRole('button', { name: 'Još' })
      more.focus()
      await user.keyboard('{Enter}')
      const items = screen.getAllByRole('menuitem')
      expect(items.map((i) => i.textContent)).toEqual(expect.arrayContaining(['Ukloni iz Watchlist-e', 'AniList: izaberi seriju', 'Isključi metapodatke za ovu seriju']))
      expect(document.activeElement).toBe(items[0])
      await user.keyboard('{Escape}')
      expect(document.activeElement).toBe(more)
      expect(screen.queryByRole('menu')).toBeNull()
    })
    it('item actions', () => {
      const onChange = vi.fn()
      const { onRemove, onPickAniList } = mount({ metaToggle: { off: true, onChange } })
      fireEvent.click(screen.getByRole('button', { name: 'Još' }))
      fireEvent.click(screen.getByRole('menuitem', { name: 'Uključi metapodatke za ovu seriju' }))
      expect(onChange).toHaveBeenCalledWith(false)
      fireEvent.click(screen.getByRole('button', { name: 'Još' }))
      fireEvent.click(screen.getByRole('menuitem', { name: 'AniList: izaberi seriju' }))
      expect(onPickAniList).toHaveBeenCalled()
      fireEvent.click(screen.getByRole('button', { name: 'Još' }))
      const remove = screen.getByRole('menuitem', { name: 'Ukloni iz Watchlist-e' })
      expect(remove).toHaveAttribute('data-navigates')
      fireEvent.click(remove)
      expect(onRemove).toHaveBeenCalled()
    })
    it('has no metadata item without metaToggle', () => {
      mount()
      fireEvent.click(screen.getByRole('button', { name: 'Još' }))
      expect(within(screen.getByRole('menu')).queryByText(/metapodatke/)).toBeNull()
    })
    it('closes when the player opens', () => {
      const { rerender } = mount()
      fireEvent.click(screen.getByRole('button', { name: 'Još' }))
      expect(screen.getByRole('menu')).toBeInTheDocument()
      rerender(<DetailHero entry={entry()} info={INFO} ready nextEp={4} saved={null} finished={false} fresh={0} now={Date.now()} metaToggle={null} playerOpen />)
      expect(screen.queryByRole('menu')).toBeNull()
    })
  })
})
