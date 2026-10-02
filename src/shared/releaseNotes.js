const ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', '#39': "'", nbsp: ' ' }

const tidy = (s) => s.replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim() || null

export function compareVersions(a, b) {
  const pa = String(a).split('.').map(Number)
  const pb = String(b).split('.').map(Number)
  for (let i = 0; i < 3; i++) {
    if ((pa[i] || 0) !== (pb[i] || 0)) return (pa[i] || 0) > (pb[i] || 0) ? 1 : -1
  }
  return 0
}

// GitHub release notes arrive as HTML; the app only ever shows them as plain text.
export function releaseNotesToText(notes) {
  if (notes == null) return null
  if (Array.isArray(notes)) {
    const parts = [...notes]
      .sort((x, y) => compareVersions(y.version, x.version))
      .map((n) => {
        const body = releaseNotesToText(n.note)
        return body ? `v${n.version}\n${body}` : `v${n.version}`
      })
    return parts.length ? parts.join('\n\n') : null
  }
  return tidy(
    String(notes)
      .replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1>/gi, '')
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<\/(p|li|h[1-6]|div)>/gi, '\n')
      .replace(/<\/(ul|ol)>/gi, '\n')
      .replace(/<li\b[^>]*>/gi, '• ')
      .replace(/<[^>]+>/g, '')
      .replace(/&(amp|lt|gt|quot|#39|nbsp);/g, (_, e) => ENTITIES[e]),
  )
}

export function markdownToText(md) {
  if (md == null) return null
  return tidy(
    String(md)
      .replace(/^#{1,6}\s+/gm, '')
      .replace(/^\s*[-*]\s+/gm, '• ')
      .replace(/\*\*([^*]+)\*\*/g, '$1')
      .replace(/`([^`]+)`/g, '$1')
      .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1'),
  )
}
