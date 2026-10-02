import { describe, it, expect } from 'vitest'
import { releaseNotesToText, markdownToText, compareVersions } from '../../src/shared/releaseNotes.js'

describe('releaseNotesToText', () => {
  it('turns GitHub HTML into readable text', () => {
    const html = '<h2>Novo</h2><ul><li>Bočni meni</li><li>Zvuci &amp; animacije</li></ul><p>Prvi red<br>Drugi red</p>'
    expect(releaseNotesToText(html)).toBe('Novo\n• Bočni meni\n• Zvuci & animacije\n\nPrvi red\nDrugi red')
  })
  it('strips scripts and tags, decodes entities', () => {
    const html = '<p>Hi</p><script>alert(1)</script><img src=x onerror="alert(2)"><style>p{}</style>&lt;b&gt; &quot;x&quot; &#39;y&#39;'
    const text = releaseNotesToText(html)
    expect(text).not.toMatch(/alert|onerror|<img|p\{\}/)
    expect(text).toContain('<b> "x" \'y\'')
  })
  it('joins an array of versions, newest first', () => {
    expect(releaseNotesToText([{ version: '0.3.0', note: '<p>A</p>' }, { version: '0.3.1', note: '<p>B</p>' }]))
      .toBe('v0.3.1\nB\n\nv0.3.0\nA')
  })
  it('returns null for empty input', () => {
    expect(releaseNotesToText(null)).toBeNull()
    expect(releaseNotesToText('   ')).toBeNull()
    expect(releaseNotesToText('<p></p>')).toBeNull()
  })
})

describe('markdownToText', () => {
  it('drops markdown markers but keeps the words', () => {
    expect(markdownToText('## Novo\n- **Bočni** meni\n`code` [link](https://x)\n\n\n\nkraj'))
      .toBe('Novo\n• Bočni meni\ncode link\n\nkraj')
    expect(markdownToText(null)).toBeNull()
  })
})

describe('compareVersions', () => {
  it('orders semver numerically', () => {
    expect(compareVersions('0.3.10', '0.3.9')).toBe(1)
    expect(compareVersions('0.3.0', '0.3.0')).toBe(0)
    expect(compareVersions('0.2.9', '0.3.0')).toBe(-1)
  })
})
