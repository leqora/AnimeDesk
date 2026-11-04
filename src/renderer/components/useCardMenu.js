import { useCallback, useLayoutEffect, useRef, useState } from 'react'

const EDITABLE = 'input, textarea, select, [contenteditable="true"]'
const KEY_OPEN_GUARD_MS = 500
const REFOCUS = new Set(['escape', 'outside', 'select', 'tab'])

// Only one card menu is open at a time: opening a new one closes this.
let closeCurrent = null

// The page keeps focus here when whatever held it is gone, unless a toast has it (the toast stack is a live region the user may be in).
export function focusPage() {
  if (document.activeElement?.closest?.('.toast-stack')) return
  document.querySelector('main.content')?.focus()
}

// Context menu for a card. Spread rootProps on the card root; render <ContextMenu {...menuProps}> when `open`.
// Opens on right click (at the pointer) and on Shift+F10 / the ContextMenu key (under the card).
export function useCardMenu({ label }) {
  const [position, setPosition] = useState(null)
  const rootEl = useRef(null)
  const returnTo = useRef(null)
  const openedByKeyAt = useRef(-Infinity)
  const focusInside = useRef(false)
  const myClose = useRef(null)

  const setRoot = useCallback((node) => { if (node) rootEl.current = node }, [])

  const restoreFocus = () => {
    const back = returnTo.current
    returnTo.current = null
    if (back?.isConnected && !back.disabled) { back.focus(); return }
    const main = rootEl.current?.querySelector('[data-card-main]')
    if (main && !main.disabled) { main.focus(); return }
    focusPage()
  }

  const onClose = useCallback((reason) => {
    setPosition(null)
    if (closeCurrent === myClose.current) closeCurrent = null
    if (REFOCUS.has(reason)) restoreFocus()
  }, [])
  myClose.current = onClose

  const blocked = (root) => !!document.querySelector('[aria-modal="true"]') || !!root.closest('[inert]')

  const show = (next) => {
    if (closeCurrent && closeCurrent !== onClose) closeCurrent('navigate')
    closeCurrent = onClose
    setPosition(next)
  }

  const onContextMenu = (e) => {
    if (e.target.closest?.('.context-menu')) { e.preventDefault(); return }
    if (e.target.closest?.(EDITABLE)) return
    if (Date.now() - openedByKeyAt.current < KEY_OPEN_GUARD_MS) { e.preventDefault(); return }
    if (blocked(e.currentTarget)) return
    e.preventDefault()
    returnTo.current = document.activeElement
    show({ kind: 'pointer', anchor: { x: e.clientX, y: e.clientY, altY: e.clientY } })
  }

  const onKeyDown = (e) => {
    if (e.key !== 'ContextMenu' && !(e.key === 'F10' && e.shiftKey)) return
    if (e.target.closest?.('.context-menu')) return
    if (blocked(e.currentTarget)) return
    e.preventDefault()
    openedByKeyAt.current = Date.now()
    returnTo.current = e.target
    const rect = e.currentTarget.getBoundingClientRect()
    show({ kind: 'anchor', anchor: { x: rect.left, y: rect.bottom + 4, altY: rect.top - 4 } })
  }

  const onFocus = () => { focusInside.current = true }
  const onBlur = (e) => { if (e.relatedTarget && !e.currentTarget.contains(e.relatedTarget) && !e.relatedTarget.closest?.('.context-menu')) focusInside.current = false }

  // The card goes away while focus is in it (or in its menu): focus would fall to body, so hand it to the page.
  useLayoutEffect(() => () => {
    if (closeCurrent === myClose.current) closeCurrent = null
    const active = document.activeElement
    const inside = focusInside.current || rootEl.current?.contains(active) || document.querySelector('.context-menu')?.contains(active)
    if (!inside) return
    queueMicrotask(() => {
      const now = document.activeElement
      if (!now || now === document.body) focusPage()
    })
  }, [])

  return {
    rootProps: { ref: setRoot, onContextMenu, onKeyDown, onFocus, onBlur },
    open: position !== null,
    menuProps: { label, position, onClose },
  }
}
