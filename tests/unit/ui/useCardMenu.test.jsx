// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest'
import { screen, fireEvent, act } from '@testing-library/react'
import { useEffect, useState } from 'react'
import { renderUi } from './helpers.jsx'
import { ContextMenu, MenuItem } from '../../../src/renderer/components/ContextMenu.jsx'
import { useCardMenu } from '../../../src/renderer/components/useCardMenu.js'

function Card({ name, spy = () => {}, mainDisabled = false, onSelect = () => {}, release = false }) {
  const { rootProps, open, menuProps } = useCardMenu({ label: name })
  return (
    <div data-testid={`card-${name}`} {...rootProps}>
      <button type="button" data-card-main disabled={mainDisabled}>{`main-${name}`}</button>
      <button type="button">{`other-${name}`}</button>
      <input aria-label={`field-${name}`} />
      {open && (
        <ContextMenu {...menuProps}>
          <MenuItem releasesFocus={release} onSelect={() => { spy(); return onSelect() }}>{`A-${name}`}</MenuItem>
        </ContextMenu>
      )}
    </div>
  )
}

function page(ui) {
  return renderUi(
    <>
      <main className="content" tabIndex={-1}>
        {ui}
        <span data-testid="outside">x</span>
      </main>
    </>,
  )
}

afterEach(() => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true
  document.querySelectorAll('[aria-modal]').forEach((n) => n.remove())
})

const main = () => document.querySelector('main.content')

