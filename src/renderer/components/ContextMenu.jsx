import { createContext, useContext, useEffect, useLayoutEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import { placeMenu } from '../../shared/menuPosition.js'
import { useMenuKeys } from './useMenuKeys.js'

const ITEM = '[role^="menuitem"]'
const DEFAULT_TOPBAR = 56
// A keyboard-opened menu is followed by the browser's own contextmenu for that key press for this long: not a click elsewhere.
export const KEY_OPEN_GUARD_MS = 500
const MenuCtx = createContext(null)

function topLimit() {
  const v = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--topbar-h'))
  return Number.isFinite(v) ? v : DEFAULT_TOPBAR
}

// Context menu for a card (right click / Shift+F10). Rendered into document.body like Modal; items are MenuItem/MenuSeparator/MenuGroup.
// position: { kind: 'pointer'|'anchor', anchor: { x, y, altY } } - placeMenu keeps it inside the window and below the top bar.
// onClose(reason): 'escape' | 'tab' | 'outside' | 'select' | 'navigate' | 'scroll' | 'resize' | 'blur' | 'focusout'.
// The owner decides about focus: this component only focuses the first item when it opens.
export function ContextMenu({ label, position, onClose, children }) {
  const menuRef = useRef(null)
  const onCloseRef = useRef(onClose)
  onCloseRef.current = onClose
  const close = (...args) => onCloseRef.current?.(...args)

  useLayoutEffect(() => {
    const menu = menuRef.current
    if (!menu) return
    const rect = menu.getBoundingClientRect()
    const { left, top } = placeMenu(position.anchor, { w: rect.width, h: rect.height }, { vw: window.innerWidth, vh: window.innerHeight, top: topLimit() })
    menu.style.left = `${left}px`
    menu.style.top = `${top}px`
  }, [position])

  useLayoutEffect(() => {
    menuRef.current?.querySelector(ITEM)?.focus({ preventScroll: true })
  }, [])

  useEffect(() => {
    const outside = (e) => !menuRef.current?.contains(e.target)
    const openedAt = performance.now()
    const onDown = (e) => { if (outside(e)) close('outside') }
    // A menu opened from the keyboard can be followed by the browser's own contextmenu for that same key press: not a click elsewhere.
    const onContext = (e) => { if (outside(e) && !(position.kind === 'anchor' && performance.now() - openedAt < KEY_OPEN_GUARD_MS)) close('outside') }
    const onScroll = (e) => { if (outside(e)) close('scroll') }
    const onResize = () => close('resize')
    const onBlur = () => close('blur')
    document.addEventListener('mousedown', onDown, true)
    document.addEventListener('contextmenu', onContext, true)
    document.addEventListener('scroll', onScroll, true)
    window.addEventListener('resize', onResize)
    window.addEventListener('blur', onBlur)
    return () => {
      document.removeEventListener('mousedown', onDown, true)
      document.removeEventListener('contextmenu', onContext, true)
      document.removeEventListener('scroll', onScroll, true)
      window.removeEventListener('resize', onResize)
      window.removeEventListener('blur', onBlur)
    }
  }, [])

  // releasesFocus items: close first (focus is left to fall, so a toast can take it), then run the action; onClose gets a promise that settles when it is done.
  const release = (run) => {
    let settle
    const settled = new Promise((resolve) => { settle = resolve })
    close('release', settled)
    try { Promise.resolve(run()).then(() => settle(), () => settle()) } catch { settle() }
  }
  const onKeyDown = useMenuKeys(menuRef, { onClose: close })
  const onClick = (e) => {
    const item = e.target.closest?.(ITEM)
    if (!item || !menuRef.current?.contains(item) || item.getAttribute('aria-disabled') === 'true' || item.hasAttribute('data-release')) return
    close(item.hasAttribute('data-navigates') ? 'navigate' : 'select')
  }
  // relatedTarget null means the focused item went away (or focus went to nothing); mousedown/blur cover real departures.
  const onBlur = (e) => {
    const next = e.relatedTarget
    if (next && !menuRef.current?.contains(next)) close('focusout')
  }

  return createPortal(
    <MenuCtx.Provider value={release}>
      <div ref={menuRef} className="context-menu" role="menu" aria-label={label} onKeyDown={onKeyDown} onClick={onClick} onBlur={onBlur}>
        {children}
      </div>
    </MenuCtx.Provider>,
    document.body,
  )
}

// releasesFocus: for an action that removes the card and shows a toast that must take focus. The menu closes first, without restoring focus.
export function MenuItem({ icon, onSelect, disabled = false, navigates = false, releasesFocus = false, checked, children }) {
  const release = useContext(MenuCtx)
  const radio = checked !== undefined
  return (
    <button
      type="button"
      role={radio ? 'menuitemradio' : 'menuitem'}
      aria-checked={radio ? checked : undefined}
      aria-disabled={disabled ? 'true' : undefined}
      data-navigates={navigates ? '' : undefined}
      data-release={releasesFocus ? '' : undefined}
      tabIndex={-1}
      className="context-menu__item"
      onClick={() => { if (disabled) return; if (releasesFocus && release) release(() => onSelect?.()); else onSelect?.() }}
    >
      {icon && <span className="context-menu__icon" aria-hidden="true">{icon}</span>}
      <span className="context-menu__label">{children}</span>
      {radio && <span className="context-menu__check" aria-hidden="true">{checked ? '✓' : ''}</span>}
    </button>
  )
}

export function MenuSeparator() {
  return <div role="separator" className="context-menu__separator" />
}

export function MenuGroup({ label, children }) {
  return (
    <div role="group" aria-label={label} className="context-menu__group">
      <div className="context-menu__title" aria-hidden="true">{label}</div>
      {children}
    </div>
  )
}
