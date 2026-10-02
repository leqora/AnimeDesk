export function XpBar({ into, total }) {
  const ratio = total > 0 ? Math.min(1, Math.max(0, into / total)) : 0
  return (
    <div className="xp-bar" role="progressbar" aria-valuemin={0} aria-valuemax={total} aria-valuenow={into}>
      <div className="xp-bar__fill" style={{ transform: `scaleX(${ratio})` }} />
    </div>
  )
}
