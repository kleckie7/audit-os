import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router'
import { motion } from 'framer-motion'
import type { LucideIcon } from 'lucide-react'
import {
  ArrowRight,
  BadgeCheck,
  Bot,
  Check,
  CreditCard,
  Crosshair,
  Landmark,
  Plus,
  Radar,
  Scale,
  Shield,
} from 'lucide-react'
import gsap from 'gsap'
import clsx from 'clsx'
import StatusPill from '@/components/StatusPill'
import ProgressRing from '@/components/ProgressRing'
import { Abbr } from '@/components/TermTip'
import { useAuditStore } from '@/lib/store'
import {
  HEATMAP_COLUMNS,
  MOCK_ACTIVITY,
  MOCK_DASHBOARD,
  MOCK_FRAMEWORK_PROGRESS,
  MOCK_HEATMAP,
  MOCK_INTERVIEWS,
  PHASES,
} from '@/lib/mock-dashboard'
import type { FrameworkProgressMock } from '@/lib/mock-dashboard'

const EASE: [number, number, number, number] = [0.22, 1, 0.36, 1]

const FRAMEWORK_ICONS: Record<string, LucideIcon> = {
  iso27001: Shield,
  iso42001: Bot,
  'nist-csf': Radar,
  coso: Scale,
  cobit: Landmark,
  'mitre-attack': Crosshair,
  soc2: BadgeCheck,
  'pci-dss': CreditCard,
}

const STATUS_COLORS: Record<string, string> = {
  compliant: 'var(--status-compliant)',
  partial: 'var(--status-partial)',
  noncompliant: 'var(--status-noncompliant)',
  na: 'var(--status-na)',
}

function useCountUp(target: number, duration = 800): number {
  const [value, setValue] = useState(0)
  useEffect(() => {
    const prefersReduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    if (prefersReduced) {
      setValue(target)
      return
    }
    let raf = 0
    const start = performance.now()
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / duration)
      setValue(Math.round(target * (1 - Math.pow(1 - t, 3))))
      if (t < 1) raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [target, duration])
  return value
}

/* ---------------------------------- header --------------------------------- */

function EngagementHeader() {
  const engagement = useAuditStore((s) => s.engagement)
  const navigate = useNavigate()
  return (
    <motion.section
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.2 }}
      className="relative overflow-hidden rounded-lg border border-border bg-bg-surface p-6"
    >
      {/* contour backdrop, right half, masked fade */}
      <motion.img
        src="/contour.svg"
        alt=""
        aria-hidden
        className="pointer-events-none absolute right-0 top-0 h-full w-1/2 object-cover opacity-50 [mask-image:linear-gradient(to_right,transparent,black_45%)]"
        animate={{ x: [0, 20] }}
        transition={{ duration: 20, repeat: Infinity, repeatType: 'reverse', ease: 'easeInOut' }}
      />
      <div className="relative">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <motion.div
              initial={{ opacity: 0, y: -8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.35, ease: EASE, delay: 0.06 }}
              className="font-mono text-[11px] uppercase leading-4 tracking-[0.08em] text-text-muted"
            >
              Engagement · {engagement?.id ?? 'ENG-2025-0147'}
            </motion.div>
            <motion.h1
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.35, ease: EASE, delay: 0.12 }}
              className="mt-1.5 font-display text-[30px] font-semibold leading-[38px] tracking-[-0.02em] text-text-primary"
            >
              {engagement?.client ?? 'Meridian Financial Group'} — {engagement?.name ?? 'FY25 Integrated Audit'}
            </motion.h1>
          </div>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.3, delay: 0.2 }}
            className="flex items-center gap-3"
          >
            <StatusPill status="fieldwork" />
            <span className="font-mono text-[12px] tracking-[0.02em] text-text-secondary">
              WEEK 3 OF 6
            </span>
            <button
              type="button"
              className="rounded-md border border-border-strong px-3 py-1.5 text-[13px] font-medium text-text-secondary transition-all duration-[120ms] hover:bg-bg-raised hover:text-text-primary active:scale-[0.97]"
            >
              Export snapshot
            </button>
            <button
              type="button"
              onClick={() => navigate('/audit/iso27001')}
              className="group flex items-center gap-1.5 rounded-md bg-[var(--accent)] px-3.5 py-1.5 text-[13px] font-semibold text-[#0A0D10] transition-all duration-[120ms] hover:bg-[var(--accent-strong)] active:scale-[0.97]"
            >
              Continue audit
              <ArrowRight className="size-3.5 transition-transform duration-[160ms] group-hover:translate-x-[3px]" />
            </button>
          </motion.div>
        </div>
        {/* meta strip */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.3, delay: 0.24 }}
          className="mt-5 flex flex-wrap items-center gap-x-3 gap-y-1 font-mono text-[12px] leading-4 tracking-[0.02em] text-text-secondary"
        >
          {[
            `LEAD AUDITOR ${(engagement?.auditor ?? 'J. MERCER').toUpperCase()}`,
            'SCOPE 8 FRAMEWORKS',
            'PERIOD JAN 06 – FEB 14, 2025',
            'AUTOSAVED 14:32:07',
          ].map((item, i) => (
            <span key={item} className="flex items-center gap-3">
              {i > 0 && <span className="h-3 w-px bg-border-strong" aria-hidden />}
              {item}
            </span>
          ))}
        </motion.div>
      </div>
    </motion.section>
  )
}

