// AniList login helpers (pure). The token itself never leaves main; only its expiry is derived here.

// Public OAuth client id (implicit grant). Stays null until the app is registered on AniList.
export const ANILIST_CLIENT_ID = null

export const APPS_URL = 'https://anilist.co/settings/apps'

export const EXPIRY_WARN_MS = 14 * 24 * 3600 * 1000

export function authorizeUrl(clientId) {
  if (!clientId) return null
  return `https://anilist.co/api/v2/oauth/authorize?client_id=${encodeURIComponent(clientId)}&response_type=token`
}

// Expiry (ms since epoch) from the JWT payload's `exp`; no signature check. Unreadable -> null.
export function tokenExpiry(token) {
  try {
    if (typeof token !== 'string') return null
    const parts = token.split('.')
    if (parts.length !== 3) return null
    let b64 = parts[1].replace(/-/g, '+').replace(/_/g, '/')
    while (b64.length % 4) b64 += '='
    const exp = JSON.parse(atob(b64))?.exp
    return typeof exp === 'number' && Number.isFinite(exp) ? exp * 1000 : null
  } catch {
    return null
  }
}
