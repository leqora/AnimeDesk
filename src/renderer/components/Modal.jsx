import { useEffect, useRef } from 'react'

const FOCUSABLE = 'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
// Module-level stack of open modal instance ids; only the last one is "on top".
const stack = []
let nextId = 0

function focusables(box) {
  return [...box.querySelectorAll(FOCUSABLE)].filter((el) => !el.disabled)
}

export function Modal({ label, labelledBy, onClose, initialFocus, className = '', children }) {
  const boxRef = useRef(null)
  const onCloseRef = useRef(onClose)
  onCloseRef.current = onClose

  useEffect(() => {
    const box = boxRef.current
    const id = ++nextId
    stack.push(id)
    const opener = document.activeElement
    const target = initialFocus?.current ?? focusables(box)[0] ?? box
    target.focus()

    const onKey = (e) => {
      if (stack[stack.length - 1] !== id) return
      if (e.key === 'Escape') {
        if (!onCloseRef.current) return
        e.preventDefault()
        onCloseRef.current()
      } else if (e.key === 'Tab' && !box.contains(document.activeElement)) {
        // focus escaped (e.g. click on the scrim): pull it back into the box
        e.preventDefault()
        const items = focusables(box)
        ;(e.shiftKey ? items[items.length - 1] : items[0] ?? box)?.focus()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('keydown', onKey)
      const i = stack.indexOf(id)
      if (i >= 0) stack.splice(i, 1)
      const active = document.activeElement
      const inDialogOrIdle = !active || active === document.body || box.contains(active)
      if (opener && opener.isConnected && inDialogOrIdle) opener.focus?.()
    }
  }, [])

  const onKeyDown = (e) => {
    if (e.key !== 'Tab') return
    const box = boxRef.current
    const items = focusables(box)
    if (items.length === 0) { e.preventDefault(); box.focus(); return }
    const first = items[0]
    const last = items[items.length - 1]
    const active = document.activeElement
    if (e.shiftKey && (active === first || active === box)) { e.preventDefault(); last.focus() }
    else if (!e.shiftKey && active === last) { e.preventDefault(); first.focus() }
  }

  return (
    <div className="modal">
      <div
        ref={boxRef}
        className={`modal__box${className ? ` ${className}` : ''}`}
        role="dialog"
        aria-modal="true"
        aria-label={label}
        aria-labelledby={labelledBy}
        tabIndex={-1}
        onKeyDown={onKeyDown}
      >
        {children}
      </div>
    </div>
  )
}
