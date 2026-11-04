import { ChevronDown, House, ListVideo, Download, UserRound, Settings, Play, Info, Check, Flame, Search, Film, Volume2, ArrowLeft, Star, ChevronLeft, ChevronRight, Maximize, Minimize, Pause, Rewind, FastForward, SkipBack, SkipForward, VolumeX, Subtitles, CircleAlert, Bell, CalendarDays, Compass, PictureInPicture2, Maximize2, X, Clock, Zap, Moon, Sunrise, Mountain, Landmark, Heart, Library, Trophy } from 'lucide-react'

const ICONS = {
  home: House, watchlist: ListVideo, downloads: Download, profile: UserRound, settings: Settings,
  play: Play, info: Info, check: Check, flame: Flame, search: Search, film: Film, volume: Volume2,
  back: ArrowLeft, star: Star, chevronLeft: ChevronLeft, chevronRight: ChevronRight, maximize: Maximize, minimize: Minimize,
  pause: Pause, rewind: Rewind, fastForward: FastForward, skipBack: SkipBack, skipForward: SkipForward,
  volumeX: VolumeX, subtitles: Subtitles, alert: CircleAlert, bell: Bell, schedule: CalendarDays, discover: Compass, chevronDown: ChevronDown,
  mini: PictureInPicture2, expand: Maximize2, close: X,
  clock: Clock, zap: Zap, moon: Moon, sunrise: Sunrise, compass: Compass, mountain: Mountain, landmark: Landmark, heart: Heart, library: Library, trophy: Trophy,
}

export function Icon({ name, size = 18 }) {
  const Component = ICONS[name]
  return Component ? <Component size={size} strokeWidth={1.75} aria-hidden="true" /> : null
}
