// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, fireEvent, act } from '@testing-library/react'
import { I18nProvider } from '../../../src/renderer/i18n/I18nContext.jsx'
import { ToastProvider, useToast } from '../../../src/renderer/toast/ToastProvider.jsx'

let api
function Grab() { api = useToast(); return null }
function setup() {
  vi.useFakeTimers()
  render(<I18nProvider lang="sr"><ToastProvider><Grab /></ToastProvider></I18nProvider>)
}
afterEach(() => { vi.useRealTimers() })

describe('ToastProvider', () => {
  it('shows a message and hides it after 3 s', () => {
    setup()
    act(() => { api.show({ message: 'Zdravo' }) })
    expect(screen.getByRole('status')).toHaveTextContent('Zdravo')
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
    expect(screen.getAllByRole('status')).toHaveLength(3)
    expect(screen.queryByText('D')).not.toBeInTheDocument()
    act(() => vi.advanceTimersByTime(3100))
    expect(screen.getByText('D')).toBeInTheDocument()
    expect(screen.queryByText('A')).not.toBeInTheDocument()
  })
  it('hover pauses the timer and leaving resumes it', () => {
    setup()
    act(() => { api.show({ message: 'Hover' }) })
    act(() => vi.advanceTimersByTime(2000))
    const el = screen.getByRole('status')
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
})
