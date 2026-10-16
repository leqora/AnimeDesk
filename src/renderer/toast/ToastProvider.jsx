import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import { Toast } from '../components/Toast.jsx'
import { useT } from '../i18n/I18nContext.jsx'
import { add, remove, visible, DEFAULT_MS, ACTION_MS } from './toastQueue.js'

const NOOP = { show: () => null, dismiss() {}, runLatestAction: () => false }
const ToastCtx = createContext(NOOP)
export const useToast = () => useContext(ToastCtx)

// Mounted only while the toast is visible, so its timer starts when it becomes visible.
// `saved` keeps the remaining time across unmounts (the provider's hold), keyed by toast id.
function ToastItem({ toast, onDone, saved }) {
  const remaining = useRef(saved.get(toast.id) ?? toast.ms)
  const firstMount = useRef(!saved.has(toast.id)).current // a remount (after hold) must not grab focus again
  const startedAt = useRef(0)
  const timer = useRef(null)
  const paused = useRef(false)
  const onDoneRef = useRef(onDone)
  onDoneRef.current = onDone
  const start = () => {
    if (paused.current) return // focus/hover arrived before the timer was started
    startedAt.current = Date.now()
    timer.current = setTimeout(() => onDoneRef.current(), remaining.current)
  }
  const pause = () => {
    if (paused.current) return
    paused.current = true
    if (startedAt.current === 0) return
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
      message={toast.message} icon={toast.icon} action={toast.action} focusAction={toast.focusAction && firstMount}
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
  const show = useCallback(({ message, icon = 'check', action = null, ms, focusAction = false }) => {
    const id = nextId.current++
    setQueue((q) => add(q, { id, message, icon, action, focusAction, ms: ms ?? (action ? ACTION_MS : DEFAULT_MS) }))
    return id
  }, [])
  const shown = visible(queue)
  const shownRef = useRef([])
  shownRef.current = hold ? [] : shown
  // Runs (and dismisses) the newest visible toast that has an action, like clicking it. False when there is none.
  const runLatestAction = useCallback(() => {
    const target = [...shownRef.current].reverse().find((x) => x.action)
    if (!target) return false
    dismiss(target.id)
    try { target.action.onAction() } catch (err) { console.error(err) }
    return true
  }, [dismiss])
  const api = useMemo(() => ({ show, dismiss, runLatestAction }), [show, dismiss, runLatestAction])
  return (
    <ToastCtx.Provider value={api}>
      {children}
      <div className="toast-stack" role="group" aria-live="polite" aria-label={t('toast.region')}>
        {!hold && shown.map((x) => <ToastItem key={x.id} toast={x} onDone={() => dismiss(x.id)} saved={saved} />)}
      </div>
    </ToastCtx.Provider>
  )
}
