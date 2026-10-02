import { House, ListVideo, Download, UserRound, Settings, Play, Info, Check, Flame, Search, Film, Volume2 } from 'lucide-react'

const ICONS = {
  home: House, watchlist: ListVideo, downloads: Download, profile: UserRound, settings: Settings,
  play: Play, info: Info, check: Check, flame: Flame, search: Search, film: Film, volume: Volume2,
}

export function Icon({ name, size = 18 }) {
  const Component = ICONS[name]
  return Component ? <Component size={size} strokeWidth={1.75} aria-hidden="true" /> : null
}
