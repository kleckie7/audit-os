import { Link, useLocation } from 'react-router'
import { ChevronDown, Search } from 'lucide-react'
import { useAuditStore } from '@/lib/store'
import { MOCK_DASHBOARD } from '@/lib/mock-dashboard'
import ProgressRing from '@/components/ProgressRing'

// TopBar — 56px fixed app bar (design.md §9).

const ROUTE_LABELS: Record<string, string> = {
  '/': 'Dashboard',
  '/frameworks': 'Framework Library',
  '/audit': 'Guided Audit',
  '/interviews': 'Interviews',
  '/findings': 'Findings & Scoring',
  '/reports': 'Reports & Export',
  '/glossary': 'Glossary',
}

function breadcrumb(pathname: string): string {
  if (pathname.startsWith('/audit/')) return 'Guided Audit'
  return ROUTE_LABELS[pathname] ?? 'Dashboard'
}

export default function TopBar() {
  const engagement = useAuditStore((s) => s.engagement)
  const lastSavedAt = useAuditStore((s) => s.lastSavedAt)
  const { pathname } = useLocation()

  const savedLabel = lastSavedAt
    ? new Date(lastSavedAt).toLocaleTimeString('en-GB', { hour12: false })
    : '14:32:07'

  return (
    <header className="fixed top-0 z-50 flex h-14 w-full items-center gap-4 border-b border-border bg-bg-surface px-4">
      {/* Logo + wordmark */}
      <Link to="/" className="flex shrink-0 items-center gap-2.5">
        <img src="/logo.svg" alt="AuditOS" className="size-6" />
        <span className="font-display text-[15px] font-semibold tracking-[-0.01em] text-text-primary">
          AuditOS
        </span>
      </Link>

      {/* Engagement switcher */}
      <button
        type="button"
        className="group flex items-center gap-2 rounded-md border border-border px-2.5 py-1.5 transition-colors duration-[120ms] hover:border-border-strong hover:bg-bg-raised"
      >
        <span className="max-w-44 truncate text-[13px] font-medium text-text-primary">
          {engagement?.client ?? 'Meridian Financial Group'}
        </span>
        <span className="font-mono text-[11px] tracking-[0.02em] text-text-muted">
          {engagement?.id ?? 'ENG-2025-0147'}
        </span>
        <ChevronDown className="size-3.5 text-text-muted transition-colors group-hover:text-text-secondary" />
      </button>

      {/* Breadcrumb */}
      <nav className="hidden items-center gap-1.5 font-mono text-[11px] uppercase tracking-[0.08em] text-text-muted md:flex">
        <span>WORKSPACE</span>
        <span className="text-border-strong">/</span>
        <span className="text-text-secondary">{breadcrumb(pathname)}</span>
      </nav>

      <div className="flex-1" />

      {/* Cmd+K trigger */}
      <button
        type="button"
        className="hidden w-56 items-center gap-2 rounded-md border border-border bg-bg-base px-3 py-1.5 text-left text-[13px] text-text-muted transition-colors duration-[120ms] hover:border-border-strong hover:bg-bg-raised lg:flex"
        onClick={() => window.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', metaKey: true }))}
      >
        <Search className="size-3.5" />
        <span className="flex-1">Search controls, findings…</span>
        <kbd className="rounded border border-border-strong bg-bg-raised px-1 py-px font-mono text-[11px] leading-[14px] tracking-[0.04em] text-text-secondary">
          ⌘K
        </kbd>
      </button>

      {/* Global progress chip */}
      <div className="flex items-center gap-2 rounded-full border border-border py-1 pl-1 pr-2.5">
        <ProgressRing value={MOCK_DASHBOARD.overallProgressPct} size={20} showLabel={false} animate={false} />
        <span className="font-mono text-[11px] font-medium tabular text-text-secondary">
          {MOCK_DASHBOARD.overallProgressPct}%
        </span>
      </div>

      {/* Autosave dot */}
      <div className="hidden items-center gap-1.5 sm:flex" title={`Autosaved ${savedLabel}`}>
        <span className="size-1.5 rounded-full bg-[var(--accent)]" />
        <span className="font-mono text-[11px] uppercase tracking-[0.04em] text-text-muted">
          Saved
        </span>
      </div>

      {/* Auditor avatar */}
      <img
        src="/avatar-jm.svg"
        alt="J. Mercer"
        className="size-8 shrink-0 rounded-full border border-border-strong"
      />
    </header>
  )
}
