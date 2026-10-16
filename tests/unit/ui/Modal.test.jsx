// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest'
import { useState } from 'react'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
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
  it('Esc in fullscreen closes the dialog but does not leave fullscreen', async () => {
    const api = makeFakeApi()
    api.window.getFullscreen.mockResolvedValue(true)
    api.whatsNew.get.mockResolvedValue({ version: '0.7.3', notes: 'beleške' })
    render(<App api={api} />)
    await screen.findByRole('dialog')
    await waitFor(() => expect(api.window.getFullscreen).toHaveBeenCalled())
    await new Promise((r) => setTimeout(r, 20))
    esc()
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(api.window.setFullscreen).not.toHaveBeenCalled()
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
