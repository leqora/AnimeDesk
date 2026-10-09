// tests/unit/subtitles.test.js
import { describe, it, expect } from 'vitest'
import { detectFormat, srtToVtt, toVtt } from '../../src/shared/subtitles.js'

const SRT = '1\n00:00:01,000 --> 00:00:03,500\nHello, world\n\n2\n00:00:04,000 --> 00:00:06,000\n<i>Second</i>\nline two\n'

describe('detectFormat', () => {
  it('recognises formats by content', () => {
    expect(detectFormat('WEBVTT\n\n00:01.000 --> 00:02.000\nx')).toBe('vtt')
    expect(detectFormat('﻿WEBVTT')).toBe('vtt')
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
    const out = srtToVtt('﻿1\r\n0:00:01,000 --> 0:00:02,000   \r\nA\r\n\r\n2\r\n00:00:03,000 --> 00:00:04,000\r\nB')
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
    expect(toVtt('﻿WEBVTT\n')).toEqual({ vtt: 'WEBVTT\n', format: 'vtt' })
    expect(toVtt(SRT).format).toBe('srt')
    expect(toVtt(SRT).vtt.startsWith('WEBVTT\n\n1\n00:00:01.000')).toBe(true)
    expect(toVtt('[Script Info]\n')).toEqual({ vtt: null, format: 'ass' })
    expect(toVtt('garbage')).toEqual({ vtt: null, format: 'unknown' })
  })
})