/* --------------------------------- KPI strip -------------------------------- */

function CornerTicks() {
  return (
    <>
      <span aria-hidden className="absolute left-0 top-0 size-2 border-l border-t border-border-strong" />
      <span aria-hidden className="absolute bottom-0 right-0 size-2 border-b border-r border-border-strong" />
    </>
  )
}

function KpiStrip() {
  const d = MOCK_DASHBOARD
  const compliance = useCountUp(d.overallCompliancePct)
  const assessed = useCountUp(d.controlsAssessed)
  const findings = useCountUp(d.openFindings)
  const evidence = useCountUp(d.evidenceItems)
  const interviews = useCountUp(d.interviewsDone)
  const assessedPct = Math.round((d.controlsAssessed / d.controlsTotal) * 100)

  const cards = [
    {
      key: 'compliance',
      label: 'Overall Compliance',
      to: '/findings',
      body: (
        <div className="flex items-center gap-4">
          <ProgressRing value={d.overallCompliancePct} size={96} />
          <div>
            <div className="font-display text-[34px] font-semibold leading-10 tracking-[-0.02em] tabular text-text-primary">
              {compliance}%
            </div>
            <div className="font-mono text-[12px] tracking-[0.02em] text-[var(--accent)]">
              {d.complianceDelta}
            </div>
          </div>
        </div>
      ),
    },
    {
      key: 'assessed',
      label: 'Controls Assessed',
      to: '/audit/iso27001',
      body: (
        <div>
          <div className="font-display text-[34px] font-semibold leading-10 tracking-[-0.02em] tabular text-text-primary">
            {assessed} <span className="text-text-muted">/ {d.controlsTotal}</span>
          </div>
          <motion.div
            initial={{ scaleX: 0 }}
            animate={{ scaleX: 1 }}
            transition={{ duration: 0.6, ease: EASE, delay: 0.4 }}
            className="mt-2 h-1 w-full origin-left overflow-hidden rounded-full bg-bg-raised"
          >
            <div className="h-full rounded-full bg-[var(--accent)]" style={{ width: `${assessedPct}%` }} />
          </motion.div>
          <div className="mt-2 font-mono text-[12px] tracking-[0.02em] text-text-muted">
            {assessedPct}% COMPLETE
          </div>
        </div>
      ),
    },
    {
      key: 'findings',
      label: 'Open Findings',
      to: '/findings',
      body: (
        <div>
          <div className="font-display text-[34px] font-semibold leading-10 tracking-[-0.02em] tabular text-text-primary">
            {findings}
          </div>
          <div className="mt-2 flex items-center gap-3 font-mono text-[12px] tracking-[0.02em]">
            <span className="flex items-center gap-1.5 text-text-secondary">
              <span className="size-1.5 rounded-full bg-[var(--severity-high)]" />
              {d.findingsBySeverity.high}H
            </span>
            <span className="flex items-center gap-1.5 text-text-secondary">
              <span className="size-1.5 rounded-full bg-[var(--severity-medium)]" />
              {d.findingsBySeverity.medium}M
            </span>
            <span className="flex items-center gap-1.5 text-text-secondary">
              <span className="size-1.5 rounded-full bg-[var(--severity-low)]" />
              {d.findingsBySeverity.low}L
            </span>
          </div>
        </div>
      ),
    },
    {
      key: 'evidence',
      label: 'Evidence Items',
      to: '/audit/iso27001',
      body: (
        <div>
          <div className="font-display text-[34px] font-semibold leading-10 tracking-[-0.02em] tabular text-text-primary">
            {evidence}
          </div>
          <div className="mt-2 font-mono text-[12px] tracking-[0.02em] text-[var(--accent)]">
            {d.evidenceDelta}
          </div>
        </div>
      ),
    },
    {
      key: 'interviews',
      label: 'Interviews',
      to: '/interviews',
      body: (
        <div>
          <div className="font-display text-[34px] font-semibold leading-10 tracking-[-0.02em] tabular text-text-primary">
            {interviews} <span className="text-text-muted">/ {d.interviewsTotal}</span>
          </div>
          <div className="mt-2 flex items-center gap-2">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-accent-dim px-2 py-0.5 font-mono text-[11px] font-medium text-[var(--accent)]">
              <img src="/avatar-jm.svg" alt="" className="size-3.5 rounded-full" />
              CISO
            </span>
            <span className="font-mono text-[12px] tracking-[0.02em] text-text-muted">TUE 10:00</span>
          </div>
        </div>
      ),
    },
  ]

  return (
    <section className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-5">
      {cards.map((card, i) => (
        <motion.div
          key={card.key}
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.35, ease: EASE, delay: 0.15 + i * 0.06 }}
          whileHover={{ y: -2 }}
        >
          <Link
            to={card.to}
            className="relative block min-w-[200px] rounded-lg border border-border bg-bg-surface p-4 transition-colors duration-[160ms] hover:border-border-strong"
          >
            <CornerTicks />
            <div className="font-mono text-[11px] uppercase leading-4 tracking-[0.08em] text-text-muted">
              {card.label}
            </div>
            <div className="mt-3">{card.body}</div>
          </Link>
        </motion.div>
      ))}
    </section>
  )
}

