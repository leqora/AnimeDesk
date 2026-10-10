import { useEffect } from 'react'
import { useLatest } from './useLatest.js'

// Physical keys, so shortcuts also work on other layouts (Serbian Cyrillic letters; Š/Đ/Ž for [ ] \ on Serbian Latin).
const KEY_BY_CODE = { KeyF: 'f', KeyM: 'm', KeyS: 's', KeyG: 'g', KeyH: 'h', KeyN: 'n', Space: ' ', BracketLeft: '[', BracketRight: ']', Backslash: '\\' }
const TEXT_FIELD = 'input:not([type=range]):not([type=checkbox]), textarea, [contenteditable="true"]'
// The menu's size slider owns its keys (arrows move the slider, they must not seek); other menu controls keep the shortcuts.
export const MENU_SLIDER = '.player__menu input[type="range"]'
export const QUIET = 'quiet'
export const shortcutKey = (e) => KEY_BY_CODE[e.code] ?? (e.key.length === 1 ? e.key.toLowerCase() : e.key)

export function usePlayerShortcuts(actions, { onHandled } = {}) {
  const latest = useLatest({ actions, onHandled })
  useEffect(() => {
    const onKey = (e) => {
      // Only text entry keeps its keys; a focused slider or select must not swallow the player shortcuts.
      if (e.ctrlKey || e.altKey || e.metaKey || e.target?.closest?.(TEXT_FIELD)) return
      if (e.target?.closest?.(MENU_SLIDER)) return
      const action = latest.current.actions[shortcutKey(e)]
      if (!action) return
      const result = action(e)
      e.preventDefault() // the focused control (slider, select) must not react to the same key
      if (result !== QUIET) latest.current.onHandled?.()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])
}
