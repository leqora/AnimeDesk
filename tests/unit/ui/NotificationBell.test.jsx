// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest'
import { screen, act, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { NotificationBell } from '../../../src/renderer/components/NotificationBell.jsx'
import { makeFakeApi, renderUi } from './helpers.jsx'

const NOW = Date.now()
const item = (id, animeId, title, episode, minAgo, read = false) => ({ id, animeId, title, episode, at: new Date(NOW - minAgo * 60000).toISOString(), read })

function setup(items, { unread = items.filter((i) => !i.read).length, ids = ['a1', 'a2', 'a3'], lang = 'sr' } = {}) {
  let push = () => {}
  const api = makeFakeApi({
    notifications: { list: vi.fn(async () => ({ items, unread })), markRead: vi.fn(async () => ({ items: items.map((i) => ({ ...i, read: true })), unread: 0 })) },
  })
  api.onNotificationsChanged = vi.fn((cb) => { push = cb; return () => {} })
  const onOpenAnime = vi.fn()
  const view = renderUi(<NotificationBell onOpenAnime={onOpenAnime} libraryIds={new Set(ids)} />, { api, lang })
  return { api, onOpenAnime, push: (p) => act(() => push(p)), ...view }
}

describe('NotificationBell', () => {
  it('no badge and plain label with 0 unread', async () => {
    const { container } = setup([])
    await screen.findByRole('button', { name: 'Obaveštenja' })
    expect(container.querySelector('.bell__badge')).toBeNull()
  })

  it('shows count and aria-label with 3 unread', async () => {
    const { container } = setup([item(1, 'a1', 'A', 1, 5), item(2, 'a2', 'B', 2, 6), item(3, 'a3', 'C', 3, 7)])
    expect(await screen.findByRole('button', { name: 'Obaveštenja (3 nepročitana)' })).toBeInTheDocument()
    expect(container.querySelector('.bell__badge').textContent).toBe('3')
  })

  it('shows 9+ for 12 unread, English label', async () => {
    const { container } = setup([], { unread: 12, lang: 'en' })
    expect(await screen.findByRole('button', { name: 'Notifications (12 unread)' })).toBeInTheDocument()
    expect(container.querySelector('.bell__badge').textContent).toBe('9+')
  })

  it('Serbian plural forms in the label', async () => {
    const one = setup([], { unread: 1 })
    expect(await screen.findByRole('button', { name: 'Obaveštenja (1 nepročitano)' })).toBeInTheDocument()
    one.unmount()
    setup([], { unread: 5 })
    expect(await screen.findByRole('button', { name: 'Obaveštenja (5 nepročitanih)' })).toBeInTheDocument()
  })

  it('English label with 1 unread', async () => {
    setup([], { unread: 1, lang: 'en' })
    expect(await screen.findByRole('button', { name: 'Notifications (1 unread)' })).toBeInTheDocument()
  })

  it('under a minute shows now in both languages', async () => {
    const user = userEvent.setup()
    const v = setup([item(1, 'a1', 'Alpha', 4, 0.2)])
    await user.click(await screen.findByRole('button', { name: /Obaveštenja/ }))
    expect((await screen.findByRole('dialog')).querySelector('.bell__item-time').textContent).toBe('sada')
    v.unmount()
    setup([item(1, 'a1', 'Alpha', 4, 0.2)], { lang: 'en' })
    await user.click(await screen.findByRole('button', { name: /Notifications/ }))
    expect((await screen.findByRole('dialog')).querySelector('.bell__item-time').textContent).toBe('now')
  })

  it('panel lists items newest first with only series and EP', async () => {
    const user = userEvent.setup()
    const { api } = setup([item(1, 'a1', 'Alpha', 4, 5), item(2, 'a2', 'Beta', 9, 120, true)])
    await user.click(await screen.findByRole('button', { name: /Obaveštenja/ }))
    const dialog = await screen.findByRole('dialog', { name: 'Obaveštenja' })
    const rows = dialog.querySelectorAll('.bell__item')
    expect(rows).toHaveLength(2)
    expect(rows[0].textContent).toContain('Alpha — EP 4')
    expect(rows[1].textContent).toContain('Beta — EP 9')
    expect(rows[0].textContent).toMatch(/pre 5 minuta|pre 5 min/)
    expect(api.notifications.markRead).not.toHaveBeenCalled()
  })

  it('click item opens anime and closes the panel', async () => {
    const user = userEvent.setup()
    const { onOpenAnime } = setup([item(1, 'a1', 'Alpha', 4, 5)])
    await user.click(await screen.findByRole('button', { name: /Obaveštenja/ }))
    await user.click(await screen.findByRole('button', { name: /Alpha — EP 4/ }))
    expect(onOpenAnime).toHaveBeenCalledWith('a1')
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('item is disabled when the series is not in the library', async () => {
    const user = userEvent.setup()
    const { onOpenAnime } = setup([item(1, 'gone', 'Alpha', 4, 5)])
    await user.click(await screen.findByRole('button', { name: /Obaveštenja/ }))
    const btn = await screen.findByRole('button', { name: /Alpha — EP 4/ })
    expect(btn).toBeDisabled()
    await user.click(btn)
    expect(onOpenAnime).not.toHaveBeenCalled()
  })

  it('mark all read clears the badge', async () => {
    const user = userEvent.setup()
    const { api, container } = setup([item(1, 'a1', 'Alpha', 4, 5)])
    await user.click(await screen.findByRole('button', { name: /Obaveštenja/ }))
    await user.click(await screen.findByRole('button', { name: 'Označi sve kao pročitano' }))
    expect(api.notifications.markRead).toHaveBeenCalled()
    await waitFor(() => expect(container.querySelector('.bell__badge')).toBeNull())
  })

  it('closes the panel when the player opens', async () => {
    const user = userEvent.setup()
    const api = makeFakeApi({ notifications: { list: vi.fn(async () => ({ items: [], unread: 0 })) } })
    const el = (closeMenus) => <NotificationBell onOpenAnime={vi.fn()} libraryIds={new Set()} closeMenus={closeMenus} />
    const { rerender } = renderUi(el(false), { api, lang: 'sr' })
    await user.click(await screen.findByRole('button', { name: 'Obaveštenja' }))
    expect(await screen.findByRole('dialog')).toBeInTheDocument()
    rerender(el(true))
    expect(screen.queryByRole('dialog')).toBeNull()
    rerender(el(false))
    expect(screen.queryByRole('dialog')).toBeNull() // stays closed after the player closes
  })

  it('empty state', async () => {
    const user = userEvent.setup()
    setup([])
    await user.click(await screen.findByRole('button', { name: 'Obaveštenja' }))
    expect(await screen.findByText('Nema obaveštenja')).toBeInTheDocument()
  })

  it('updates live from the changed event', async () => {
    const { container, push } = setup([])
    await screen.findByRole('button', { name: 'Obaveštenja' })
    push({ items: [item(1, 'a1', 'Alpha', 4, 1)], unread: 1 })
    await waitFor(() => expect(container.querySelector('.bell__badge').textContent).toBe('1'))
  })
})
