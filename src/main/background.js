// Pure helpers for background behaviour (tray, notifications). No Electron imports.

export const shouldHideOnClose = ({ closeToTray, quitting }) => Boolean(closeToTray) && !quitting
export const startHidden = (argv) => Array.isArray(argv) && argv.includes('--hidden')
export const shouldNotifyDownload = ({ notifyDownloads, windowFocused }) => Boolean(notifyDownloads) && !windowFocused

const COPY = {
  sr: {
    episodeTitle: 'Nova epizoda',
    downloaded: 'Preuzeto',
    downloadFailed: 'Preuzimanje nije uspelo',
    trayHint: 'AnimeDesk radi u pozadini — ikona je pored sata',
    trayOpen: 'Otvori AnimeDesk',
    trayQuit: 'Izađi',
  },
  en: {
    episodeTitle: 'New episode',
    downloaded: 'Downloaded',
    downloadFailed: 'Download failed',
    trayHint: 'AnimeDesk keeps running in the background — the icon is next to the clock',
    trayOpen: 'Open AnimeDesk',
    trayQuit: 'Quit',
  },
}
const copyFor = (lang) => COPY[lang] ?? COPY.sr

// Text is only the series title and the episode number (no spoilers).
export function notificationText(kind, { title, episode } = {}, lang = 'sr') {
  const c = copyFor(lang)
  const what = `${title} — EP ${episode}`
  switch (kind) {
    case 'episode': return { title: c.episodeTitle, body: what }
    case 'downloaded': return { title: 'AnimeDesk', body: `${c.downloaded}: ${what}` }
    case 'downloadFailed': return { title: 'AnimeDesk', body: `${c.downloadFailed}: ${what}` }
    case 'trayHint': return { title: 'AnimeDesk', body: c.trayHint }
    default: throw new Error(`unknown notification kind: ${kind}`)
  }
}

export const trayLabels = (lang) => ({ open: copyFor(lang).trayOpen, quit: copyFor(lang).trayQuit })
