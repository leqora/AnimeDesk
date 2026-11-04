// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest'
import { screen, fireEvent } from '@testing-library/react'
import { renderUi } from './helpers.jsx'
import { ContextMenu, MenuItem, MenuSeparator, MenuGroup } from '../../../src/renderer/components/ContextMenu.jsx'

const pointer = (x = 100, y = 100) => ({ kind: 'pointer', anchor: { x, y, altY: y } })

function setup(props = {}, items) {
  const onClose = vi.fn()
  const onA = vi.fn()
  const ui = renderUi(
    <main className="content">
      <ContextMenu label="Naruto" position={pointer()} onClose={onClose} {...props}>
        {items ?? (
          <>
            <MenuItem onSelect={onA}>A</MenuItem>
            <MenuItem onSelect={() => {}}>B</MenuItem>
            <MenuSeparator />
            <MenuItem onSelect={() => {}}>C</MenuItem>
          </>
        )}
      </ContextMenu>
    </main>,
  )
  return { onClose, onA, ...ui }
}

afterEach(() => { vi.restoreAllMocks() })

describe('ContextMenu', () => {
  it('opens as a labelled menu with focus on the first item', () => {
    setup()
    expect(screen.getByRole('menu', { name: 'Naruto' })).toBeInTheDocument()
    expect(screen.getByRole('menuitem', { name: 'A' })).toHaveFocus()
  })

  it('renders into document.body (portal)', () => {
    const { container } = setup()
    expect(container.querySelector('.context-menu')).toBeNull()
    expect(document.body.querySelector(':scope > .context-menu')).not.toBeNull()
  })

  it('moves with arrows, wraps, Home and End', () => {
    setup()
    const menu = screen.getByRole('menu')
    fireEvent.keyDown(menu, { key: 'ArrowDown' })
    expect(screen.getByRole('menuitem', { name: 'B' })).toHaveFocus()
    fireEvent.keyDown(menu, { key: 'ArrowDown' })
    fireEvent.keyDown(menu, { key: 'ArrowDown' })
    expect(screen.getByRole('menuitem', { name: 'A' })).toHaveFocus()
    fireEvent.keyDown(menu, { key: 'End' })
    expect(screen.getByRole('menuitem', { name: 'C' })).toHaveFocus()
    fireEvent.keyDown(menu, { key: 'Home' })
    expect(screen.getByRole('menuitem', { name: 'A' })).toHaveFocus()
  })

  it('closes on Escape and Tab with the reason', () => {
    const { onClose } = setup()
    const menu = screen.getByRole('menu')
    fireEvent.keyDown(menu, { key: 'Escape' })
    expect(onClose).toHaveBeenLastCalledWith('escape')
    fireEvent.keyDown(menu, { key: 'Tab' })
    expect(onClose).toHaveBeenLastCalledWith('tab')
  })

  it('selecting an item runs onSelect and then closes with select', () => {
    const { onClose, onA } = setup()
    fireEvent.click(screen.getByRole('menuitem', { name: 'A' }))
    expect(onA).toHaveBeenCalledTimes(1)
    expect(onClose).toHaveBeenCalledWith('select')
    expect(onA.mock.invocationCallOrder[0]).toBeLessThan(onClose.mock.invocationCallOrder[0])
  })

  it('an item that navigates closes with navigate', () => {
    const { onClose } = setup({}, <MenuItem navigates onSelect={() => {}}>Go</MenuItem>)
    fireEvent.click(screen.getByRole('menuitem', { name: 'Go' }))
    expect(onClose).toHaveBeenCalledWith('navigate')
  })

  it('a disabled item is aria-disabled, stays focusable and does nothing on click', () => {
    const onSelect = vi.fn()
    const { onClose } = setup({}, (
      <>
        <MenuItem disabled onSelect={onSelect}>Off</MenuItem>
        <MenuItem onSelect={() => {}}>On</MenuItem>
      </>
    ))
    const off = screen.getByRole('menuitem', { name: 'Off' })
    expect(off).toHaveAttribute('aria-disabled', 'true')
    expect(off).toHaveFocus()
    fireEvent.click(off)
    expect(onSelect).not.toHaveBeenCalled()
    expect(onClose).not.toHaveBeenCalled()
  })

  it('checked makes it a menuitemradio with aria-checked', () => {
    setup({}, (
      <>
        <MenuItem checked onSelect={() => {}}>Now</MenuItem>
        <MenuItem checked={false} onSelect={() => {}}>Later</MenuItem>
      </>
    ))
    expect(screen.getByRole('menuitemradio', { name: 'Now' })).toHaveAttribute('aria-checked', 'true')
    expect(screen.getByRole('menuitemradio', { name: 'Later' })).toHaveAttribute('aria-checked', 'false')
  })

  it('a group is labelled and the separator is a separator', () => {
    setup({}, (
      <>
        <MenuGroup label="Status"><MenuItem checked onSelect={() => {}}>X</MenuItem></MenuGroup>
        <MenuSeparator />
      </>
    ))
    expect(screen.getByRole('group', { name: 'Status' })).toBeInTheDocument()
    expect(screen.getByRole('separator')).toBeInTheDocument()
  })

  it('mousedown outside closes, inside does not', () => {
    const { onClose } = setup()
    fireEvent.mouseDown(screen.getByRole('menuitem', { name: 'B' }))
    expect(onClose).not.toHaveBeenCalled()
    fireEvent.mouseDown(document.body)
    expect(onClose).toHaveBeenCalledWith('outside')
  })

  it('contextmenu outside closes', () => {
    const { onClose } = setup()
    fireEvent.contextMenu(document.body)
    expect(onClose).toHaveBeenCalledWith('outside')
  })

  it('scroll of an ancestor closes, scroll of the menu itself does not', () => {
    const { onClose, container } = setup()
    fireEvent.scroll(screen.getByRole('menu'))
    expect(onClose).not.toHaveBeenCalled()
    fireEvent.scroll(container.querySelector('main'))
    expect(onClose).toHaveBeenCalledWith('scroll')
  })

  it('closes on window resize and blur', () => {
    const { onClose } = setup()
    fireEvent(window, new Event('resize'))
    expect(onClose).toHaveBeenLastCalledWith('resize')
    fireEvent(window, new Event('blur'))
    expect(onClose).toHaveBeenLastCalledWith('blur')
  })

  it('closes when focus moves to an element outside', () => {
    const { onClose } = setup()
    const outside = document.createElement('button')
    document.body.appendChild(outside)
    fireEvent.focusOut(screen.getByRole('menuitem', { name: 'A' }), { relatedTarget: outside })
    expect(onClose).toHaveBeenCalledWith('focusout')
    outside.remove()
  })

  it('does not close when focus leaves to nothing (item removed) or stays inside', () => {
    const { onClose } = setup()
    fireEvent.focusOut(screen.getByRole('menuitem', { name: 'A' }), { relatedTarget: null })
    fireEvent.focusOut(screen.getByRole('menuitem', { name: 'A' }), { relatedTarget: screen.getByRole('menuitem', { name: 'B' }) })
    expect(onClose).not.toHaveBeenCalled()
  })

  it('places the menu with placeMenu (flips left at the right edge)', () => {
    vi.spyOn(Element.prototype, 'getBoundingClientRect').mockReturnValue({ width: 220, height: 300, left: 0, top: 0, right: 220, bottom: 300, x: 0, y: 0 })
    vi.spyOn(window, 'innerWidth', 'get').mockReturnValue(1280)
    vi.spyOn(window, 'innerHeight', 'get').mockReturnValue(800)
    setup({ position: { kind: 'pointer', anchor: { x: 1200, y: 100, altY: 100 } } })
    const menu = screen.getByRole('menu')
    expect(menu.style.left).toBe('980px')
    expect(menu.style.top).toBe('100px')
  })

  it('releasesFocus closes first with release and a settle promise, then runs onSelect', async () => {
    const order = []
    const onClose = vi.fn((reason) => order.push(`close:${reason}`))
    const onSelect = vi.fn(() => { order.push('select') })
    setup({ onClose }, <MenuItem releasesFocus onSelect={onSelect}>Rm</MenuItem>)
    fireEvent.click(screen.getByRole('menuitem', { name: 'Rm' }))
    expect(order).toEqual(['close:release', 'select'])
    expect(onClose).toHaveBeenCalledTimes(1)
    await expect(onClose.mock.calls[0][1]).resolves.toBeUndefined()
  })

  it('releasesFocus settles even when onSelect rejects', async () => {
    const { onClose } = setup({}, <MenuItem releasesFocus onSelect={() => Promise.reject(new Error('x'))}>Rm</MenuItem>)
    fireEvent.click(screen.getByRole('menuitem', { name: 'Rm' }))
    await expect(onClose.mock.calls[0][1]).resolves.toBeUndefined()
  })

  it('a disabled releasesFocus item does nothing', () => {
    const onSelect = vi.fn()
    const { onClose } = setup({}, <MenuItem disabled releasesFocus onSelect={onSelect}>Rm</MenuItem>)
    fireEvent.click(screen.getByRole('menuitem', { name: 'Rm' }))
    expect(onSelect).not.toHaveBeenCalled()
    expect(onClose).not.toHaveBeenCalled()
  })
})