/* ------------------------------- phase tracker ------------------------------ */

const PHASE_CHECKLISTS: Record<string, string[]> = {
  scoping: ['Frameworks selected 8/8', 'Stakeholder map approved', 'CDE boundary confirmed'],
  planning: ['Test plan signed off', 'Evidence requests issued 62', 'Interview calendar booked 18/18'],
  fieldwork: [
    `Control testing ${MOCK_DASHBOARD.controlsAssessed}/${MOCK_DASHBOARD.controlsTotal}`,
    `Interviews ${MOCK_DASHBOARD.interviewsDone}/${MOCK_DASHBOARD.interviewsTotal}`,
    `Evidence ${MOCK_DASHBOARD.evidenceItems} items`,
  ],
  findings: ['Severity ratings pending', 'Management responses due FEB 11', 'Retest window reserved'],
  reporting: ['Draft outline ready', 'Exec summary template loaded', 'QA review scheduled'],
}

function PhaseTracker() {
  const [selected, setSelected] = useState<number | null>(null)
  const current = MOCK_DASHBOARD.currentPhase
  const currentFill = MOCK_DASHBOARD.currentPhaseProgress

  return (
    <motion.section
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, ease: EASE, delay: 0.3 }}
      className="rounded-lg border border-border bg-bg-surface p-6"
    >
      <div className="flex items-center justify-between">
        <div className="font-mono text-[11px] uppercase leading-4 tracking-[0.08em] text-text-muted">
          Audit Phase
        </div>
        <Link
          to="/audit/iso27001"
          className="text-[12px] font-medium text-[var(--accent)] transition-colors hover:text-[var(--accent-strong)]"
        >
          View plan →
        </Link>
      </div>
      <div className="mt-6 flex items-start">
        {PHASES.map((phase, i) => {
          const done = i < current
          const active = i === current
          return (
            <div key={phase.id} className="relative flex flex-1 flex-col items-center">
              {/* connector before node */}
              {i > 0 && (
                <div className="absolute left-0 top-3 h-0.5 w-1/2 -translate-x-0 overflow-hidden bg-border">
                  <motion.div
                    initial={{ scaleX: 0 }}
                    animate={{ scaleX: 1 }}
                    transition={{ duration: 0.9, ease: EASE, delay: 0.3 + i * 0.12 }}
                    className="h-full w-full origin-left bg-[var(--accent)]"
                    style={{
                      opacity: done ? 1 : active ? 1 : 0.15,
                      transform: undefined,
                    }}
                  />
                </div>
              )}
              {i < PHASES.length - 1 && (
                <div className="absolute right-0 top-3 h-0.5 w-1/2 overflow-hidden bg-border">
                  <motion.div
                    initial={{ scaleX: 0 }}
                    animate={{ scaleX: active ? currentFill / 100 : done ? 1 : 0 }}
                    transition={{ duration: 0.9, ease: EASE, delay: 0.3 + i * 0.12 }}
                    className="h-full w-full origin-left bg-[var(--accent)]"
                    style={{ opacity: done || active ? 1 : 0.15 }}
                  />
                </div>
              )}
              <button
                type="button"
                onClick={() => setSelected(selected === i ? null : i)}
                aria-label={`${phase.label} phase details`}
                className={clsx(
                  'relative z-10 flex size-6 items-center justify-center rounded-full border transition-colors duration-[160ms]',
                  done
                    ? 'border-[var(--accent)] bg-[var(--accent)] text-[#0A0D10]'
                    : active
                      ? 'border-[var(--accent)] bg-bg-surface'
                      : 'border-border bg-bg-surface hover:border-border-strong',
                )}
              >
                {done ? (
                  <Check className="size-3.5" strokeWidth={3} />
                ) : active ? (
                  <motion.span
                    className="size-1 rounded-full bg-[var(--accent)]"
                    animate={{ opacity: [1, 0.4, 1] }}
                    transition={{ duration: 1.6, repeat: Infinity, ease: 'easeInOut' }}
                  />
                ) : null}
                {active && (
                  <span className="absolute inset-0 rounded-full ring-2 ring-[rgba(52,211,153,0.4)]" />
                )}
              </button>
              <div
                className={clsx(
                  'mt-2 font-mono text-[11px] uppercase leading-4 tracking-[0.08em]',
                  done || active ? 'text-text-primary' : 'text-text-muted',
                )}
              >
                {phase.label}
              </div>
              <div className="font-mono text-[10px] leading-4 tracking-[0.02em] text-text-muted">
                {phase.dates}
              </div>

              {/* phase checklist popover */}
              {selected === i && (
                <motion.div
                  initial={{ opacity: 0, scale: 0.96, y: 4 }}
                  animate={{ opacity: 1, scale: 1, y: 0 }}
                  transition={{ duration: 0.14, ease: 'easeOut' }}
                  className="absolute top-12 z-20 w-56 rounded-[10px] border border-border-strong bg-bg-overlay p-3 text-left shadow-popover"
                >
                  <div className="font-mono text-[10px] uppercase tracking-[0.08em] text-text-muted">
                    {phase.label} checklist
                  </div>
                  <ul className="mt-2 space-y-1.5">
                    {(PHASE_CHECKLISTS[phase.id] ?? []).map((item) => (
                      <li key={item} className="flex items-start gap-1.5 text-[12px] leading-4 text-text-secondary">
                        <span className="mt-1.5 size-1 shrink-0 rounded-full bg-[var(--accent)]" />
                        {item}
                      </li>
                    ))}
                  </ul>
                </motion.div>
              )}
            </div>
          )
        })}
      </div>
    </motion.section>
  )
}

