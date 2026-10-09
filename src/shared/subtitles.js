// Subtitle helpers shared by the stream proxy (format conversion) and the renderer (cue text, styling).

const SRT_TIME = /^\s*(\d{1,2}):(\d{2}):(\d{2})[,.](\d{3})\s*-->\s*(\d{1,2}):(\d{2}):(\d{2})[,.](\d{3})/
const clean = (text) => String(text ?? '').replace(/^﻿/, '').replace(/\r\n?/g, '\n')

export function detectFormat(text) {
  const s = clean(text).trimStart()
  if (!s.trim()) return 'unknown'
  if (/^WEBVTT(?=\s|$)/.test(s)) return 'vtt'
  if (/^\[(Script Info|V4\+? Styles)\]/im.test(s)) return 'ass'
  if (s.split('\n').some((l) => SRT_TIME.test(l))) return 'srt'
  return 'unknown'
}

const pad2 = (h) => h.padStart(2, '0')

export function srtToVtt(text) {
  const out = ['WEBVTT', '']
  for (const block of clean(text).trim().split(/\n\s*\n/)) {
    const lines = block.split('\n')
    const ti = lines.findIndex((l) => SRT_TIME.test(l))
    if (ti < 0 || ti > 1) continue
    let body = lines.slice(ti + 1)
    const top = body.length > 0 && /^\s*\{\\an[789]\}/.test(body[0])
    body = body.map((l) => l.replace(/\{\\[^}]*\}/g, '').replace(/-->/g, '->').trimEnd())
    while (body.length && !body.at(-1)) body.pop()
    if (!body.length) continue
    const m = SRT_TIME.exec(lines[ti])
    const id = ti === 1 && !lines[0].includes('-->') ? lines[0].trim() : ''
    const time = `${pad2(m[1])}:${m[2]}:${m[3]}.${m[4]} --> ${pad2(m[5])}:${m[6]}:${m[7]}.${m[8]}${top ? ' line:0' : ''}`
    if (id) out.push(id)
    out.push(time, ...body, '')
  }
  return out.join('\n')
}

export function toVtt(text) {
  const format = detectFormat(text)
  if (format === 'vtt') return { vtt: clean(text).trimStart(), format }
  if (format === 'srt') return { vtt: srtToVtt(text), format }
  return { vtt: null, format }
}