describe('useCardMenu', () => {
  it('right click opens the menu and prevents the browser one', () => {
    page(<Card name="A" />)
    const ev = new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: 300, clientY: 200 })
    act(() => { screen.getByText('main-A').dispatchEvent(ev) })
    expect(screen.getByRole('menu', { name: 'A' })).toBeInTheDocument()
    expect(ev.defaultPrevented).toBe(true)
  })

  it('does nothing on an input', () => {
    page(<Card name="A" />)
    const ev = new MouseEvent('contextmenu', { bubbles: true, cancelable: true })
    act(() => { screen.getByLabelText('field-A').dispatchEvent(ev) })
    expect(screen.queryByRole('menu')).toBeNull()
    expect(ev.defaultPrevented).toBe(false)
  })

  it('does nothing outside the card', () => {
    page(<Card name="A" />)
    const ev = new MouseEvent('contextmenu', { bubbles: true, cancelable: true })
    act(() => { screen.getByTestId('outside').dispatchEvent(ev) })
    expect(screen.queryByRole('menu')).toBeNull()
    expect(ev.defaultPrevented).toBe(false)
  })

  it('Shift+F10 opens under the card and Escape returns focus to the focused button', () => {
    page(<Card name="A" />)
    const other = screen.getByText('other-A')
    other.focus()
    fireEvent.keyDown(other, { key: 'F10', shiftKey: true })
    expect(screen.getByRole('menu', { name: 'A' })).toBeInTheDocument()
    fireEvent.keyDown(screen.getByRole('menu'), { key: 'Escape' })
    expect(screen.queryByRole('menu')).toBeNull()
    expect(other).toHaveFocus()
  })

  it('the ContextMenu key opens, and a contextmenu right after does not reopen or fall through', () => {
    page(<Card name="A" />)
    const btn = screen.getByText('main-A')
    btn.focus()
    fireEvent.keyDown(btn, { key: 'ContextMenu' })
    expect(screen.getAllByRole('menu')).toHaveLength(1)
    const ev = new MouseEvent('contextmenu', { bubbles: true, cancelable: true })
    act(() => { btn.dispatchEvent(ev) })
    expect(screen.getAllByRole('menu')).toHaveLength(1)
    expect(ev.defaultPrevented).toBe(true)
  })

  it('only one menu at a time', () => {
    page(<><Card name="A" /><Card name="B" /></>)
    fireEvent.contextMenu(screen.getByText('main-A'), { clientX: 10, clientY: 10 })
    expect(screen.getByRole('menu', { name: 'A' })).toBeInTheDocument()
    fireEvent.contextMenu(screen.getByText('main-B'), { clientX: 20, clientY: 20 })
    const menus = screen.getAllByRole('menu')
    expect(menus).toHaveLength(1)
    expect(menus[0]).toHaveAccessibleName('B')
  })

  it('Escape with a removed returnTo falls back to the card main button, then to main.content', () => {
    const { rerender } = page(<Card name="A" />)
    const other = screen.getByText('other-A')
    other.focus()
    fireEvent.keyDown(other, { key: 'F10', shiftKey: true })
    other.remove()
    fireEvent.keyDown(screen.getByRole('menu'), { key: 'Escape' })
    expect(screen.getByText('main-A')).toHaveFocus()
    rerender(<main className="content" tabIndex={-1}><Card name="A" mainDisabled /><span data-testid="outside">x</span></main>)
    const root = screen.getByTestId('card-A')
    root.querySelector('input').focus()
    fireEvent.keyDown(root.querySelector('input'), { key: 'ContextMenu' })
    root.querySelector('input').remove()
    fireEvent.keyDown(screen.getByRole('menu'), { key: 'Escape' })
    expect(main()).toHaveFocus()
  })

  it('selecting an item that removes the card leaves focus on main.content, not body', async () => {
    const spy = vi.fn()
    function Parent() {
      const [gone, setGone] = useState(false)
      return gone ? null : <Card name="A" spy={spy} onSelect={() => setGone(true)} />
    }
    page(<Parent />)
    fireEvent.contextMenu(screen.getByText('main-A'), { clientX: 5, clientY: 5 })
    const item = screen.getByRole('menuitem')
    expect(item).toHaveFocus()
    fireEvent.click(item)
    await act(async () => { await Promise.resolve() })
    expect(spy).toHaveBeenCalled()
    expect(screen.queryByTestId('card-A')).toBeNull()
    expect(main()).toHaveFocus()
  })

  it('does not open while an aria-modal dialog is present', () => {
    page(<Card name="A" />)
    const dlg = document.createElement('div')
    dlg.setAttribute('aria-modal', 'true')
    document.body.appendChild(dlg)
    const ev = new MouseEvent('contextmenu', { bubbles: true, cancelable: true })
    act(() => { screen.getByText('main-A').dispatchEvent(ev) })
    expect(screen.queryByRole('menu')).toBeNull()
  })

  it('does not open inside an inert subtree', () => {
    renderUi(<div inert><main className="content" tabIndex={-1}><Card name="A" /></main></div>)
    act(() => { screen.getByText('main-A').dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true })) })
    expect(screen.queryByRole('menu')).toBeNull()
  })

  it.each([
    ['scroll', () => fireEvent.scroll(main())],
    ['resize', () => fireEvent(window, new Event('resize'))],
    ['blur', () => fireEvent(window, new Event('blur'))],
  ])('%s closes and keeps focus on the element that opened the menu (not body)', (_n, trigger) => {
    page(<Card name="A" />)
    const other = screen.getByText('other-A')
    other.focus()
    fireEvent.keyDown(other, { key: 'F10', shiftKey: true })
    expect(screen.getByRole('menuitem')).toHaveFocus()
    act(() => { trigger() })
    expect(screen.queryByRole('menu')).toBeNull()
    expect(other).toHaveFocus()
  })

  it('release: focus is left to a focus-taking element that appears after the action', async () => {
    function Host() {
      const [toast, setToast] = useState(false)
      return (
        <>
          <Card name="A" release onSelect={async () => { await Promise.resolve(); setToast(true) }} />
          {toast && <ToastLike />}
        </>
      )
    }
    function ToastLike() {
      useEffect(() => { if (document.activeElement === document.body) document.getElementById('undo').focus() }, [])
      return <button type="button" id="undo">Undo</button>
    }
    page(<Host />)
    fireEvent.contextMenu(screen.getByText('main-A'), { clientX: 5, clientY: 5 })
    await act(async () => { fireEvent.click(screen.getByRole('menuitem')) })
    await act(async () => { await new Promise((r) => setTimeout(r, 120)) })
    expect(screen.getByText('Undo')).toHaveFocus()
  })

  it('release: a rejected action does not leave focus on body', async () => {
    page(<Card name="A" release onSelect={() => Promise.reject(new Error('x'))} />)
    const other = screen.getByText('other-A')
    other.focus()
    fireEvent.keyDown(other, { key: 'F10', shiftKey: true })
    fireEvent.click(screen.getByRole('menuitem'))
    await act(async () => { await new Promise((r) => setTimeout(r, 120)) })
    expect(other).toHaveFocus()
  })

  describe('release without act (real timing)', () => {
    const wait = (ms) => new Promise((r) => setTimeout(r, ms))
    function ToastLike() {
      useEffect(() => { const a = document.activeElement; if (!a || a === document.body) document.getElementById('undo').focus() }, [])
      return <div className="toast-stack"><button type="button" id="undo">Undo</button></div>
    }
    function Host({ delay, toast }) {
      const [gone, setGone] = useState(false)
      const run = async () => { await wait(delay); setGone(true) }
      return (
        <>
          {!gone && <Card name="A" release onSelect={run} />}
          {gone && toast && <ToastLike />}
        </>
      )
    }
    async function run(props) {
      page(<Host {...props} />)
      globalThis.IS_REACT_ACT_ENVIRONMENT = false
      await wait(20)
      const btn = screen.getByText('main-A')
      btn.focus()
      fireEvent.keyDown(btn, { key: 'F10', shiftKey: true })
      await wait(20)
      fireEvent.click(screen.getByRole('menuitem'))
      await wait(250)
    }

    it.each([0, 10])('the toast keeps focus when the action removes the card (delay %i)', async (delay) => {
      await run({ delay, toast: true })
      expect(screen.queryByTestId('card-A')).toBeNull()
      expect(screen.getByText('Undo')).toHaveFocus()
    })

    it('with no toast, a removed card ends on main.content, not body', async () => {
      await run({ delay: 10, toast: false })
      expect(screen.queryByTestId('card-A')).toBeNull()
      expect(main()).toHaveFocus()
    })
  })
})