/* ------------------------------- framework grid ----------------------------- */

const FILTERS = ['ALL', 'SECURITY', 'GOVERNANCE', 'PRIVACY', 'THREAT'] as const

function FrameworkCard({ fw, index }: { fw: FrameworkProgressMock; index: number }) {
  const Icon = FRAMEWORK_ICONS[fw.id] ?? Shield
  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, ease: EASE, delay: index * 0.05 }}
      whileHover={{ y: -2 }}
    >
      <Link
        to={`/audit/${fw.id}`}
        className="block rounded-lg border border-border bg-bg-surface p-5 transition-all duration-[160ms] hover:border-border-strong hover:shadow-[inset_0_0_0_1px_var(--accent-dim)]"
      >
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            <span className="flex size-10 shrink-0 items-center justify-center rounded-md bg-accent-dim">
              <Icon className="size-5 text-[var(--accent)]" />
            </span>
            <div>
              <div className="text-[14px] font-semibold leading-5 text-text-primary">
                <Abbr term={fw.name.replace(/:.*/, '')}>{fw.name}</Abbr>
              </div>
              <div className="font-mono text-[11px] tracking-[0.02em] text-text-muted">
                {fw.version}
              </div>
            </div>
          </div>
          <ProgressRing value={fw.assessedPct} size={40} />
        </div>

        {/* domain mini-bars */}
        <div className="mt-4 space-y-1.5">
          {fw.domains.map((dom, i) => (
            <div key={dom.name} className="flex items-center gap-2">
              <span className="w-12 shrink-0 font-mono text-[10px] tracking-[0.04em] text-text-muted">
                {dom.name}
              </span>
              <div className="flex h-1 flex-1 overflow-hidden rounded-full bg-bg-raised">
                {(['compliant', 'partial', 'noncompliant', 'na'] as const).map((s) => (
                  <motion.span
                    key={s}
                    initial={{ scaleX: 0 }}
                    animate={{ scaleX: 1 }}
                    transition={{ duration: 0.4, ease: EASE, delay: 0.3 + i * 0.03 }}
                    className="h-full origin-left"
                    style={{ width: `${dom[s]}%`, backgroundColor: STATUS_COLORS[s] }}
                  />
                ))}
              </div>
            </div>
          ))}
        </div>

        <div className="mt-4 flex items-center justify-between gap-2 border-t border-border pt-3">
          <span className="truncate font-mono text-[11px] uppercase tracking-[0.04em] text-text-secondary">
            Next: {fw.nextControl}
          </span>
          <StatusPill status={fw.worstDomain.status} label={fw.worstDomain.name} />
        </div>
      </Link>
    </motion.div>
  )
}

