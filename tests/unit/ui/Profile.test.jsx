// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest'
import { screen, fireEvent, within } from '@testing-library/react'
import { renderUi } from './helpers.jsx'
import { XpBar } from '../../../src/renderer/components/XpBar.jsx'
import { initials } from '../../../src/renderer/initials.js'
import { ProfilePage } from '../../../src/renderer/pages/ProfilePage.jsx'
import { EMPTY_STATS } from '../../../src/shared/stats.js'
import { ACHIEVEMENTS } from '../../../src/shared/achievements.js'

const stats = {
  ...EMPTY_STATS, xp: 3100, level: 11, title: 'veteran', xpIntoLevel: 1240, xpForNext: 1500,
  episodes: 1240, hours: 42, completed: 7, avgRating: 8.5, streakDays: 5,
  topGenres: [{ genre: 'Action', episodes: 40 }, { genre: 'Drama', episodes: 20 }],
  activity: EMPTY_STATS.activity.map((d, i) => ({ date: `2026-09-${String(i + 1).padStart(2, '0')}`, count: i === 27 ? 4 : 0 })),
}

describe('XpBar', () => {
  it('fills proportionally and clamps', () => {
    const { container, rerender } = renderUi(<XpBar into={50} total={100} />)
    expect(container.querySelector('.xp-bar__fill').style.transform).toBe('scaleX(0.5)')
    rerender(<XpBar into={500} total={100} />)
    expect(container.querySelector('.xp-bar__fill').style.transform).toBe('scaleX(1)')
    rerender(<XpBar into={5} total={0} />)
    expect(container.querySelector('.xp-bar__fill').style.transform).toBe('scaleX(0)')
    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '5')
  })
})

describe('initials', () => {
  it('makes initials', () => {
    expect(initials('Nikola Lelekovic')).toBe('NL')
    expect(initials('nikola')).toBe('N')
    expect(initials('  ')).toBe('?')
  })
})

describe('ProfilePage', () => {
  it('shows stats formatted for Serbian', () => {
    renderUi(<ProfilePage stats={stats} name="Nikola" lang="sr" />)
    expect(screen.getByRole('heading', { name: 'Nikola' })).toBeInTheDocument()
    expect(screen.getByText('1.240 / 1.500 XP')).toBeInTheDocument()
    expect(screen.getByText('1.240')).toBeInTheDocument()
    expect(screen.getByText('~42')).toBeInTheDocument()
    expect(screen.getByText('8,5')).toBeInTheDocument()
    expect(screen.getByText('Niz dana: 5')).toBeInTheDocument()
    expect(screen.getByText('Action')).toBeInTheDocument()
    const cells = screen.getAllByTestId('activity-cell')
    expect(cells).toHaveLength(28)
    expect(cells[27]).toHaveClass('activity-cell--l3')
    expect(cells[0]).toHaveClass('activity-cell--l0')
    expect(screen.queryByText('Odgledaj prvu epizodu da počneš.')).not.toBeInTheDocument()
  })
  it('shows the empty state for a new install', () => {
    renderUi(<ProfilePage stats={EMPTY_STATS} name="Nikola" lang="en" />, { lang: 'en' })
    expect(screen.getByText('Watch your first episode to get started.')).toBeInTheDocument()
    expect(screen.getByText('LV 1 · Rookie')).toBeInTheDocument()
    expect(screen.getByText('—')).toBeInTheDocument()
  })
})

describe('Profile page header (v0.19.0)', () => {
  it('has the header with a subtitle; the name is a lower heading', () => {
    const { container } = renderUi(<ProfilePage stats={stats} name="Nikola" lang="sr" />)
    const head = container.querySelector('header.page__head')
    expect(head.querySelector('h2').textContent).toBe('Profil')
    expect(head).toHaveTextContent('Nivo, XP i dostignuća')
    expect(screen.getByRole('heading', { level: 3, name: 'Nikola' })).toBeInTheDocument()
  })
})

