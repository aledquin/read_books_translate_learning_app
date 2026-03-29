type Props = {
  current: number
  total: number
}

export function ProgressBar({ current, total }: Props) {
  const pct = Math.min(100, (100 * current) / Math.max(1, total))
  return (
    <div className="progress-wrap">
      <div className="progress-bar">
        <div style={{ width: `${pct}%` }} />
      </div>
    </div>
  )
}