function FrameworkGrid() {
  const [filter, setFilter] = useState<(typeof FILTERS)[number]>('ALL')
  const visible =
    filter === 'ALL'
      ? MOCK_FRAMEWORK_PROGRESS
      : MOCK_FRAMEWORK_PROGRESS.filter((f) => f.category === filter.toLowerCase())

  return (
    <section>
      <div className="flex flex-wrap items-center gap-3">
        <span className="font-mono text-[11px] uppercase leading-4 tracking-[0.08em] text-text-muted">
          Active Frameworks
        </span>
        <span className="rounded-full bg-bg-raised px-2 py-0.5 font-mono text-[11px] tabular text-text-secondary">
          {MOCK_FRAMEWORK_PROGRESS.length}
        </span>
        <div className="ml-auto flex gap-1.5">
          {FILTERS.map((f) => (
            <button
              key={f}
              type="button"
              onClick={() => setFilter(f)}
              className={clsx(
                'rounded-full border px-2.5 py-1 font-mono text-[11px] uppercase tracking-[0.04em] transition-colors duration-[160ms]',
                filter === f
                  ? 'border-[var(--accent)] bg-accent-dim text-[var(--accent)]'
                  : 'border-border text-text-muted hover:border-border-strong hover:text-text-secondary',
              )}
            >
              {f}
            </button>
          ))}
        </div>
      </div>
      <motion.div layout className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
        {visible.map((fw, i) => (
          <FrameworkCard key={fw.id} fw={fw} index={i} />
        ))}
        <motion.div layout initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.2 }}>
          <Link
            to="/frameworks"
            className="flex h-full min-h-40 flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-border-strong text-text-muted transition-colors duration-[160ms] hover:border-[var(--accent)] hover:text-[var(--accent)]"
          >
            <Plus className="size-5" />
            <span className="font-mono text-[11px] uppercase tracking-[0.08em]">Add framework</span>
          </Link>
        </motion.div>
      </motion.div>
    </section>
  )
}

