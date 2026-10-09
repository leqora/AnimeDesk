import { createElement } from 'react'
import { parseCueText, subtitleStyleVars } from '../../shared/subtitles.js'

// Only i/b/u/br ever become elements; everything else in a cue is plain text.
function renderNodes(nodes) {
  return nodes.map((n, i) => {
    if (n.type === 'text') return n.value
    if (n.type === 'br') return <br key={i} />
    return createElement(n.type, { key: i }, renderNodes(n.children))
  })
}

function Group({ cues, where }) {
  return (
    <div className={`subs__group subs__group--${where}`}>
      {cues.map((c) => (
        <div key={c.id} className="subs__cue"><span className="subs__line">{renderNodes(parseCueText(c.text))}</span></div>
      ))}
    </div>
  )
}

export function SubtitleOverlay({ cues, subtitles, raised = false }) {
  const cls = `subs${raised ? ' subs--raised' : ''}${subtitles.box ? '' : ' subs--no-box'}`
  return (
    <div className={cls} style={subtitleStyleVars(subtitles)} aria-live="off">
      <Group cues={cues.filter((c) => c.top)} where="top" />
      <Group cues={cues.filter((c) => !c.top)} where="bottom" />
    </div>
  )
}
