import { useEffect, useId, useRef, useState } from 'react'
import { Icon } from './Icon.jsx'

// Button that opens a menu (role="menu") of role="menuitem" children. Roving focus by code, so items are tabIndex -1.
// An item that navigates carries data-navigates: focus then stays with the app's own page focus instead of returning here.
// header/footer are shown in the popup around the menu, outside role="menu" (only menuitems belong inside it).
// closeWhen: the menu closes whenever it turns true (e.g. the player opens).
export function MenuButton({ label, icon, children, header = null, footer = null, closeWhen = false, className = '' }) {
  const [open, setOpen] = useState(false)
  const rootRef = useRef(null)
  const buttonRef = useRef(null)
  const listRef = useRef(null)
  const startAt = useRef('first')
  const id = useId()

  const items = () => Array.from(listRef.current?.querySelectorAll('[role="menuitem"]') ?? [])
  const focusButton = () => buttonRef.current?.focus()
  const close = (refocus) => { setOpen(false); if (refocus) focusButton() }
  const openAt = (where) => { startAt.current = where; setOpen(true) }

  useEffect(() => { if (closeWhen) setOpen(false) }, [closeWhen])

  useEffect(() => {
    if (!open) return
    const list = items()
    ;(startAt.current === 'last' ? list[list.length - 1] : list[0])?.focus()
  }, [open])

  useEffect(() => {
    if (!open) return undefined
    const onDown = (e) => { if (!rootRef.current?.contains(e.target)) setOpen(false) }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [open])

  const onButtonKeyDown = (e) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); openAt('first') }
    else if (e.key === 'ArrowUp') { e.preventDefault(); openAt('last') }
  }
  const onListKeyDown = (e) => {
    const list = items()
    const at = list.indexOf(document.activeElement)
    const go = (i) => { e.preventDefault(); list[(i + list.length) % list.length]?.focus() }
    if (e.key === 'ArrowDown') go(at + 1)
    else if (e.key === 'ArrowUp') go(at < 0 ? list.length - 1 : at - 1)
    else if (e.key === 'Home') go(0)
    else if (e.key === 'End') go(list.length - 1)
    else if (e.key === 'Escape') { e.preventDefault(); close(true) }
    else if (e.key === 'Tab') close(true) // focus lands on the button first, so Tab moves on from there
  }
  const onListClick = (e) => {
    const item = e.target.closest?.('[role="menuitem"]')
    if (!item) return
    close(!item.hasAttribute('data-navigates'))
  }

  return (
    <div className={`menu-button ${className}`.trim()} ref={rootRef}>
      <button
        ref={buttonRef}
        type="button"
        className="menu-button__trigger"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? id : undefined}
        aria-label={icon ? label : undefined}
        onClick={() => (open ? close(false) : openAt('first'))}
        onKeyDown={onButtonKeyDown}
      >
        {icon ?? <><span>{label}</span><Icon name="chevronDown" size={14} /></>}
      </button>
      {open && (
        <div className="menu-button__popup">
          {header}
          <div id={id} ref={listRef} className="menu-button__list" role="menu" aria-label={label} onKeyDown={onListKeyDown} onClick={onListClick}>
            {children}
          </div>
          {footer}
        </div>
      )}
    </div>
  )
}
