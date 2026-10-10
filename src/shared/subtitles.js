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

const ENTITIES = { amp: '&', lt: '<', gt: '>', nbsp: '\u00a0', lrm: '\u200e', rlm: '\u200f', quot: '"', apos: "'" }
const decode = (s) => s.replace(/&(\w+);/g, (m, name) => ENTITIES[name] ?? m)
const KEPT_TAGS = new Set(['i', 'b', 'u'])

// WebVTT cue text → a plain node tree; React renders it, so cue text can never become markup.
export function parseCueText(text) {
  const src = String(text ?? '')
  const root = { children: [] }
  const stack = [root]
  const pushText = (s) => {
    decode(s).split('\n').forEach((part, i) => {
      if (i) stack.at(-1).children.push({ type: 'br' })
      if (part) stack.at(-1).children.push({ type: 'text', value: part })
    })
  }
  let last = 0
  for (const m of src.matchAll(/<[^<>]*>/g)) {
    pushText(src.slice(last, m.index))
    last = m.index + m[0].length
    const tag = /^<(\/?)([a-z]+)/i.exec(m[0])
    const name = tag?.[2].toLowerCase()
    if (!tag || !KEPT_TAGS.has(name)) continue
    if (tag[1]) {
      const at = stack.findLastIndex((n, k) => k > 0 && n.type === name)
      if (at > 0) stack.length = at
    } else {
      const node = { type: name, children: [] }
      stack.at(-1).children.push(node)
      stack.push(node)
    }
  }
  pushText(src.slice(last))
  return root.children
}

export function activeCues(cues, t) {
  return cues
    .map((cue, i) => ({ cue, i }))
    .filter(({ cue }) => cue.startTime <= t && t < cue.endTime)
    .sort((a, b) => a.cue.startTime - b.cue.startTime || a.i - b.i)
    .map(({ cue }) => cue)
}

// Basic VTT positioning only: signs/top captions ("line:0", {\an8}) go up, dialogue stays at the bottom.
export function isTopCue(cue) {
  if (typeof cue.line !== 'number') return false
  return cue.snapToLines ? cue.line >= 0 && cue.line < 3 : cue.line < 50
}

export const SUB_OFFSET_LIMIT = 60
export function clampOffset(v) {
  const n = Number(v)
  if (typeof v !== 'number' || !Number.isFinite(n)) return 0
  return Math.round(Math.min(SUB_OFFSET_LIMIT, Math.max(-SUB_OFFSET_LIMIT, n)) * 10) / 10
}

export function formatOffset(v, lang) {
  const n = clampOffset(v)
  const sign = n > 0 ? '+' : n < 0 ? '-' : ''
  const s = Math.abs(n).toFixed(1)
  return sign + (lang === 'sr' ? s.replace('.', ',') : s)
}

export const SUBTITLE_FONT_STACKS = Object.freeze({
  default: "'Segoe UI', sans-serif",
  segoe: "'Segoe UI', sans-serif",
  arial: 'Arial, sans-serif',
  verdana: 'Verdana, sans-serif',
  trebuchet: "'Trebuchet MS', sans-serif",
  georgia: 'Georgia, serif',
  exo2: 'var(--font-body)',
})
export const SUBTITLE_COLORS = ['white', 'yellow']
export const DEFAULT_SUBTITLES = Object.freeze({
  enabled: Object.freeze({ sub: true, dub: false }),
  size: 25, lineSpacing: 0, font: 'default', color: 'white', box: true, boxOpacity: 60,
})

// Below a line-height of 1.4 the boxes of a wrapped cue overlap, so 0 % is the tightest readable spacing.
const MIN_LINE = 1.4

export function subtitleStyleVars(s) {
  const line = MIN_LINE + (s.lineSpacing / 100) * 0.2
  return {
    '--sub-size': `${(2.5 + (s.size / 100) * 5.5).toFixed(2)}cqh`,
    '--sub-line': line.toFixed(2),
    '--sub-gap': `${(line - MIN_LINE).toFixed(2)}em`,
    '--sub-font': SUBTITLE_FONT_STACKS[s.font] ?? SUBTITLE_FONT_STACKS.default,
    '--sub-color': s.color === 'yellow' ? 'var(--sub-text-alt)' : 'var(--sub-text)',
    '--sub-box-alpha': String(s.boxOpacity / 100),
  }
}
