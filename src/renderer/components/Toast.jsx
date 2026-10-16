import { useEffect, useRef } from 'react'
import { Icon } from './Icon.jsx'

// Presentational only: timing and queueing live in ToastProvider.
export function Toast({ message, icon = 'check', action = null, focusAction = false, onAction, onPause, onResume }) {
  const actionRef = useRef(null)
  // after the trigger unmounted (e.g. a removed series) focus would fall to body; "Undo" must stay reachable
  useEffect(() => { if (focusAction) actionRef.current?.focus() }, [])
  // focus moving between elements inside the toast is not "leaving"
  const onBlur = (e) => { if (!e.currentTarget.contains(e.relatedTarget)) onResume?.() }
  return (
    <div className="toast" role="status" onMouseEnter={onPause} onMouseLeave={onResume} onFocus={onPause} onBlur={onBlur}>
      <Icon name={icon} />
      <span className="hud">{message}</span>
      {action && <button type="button" className="toast__action" ref={actionRef} onClick={onAction}>{action.label}</button>}
    </div>
  )
}