/* --------------------------- heat map (GSAP isolated) ----------------------- */

function cellColor(status: 'compliant' | 'partial' | 'noncompliant', count: number): string {
  const base = STATUS_COLORS[status]
  const intensity = Math.min(0.4, 0.14 + count * 0.07)
  return `color-mix(in srgb, ${base} ${Math.round(intensity * 100)}%, transparent)`
}

function HeatMap() {
  const gridRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const el = gridRef.current
    if (!el) return
    const prefersReduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    if (prefersReduced) return
    const cells = el.querySelectorAll<HTMLElement>('[data-heat-cell]')
    gsap.set(cells, { scale: 0.8, opacity: 0 })
    const observer = new IntersectionObserver(
      (entries) => {
        if (!entries[0]?.isIntersecting) return
        gsap.to(cells, {
          scale: 1,
          opacity: 1,
          duration: 0.25,
          ease: 'power2.out',
          stagger: { each: 0.006, grid: [MOCK_HEATMAP.length, HEATMAP_COLUMNS.length], from: 'start' },
        })
        observer.disconnect()
      },
      { threshold: 0.7 },
    )
    observer.observe(el)
    return () => observer.disconnect()
  }, [])

  return (
    <div className="rounded-lg border border-border bg-bg-surface p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="font-mono text-[11px] uppercase leading-4 tracking-[0.08em] text-text-muted">
          Domain Heat
        </span>
        <div className="flex gap-1.5">
          <StatusPill status="compliant" />
          <StatusPill status="partial" />
          <StatusPill status="noncompliant" />
          <StatusPill status="na" />
        </div>
      </div>
      <div ref={gridRef} className="mt-4 overflow-x-auto">
        <div
          className="grid gap-1"
          style={{ gridTemplateColumns: `88px repeat(${HEATMAP_COLUMNS.length}, 28px)` }}
        >
          <span />
          {HEATMAP_COLUMNS.map((c) => (
            <span key={c} className="text-center font-mono text-[9px] uppercase tracking-[0.04em] text-text-muted">
              {c}
            </span>
          ))}
          {MOCK_HEATMAP.map((row) => (
            <HeatRow key={row.framework} row={row} />
          ))}
        </div>
      </div>
    </div>
  )
}

function HeatRow({ row }: { row: (typeof MOCK_HEATMAP)[number] }) {
  return (
    <>
      <span className="flex items-center truncate pr-2 font-mono text-[11px] tracking-[0.02em] text-text-secondary">
        {row.framework}
      </span>
      {row.cells.map((cell, i) => (
        <span
          key={i}
          data-heat-cell
          title={
            cell
              ? `${row.framework} · ${HEATMAP_COLUMNS[i]} — ${cell.status}, ${cell.count} open finding${cell.count === 1 ? '' : 's'}`
              : `${row.framework} · ${HEATMAP_COLUMNS[i]} — not scored`
          }
          className="flex h-5 w-7 items-center justify-center rounded-[3px] transition-transform duration-[120ms] hover:scale-[1.15]"
          style={{ backgroundColor: cell ? cellColor(cell.status, cell.count) : 'var(--bg-raised)' }}
        >
          {!cell && <span className="size-px rounded-full bg-text-muted" />}
        </span>
      ))}
    </>
  )
}

/* -------------------------------- activity feed ------------------------------ */

