// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest'
import { useState } from 'react'
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react'
import App from '../../../src/renderer/App.jsx'
import { Modal } from '../../../src/renderer/components/Modal.jsx'
import { AskDialog } from '../../../src/renderer/components/AskDialog.jsx'
import { SetupWizard } from '../../../src/renderer/pages/SetupWizard.jsx'
import { makeFakeApi, renderUi } from './helpers.jsx'

vi.mock('hls.js', async () => ({ default: (await import('./fakeHls.js')).FakeHls }))

const esc = () => fireEvent.keyDown(window, { key: 'Escape' })

describe('Modal', () => {
  it('has dialog role, aria-modal and a name', () => {
    render(<Modal label="Naslov"><button>A</button></Modal>)
    const d = screen.getByRole('dialog', { name: 'Naslov' })
    expect(d).toHaveAttribute('aria-modal', 'true')
  })
  it('focuses the first focusable element on open', () => {
    render(<Modal label="N"><button>A</button><button>B</button></Modal>)
    expect(screen.getByText('A')).toHaveFocus()
  })
  it('focuses initialFocus when given', () => {
    const Host = () => {
      const ref = { current: null }
      return <Modal label="N" initialFocus={ref}><button>A</button><button ref={(el) => { ref.current = el }}>B</button></Modal>
    }
    // ref is assigned during commit, before effects run
    render(<Host />)
    expect(screen.getByText('B')).toHaveFocus()
  })
  it('Tab from the last button goes to the first, Shift+Tab from the first to the last', () => {
    render(<Modal label="N"><button>A</button><button>B</button></Modal>)
    screen.getByText('B').focus()
    fireEvent.keyDown(screen.getByText('B'), { key: 'Tab' })
    expect(screen.getByText('A')).toHaveFocus()
    fireEvent.keyDown(screen.getByText('A'), { key: 'Tab', shiftKey: true })
    expect(screen.getByText('B')).toHaveFocus()
  })
  it('Esc calls onClose and marks the event handled', () => {
    const onClose = vi.fn()
    render(<Modal label="N" onClose={onClose}><button>A</button></Modal>)
    let prevented
    window.addEventListener('keydown', (e) => { prevented = e.defaultPrevented }, { once: true })
    esc()
    expect(onClose).toHaveBeenCalledTimes(1)
    expect(prevented).toBe(true)
  })
  it('with two modals only the top one closes on Esc', () => {
    const a = vi.fn(); const b = vi.fn()
    render(<><Modal label="A" onClose={a}><button>x</button></Modal><Modal label="B" onClose={b}><button>y</button></Modal></>)
    esc()
    expect(b).toHaveBeenCalledTimes(1)
    expect(a).not.toHaveBeenCalled()
  })
  it('restores focus to the opener after close', () => {
    const Host = () => {
      const [open, setOpen] = useState(false)
      return <><button onClick={() => setOpen(true)}>Open</button>{open && <Modal label="N" onClose={() => setOpen(false)}><button>A</button></Modal>}</>
    }
    render(<Host />)
    screen.getByText('Open').focus()
    fireEvent.click(screen.getByText('Open'))
    expect(screen.getByText('A')).toHaveFocus()
    esc()
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(screen.getByText('Open')).toHaveFocus()
  })
  it('Esc in fullscreen closes the ask dialog but does not leave fullscreen', async () => {
    let ask
    const api = makeFakeApi({ watch: { onAsk: vi.fn((cb) => { ask = cb; return () => {} }) } })
    api.window.getFullscreen.mockResolvedValue(true)
    render(<App api={api} />)
    await waitFor(() => expect(ask).toBeDefined())
    await waitFor(() => expect(api.window.onFullscreen).toHaveBeenCalled())
    act(() => ask({ aniCliTitle: 'Show', episode: '3' }))
    const dlg = await screen.findByRole('dialog')
    expect(dlg).toBeInTheDocument()
    esc()
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(api.window.setFullscreen).not.toHaveBeenCalled()
  })
  it('zero focusables: box gets focus and Tab / Shift+Tab keep it there', () => {
    render(<Modal label="N"><p>text</p></Modal>)
    const box = screen.getByRole('dialog')
    expect(box).toHaveFocus()
    fireEvent.keyDown(box, { key: 'Tab' })
    expect(box).toHaveFocus()
    fireEvent.keyDown(box, { key: 'Tab', shiftKey: true })
    expect(box).toHaveFocus()
    box.blur()
    fireEvent.keyDown(window, { key: 'Tab', shiftKey: true })
    expect(box).toHaveFocus()
  })
  it('skips disabled buttons at either end of the trap', () => {
    render(<Modal label="N"><button disabled>X</button><button>A</button><button>B</button><button disabled>Y</button></Modal>)
    expect(screen.getByText('A')).toHaveFocus()
    screen.getByText('B').focus()
    fireEvent.keyDown(screen.getByText('B'), { key: 'Tab' })
    expect(screen.getByText('A')).toHaveFocus()
    fireEvent.keyDown(screen.getByText('A'), { key: 'Tab', shiftKey: true })
    expect(screen.getByText('B')).toHaveFocus()
  })
  it('Tab with focus escaped to body pulls it back into the box', () => {
    render(<Modal label="N"><button>A</button><button>B</button></Modal>)
    document.body.focus()
    ;(document.activeElement).blur?.()
    fireEvent.keyDown(window, { key: 'Tab' })
    expect(screen.getByText('A')).toHaveFocus()
    document.activeElement.blur()
    fireEvent.keyDown(window, { key: 'Tab', shiftKey: true })
    expect(screen.getByText('B')).toHaveFocus()
  })
  it('unmounting a non-top modal keeps the stack right: Esc closes the remaining top one', () => {
    const a = vi.fn(); const b = vi.fn()
    const Host = ({ showA }) => <>{showA && <Modal label="A" onClose={a}><button>x</button></Modal>}<Modal label="B" onClose={b}><button>y</button></Modal></>
    const { rerender } = render(<Host showA />)
    rerender(<Host showA={false} />)
    esc()
    expect(b).toHaveBeenCalledTimes(1)
    expect(a).not.toHaveBeenCalled()
  })
  it('does not throw when the opener was removed before close', () => {
    const Host = () => {
      const [open, setOpen] = useState(false)
      const [hasOpener, setHasOpener] = useState(true)
      return <>{hasOpener && <button onClick={() => setOpen(true)}>Open</button>}<button onClick={() => setHasOpener(false)}>Drop</button>{open && <Modal label="N" onClose={() => setOpen(false)}><button>A</button></Modal>}</>
    }
    render(<Host />)
    screen.getByText('Open').focus()
    fireEvent.click(screen.getByText('Open'))
    // remove opener while the modal is open
    act(() => { fireEvent.click(screen.getByText('Drop')) })
    expect(() => esc()).not.toThrow()
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })
  it('ignores Esc already consumed by a nested handler', () => {
    const onClose = vi.fn()
    render(<Modal label="N" onClose={onClose}><button>A</button></Modal>)
    const stop = (e) => e.preventDefault()
    // runs before the Modal's window listener? register on capture phase of window
    window.addEventListener('keydown', stop, true)
    esc()
    window.removeEventListener('keydown', stop, true)
    expect(onClose).not.toHaveBeenCalled()
  })
})

describe('dialogs on Modal', () => {
  it('AskDialog: starts focused on Yes and Esc answers no', () => {
    const api = makeFakeApi()
    const onDone = vi.fn()
    renderUi(<AskDialog ask={{ aniCliTitle: 'Show', episode: '3' }} onDone={onDone} />, { api })
    expect(screen.getByRole('button', { name: 'Da' })).toHaveFocus()
    esc()
    expect(api.library.recordWatched).not.toHaveBeenCalled()
    expect(onDone).toHaveBeenCalledTimes(1)
  })
  it('SetupWizard: Esc closes', () => {
    const api = makeFakeApi()
    const onClose = vi.fn()
    renderUi(<SetupWizard health={{ light: 'green', reason: 'ok' }} onClose={onClose} />, { api })
    esc()
    expect(onClose).toHaveBeenCalledTimes(1)
  })
})
