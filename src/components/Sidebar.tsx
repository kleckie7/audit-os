import { NavLink } from 'react-router'
import { motion } from 'framer-motion'
import {
  BookOpenText,
  ClipboardCheck,
  Compass,
  FileBarChart,
  Layers,
  LayoutDashboard,
  MessagesSquare,
  PanelLeftClose,
  PanelLeftOpen,
  ShieldAlert,
} from 'lucide-react'
import clsx from 'clsx'
import { MOCK_DASHBOARD } from '@/lib/mock-dashboard'

// Sidebar — 248px, collapsible to 64px icon rail (design.md §9).

interface NavItem {
  label: string
  to: string
  icon: typeof LayoutDashboard
  /** 0–100 mini progress under the label, when the item tracks engagement progress. */
  progress?: number
}

const WORKSPACE: NavItem[] = [
  { label: 'Dashboard', to: '/', icon: LayoutDashboard },
  { label: 'Guided Audit', to: '/audit/iso27001', icon: ClipboardCheck, progress: MOCK_DASHBOARD.overallProgressPct },
  { label: 'Interviews', to: '/interviews', icon: MessagesSquare, progress: Math.round((MOCK_DASHBOARD.interviewsDone / MOCK_DASHBOARD.interviewsTotal) * 100) },
  { label: 'Findings', to: '/findings', icon: ShieldAlert },
  { label: 'Reports', to: '/reports', icon: FileBarChart },
]

const REFERENCE: NavItem[] = [
  { label: 'Framework Library', to: '/frameworks', icon: Layers },
  { label: 'Field Guide', to: '/field-guide', icon: Compass },
  { label: 'Glossary', to: '/glossary', icon: BookOpenText },
]

export default function Sidebar({
  collapsed,
  onToggle,
}: {
  collapsed: boolean
  onToggle: () => void
}) {
  const renderItem = (item: NavItem) => (
    <NavLink
      key={item.to}
      to={item.to}
      end={item.to === '/'}
      title={collapsed ? item.label : undefined}
      className={({ isActive }) =>
        clsx(
          'group relative flex items-center gap-2.5 rounded-md px-2.5 py-2 text-[13px] transition-colors duration-[120ms]',
          isActive
            ? 'bg-accent-dim font-medium text-[var(--accent)] shadow-[inset_0_0_0_1px_rgba(200,243,29,0.18),0_0_16px_-6px_rgba(200,243,29,0.4)]'
            : 'text-text-secondary hover:bg-bg-raised hover:text-text-primary',
        )
      }
    >
      {({ isActive }) => (
        <>
          <item.icon className="size-4 shrink-0" />
          {!collapsed && (
            <>
              {/* 2px accent underline sweep on hover */}
              <span
                className={clsx(
                  'absolute bottom-0 left-2.5 h-px bg-[var(--accent)] transition-all duration-[160ms]',
                  isActive ? 'w-[calc(100%-20px)] opacity-100' : 'w-0 opacity-0 group-hover:w-[calc(100%-20px)] group-hover:opacity-60',
                )}
              />
              <span className="flex-1 truncate">{item.label}</span>
              {typeof item.progress === 'number' && (
                <span className="w-full max-w-16">
                  <span className="block text-right font-mono text-[10px] tabular text-text-muted">
                    {item.progress}%
                  </span>
                  <span className="mt-0.5 block h-0.5 w-full overflow-hidden rounded-full bg-bg-raised">
                    <span
                      className="block h-full rounded-full bg-[var(--accent)]"
                      style={{ width: `${item.progress}%` }}
                    />
                  </span>
                </span>
              )}
            </>
          )}
        </>
      )}
    </NavLink>
  )

  return (
    <motion.aside
      animate={{ width: collapsed ? 64 : 248 }}
      initial={false}
      transition={{ duration: 0.2, ease: 'easeInOut' }}
      className="flex h-full shrink-0 flex-col overflow-hidden border-r border-border bg-bg-surface"
    >
      <nav className="slim-scroll flex-1 overflow-y-auto px-2 py-3">
        {!collapsed && (
          <div className="px-2.5 pb-1.5 font-mono text-[11px] uppercase leading-4 tracking-[0.08em] text-text-muted">
            Workspace
          </div>
        )}
        <div className="space-y-0.5">{WORKSPACE.map(renderItem)}</div>
        {!collapsed && (
          <div className="px-2.5 pb-1.5 pt-5 font-mono text-[11px] uppercase leading-4 tracking-[0.08em] text-text-muted">
            Reference
          </div>
        )}
        {collapsed && <div className="my-3 border-t border-border" />}
        <div className="space-y-0.5">{REFERENCE.map(renderItem)}</div>
      </nav>

      {/* Footer: engagement health + collapse toggle */}
      <div className="border-t border-border p-2">
        {!collapsed && (
          <div className="mb-2 rounded-md bg-bg-raised px-2.5 py-2">
            <div className="font-mono text-[10px] uppercase tracking-[0.08em] text-text-muted">
              Engagement health
            </div>
            <div className="mt-1 flex items-center justify-between">
              <span className="font-mono text-[12px] tabular text-text-primary">
                {MOCK_DASHBOARD.overallCompliancePct}% compliant
              </span>
              <span className="font-mono text-[10px] tabular text-[var(--status-noncompliant)]">
                {MOCK_DASHBOARD.openFindings} findings
              </span>
            </div>
            <div className="mt-1.5 h-0.5 w-full overflow-hidden rounded-full bg-bg-base">
              <div
                className="h-full rounded-full bg-[var(--accent)]"
                style={{ width: `${MOCK_DASHBOARD.overallCompliancePct}%` }}
              />
            </div>
          </div>
        )}
        <button
          type="button"
          onClick={onToggle}
          aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          className="flex w-full items-center justify-center gap-2 rounded-md px-2 py-1.5 text-text-muted transition-colors duration-[120ms] hover:bg-bg-raised hover:text-text-secondary"
        >
          {collapsed ? <PanelLeftOpen className="size-4" /> : <PanelLeftClose className="size-4" />}
          {!collapsed && <span className="text-[12px]">Collapse</span>}
        </button>
      </div>
    </motion.aside>
  )
}