function ActivityFeed() {
  return (
    <div className="flex flex-col rounded-lg border border-border bg-bg-surface p-5">
      <div className="flex items-center justify-between">
        <span className="font-mono text-[11px] uppercase leading-4 tracking-[0.08em] text-text-muted">
          Activity
        </span>
        <Link
          to="/findings"
          className="text-[12px] font-medium text-[var(--accent)] transition-colors hover:text-[var(--accent-strong)]"
        >
          View all
        </Link>
      </div>
      <div className="slim-scroll mt-3 max-h-[248px] space-y-1 overflow-y-auto pr-1">
        {MOCK_ACTIVITY.slice(0, 8).map((entry, i) => (
          <motion.div
            key={`${entry.time}-${i}`}
            initial={{ opacity: 0, x: 8 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.25, ease: 'easeOut', delay: 0.35 + i * 0.03 }}
            className="flex items-start gap-2.5 rounded-md px-2 py-2 transition-colors duration-[120ms] hover:bg-bg-raised"
          >
            <motion.span
              className="mt-1.5 size-1.5 shrink-0 rounded-full"
              style={{ backgroundColor: STATUS_COLORS[entry.status] ?? STATUS_COLORS.na }}
              animate={i === 0 ? { opacity: [1, 0.4, 1] } : undefined}
              transition={i === 0 ? { duration: 1.2, times: [0, 0.5, 1] } : undefined}
            />
            <span className="flex-1 text-[12px] leading-[18px] text-text-secondary">{entry.text}</span>
            <span className="shrink-0 font-mono text-[11px] tabular text-text-muted">{entry.time}</span>
            <span className="flex size-5 shrink-0 items-center justify-center rounded-full bg-bg-raised font-mono text-[9px] font-medium text-text-secondary">
              {entry.actor}
            </span>
          </motion.div>
        ))}
      </div>
    </div>
  )
}

/* ------------------------------- interview strip ----------------------------- */

function InterviewStrip() {
  return (
    <section>
      <div className="font-mono text-[11px] uppercase leading-4 tracking-[0.08em] text-text-muted">
        Upcoming Interviews
      </div>
      <div className="slim-scroll mt-3 flex gap-3 overflow-x-auto pb-2 [mask-image:linear-gradient(to_right,black_calc(100%-48px),transparent)]">
        {MOCK_INTERVIEWS.map((iv, i) => (
          <motion.div
            key={iv.name}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3, ease: EASE, delay: 0.3 + i * 0.04 }}
            whileHover={{ y: -2 }}
            className="flex w-[280px] shrink-0 flex-col rounded-lg border border-border bg-bg-surface p-4 transition-colors duration-[160ms] hover:border-border-strong"
          >
            <div className="flex items-center gap-2">
              <span className="inline-flex items-center gap-1.5 rounded-full bg-accent-dim py-0.5 pl-0.5 pr-2 font-mono text-[11px] font-medium text-[var(--accent)]">
                <img src="/avatar-jm.svg" alt="" className="size-4 rounded-full" />
                {iv.role}
              </span>
              <span className="truncate text-[13px] font-medium text-text-primary">{iv.name}</span>
            </div>
            <div className="mt-3 font-mono text-[12px] tracking-[0.02em] text-text-secondary">
              {iv.datetime}
            </div>
            <div className="mt-1 font-mono text-[11px] tracking-[0.02em] text-text-muted">
              {iv.questions}
            </div>
            <div className="mt-3 flex items-center gap-2">
              <span className="h-1 flex-1 overflow-hidden rounded-full bg-bg-raised">
                <span
                  className="block h-full rounded-full"
                  style={{
                    width: iv.ready ? '100%' : '45%',
                    backgroundColor: iv.ready ? 'var(--accent)' : 'var(--status-partial)',
                  }}
                />
              </span>
              <span
                className="font-mono text-[10px] uppercase tracking-[0.08em]"
                style={{ color: iv.ready ? 'var(--accent)' : 'var(--status-partial)' }}
              >
                {iv.ready ? 'Script ready' : 'Draft'}
              </span>
            </div>
            <Link
              to="/interviews"
              className="mt-3 rounded-md bg-[var(--accent)] px-3 py-1.5 text-center text-[13px] font-semibold text-[#0A0D10] transition-all duration-[120ms] hover:bg-[var(--accent-strong)] active:scale-[0.97]"
            >
              Open session
            </Link>
          </motion.div>
        ))}
      </div>
    </section>
  )
}

/* ------------------------------------ page ----------------------------------- */

export default function Home() {
  return (
    <div className="space-y-6">
      <EngagementHeader />
      <KpiStrip />
      <PhaseTracker />
      <FrameworkGrid />
      <motion.section
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35, ease: EASE, delay: 0.4 }}
        className="grid grid-cols-1 gap-6 xl:grid-cols-3"
      >
        <div className="xl:col-span-2">
          <HeatMap />
        </div>
        <ActivityFeed />
      </motion.section>
      <InterviewStrip />
    </div>
  )
}
