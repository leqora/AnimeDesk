import { useEffect } from 'react'
import { Icon } from './Icon.jsx'

export function Toast({ children, onDone, ms = 3000, icon = 'check' }) {
  useEffect(() => {
    const timer = setTimeout(onDone, ms)
    return () => clearTimeout(timer)
  }, [children])
  return (
    <div className="toast" role="status">
      <Icon name={icon} />
      <span className="hud">{children}</span>
    </div>
  )
}
