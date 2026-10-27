// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { Tabs } from '../../../src/renderer/components/Tabs.jsx'

const tabs = [
  { id: 'a', label: 'Prva', content: <p>sadrzaj A</p> },
  { id: 'b', label: 'Druga', content: <p>sadrzaj B</p> },
  { id: 'c', label: 'Treca', content: <p>sadrzaj C</p> },
]
const setup = (value = 'a') => {
  const onChange = vi.fn()
  render(<Tabs label="Delovi" tabs={tabs} value={value} onChange={onChange} />)
  return onChange
}

describe('Tabs', () => {
  it('has a labelled tablist with aria-selected tabs wired to panels', () => {
    setup('b')
    expect(screen.getByRole('tablist', { name: 'Delovi' })).toBeInTheDocument()
    const tab = screen.getByRole('tab', { name: 'Druga' })
    expect(tab).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByRole('tab', { name: 'Prva' })).toHaveAttribute('aria-selected', 'false')
    expect(screen.getByRole('tabpanel', { name: 'Druga' })).toHaveAttribute('id', tab.getAttribute('aria-controls'))
  })
  it('only the active tab is in the Tab order', () => {
    setup('b')
    expect(screen.getByRole('tab', { name: 'Druga' })).toHaveAttribute('tabindex', '0')
    expect(screen.getByRole('tab', { name: 'Prva' })).toHaveAttribute('tabindex', '-1')
    expect(screen.getByRole('tab', { name: 'Treca' })).toHaveAttribute('tabindex', '-1')
  })
  it('ArrowRight from the last wraps to the first, focuses it and calls onChange', () => {
    const onChange = setup('c')
    fireEvent.keyDown(screen.getByRole('tab', { name: 'Treca' }), { key: 'ArrowRight' })
    expect(onChange).toHaveBeenCalledWith('a')
    expect(document.activeElement).toBe(screen.getByRole('tab', { name: 'Prva' }))
  })
  it('ArrowLeft from the first wraps to the last', () => {
    const onChange = setup('a')
    fireEvent.keyDown(screen.getByRole('tab', { name: 'Prva' }), { key: 'ArrowLeft' })
    expect(onChange).toHaveBeenCalledWith('c')
  })
  it('End and Home jump to the ends', () => {
    const onChange = setup('b')
    fireEvent.keyDown(screen.getByRole('tab', { name: 'Druga' }), { key: 'End' })
    expect(onChange).toHaveBeenLastCalledWith('c')
    fireEvent.keyDown(screen.getByRole('tab', { name: 'Druga' }), { key: 'Home' })
    expect(onChange).toHaveBeenLastCalledWith('a')
  })
  it('inactive panels are hidden but stay in the DOM', () => {
    setup('a')
    expect(screen.getByText('sadrzaj A')).toBeVisible()
    const b = screen.getByText('sadrzaj B')
    expect(b).toBeInTheDocument()
    expect(b.closest('[role="tabpanel"]')).toHaveAttribute('hidden')
    expect(screen.queryByRole('tabpanel', { name: 'Druga' })).toBeNull()
  })
  it('click selects', () => {
    const onChange = setup('a')
    fireEvent.click(screen.getByRole('tab', { name: 'Treca' }))
    expect(onChange).toHaveBeenCalledWith('c')
  })
})
