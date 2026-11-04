import { useCallback, useLayoutEffect, useRef, useState } from 'react'
import { KEY_OPEN_GUARD_MS, RELEASE_GRACE_MS } from './menuTiming.js'

const EDITABLE = 'input, textarea, select, [contenteditable="true"]'
const REFOCUS = new Set(['escape', 'outside', 'select', 'tab'])
// The menu goes away with these, taking focus with it if it is inside: focus must not fall to body.
const REFOCUS_IF_IN_MENU = new Set(['scroll', 'resize', 'blur'])

// Only one card menu is open at a time: opening a new one closes this.
let closeCurrent = null

// The page keeps focus here when whatever held it is gone, unless a toast has it (the toast stack is a live region the user may be in).
export function focusPage() {
  if (document.activeElement?.closest?.('.toast-stack')) return
  document.querySelector('main.content')?.focus()
}

// Context menu for a card. Spread rootProps on the card root; render <ContextMenu {...menuProps}> when `open`.
// Opens on right click (at the pointer) and on Shift+F10 / the ContextMenu key (under the card).
export function useCardMenu({ label, enabled = true }) {
  const [position, setPosition] = useState(null)
  const rootEl = useRef(null)
  const returnTo = useRef(null)
  const openedByKeyAt = useRef(-Infinity)
  const focusInside = useRef(false)
  const releasePending = useRef(false)
  const myClose = useRef(null)

  const setRoot = useCallback((node) => { if (node) rootEl.current = node }, [])

  const usable = (el) => !!el && el !== document.body && el.isConnected && !el.disabled && !el.closest?.('[inert]')

  const restoreFocus = (options) => {
    const back = returnTo.current
    returnTo.current = null
    if (usable(back)) { back.focus(options); return }
    const main = rootEl.current?.querySelector('[data-card-main]')
    if (usable(main)) { main.focus(options); return }
    focusPage()
  }

  const onClose = useCallback((reason, settled) => {
    const inMenu = !!document.activeElement?.closest?.('.context-menu')
    setPosition(null)
    if (closeCurrent === myClose.current) closeCurrent = null
    if (reason === 'outside') {
      // The mousedown default action (a click on a non-focusable part of the page) clears focus right after this: once it has run,
      // put focus back, unless the click landed on something focusable.
      const back = returnTo.current
      restoreFocus()
      setTimeout(() => {
        if (document.activeElement && document.activeElement !== document.body) return
        returnTo.current = back
        restoreFocus({ preventScroll: true })
      }, 0)
    } else if (REFOCUS.has(reason)) restoreFocus()
    else if (REFOCUS_IF_IN_MENU.has(reason) && inMenu) restoreFocus({ preventScroll: true })
    else if (reason === 'release') {
      // Focus is left to fall so the action's toast can take it; if nothing did once the action settled, do not leave it on body.
      // The card may be removed by the action: its unmount handoff stands down (releasePending), this timer is the only safety net
      // and does not depend on the card still being mounted.
      releasePending.current = true
      focusInside.current = false
      Promise.resolve(settled).then(() => setTimeout(() => {
        releasePending.current = false
        const a = document.activeElement
        if (!a || a === document.body) restoreFocus()
      }, RELEASE_GRACE_MS))
    }
  }, [])
  myClose.current = onClose

  const blocked = (root) => !!document.querySelector('[aria-modal="true"]') || !!root.closest('[inert]')

  const show = (next) => {
    if (closeCurrent && closeCurrent !== onClose) closeCurrent('navigate')
    closeCurrent = onClose
    setPosition(next)
  }

  const onContextMenu = (e) => {
    if (!enabled) return
    if (e.target.closest?.('.context-menu')) { e.preventDefault(); return }
    if (e.target.closest?.(EDITABLE)) return
    if (Date.now() - openedByKeyAt.current < KEY_OPEN_GUARD_MS) { e.preventDefault(); return }
    if (blocked(e.currentTarget)) return
    e.preventDefault()
    returnTo.current = document.activeElement
    show({ kind: 'pointer', anchor: { x: e.clientX, y: e.clientY, altY: e.clientY } })
  }

  const onKeyDown = (e) => {
    if (!enabled) return
    if (e.key !== 'ContextMenu' && !(e.key === 'F10' && e.shiftKey)) return
    if (e.target.closest?.('.context-menu')) return
    if (blocked(e.currentTarget)) return
    e.preventDefault()
    openedByKeyAt.current = Date.now()
    returnTo.current = e.target
    const rect = e.currentTarget.getBoundingClientRect()
    show({ kind: 'anchor', anchor: { x: rect.left, y: rect.bottom + 4, altX: rect.right, altY: rect.top - 4 } })
  }

  const onFocus = () => { focusInside.current = true }
  const onBlur = (e) => {
    const next = e.relatedTarget
    if (next) {
      if (!e.currentTarget.contains(next) && !next.closest?.('.context-menu')) focusInside.current = false
      return
    }
    // Null: focus went to nothing (clicked empty page) or the focused element is being removed. Decide after the dust settles;
    // a card that unmounts in between has already handled its own focus.
    setTimeout(() => {
      const a = document.activeElement
      if (!rootEl.current?.contains(a) && !a?.closest?.('.context-menu')) focusInside.current = false
    }, 0)
  }

  // The card goes away while focus is in it (or in its menu): focus would fall to body, so hand it to the page.
  useLayoutEffect(() => () => {
    if (closeCurrent === myClose.current) closeCurrent = null
    if (releasePending.current) return
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
