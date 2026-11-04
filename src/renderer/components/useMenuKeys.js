// Keyboard handling shared by popup menus: arrows (wrapping), Home/End, Esc and Tab. Items are [role^="menuitem"]
// (menuitem and menuitemradio). aria-disabled items stay focusable (ARIA APG), so they are not skipped.
// onClose(reason): 'escape' (Esc, preventDefault) or 'tab' (no preventDefault: focus moves on from wherever onClose puts it).
export function useMenuKeys(listRef, { onClose }) {
  return (e) => {
    const list = Array.from(listRef.current?.querySelectorAll('[role^="menuitem"]') ?? [])
    const at = list.indexOf(document.activeElement)
    const go = (i) => { e.preventDefault(); list[(i + list.length) % list.length]?.focus() }
    if (e.key === 'ArrowDown') go(at + 1)
    else if (e.key === 'ArrowUp') go(at < 0 ? list.length - 1 : at - 1)
    else if (e.key === 'Home') go(0)
    else if (e.key === 'End') go(list.length - 1)
    else if (e.key === 'Escape') { e.preventDefault(); onClose('escape') }
    else if (e.key === 'Tab') onClose('tab')
  }
}
