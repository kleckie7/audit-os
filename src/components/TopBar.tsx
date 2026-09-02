import { useState } from 'react'
import { Link, useLocation } from 'react-router'
import { ChevronDown, LogOut, Plus, Search } from 'lucide-react'
import { useAuditStore } from '@/lib/store'
import { MOCK_DASHBOARD } from '@/lib/mock-dashboard'
import ProgressRing from '@/components/ProgressRing'
import { useAuth } from '@/hooks/useAuth'
import { LOGIN_PATH } from '@/const'
import { trpc } from '@/providers/trpc'
import { useCloudSync, displayId } from '@/lib/sync'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'

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
  const { user, isAuthenticated, isLoading, logout } = useAuth()
  const { hydrateEngagement, createCloudEngagement } = useCloudSync()

  const [newEngagementOpen, setNewEngagementOpen] = useState(false)
  const [newClient, setNewClient] = useState('')
  const [newName, setNewName] = useState('')
  const [creating, setCreating] = useState(false)

  const engagementsQuery = trpc.audit.listEngagements.useQuery(undefined, {
    enabled: isAuthenticated,
    staleTime: 1000 * 30,
  })

  const savedLabel = lastSavedAt
    ? new Date(lastSavedAt).toLocaleTimeString('en-GB', { hour12: false })
    : '14:32:07'

  const handleNewEngagement = async () => {
    if (!newClient.trim() || !newName.trim() || creating) return
    setCreating(true)
    try {
      await createCloudEngagement({ clientName: newClient.trim(), name: newName.trim() })
      setNewEngagementOpen(false)
      setNewClient('')
      setNewName('')
      void engagementsQuery.refetch()
    } finally {
      setCreating(false)
    }
  }

  const switcherLabel = (
    <>
      <span className="max-w-44 truncate text-[13px] font-medium text-text-primary">
        {engagement?.client ?? 'Meridian Financial Group'}
      </span>
      <span className="font-mono text-[11px] tracking-[0.02em] text-text-muted">
        {engagement?.id ?? 'ENG-2025-0147'}
      </span>
      <ChevronDown className="size-3.5 text-text-muted transition-colors group-hover:text-text-secondary" />
    </>
  )

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
      {isAuthenticated ? (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              className="group flex items-center gap-2 rounded-md border border-border px-2.5 py-1.5 transition-colors duration-[120ms] hover:border-border-strong hover:bg-bg-raised"
            >
              {switcherLabel}
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-72">
            <DropdownMenuLabel className="font-mono text-[11px] uppercase tracking-[0.08em] text-text-muted">
              Engagements
            </DropdownMenuLabel>
            {(engagementsQuery.data ?? []).map((eng) => (
              <DropdownMenuItem
                key={eng.id}
                onSelect={() => void hydrateEngagement(eng.id)}
                className="flex flex-col items-start gap-0.5"
              >
                <span className="text-[13px] font-medium">
                  {eng.clientName} — {eng.name}
                </span>
                <span className="font-mono text-[11px] text-text-muted">
                  {displayId(eng.id, eng.startedAt instanceof Date ? eng.startedAt : new Date(eng.startedAt))}
                </span>
              </DropdownMenuItem>
            ))}
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={() => setNewEngagementOpen(true)}>
              <Plus className="size-3.5" />
              New engagement
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      ) : (
        <button
          type="button"
          className="group flex items-center gap-2 rounded-md border border-border px-2.5 py-1.5 transition-colors duration-[120ms] hover:border-border-strong hover:bg-bg-raised"
        >
          {switcherLabel}
        </button>
      )}

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

      {/* Sync status chip (guest mode only) */}
      {!isLoading && !isAuthenticated && (
        <span className="hidden rounded-full border border-border px-2.5 py-1 font-mono text-[10px] uppercase tracking-[0.06em] text-text-muted xl:inline">
          Local only — sign in to sync
        </span>
      )}

      {/* Auth slot */}
      {isLoading ? (
        <div className="flex shrink-0 items-center gap-2">
          <span className="size-8 animate-pulse rounded-full border border-border bg-bg-raised" />
          <span className="hidden h-3 w-20 animate-pulse rounded bg-bg-raised md:block" />
        </div>
      ) : isAuthenticated && user ? (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              className="flex shrink-0 items-center gap-2 rounded-md px-1.5 py-1 transition-colors duration-[120ms] hover:bg-bg-raised"
            >
              <Avatar className="size-8 border border-border-strong">
                {user.avatar ? <AvatarImage src={user.avatar} alt={user.name ?? 'Auditor'} /> : null}
                <AvatarFallback className="bg-[var(--accent-dim)] font-mono text-[11px] font-semibold text-[var(--accent)]">
                  {(user.name ?? user.email ?? 'A')
                    .split(/\s+/)
                    .map((p) => p.charAt(0))
                    .slice(0, 2)
                    .join('')
                    .toUpperCase()}
                </AvatarFallback>
              </Avatar>
              <span className="hidden max-w-32 truncate text-[13px] font-medium text-text-primary md:block">
                {user.name ?? user.email ?? 'Auditor'}
              </span>
              <ChevronDown className="hidden size-3.5 text-text-muted md:block" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
            <DropdownMenuLabel className="flex flex-col gap-0.5">
              <span className="text-[13px] font-medium">{user.name ?? 'Auditor'}</span>
              {user.email ? (
                <span className="font-mono text-[11px] text-text-muted">{user.email}</span>
              ) : null}
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={() => logout()}>
              <LogOut className="size-3.5" />
              Sign out
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      ) : (
        <Link
          to={LOGIN_PATH}
          className="shrink-0 rounded-md bg-[var(--accent)] px-3.5 py-1.5 text-[13px] font-semibold text-[var(--bg-base,#071114)] transition-colors duration-[120ms] hover:bg-[var(--accent-strong)]"
        >
          Sign in
        </Link>
      )}

      {/* New engagement dialog */}
      <Dialog open={newEngagementOpen} onOpenChange={setNewEngagementOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>New engagement</DialogTitle>
          </DialogHeader>
          <div className="flex flex-col gap-3">
            <Input
              placeholder="Client name"
              value={newClient}
              onChange={(e) => setNewClient(e.target.value)}
            />
            <Input
              placeholder="Engagement name"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') void handleNewEngagement()
              }}
            />
            <Button
              onClick={() => void handleNewEngagement()}
              disabled={creating || !newClient.trim() || !newName.trim()}
            >
              {creating ? 'Creating…' : 'Create engagement'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </header>
  )
}
