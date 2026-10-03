import { describe, it, expect } from 'vitest'
import { mapError, menuKind, autoAnswer, parsePlayerArgs, buildEnv, stripAnsi } from '../../src/main/aniCliBridge.js'
import { DEFAULT_SETTINGS } from '../../src/main/settings.js'

describe('aniCliBridge helpers', () => {
  it('lets a session override quality and mode', () => {
    const base = { baseEnv: {}, tools: {}, bridges: { menu: 'm', player: 'p' }, server: { port: 1, token: 't' }, sessionId: 's', player: 'play', settings: { ...DEFAULT_SETTINGS, quality: '720', mode: 'sub' }, historyDir: 'h' }
    expect(buildEnv(base)).toMatchObject({ ANI_CLI_QUALITY: '720', ANI_CLI_MODE: 'sub' })
    expect(buildEnv({ ...base, quality: '1080', mode: 'dub' })).toMatchObject({ ANI_CLI_QUALITY: '1080', ANI_CLI_MODE: 'dub' })
    expect(buildEnv({ ...base, quality: null, mode: undefined })).toMatchObject({ ANI_CLI_QUALITY: '720', ANI_CLI_MODE: 'sub' })
  })
  it('maps ani-cli errors (with ANSI colors) to codes', () => {
    expect(mapError('\x1b[2K\r\x1b[1;31mNo results found!\x1b[0m\n')).toBe('no-results')
    expect(mapError('[1;31mNo sources found for dub![0m')).toBe('no-dub')
    expect(mapError('Episode not released!')).toBe('episode-not-released')
    expect(mapError('Blocked by cloudflare.')).toBe('blocked')
    expect(mapError('weird')).toBe('unknown')
    expect(stripAnsi('\x1b[1;36mhi\x1b[0m')).toBe('hi')
  })
  it('classifies menus by prompt', () => {
    expect(menuKind('Select anime: ')).toBe('anime')
    expect(menuKind('Select episode: ')).toBe('episode')
    expect(menuKind('Select Quality: ')).toBe('other')
  })
  it('auto-answers known anime and episodes', () => {
    expect(autoAnswer('Select anime: ', ['1 Other', '2 Fake Anime'], { anime: 'fake anime' })).toBe('2 Fake Anime')
    expect(autoAnswer('Select anime: ', ['1 Other'], { anime: 'Fake Anime' })).toBeNull()
    expect(autoAnswer('Select episode: ', ['1', '2', '12.5'], { episode: '12.5' })).toBe('12.5')
    expect(autoAnswer('Select episode: ', ['1', '2'], {})).toBeNull()
  })
  it('parses player args from ani-cli', () => {
    const p = parsePlayerArgs(['--referrer=https://r', '--force-media-title=Re:Zero Episode 12.5', 'https://v.m3u8'])
    expect(p).toEqual({ mpvArgs: ['--referrer=https://r', '--force-media-title=Re:Zero Episode 12.5', 'https://v.m3u8'], title: 'Re:Zero', episode: '12.5', url: 'https://v.m3u8' })
  })
  it('builds env with a single PATH key and MSYS paths', () => {
    const env = buildEnv({
      baseEnv: { Path: 'C:\\Windows', OTHER: '1' },
      tools: { gitRoot: 'C:\\Git', ytDlp: 'C:\\T\\yt-dlp\\yt-dlp.exe', ffmpeg: 'C:\\T\\ff\\bin\\ffmpeg.exe' },
      bridges: { menu: 'C:\\App\\bridges\\menu-bridge.sh', player: 'C:\\App\\bridges\\animedesk-mpv-bridge.sh' },
      server: { port: 5555, token: 'tok' },
      sessionId: 'sid',
      player: 'play',
      downloadDir: 'D:\\Moji anime\\Šou',
      settings: { ...DEFAULT_SETTINGS, quality: '720', mode: 'dub' },
      historyDir: 'C:\\Data\\hist',
    })
    expect(Object.keys(env).filter((k) => k.toUpperCase() === 'PATH')).toEqual(['PATH'])
    expect(env.PATH.split(';')).toEqual(['C:\\App\\bridges', 'C:\\Git\\usr\\bin', 'C:\\Git\\mingw64\\bin', 'C:\\T\\yt-dlp', 'C:\\T\\ff\\bin', 'C:\\Windows'])
    expect(env).toMatchObject({
      OTHER: '1',
      ANI_CLI_MENU: '/c/App/bridges/menu-bridge.sh',
      ANI_CLI_PLAYER: 'animedesk-mpv-bridge.sh',
      ANI_CLI_NO_DETACH: '1', ANI_CLI_EXIT_AFTER_PLAY: '1', ANI_CLI_LOG: '0',
      ANI_CLI_QUALITY: '720', ANI_CLI_MODE: 'dub',
      ANI_CLI_HIST_DIR: '/c/Data/hist',
      // Windows path with forward slashes: MSYS passes it to yt-dlp.exe unchanged even when the
      // file name ani-cli appends contains ":" "?" or "*" (an /d/... path would not be converted then).
      ANI_CLI_DOWNLOAD_DIR: 'D:/Moji anime/Šou',
      ANIMEDESK_PORT: '5555', ANIMEDESK_TOKEN: 'tok', ANIMEDESK_SESSION: 'sid',
    })
    const dl = buildEnv({ baseEnv: {}, tools: { gitRoot: 'C:\\Git' }, bridges: { menu: 'm', player: 'p' }, server: { port: 1, token: 't' }, sessionId: 's', player: 'download', settings: DEFAULT_SETTINGS, historyDir: 'h' })
    expect(dl.ANI_CLI_PLAYER).toBe('download')
    expect(dl).not.toHaveProperty('ANI_CLI_DOWNLOAD_DIR')
  })
})
