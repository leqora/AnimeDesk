// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, fireEvent, act } from '@testing-library/react'
import { I18nProvider } from '../../../src/renderer/i18n/I18nContext.jsx'
import { ToastProvider, useToast } from '../../../src/renderer/toast/ToastProvider.jsx'

let api
function Grab() { api = useToast(); return null }
function setup() {
  vi.useFakeTimers()
  return render(<I18nProvider lang="sr"><ToastProvider><Grab /></ToastProvider></I18nProvider>)
}
afterEach(() => { vi.useRealTimers() })

describe('ToastProvider', () => {
  it('shows a message and hides it after 3 s', () => {
    setup()
    act(() => { api.show({ message: 'Zdravo' }) })
    expect(document.querySelector('.toast')).toHaveTextContent('Zdravo')
    expect(screen.getByRole('group', { name: 'Obaveštenja' })).toBeInTheDocument()
    act(() => vi.advanceTimersByTime(2900))
    expect(screen.getByText('Zdravo')).toBeInTheDocument()
    act(() => vi.advanceTimersByTime(200))
    expect(screen.queryByText('Zdravo')).not.toBeInTheDocument()
  })
  it('a toast with action stays 6 s', () => {
    setup()
    act(() => { api.show({ message: 'Obrisano', action: { label: 'Poništi', onAction: () => {} } }) })
    act(() => vi.advanceTimersByTime(5900))
    expect(screen.getByText('Obrisano')).toBeInTheDocument()
    act(() => vi.advanceTimersByTime(200))
    expect(screen.queryByText('Obrisano')).not.toBeInTheDocument()
  })
  it('four toasts: three visible, the fourth appears when one leaves', () => {
    setup()
    act(() => { for (const m of ['A', 'B', 'C', 'D']) api.show({ message: m }) })
    expect(document.querySelectorAll('.toast')).toHaveLength(3)
    expect(screen.queryByText('D')).not.toBeInTheDocument()
    act(() => vi.advanceTimersByTime(3100))
    expect(screen.getByText('D')).toBeInTheDocument()
    expect(screen.queryByText('A')).not.toBeInTheDocument()
  })
  it('hover pauses the timer and leaving resumes it', () => {
    setup()
    act(() => { api.show({ message: 'Hover' }) })
    act(() => vi.advanceTimersByTime(2000))
    const el = document.querySelector('.toast')
    fireEvent.mouseEnter(el)
    act(() => vi.advanceTimersByTime(10000))
    expect(screen.getByText('Hover')).toBeInTheDocument()
    fireEvent.mouseLeave(el)
    act(() => vi.advanceTimersByTime(900))
    expect(screen.getByText('Hover')).toBeInTheDocument()
    act(() => vi.advanceTimersByTime(200))
    expect(screen.queryByText('Hover')).not.toBeInTheDocument()
  })
  it('focus inside pauses', () => {
    setup()
    act(() => { api.show({ message: 'Fokus', action: { label: 'Poništi', onAction: () => {} } }) })
    act(() => vi.advanceTimersByTime(1000))
    const btn = screen.getByRole('button', { name: 'Poništi' })
    act(() => btn.focus())
    act(() => vi.advanceTimersByTime(20000))
    expect(screen.getByText('Fokus')).toBeInTheDocument()
    act(() => btn.blur())
    act(() => vi.advanceTimersByTime(5100))
    expect(screen.queryByText('Fokus')).not.toBeInTheDocument()
  })
  it('action click runs onAction and dismisses', () => {
    setup()
    const onAction = vi.fn()
    act(() => { api.show({ message: 'Akcija', action: { label: 'Poništi', onAction } }) })
    fireEvent.click(screen.getByRole('button', { name: 'Poništi' }))
    expect(onAction).toHaveBeenCalledTimes(1)
    expect(screen.queryByText('Akcija')).not.toBeInTheDocument()
  })
  it('action click dismisses even if onAction throws', () => {
    setup()
    const onAction = vi.fn(() => { throw new Error('boom') })
    act(() => { api.show({ message: 'Greška', action: { label: 'Poništi', onAction } }) })
    const swallow = (e) => e.preventDefault()
    window.addEventListener('error', swallow)
    try { fireEvent.click(screen.getByRole('button', { name: 'Poništi' })) } catch {}
    window.removeEventListener('error', swallow)
    expect(onAction).toHaveBeenCalled()
    expect(screen.queryByText('Greška')).not.toBeInTheDocument()
  })
  it('hold pauses and hides toasts; releasing shows them with their remaining time', () => {
    vi.useFakeTimers()
    const ui = (hold) => <I18nProvider lang="sr"><ToastProvider hold={hold}><Grab /></ToastProvider></I18nProvider>
    const { rerender } = render(ui(false))
    act(() => { api.show({ message: 'Drži' }) })
    act(() => vi.advanceTimersByTime(2000))
    rerender(ui(true))
    expect(screen.queryByText('Drži')).not.toBeInTheDocument()
    act(() => { api.show({ message: 'Novo' }) })
    act(() => vi.advanceTimersByTime(20000))
    rerender(ui(false))
    expect(screen.getByText('Drži')).toBeInTheDocument()
    expect(screen.getByText('Novo')).toBeInTheDocument()
    act(() => vi.advanceTimersByTime(900))
    expect(screen.getByText('Drži')).toBeInTheDocument()
    act(() => vi.advanceTimersByTime(200))
    expect(screen.queryByText('Drži')).not.toBeInTheDocument()
    expect(screen.getByText('Novo')).toBeInTheDocument()
  })
  it('dismiss removes a toast by id', () => {
    setup()
    let id
    act(() => { id = api.show({ message: 'Nestani' }) })
    act(() => api.dismiss(id))
    expect(screen.queryByText('Nestani')).not.toBeInTheDocument()
  })
  it('useToast outside a provider is a no-op', () => {
    function Alone() { const x = useToast(); return <button onClick={() => x.show({ message: 'x' })}>go</button> }
    render(<Alone />)
    expect(() => fireEvent.click(screen.getByText('go'))).not.toThrow()
  })

  describe('focus and live region', () => {
    const action = { label: 'Poništi', onAction: () => {} }
    const ui = (hold = false, children = null) => (
      <I18nProvider lang="sr"><ToastProvider hold={hold}><Grab />{children}</ToastProvider></I18nProvider>
    )
    it('focusAction focuses Undo when focus is on body', () => {
      vi.useFakeTimers()
      render(ui())
      act(() => document.activeElement.blur())
      act(() => { api.show({ message: 'x', focusAction: true, action }) })
      expect(screen.getByRole('button', { name: 'Poništi' })).toHaveFocus()
    })
    it('focusAction does not steal focus from a focused control', () => {
      vi.useFakeTimers()
      render(ui(false, <input aria-label="polje" />))
      const input = screen.getByLabelText('polje')
      act(() => input.focus())
      act(() => { api.show({ message: 'x', focusAction: true, action }) })
      expect(input).toHaveFocus()
    })
    it('focusAction applies only on first mount', () => {
      vi.useFakeTimers()
      const { rerender } = render(ui(false, <input aria-label="polje" />))
      const input = screen.getByLabelText('polje')
      act(() => input.focus())
      act(() => { api.show({ message: 'x', focusAction: true, action }) })
      expect(input).toHaveFocus()
      act(() => input.blur())
      rerender(ui(true, <input aria-label="polje" />))
      rerender(ui(false, <input aria-label="polje" />))
      expect(screen.getByRole('button', { name: 'Poništi' })).not.toHaveFocus()
    })
    it('focus moves to the next toast action when the focused toast closes', () => {
      vi.useFakeTimers()
      render(ui())
      act(() => { api.show({ message: 'A', action: { label: 'Prvi', onAction: () => {} } }) })
      act(() => { api.show({ message: 'B', action: { label: 'Drugi', onAction: () => {} } }) })
      const first = screen.getByRole('button', { name: 'Prvi' })
      act(() => first.focus())
      fireEvent.click(first)
      act(() => vi.advanceTimersByTime(0))
      expect(screen.getByRole('button', { name: 'Drugi' })).toHaveFocus()
    })
    it('focus falls back to main when the last focused toast closes', () => {
      vi.useFakeTimers()
      render(ui(false, <main className="content" tabIndex={-1} data-testid="main" />))
      let id
      act(() => { id = api.show({ message: 'A', action }) })
      act(() => screen.getByRole('button', { name: 'Poništi' }).focus())
      act(() => api.dismiss(id))
      act(() => vi.advanceTimersByTime(0))
      expect(screen.getByTestId('main')).toHaveFocus()
    })
    it('focus falls back to an open modal dialog instead of main', () => {
      vi.useFakeTimers()
      render(ui(false, <>
        <main className="content" tabIndex={-1} data-testid="main" />
        <div role="dialog" aria-modal="true" tabIndex={-1} data-testid="dlg" />
      </>))
      let id
      act(() => { id = api.show({ message: 'A', action }) })
      act(() => screen.getByRole('button', { name: 'Poništi' }).focus())
      act(() => api.dismiss(id))
      act(() => vi.advanceTimersByTime(0))
      expect(screen.getByTestId('dlg')).toHaveFocus()
      expect(screen.getByTestId('main')).not.toHaveFocus()
    })
    it('does not pull focus when the closing toast did not hold it', () => {
      vi.useFakeTimers()
      render(ui(false, <main className="content" tabIndex={-1} data-testid="main" />))
      let id
      act(() => { id = api.show({ message: 'A', action }) })
      act(() => api.dismiss(id))
      act(() => vi.advanceTimersByTime(0))
      expect(screen.getByTestId('main')).not.toHaveFocus()
    })
    it('stack container is always rendered with aria-live polite', () => {
      vi.useFakeTimers()
      const { rerender } = render(ui())
      const region = () => screen.getByRole('group', { name: 'Obaveštenja' })
      expect(region()).toHaveAttribute('aria-live', 'polite')
      act(() => { api.show({ message: 'Zdravo' }) })
      expect(document.querySelector('.toast')).not.toHaveAttribute('role')
      rerender(ui(true))
      expect(region()).toHaveAttribute('aria-live', 'polite')
      expect(document.querySelector('.toast')).toBeNull()
    })
  })
})
