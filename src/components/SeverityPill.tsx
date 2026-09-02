import clsx from 'clsx'
import type { FindingSeverity } from '@/lib/types'

// Severity pill — same anatomy as StatusPill, severity palette (design.md §9).

const CONFIG: Record<FindingSeverity, { color: string; label: string }> = {
  critical: { color: 'var(--severity-critical)', label: 'CRITICAL' },
  high: { color: 'var(--severity-high)', label: 'HIGH' },
  medium: { color: 'var(--severity-medium)', label: 'MEDIUM' },
  low: { color: 'var(--severity-low)', label: 'LOW' },
}

export default function SeverityPill({
  severity,
  className,
}: {
  severity: FindingSeverity
  className?: string
}) {
  const cfg = CONFIG[severity]
  return (
    <span
      className={clsx(
        'inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 font-mono text-[11px] font-medium uppercase leading-4 tracking-[0.04em]',
        className,
      )}
      style={{
        backgroundColor: `color-mix(in srgb, ${cfg.color} 12%, transparent)`,
        color: cfg.color,
      }}
    >
      <span className="size-1.5 shrink-0 rounded-full" style={{ backgroundColor: cfg.color }} />
      {cfg.label}
    </span>
  )
}
