// tests/unit/subtitles.test.js
import { describe, it, expect } from 'vitest'
import { detectFormat, srtToVtt, toVtt, parseCueText, activeCues, isTopCue, clampOffset, formatOffset, subtitleStyleVars, DEFAULT_SUBTITLES, SUBTITLE_FONT_STACKS } from '../../src/shared/subtitles.js'

const SRT = '1\n00:00:01,000 --> 00:00:03,500\nHello, world\n\n2\n00:00:04,000 --> 00:00:06,000\n<i>Second</i>\nline two\n'

describe('detectFormat', () => {
  it('recognises formats by content', () => {
    expect(detectFormat('WEBVTT\n\n00:01.000 --> 00:02.000\nx')).toBe('vtt')
    expect(detectFormat('\uFEFFWEBVTT')).toBe('vtt')
    expect(detectFormat(SRT)).toBe('srt')
    expect(detectFormat('1\r\n0:00:01.000 --> 0:00:02.000\r\nx')).toBe('srt')
    expect(detectFormat('[Script Info]\nTitle: x\n')).toBe('ass')
    expect(detectFormat('  \n[V4+ Styles]\n')).toBe('ass')
    expect(detectFormat('')).toBe('unknown')
    expect(detectFormat('<html>nope</html>')).toBe('unknown')
    expect(detectFormat(null)).toBe('unknown')
  })
})

describe('srtToVtt', () => {
  it('adds the header and fixes the decimal comma only in time lines', () => {
    expect(srtToVtt(SRT)).toBe('WEBVTT\n\n1\n00:00:01.000 --> 00:00:03.500\nHello, world\n\n2\n00:00:04.000 --> 00:00:06.000\n<i>Second</i>\nline two\n')
  })
  it('handles CRLF, BOM, trailing spaces and no final newline', () => {
    const out = srtToVtt('\uFEFF1\r\n0:00:01,000 --> 0:00:02,000   \r\nA\r\n\r\n2\r\n00:00:03,000 --> 00:00:04,000\r\nB')
    expect(out).toBe('WEBVTT\n\n1\n00:00:01.000 --> 00:00:02.000\nA\n\n2\n00:00:03.000 --> 00:00:04.000\nB\n')
  })
  it('moves {\\an8} cues to the top and strips other override tags', () => {
    const out = srtToVtt('1\n00:00:01,000 --> 00:00:02,000\n{\\an8}Sign text\n\n2\n00:00:03,000 --> 00:00:04,000\n{\\i1}Hi{\\i0}\n')
    expect(out).toContain('00:00:01.000 --> 00:00:02.000 line:0\nSign text\n')
    expect(out).toContain('00:00:03.000 --> 00:00:04.000\nHi\n')
  })
  it('skips broken and empty blocks and keeps "-->" out of cue text', () => {
    const out = srtToVtt('1\nnot a time\ntext\n\n2\n00:00:01,000 --> 00:00:02,000\n\n3\n00:00:03,000 --> 00:00:04,000\nA --> B\n')
    expect(out).toBe('WEBVTT\n\n3\n00:00:03.000 --> 00:00:04.000\nA -> B\n')
  })
})

describe('toVtt', () => {
  it('passes VTT through, converts SRT, rejects the rest', () => {
    expect(toVtt('\uFEFFWEBVTT\n')).toEqual({ vtt: 'WEBVTT\n', format: 'vtt' })
    expect(toVtt(SRT).format).toBe('srt')
    expect(toVtt(SRT).vtt.startsWith('WEBVTT\n\n1\n00:00:01.000')).toBe(true)
    expect(toVtt('[Script Info]\n')).toEqual({ vtt: null, format: 'ass' })
    expect(toVtt('garbage')).toEqual({ vtt: null, format: 'unknown' })
  })
})

describe('parseCueText', () => {
  it('keeps i/b/u and line breaks as nodes', () => {
    expect(parseCueText('<i>Hi</i> there\n<b>now <u>u</u></b>')).toEqual([
      { type: 'i', children: [{ type: 'text', value: 'Hi' }] }, { type: 'text', value: ' there' }, { type: 'br' },
      { type: 'b', children: [{ type: 'text', value: 'now ' }, { type: 'u', children: [{ type: 'text', value: 'u' }] }] },
    ])
  })
  it('drops other tags but keeps their text, closes unclosed tags, decodes entities', () => {
    expect(parseCueText('<v Frieren>Hi</v> <c.yellow>&amp; you</c><00:00:01.000> &lt;3 &bogus;')).toEqual([{ type: 'text', value: 'Hi' }, { type: 'text', value: ' ' }, { type: 'text', value: '& you' }, { type: 'text', value: ' <3 &bogus;' }])
    expect(parseCueText('<i.loud>open')).toEqual([{ type: 'i', children: [{ type: 'text', value: 'open' }] }])
  })
  it('never produces elements other than i/b/u/br', () => {
    const flat = (nodes) => nodes.flatMap((n) => [n.type, ...flat(n.children ?? [])])
    const nodes = parseCueText('<script>alert(1)</script><img src=x onerror=y>a < b')
    expect(new Set(flat(nodes))).toEqual(new Set(['text']))
    expect(nodes.map((n) => n.value).join('')).toBe('alert(1)a < b')
  })
})

