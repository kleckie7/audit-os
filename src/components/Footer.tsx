import { useAuditStore } from '@/lib/store'
import { FRAMEWORKS } from '@/data/frameworks'

// App footer — 40px bar, hairline top, mono micro text (design.md §9).

export default function Footer() {
  const engagement = useAuditStore((s) => s.engagement)
  const lastSavedAt = useAuditStore((s) => s.lastSavedAt)

  const savedLabel = lastSavedAt
    ? new Date(lastSavedAt).toLocaleTimeString('en-GB', { hour12: false })
    : '14:32:07'

  const versions = FRAMEWORKS.slice(0, 4)
    .map((f) => `${f.shortName} ${f.version}`)
    .join(' · ')

  return (
    <footer className="flex h-10 shrink-0 items-center gap-4 overflow-hidden border-t border-border bg-bg-surface px-4 font-mono text-[11px] leading-4 tracking-[0.02em] text-text-muted">
      <span className="tabular">{engagement?.id ?? 'ENG-2025-0147'}</span>
      <span className="text-border-strong">·</span>
      <span className="hidden truncate md:inline">{versions}</span>
      <span className="hidden text-border-strong md:inline">·</span>
      <span className="ml-auto shrink-0 tabular">
        SAVED {savedLabel}
      </span>
      <span className="text-border-strong">·</span>
      <span className="shrink-0">AuditOS v1.0</span>
    </footer>
  )
}
