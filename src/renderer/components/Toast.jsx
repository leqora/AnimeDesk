import { Icon } from './Icon.jsx'

// Presentational only: timing and queueing live in ToastProvider.
export function Toast({ message, icon = 'check', action = null, onAction, onPause, onResume }) {
  // focus moving between elements inside the toast is not "leaving"
  const onBlur = (e) => { if (!e.currentTarget.contains(e.relatedTarget)) onResume?.() }
  return (
    <div className="toast" role="status" onMouseEnter={onPause} onMouseLeave={onResume} onFocus={onPause} onBlur={onBlur}>
      <Icon name={icon} />
      <span className="hud">{message}</span>
      {action && <button type="button" className="toast__action" onClick={onAction}>{action.label}</button>}
    </div>
  )
}
