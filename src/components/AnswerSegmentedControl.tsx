import clsx from 'clsx'
import type { AnswerStatus } from '@/lib/types'

// AnswerSegmentedControl — four equal segments (Compliant / Partial /
// Non-Compliant / N/A) with kbd hints 1–4 in the corner of each segment.
// Selected = status color at 14% fill + status-colored inset border + bold
// label (design.md §9). Used by the AuditWorkflow answer dock; other pages
// (e.g. Findings) may import the compact `sm` variant.

type Status = Exclude<AnswerStatus, null>

const ANSWER_OPTIONS: { value: Status; label: string; kbd: string; color: string }[] = [
  { value: 'compliant', label: 'Compliant', kbd: '1', color: 'var(--status-compliant)' },
  { value: 'partial', label: 'Partial', kbd: '2', color: 'var(--status-partial)' },
  { value: 'noncompliant', label: 'Non-Compliant', kbd: '3', color: 'var(--status-noncompliant)' },
  { value: 'na', label: 'N/A', kbd: '4', color: 'var(--status-na)' },
]

export default function AnswerSegmentedControl({
  value,
  onChange,
  size = 'md',
  className,
}: {
  value: AnswerStatus
  onChange: (status: Status) => void
  /** md = 40px dock rows · sm = 28px compact inline rows */
  size?: 'md' | 'sm'
  className?: string
}) {
  return (
    <div
      role="radiogroup"
      aria-label="Audit answer"
      className={clsx(
        'grid grid-cols-4 gap-px overflow-hidden rounded-md border border-border bg-border',
        className,
      )}
    >
      {ANSWER_OPTIONS.map((opt) => {
        const selected = value === opt.value
        return (
          <button
            key={opt.value}
            type="button"
            role="radio"
            aria-checked={selected}
            onClick={() => onChange(opt.value)}
            className={clsx(
              'relative flex items-center justify-center gap-1.5 bg-bg-base transition-colors duration-[140ms]',
              size === 'md' ? 'h-10 px-3 text-[13px]' : 'h-7 px-2 text-[11px]',
              selected
                ? 'font-semibold'
                : 'font-medium text-text-secondary hover:bg-bg-raised hover:text-text-primary',
            )}
            style={
              selected
                ? {
                    backgroundColor: `color-mix(in srgb, ${opt.color} 14%, var(--bg-base))`,
                    boxShadow: `inset 0 0 0 1px ${opt.color}`,
                    color: opt.color,
                  }
                : undefined
            }
          >
            <span
              className="size-1.5 shrink-0 rounded-full"
              style={{ backgroundColor: opt.color, opacity: selected ? 1 : 0.45 }}
            />
            <span className="truncate">{opt.label}</span>
            <kbd
              className={clsx(
                'absolute right-1 top-1 rounded border px-0.5 font-mono leading-[12px] tracking-[0.04em]',
                size === 'md' ? 'text-[10px]' : 'text-[9px]',
                selected
                  ? 'border-current opacity-70'
                  : 'border-border-strong bg-bg-raised text-text-muted',
              )}
            >
              {opt.kbd}
            </kbd>
          </button>
        )
      })}
    </div>
  )
}