describe('activeCues / isTopCue', () => {
  const c = (startTime, endTime, extra = {}) => ({ startTime, endTime, text: `${startTime}`, ...extra })
  it('selects cues active at t, ordered by start', () => {
    const a = c(2, 5); const b = c(1, 3); const d = c(5, 6)
    expect(activeCues([a, b, d], 2.5)).toEqual([b, a])
    expect(activeCues([a, b, d], 5)).toEqual([d])
    expect(activeCues([a], 10)).toEqual([])
  })
  it('puts line:0 style cues on top', () => {
    expect(isTopCue(c(0, 1, { line: 0, snapToLines: true }))).toBe(true)
    expect(isTopCue(c(0, 1, { line: 10, snapToLines: false }))).toBe(true)
    expect(isTopCue(c(0, 1, { line: 'auto', snapToLines: true }))).toBe(false)
    expect(isTopCue(c(0, 1, { line: -1, snapToLines: true }))).toBe(false)
    expect(isTopCue(c(0, 1, { line: 90, snapToLines: false }))).toBe(false)
    expect(isTopCue(c(0, 1))).toBe(false)
  })
})

describe('offset helpers', () => {
  it('clamps to ±60 s and rounds to 0.1 s', () => {
    expect(clampOffset(0.15000001)).toBe(0.2)
    expect(clampOffset(0.1 + 0.2)).toBe(0.3)
    expect(clampOffset(-75)).toBe(-60)
    expect(clampOffset(61)).toBe(60)
    expect(clampOffset('x')).toBe(0)
    expect(clampOffset(NaN)).toBe(0)
  })
  it('formats with a sign and the language decimal separator', () => {
    expect(formatOffset(0.5, 'sr')).toBe('+0,5')
    expect(formatOffset(-1, 'sr')).toBe('-1,0')
    expect(formatOffset(0, 'sr')).toBe('0,0')
    expect(formatOffset(1.5, 'en')).toBe('+1.5')
  })
})

describe('subtitleStyleVars', () => {
  it('maps the settings to CSS variables', () => {
    expect(subtitleStyleVars(DEFAULT_SUBTITLES)).toEqual({
      '--sub-size': '3.88cqh', '--sub-line': '1.40', '--sub-gap': '0.00em',
      '--sub-font': SUBTITLE_FONT_STACKS.default, '--sub-color': 'var(--sub-text)', '--sub-box-alpha': '0.6',
    })
    const v = subtitleStyleVars({ ...DEFAULT_SUBTITLES, size: 100, lineSpacing: 100, font: 'exo2', color: 'yellow', boxOpacity: 0 })
    expect(v['--sub-size']).toBe('8.00cqh')
    expect(v['--sub-line']).toBe('1.60')
    expect(v['--sub-gap']).toBe('0.20em')
    expect(v['--sub-font']).toBe('var(--font-body)')
    expect(v['--sub-color']).toBe('var(--sub-text-alt)')
    expect(v['--sub-box-alpha']).toBe('0')
    expect(subtitleStyleVars({ ...DEFAULT_SUBTITLES, size: 0 })['--sub-size']).toBe('2.50cqh')
  })
  it('never lets the boxes of wrapped lines overlap, even at the tightest spacing', () => {
    for (const lineSpacing of [0, 1, 50, 100]) {
      expect(Number(subtitleStyleVars({ ...DEFAULT_SUBTITLES, lineSpacing })['--sub-line']), String(lineSpacing)).toBeGreaterThanOrEqual(1.4)
    }
  })
  it('has the agreed defaults, frozen', () => {
    expect(DEFAULT_SUBTITLES).toEqual({ enabled: { sub: true, dub: false }, size: 25, lineSpacing: 0, font: 'default', color: 'white', box: true, boxOpacity: 60 })
    expect(Object.isFrozen(DEFAULT_SUBTITLES) && Object.isFrozen(DEFAULT_SUBTITLES.enabled)).toBe(true)
  })
})
