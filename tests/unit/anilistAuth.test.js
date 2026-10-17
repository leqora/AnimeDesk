import { describe, it, expect } from 'vitest'
import { ANILIST_CLIENT_ID, APPS_URL, EXPIRY_WARN_MS, authorizeUrl, tokenExpiry } from '../../src/shared/anilistAuth.js'

const b64url = (obj) => btoa(JSON.stringify(obj)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')

describe('anilistAuth', () => {
  it('exports constants', () => {
    expect(ANILIST_CLIENT_ID).toBeNull()
    expect(APPS_URL).toBe('https://anilist.co/settings/apps')
    expect(EXPIRY_WARN_MS).toBe(14 * 24 * 3600 * 1000)
  })
  it('builds the authorize URL', () => {
    expect(authorizeUrl(12345)).toBe('https://anilist.co/api/v2/oauth/authorize?client_id=12345&response_type=token')
  })
  it('returns null for a falsy client id', () => {
    expect(authorizeUrl(null)).toBeNull()
    expect(authorizeUrl(0)).toBeNull()
  })
  it('reads exp from the JWT payload in ms', () => {
    expect(tokenExpiry(`header.${b64url({ exp: 1800000000 })}.sig`)).toBe(1800000000000)
  })
  it('returns null for unreadable tokens', () => {
    expect(tokenExpiry('garbage')).toBeNull()
    expect(tokenExpiry('a.b.c')).toBeNull()
    expect(tokenExpiry('')).toBeNull()
    expect(tokenExpiry(null)).toBeNull()
    expect(tokenExpiry(`h.${b64url({ sub: 'x' })}.s`)).toBeNull()
  })
})