describe('Profile achievements and statistics (v0.22.0)', () => {
  const ach = (over = {}) => ACHIEVEMENTS.map((a) => ({ id: a.id, icon: a.icon, goal: a.goal, value: 0, unlockedAt: null, ...(over[a.id] ?? {}) }))
  const withAch = (over, extra = {}) => ({ ...EMPTY_STATS, achievements: ach(over), ...extra })
  const tile = (id) => document.querySelector(`[data-ach="${id}"]`)

  it('shows the count heading and unlocked/locked tiles', () => {
    renderUi(<ProfilePage stats={withAch({ 'first-episode': { value: 1, unlockedAt: '2026-11-04T10:00:00.000Z' }, 'episodes-50': { value: 37 }, 'episodes-250': { value: 300, unlockedAt: '2026-11-03T10:00:00.000Z' } })} name="N" lang="sr" />)
    expect(screen.getByRole('heading', { name: 'Dostignuća · 2 / 21' })).toBeInTheDocument()
    const done = within(tile('first-episode'))
    expect(done.getByText(/^Otključano /)).toBeInTheDocument()
    expect(done.queryByText(/\d+ \/ \d+/)).toBeNull()
    const locked = within(tile('episodes-50'))
    expect(locked.getByText('37 / 50')).toBeInTheDocument()
    expect(locked.getByText('zaključano, 37 od 50')).toBeInTheDocument()
    expect(done.getByText('otključano')).toBeInTheDocument()
  })
  it('formats hours measures', () => {
    renderUi(<ProfilePage stats={withAch({ 'day-of-anime': { value: 3.46 }, 'hours-250': { value: 120.4 } })} name="N" lang="sr" />)
    expect(within(tile('day-of-anime')).getByText('3,5 / 24')).toBeInTheDocument()
    expect(within(tile('hours-250')).getByText('120 / 250')).toBeInTheDocument()
  })
  it('has no focusable tiles', () => {
    renderUi(<ProfilePage stats={withAch({})} name="N" lang="sr" />)
    const list = screen.getByRole('list', { name: /Dostignuća/ })
    expect(within(list).queryAllByRole('button')).toHaveLength(0)
    expect(list.querySelector('[tabindex]')).toBeNull()
    expect(within(list).getAllByRole('listitem')).toHaveLength(21)
  })
  it('omits the achievements section before the first stats load', () => {
    renderUi(<ProfilePage stats={EMPTY_STATS} name="N" lang="sr" />)
    expect(screen.queryByText(/^Dostignuća ·/)).toBeNull()
  })
  it('shows the longest streak tile', () => {
    renderUi(<ProfilePage stats={{ ...EMPTY_STATS, longestStreak: 9 }} name="N" lang="sr" />)
    expect(screen.getByText('9')).toBeInTheDocument()
    expect(screen.getByText('Najduži niz')).toBeInTheDocument()
  })
  it('renders 12 weekly bars with accessible text', () => {
    const weeklyHours = Array.from({ length: 12 }, (_, i) => ({ start: i === 11 ? '2026-11-02' : `2026-08-${String(10 + i).padStart(2, '0')}`, hours: i === 11 ? 2 : 0 }))
    const { container } = renderUi(<ProfilePage stats={{ ...EMPTY_STATS, weeklyHours }} name="N" lang="sr" />)
    expect(container.querySelectorAll('.week-bar')).toHaveLength(12)
    expect(screen.getByText('Nedelja od 2. 11.: 2 h')).toBeInTheDocument()
    expect(screen.getByText('2. 11.')).toBeInTheDocument()
  })
  it('time of day: empty below 5, bars otherwise', () => {
    const { unmount } = renderUi(<ProfilePage stats={{ ...EMPTY_STATS, timeOfDay: { morning: 1, afternoon: 1, evening: 1, night: 0, total: 3 } }} name="N" lang="sr" />)
    expect(screen.getByText('Gledaj u aplikaciji nekoliko dana pa će se ovde videti kad najčešće gledaš.')).toBeInTheDocument()
    unmount()
    renderUi(<ProfilePage stats={{ ...EMPTY_STATS, timeOfDay: { morning: 1, afternoon: 2, evening: 3, night: 0, total: 6 } }} name="N" lang="sr" />)
    for (const l of ['Jutro', 'Popodne', 'Veče', 'Noć']) expect(screen.getByText(l)).toBeInTheDocument()
  })
  it('top this month: click opens, plurals, empty state', () => {
    const onOpenAnime = vi.fn()
    const topThisMonth = [{ animeId: 'id-a', title: 'Alpha', episodes: 5 }, { animeId: 'id-b', title: 'Beta', episodes: 2 }, { animeId: 'id-c', title: 'Gamma', episodes: 1 }]
    const { unmount } = renderUi(<ProfilePage stats={{ ...EMPTY_STATS, topThisMonth }} name="N" lang="sr" onOpenAnime={onOpenAnime} />)
    expect(screen.getByText('5 epizoda')).toBeInTheDocument()
    expect(screen.getByText('2 epizode')).toBeInTheDocument()
    expect(screen.getByText('1 epizoda')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /Beta/ }))
    expect(onOpenAnime).toHaveBeenCalledWith('id-b')
    unmount()
    renderUi(<ProfilePage stats={EMPTY_STATS} name="N" lang="sr" />)
    expect(screen.getByText('Ovog meseca još ništa.')).toBeInTheDocument()
  })
})
