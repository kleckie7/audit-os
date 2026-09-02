import clsx from 'clsx'
import type { AnswerStatus } from '@/lib/types'

// 6px status dot + mono 11px label, pill bg at 12% status color (design.md §9).

export type StatusVariant = 'compliant' | 'partial' | 'noncompliant' | 'na' | 'fieldwork' | 'draft'

const CONFIG: Record<StatusVariant, { color: string; label: string }> = {
  compliant: { color: 'var(--status-compliant)', label: 'COMPLIANT' },
  partial: { color: 'var(--status-partial)', label: 'PARTIAL' },
  noncompliant: { color: 'var(--status-noncompliant)', label: 'NON-COMPLIANT' },
  na: { color: 'var(--status-na)', label: 'N/A' },
  fieldwork: { color: 'var(--status-compliant)', label: 'FIELDWORK' },
  draft: { color: 'var(--status-partial)', label: 'DRAFT' },
}

function hexWithAlpha(hex: string, alpha: number): string {
  // color-mix keeps this working for CSS variables too
  return `color-mix(in srgb, ${hex} ${Math.round(alpha * 100)}%, transparent)`
}

export default function StatusPill({
  status,
  label,
  className,
}: {
  status: StatusVariant | Exclude<AnswerStatus, null>
  label?: string
  className?: string
}) {
  const cfg = CONFIG[status as StatusVariant] ?? CONFIG.na
  return (
    <span
      className={clsx(
        'inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 font-mono text-[11px] font-medium uppercase leading-4 tracking-[0.04em]',
        className,
      )}
      style={{ backgroundColor: hexWithAlpha(cfg.color, 0.12), color: cfg.color }}
    >
      <span className="size-1.5 shrink-0 rounded-full" style={{ backgroundColor: cfg.color }} />
      {label ?? cfg.label}
    </span>
  )
}
