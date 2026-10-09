import { Component } from 'react'
import { useT } from '../i18n/I18nContext.jsx'

function Fallback({ error, actionLabelKey, onAction, className = '' }) {
  const t = useT()
  return (
    <div className={`error-fallback glass ${className}`.trim()} role="alert">
      <h2>{t('error.title')}</h2>
      <p>{t('error.body')}</p>
      <code className="error-fallback__detail">{String(error?.message ?? error)}</code>
      {onAction && <button type="button" onClick={onAction}>{t(actionLabelKey)}</button>}
    </div>
  )
}

// Keeps one crashing page or the player from blanking the whole window.
export class ErrorBoundary extends Component {
  state = { error: null }

  static getDerivedStateFromError(error) { return { error } }

  componentDidCatch(error, info) { console.error('UI error', error, info?.componentStack) }

  render() {
    const { actionLabelKey, onAction, className, children } = this.props
    if (this.state.error) return <Fallback error={this.state.error} actionLabelKey={actionLabelKey} onAction={onAction} className={className} />
    return children
  }
}
