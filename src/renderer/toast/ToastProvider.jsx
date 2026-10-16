import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import { Toast } from '../components/Toast.jsx'
import { useT } from '../i18n/I18nContext.jsx'
import { add, remove, visible, DEFAULT_MS, ACTION_MS } from './toastQueue.js'

const NOOP = { show: () => null, dismiss() {} }
const ToastCtx = createContext(NOOP)
export const useToast = () => useContext(ToastCtx)

// Mounted only while the toast is visible, so its timer starts when it becomes visible.
// `saved` keeps the remaining time across unmounts (the provider's hold), keyed by toast id.
function ToastItem({ toast, onDone, saved }) {
  const remaining = useRef(saved.get(toast.id) ?? toast.ms)
  const startedAt = useRef(0)
  const timer = useRef(null)
  const paused = useRef(false)
  const onDoneRef = useRef(onDone)
  onDoneRef.current = onDone
  const start = () => {
    startedAt.current = Date.now()
    timer.current = setTimeout(() => onDoneRef.current(), remaining.current)
  }
  const pause = () => {
    if (paused.current) return
    paused.current = true
    clearTimeout(timer.current)
    remaining.current = Math.max(0, remaining.current - (Date.now() - startedAt.current))
  }
  const resume = () => {
    if (!paused.current) return
    paused.current = false
    start()
  }
  useEffect(() => {
    start()
    return () => {
      clearTimeout(timer.current)
      if (!paused.current) remaining.current = Math.max(0, remaining.current - (Date.now() - startedAt.current))
      saved.set(toast.id, remaining.current)
    }
  }, [])
  return (
    <Toast
      message={toast.message} icon={toast.icon} action={toast.action}
      onAction={() => { try { toast.action.onAction() } finally { onDone() } }}
      onPause={pause} onResume={resume}
    />
  )
}

// hold: while true nothing is shown and timers stand still, so toasts are not missed behind an overlay.
export function ToastProvider({ children, hold = false }) {
  const t = useT()
  const saved = useRef(new Map()).current
  const [queue, setQueue] = useState([])
  const nextId = useRef(1)
  const dismiss = useCallback((id) => setQueue((q) => remove(q, id)), [])
  const show = useCallback(({ message, icon = 'check', action = null, ms }) => {
    const id = nextId.current++
    setQueue((q) => add(q, { id, message, icon, action, ms: ms ?? (action ? ACTION_MS : DEFAULT_MS) }))
    return id
  }, [])
  const shown = visible(queue)
  const api = useMemo(() => ({ show, dismiss }), [show, dismiss])
  return (
    <ToastCtx.Provider value={api}>
      {children}
      {shown.length > 0 && !hold && (
        <div className="toast-stack" role="group" aria-label={t('toast.region')}>
          {shown.map((x) => <ToastItem key={x.id} toast={x} onDone={() => dismiss(x.id)} saved={saved} />)}
        </div>
      )}
    </ToastCtx.Provider>
  )
}
