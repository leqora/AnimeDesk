import { useEffect, useLayoutEffect, useRef } from 'react'
import { Icon } from './Icon.jsx'

// Presentational only: timing and queueing live in ToastProvider.
export function Toast({ message, icon = 'check', action = null, focusAction = false, onAction, onPause, onResume }) {
  const actionRef = useRef(null)
  const rootRef = useRef(null)
  // after the trigger unmounted (e.g. a removed series) focus would fall to body; "Undo" must stay reachable.
  // Never steal focus from a control that still has it.
  useEffect(() => {
    const a = document.activeElement
    if (focusAction && (!a || a === document.body)) actionRef.current?.focus()
  }, [])
  // A layout cleanup runs before React detaches the node, so it can still see whether this toast held focus.
  // If so, once the DOM update is done hand focus to the next toast's action, else to <main>, unless focus went elsewhere.
  useLayoutEffect(() => {
    const root = rootRef.current
    return () => {
      if (!root || !root.contains(document.activeElement)) return
      setTimeout(() => {
        const a = document.activeElement
        if (a && a !== document.body) return
        // toasts sit above modals: prefer the open modal box (topmost = last) so focus stays inside aria-modal
        const modals = document.querySelectorAll('[aria-modal="true"]')
        const next = document.querySelector('.toast-stack .toast__action')
          || modals[modals.length - 1]
          || document.querySelector('main.content')
        next?.focus({ preventScroll: true })
      }, 0)
    }
  }, [])
  // focus moving between elements inside the toast is not "leaving"
  const onBlur = (e) => { if (!e.currentTarget.contains(e.relatedTarget)) onResume?.() }
  return (
    <div className="toast" ref={rootRef} onMouseEnter={onPause} onMouseLeave={onResume} onFocus={onPause} onBlur={onBlur}>
      <Icon name={icon} />
      <span className="hud">{message}</span>
      {action && <button type="button" className="toast__action" ref={actionRef} onClick={onAction}>{action.label}</button>}
    </div>
  )
}
