import { useId, useRef } from 'react'

// Accessible tabs (WAI-ARIA tablist): arrows (wrapping), Home and End move focus and select; only the active tab is in the
// Tab order. Every panel stays mounted (hidden when inactive) so local state, like a half-typed comment, survives a switch.
export function Tabs({ label, tabs, value, onChange }) {
  const base = useId()
  const refs = useRef({})
  const ids = (id) => ({ tab: `${base}-tab-${id}`, panel: `${base}-panel-${id}` })
  const go = (id) => { onChange(id); refs.current[id]?.focus() }
  const onKeyDown = (e, i) => {
    const last = tabs.length - 1
    const target = { ArrowRight: i === last ? 0 : i + 1, ArrowLeft: i === 0 ? last : i - 1, Home: 0, End: last }[e.key]
    if (target === undefined) return
    e.preventDefault()
    go(tabs[target].id)
  }
  return (
    <div className="tabs">
      <div className="tabs__list" role="tablist" aria-label={label}>
        {tabs.map((tab, i) => (
          <button
            key={tab.id} type="button" role="tab" id={ids(tab.id).tab} ref={(el) => { refs.current[tab.id] = el }}
            className="tabs__tab" aria-selected={tab.id === value} aria-controls={ids(tab.id).panel}
            tabIndex={tab.id === value ? 0 : -1}
            onClick={() => onChange(tab.id)} onKeyDown={(e) => onKeyDown(e, i)}
          >{tab.label}</button>
        ))}
      </div>
      {tabs.map((tab) => (
        <div key={tab.id} role="tabpanel" id={ids(tab.id).panel} aria-labelledby={ids(tab.id).tab} hidden={tab.id !== value} className="tabs__panel">
          {tab.content}
        </div>
      ))}
    </div>
  )
}
