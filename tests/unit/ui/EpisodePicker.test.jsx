// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest'
import { screen, fireEvent } from '@testing-library/react'
import { renderUi } from './helpers.jsx'
import { EpisodePicker } from '../../../src/renderer/components/EpisodePicker.jsx'

const range = (a, b) => Array.from({ length: b - a + 1 }, (_, i) => String(a + i))
const base = (over = {}) => ({ episodes: range(1, 12), selected: [], watched: [], onToggle: vi.fn(), ...over })

describe('EpisodePicker', () => {
  it('shows all episodes without groups or go-to for short series', () => {
    renderUi(<EpisodePicker {...base({ watched: [1], selected: ['3'] })}><button type="button">Akcija</button></EpisodePicker>)
    expect(screen.getAllByRole('button', { name: /^\d+$/ })).toHaveLength(12)
    expect(screen.queryByRole('group', { name: 'Grupe epizoda' })).not.toBeInTheDocument()
    expect(screen.queryByLabelText('Idi na epizodu')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: '1' })).toHaveClass('ep--watched')
    expect(screen.getByRole('button', { name: '3' })).toHaveAttribute('aria-pressed', 'true')
    fireEvent.click(screen.getByRole('button', { name: '5' }))
    expect(screen.getByRole('button', { name: 'Akcija' })).toBeInTheDocument()
  })
  it('opens the last group when every episode is watched', () => {
    const p = base({ episodes: range(1, 250), watched: range(1, 250).map(Number) })
    renderUi(<EpisodePicker {...p} />)
    expect(screen.getByRole('button', { name: '201–250' })).toHaveAttribute('aria-pressed', 'true')
  })
  it('opens the group with the first unwatched episode in long series', () => {
    const p = base({ episodes: range(1, 1120), watched: range(1, 250).map(Number) })
    renderUi(<EpisodePicker {...p} />)
    expect(screen.getByRole('button', { name: '201–300' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getAllByRole('button', { name: /^\d+$/ })).toHaveLength(100)
    expect(screen.getByRole('button', { name: '251' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: '1101–1120' }))
    expect(screen.getAllByRole('button', { name: /^\d+$/ })).toHaveLength(20)
  })
  it('jumps to an episode, selects it, and reports a missing one', () => {
    const p = base({ episodes: [...range(1, 150), '150.5'] })
    renderUi(<EpisodePicker {...p} />)
    fireEvent.change(screen.getByLabelText('Idi na epizodu'), { target: { value: '150.5' } })
    fireEvent.submit(screen.getByLabelText('Idi na epizodu'))
    expect(screen.getByRole('button', { name: '101–150.5' })).toHaveAttribute('aria-pressed', 'true')
    expect(p.onToggle).toHaveBeenCalledWith('150.5')
    fireEvent.change(screen.getByLabelText('Idi na epizodu'), { target: { value: '999' } })
    fireEvent.submit(screen.getByLabelText('Idi na epizodu'))
    expect(screen.getByText('Epizoda ne postoji')).toBeInTheDocument()
    expect(p.onToggle).toHaveBeenCalledTimes(1)
  })
  it('does not unselect an already selected episode when jumping to it', () => {
    const p = base({ episodes: range(1, 150), selected: ['120'] })
    renderUi(<EpisodePicker {...p} />)
    fireEvent.change(screen.getByLabelText('Idi na epizodu'), { target: { value: '120' } })
    fireEvent.submit(screen.getByLabelText('Idi na epizodu'))
    expect(p.onToggle).not.toHaveBeenCalled()
  })
  it('shows quality and mode selects only with prefs and reports changes', () => {
    const onPrefs = vi.fn()
    const { rerender } = renderUi(<EpisodePicker {...base()} />)
    expect(screen.queryByLabelText('Kvalitet')).not.toBeInTheDocument()
    rerender(<EpisodePicker {...base()} prefs={{ quality: null, mode: 'dub' }} onPrefs={onPrefs} />)
    expect(screen.getByLabelText('Kvalitet')).toHaveValue('')
    expect(screen.getByLabelText('Režim')).toHaveValue('dub')
    fireEvent.change(screen.getByLabelText('Kvalitet'), { target: { value: '720' } })
    expect(onPrefs).toHaveBeenCalledWith({ quality: '720' })
    fireEvent.change(screen.getByLabelText('Režim'), { target: { value: '' } })
    expect(onPrefs).toHaveBeenLastCalledWith({ mode: null })
  })
  it('scrolls once per jump, including repeated jumps to the same episode', () => {
    const orig = Element.prototype.scrollIntoView
    const scroll = vi.fn()
    Element.prototype.scrollIntoView = scroll
    try {
      renderUi(<EpisodePicker {...base({ episodes: range(1, 150) })} />)
      const input = screen.getByLabelText('Idi na epizodu')
      fireEvent.change(input, { target: { value: '120' } })
      fireEvent.submit(input)
      expect(scroll).toHaveBeenCalledTimes(1)
      fireEvent.submit(input)
      expect(scroll).toHaveBeenCalledTimes(2)
      fireEvent.click(screen.getByRole('button', { name: '1–100' }))
      fireEvent.click(screen.getByRole('button', { name: '101–150' }))
      expect(scroll).toHaveBeenCalledTimes(2)
    } finally {
      Element.prototype.scrollIntoView = orig
    }
  })
})
