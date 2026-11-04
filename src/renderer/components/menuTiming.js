// A keyboard-opened menu is followed by the browser's own contextmenu for that key press for this long: not a click elsewhere.
export const KEY_OPEN_GUARD_MS = 500
// After a released action settles, give React time to render and run the effects of what it showed (a toast takes focus in a passive effect).
export const RELEASE_GRACE_MS = 50
