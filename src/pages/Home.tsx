import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router'
import { motion, useReducedMotion } from 'framer-motion'
import type { LucideIcon } from 'lucide-react'
import {
  ArrowRight,
  ArrowUpRight,
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
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import StatusPill from '@/components/StatusPill'
import ProgressRing from '@/components/ProgressRing'
import { Abbr } from '@/components/TermTip'
import { useAuditStore } from '@/lib/store'
import { FRAMEWORKS, questionCount } from '@/data/frameworks'
import { GLOSSARY } from '@/lib/glossary'
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

/* ------------------------------ shared hooks/data ---------------------------- */

function useCountUp(target: number, duration = 900): number {
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

/** Live engagement metrics derived from the zustand store. */
function useEngagementMetrics() {
  const engagement = useAuditStore((s) => s.engagement)
  const overallProgress = useAuditStore((s) => s.overallProgress)
  const progress = overallProgress()
  const answers = engagement?.answers ?? {}

  const answered = progress.compliant + progress.partial + progress.noncompliant
  const score =
    answered > 0
      ? Math.round(((progress.compliant + progress.partial * 0.5) / answered) * 100)
      : 0
  const evidenceCount = Object.values(answers).reduce(
    (n, a) => n + (a.evidenceChecked?.length ?? 0),
    0,
  )
  const totalControls = useMemo(
    () => FRAMEWORKS.reduce((n, f) => n + questionCount(f.id), 0),
    [],
  )
  return { engagement, progress, answered, score, evidenceCount, totalControls }
}

/** Deterministic 30-day signal series (seeded PRNG — stable across renders). */
function useSignalSeries() {
  return useMemo(() => {
    let seed = 20250147
    const rand = () => {
      seed |= 0
      seed = (seed + 0x6d2b79f5) | 0
      let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296
    }
    const days: { day: string; compliance: number; findings: number }[] = []
    let compliance = 54
    for (let i = 0; i < 30; i++) {
      compliance = Math.min(78, Math.max(48, compliance + (rand() - 0.42) * 4.5))
      const findings = Math.max(
        1,
        Math.round(6 + Math.sin(i / 4.2) * 4 + rand() * 6 - i * 0.12),
      )
      days.push({
        day: `D${String(i + 1).padStart(2, '0')}`,
        compliance: Math.round(compliance),
        findings,
      })
    }
    return days
  }, [])
}

/* ---------------------------------- marquee ---------------------------------- */

function Ticker() {
  const items = useMemo(() => {
    const codes = FRAMEWORKS.map((f) => `${f.shortName} ${f.version}`.toUpperCase())
    const total = FRAMEWORKS.reduce((n, f) => n + questionCount(f.id), 0)
    return [
      'AUDITOS / GRC COMMAND CENTRE',
      ...codes,
      `${total} CONTROLS MAPPED`,
      `${FRAMEWORKS.length} FRAMEWORKS`,
      `${GLOSSARY.length} GLOSSARY TERMS`,
      'A.5.15 ACCESS CONTROL',
      'PR.AA-03 IDENTITY MANAGEMENT',
      'EDM01 GOVERNANCE FRAMEWORK',
      'T1078 VALID ACCOUNTS',
      'CC2.1 CONTROL ENVIRONMENT',
    ]
  }, [])

  const row = (key: string) => (
    <div key={key} className="flex shrink-0 items-center" aria-hidden={key === 'b'}>
      {items.map((item, i) => (
        <span
          key={`${key}-${i}`}
          className="flex items-center font-mono text-[11px] uppercase tracking-[0.14em] text-text-muted"
        >
          <span className="px-5">{item}</span>
          <span className="text-[var(--accent)] opacity-60">/</span>
        </span>
      ))}
    </div>
  )

  return (
    <div className="relative overflow-hidden border-y border-border bg-bg-surface py-2.5">
      <div className="marquee-track flex w-max">
        {row('a')}
        {row('b')}
      </div>
      <div className="pointer-events-none absolute inset-y-0 left-0 w-16 bg-gradient-to-r from-bg-surface to-transparent" />
      <div className="pointer-events-none absolute inset-y-0 right-0 w-16 bg-gradient-to-l from-bg-surface to-transparent" />
    </div>
  )
}

/* ------------------------------------ hero ----------------------------------- */

function StaggeredLine({
  text,
  className,
  delay = 0,
}: {
  text: string
  className?: string
  delay?: number
}) {
  const reduce = useReducedMotion()
  const words = text.split(' ')
  return (
    <span className={clsx('block', className)}>
      {words.map((word, i) => (
        <span key={i} className="inline-block overflow-hidden pb-[0.08em] align-bottom">
          <motion.span
            className="inline-block will-change-transform"
            initial={reduce ? false : { y: '110%' }}
            animate={{ y: 0 }}
            transition={{ duration: 0.7, ease: EASE, delay: delay + i * 0.08 }}
          >
            {word}
            {i < words.length - 1 ? ' ' : ''}
          </motion.span>
        </span>
      ))}
    </span>
  )
}

function Hero() {
  const { engagement, progress, answered, totalControls } = useEngagementMetrics()
  const reduce = useReducedMotion()
  const navigate = useNavigate()
  const score = useCountUp(
    answered > 0
      ? Math.round(
          ((progress.compliant + progress.partial * 0.5) / answered) * 100,
        )
      : 0,
    1200,
  )
  const assessed = useCountUp(MOCK_DASHBOARD.controlsAssessed, 1200)
  const findings = useCountUp(MOCK_DASHBOARD.openFindings, 1200)

  const meta = [
    ['CLIENT', (engagement?.client ?? 'Meridian Financial Group').toUpperCase()],
    ['FRAMEWORKS IN SCOPE', String(engagement?.frameworks.length ?? 9).padStart(2, '0')],
    ['PERIOD', 'JAN 06 – FEB 14, 2025'],
    ['LEAD AUDITOR', (engagement?.auditor ?? 'J. Mercer').toUpperCase()],
  ]

  return (
    <section className="relative -mx-6 -mt-6 overflow-hidden border-b border-border [@media(min-width:1600px)]:-mx-8 [@media(min-width:1600px)]:-mt-8">
      {/* ambient background: drifting contours + lime glow + dot grid */}
      <div className="hero-radial absolute inset-0" aria-hidden />
      <div className="drift-slow pointer-events-none absolute -right-40 -top-24 h-[130%] w-[75%] opacity-70" aria-hidden>
        <img
          src="/contour.svg"
          alt=""
          className="h-full w-full object-cover [mask-image:linear-gradient(to_left,black_30%,transparent_85%)]"
        />
      </div>
      <div className="bg-dots absolute inset-0 opacity-40 [mask-image:radial-gradient(70%_70%_at_50%_40%,black,transparent)]" aria-hidden />

      <div className="relative flex min-h-[70vh] flex-col justify-between px-6 pb-8 pt-10 [@media(min-width:1600px)]:px-8">
        {/* micro-label row */}
        <motion.div
          initial={reduce ? false : { opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.5 }}
          className="flex flex-wrap items-center justify-between gap-3 font-mono text-[11px] uppercase leading-4 tracking-[0.14em] text-text-muted"
        >
          <span>
            <span className="text-[var(--accent)]">AUDITOS</span>
            <span className="mx-2 text-border-strong">/</span>
            GRC COMMAND CENTRE
          </span>
          <span>
            ENGAGEMENT
            <span className="mx-2 text-border-strong">/</span>
            <span className="text-text-secondary">{engagement?.id ?? 'ENG-2025-0147'}</span>
          </span>
        </motion.div>

        {/* headline */}
        <div className="mt-10 max-w-5xl">
          <div className="mb-5 flex items-center gap-3 font-mono text-[11px] uppercase tracking-[0.14em] text-text-muted">
            <span className="inline-block size-1.5 animate-pulse rounded-full bg-[var(--accent)]" />
            01 / RISK COMMAND CENTRE — LIVE POSTURE
          </div>
          <h1 className="font-display text-[clamp(44px,7.2vw,108px)] font-bold leading-[0.98] tracking-[-0.03em]">
            <StaggeredLine text="Audit signals," className="text-text-primary" delay={0.1} />
            <StaggeredLine
              text="made visible."
              className="text-glow-lime text-[var(--accent)]"
              delay={0.32}
            />
          </h1>
          <motion.p
            initial={reduce ? false : { opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, ease: EASE, delay: 0.62 }}
            className="mt-6 max-w-xl text-[15px] leading-6 text-text-secondary"
          >
            {engagement?.client ?? 'Meridian Financial Group'} — {engagement?.name ?? 'FY25 Integrated Audit'}.
            Nine frameworks, {totalControls} controls, one operating picture.
          </motion.p>

          <motion.div
            initial={reduce ? false : { opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, ease: EASE, delay: 0.74 }}
            className="mt-8 flex flex-wrap items-center gap-3"
          >
            <button
              type="button"
              onClick={() => navigate('/audit/iso27001')}
              className="group flex items-center gap-2 rounded-md bg-[var(--accent)] px-5 py-2.5 text-[13px] font-semibold text-[#061316] shadow-glow-lime transition-all duration-[120ms] hover:bg-[var(--accent-strong)] active:scale-[0.97]"
            >
              Continue audit
              <ArrowRight className="size-3.5 transition-transform duration-[160ms] group-hover:translate-x-[3px]" />
            </button>
            <Link
              to="/reports"
              className="flex items-center gap-2 rounded-md border border-border-strong px-5 py-2.5 text-[13px] font-medium text-text-secondary transition-all duration-[120ms] hover:border-[var(--accent)] hover:text-text-primary active:scale-[0.97]"
            >
              Export snapshot
              <ArrowUpRight className="size-3.5" />
            </Link>
            <div className="ml-1 flex items-center gap-2">
              <StatusPill status="fieldwork" />
              <span className="font-mono text-[11px] uppercase tracking-[0.08em] text-text-muted">
                WEEK 3 OF 6
              </span>
            </div>
          </motion.div>
        </div>

        {/* live metadata + count-up KPI row */}
        <motion.div
          initial={reduce ? false : { opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, ease: EASE, delay: 0.85 }}
          className="mt-12 grid grid-cols-2 gap-6 border-t border-border pt-6 md:grid-cols-4 xl:grid-cols-7"
        >
          {meta.map(([label, value]) => (
            <div key={label}>
              <div className="font-mono text-[10px] uppercase leading-4 tracking-[0.14em] text-text-muted">
                {label}
              </div>
              <div className="mt-1.5 truncate font-mono text-[12px] tracking-[0.02em] text-text-primary">
                {value}
              </div>
            </div>
          ))}
          <div>
            <div className="font-mono text-[10px] uppercase leading-4 tracking-[0.14em] text-text-muted">
              Weighted Posture
            </div>
            <div className="mt-0.5 font-display text-[26px] font-bold leading-8 tabular text-[var(--accent)]">
              {score}%
            </div>
          </div>
          <div>
            <div className="font-mono text-[10px] uppercase leading-4 tracking-[0.14em] text-text-muted">
              Controls Assessed
            </div>
            <div className="mt-0.5 font-display text-[26px] font-bold leading-8 tabular text-text-primary">
              {assessed}
              <span className="text-[15px] text-text-muted"> /{MOCK_DASHBOARD.controlsTotal}</span>
            </div>
          </div>
          <div>
            <div className="font-mono text-[10px] uppercase leading-4 tracking-[0.14em] text-text-muted">
              Open Findings
            </div>
            <div className="mt-0.5 font-display text-[26px] font-bold leading-8 tabular text-text-primary">
              {findings}
            </div>
          </div>
        </motion.div>
      </div>
    </section>
  )
}

/* ------------------------- posture gauge + signal chart ------------------------ */

function PostureGauge() {
  const { progress, answered } = useEngagementMetrics()
  const score =
    answered > 0
      ? Math.round(((progress.compliant + progress.partial * 0.5) / answered) * 100)
      : 0
  const display = useCountUp(score, 1400)
  const size = 232
  const stroke = 14
  const r = (size - stroke) / 2
  const c = 2 * Math.PI * r
  const scored = progress.total - progress.na
  return (
    <div className="relative flex flex-col items-center">
      <div className="relative" style={{ width: size, height: size }}>
        <svg width={size} height={size} className="-rotate-90">
          <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--bg-raised)" strokeWidth={stroke} />
          <circle
            cx={size / 2}
            cy={size / 2}
            r={r}
            fill="none"
            stroke="var(--accent)"
            strokeWidth={stroke}
            strokeLinecap="round"
            strokeDasharray={c}
            strokeDashoffset={c * (1 - display / 100)}
            style={{ filter: 'drop-shadow(0 0 14px rgba(200,243,29,0.45))' }}
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="font-display text-[64px] font-bold leading-none tracking-[-0.03em] tabular text-text-primary">
            {display}
            <span className="text-[28px] text-text-secondary">%</span>
          </span>
          <span className="mt-2 font-mono text-[10px] uppercase tracking-[0.14em] text-text-muted">
            Overall Posture
          </span>
        </div>
      </div>
      <div className="mt-5 flex items-center gap-3">
        <span className="inline-flex items-center gap-1 rounded-full bg-accent-dim px-2.5 py-1 font-mono text-[11px] font-medium text-[var(--accent)]">
          ↑ {MOCK_DASHBOARD.complianceDelta.replace(/^\+/, '')}
        </span>
        <span className="font-mono text-[11px] uppercase tracking-[0.06em] text-text-muted">
          Healthy controls {progress.compliant}/{scored}
        </span>
      </div>
    </div>
  )
}

function SignalChart() {
  const series = useSignalSeries()
  return (
    <div className="flex h-full flex-col">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="font-mono text-[11px] uppercase leading-4 tracking-[0.08em] text-text-muted">
          Threat Activity / Compliance Signal
        </span>
        <span className="rounded-full border border-border-strong px-2.5 py-1 font-mono text-[10px] uppercase tracking-[0.12em] text-text-secondary">
          Last 30 days
        </span>
      </div>
      <div className="mt-4 flex items-center gap-5 font-mono text-[10px] uppercase tracking-[0.1em] text-text-muted">
        <span className="flex items-center gap-2">
          <span className="h-px w-5 bg-[var(--accent)] shadow-glow-lime-sm" />
          Compliant trend
        </span>
        <span className="flex items-center gap-2">
          <span className="h-px w-5 bg-[var(--teal-series)]" />
          Findings trend
        </span>
      </div>
      <div className="mt-3 min-h-[240px] flex-1">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={series} margin={{ top: 8, right: 4, bottom: 0, left: -18 }}>
            <defs>
              <linearGradient id="limeFill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#C8F31D" stopOpacity={0.22} />
                <stop offset="100%" stopColor="#C8F31D" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid stroke="var(--border)" strokeDasharray="2 6" vertical={false} />
            <XAxis
              dataKey="day"
              tickLine={false}
              axisLine={false}
              interval={5}
              tick={{ fill: 'var(--text-muted)', fontSize: 10, fontFamily: 'JetBrains Mono' }}
            />
            <YAxis
              tickLine={false}
              axisLine={false}
              tick={{ fill: 'var(--text-muted)', fontSize: 10, fontFamily: 'JetBrains Mono' }}
            />
            <Tooltip
              cursor={{ stroke: 'var(--border-strong)', strokeDasharray: '3 3' }}
              contentStyle={{
                background: 'var(--bg-overlay)',
                border: '1px solid var(--border-strong)',
                borderRadius: 10,
                fontFamily: 'JetBrains Mono',
                fontSize: 11,
                color: 'var(--text-primary)',
              }}
              labelStyle={{ color: 'var(--text-muted)' }}
            />
            <Area
              type="monotone"
              dataKey="compliance"
              name="Compliant trend"
              stroke="#C8F31D"
              strokeWidth={2}
              fill="url(#limeFill)"
              dot={false}
              isAnimationActive
              animationDuration={1100}
            />
            <Area
              type="monotone"
              dataKey="findings"
              name="Findings trend"
              stroke="#5BA8A0"
              strokeWidth={1.5}
              fill="transparent"
              dot={false}
              isAnimationActive
              animationDuration={1100}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}

function PostureRow() {
  const reduce = useReducedMotion()
  return (
    <motion.section
      initial={reduce ? false : { opacity: 0, y: 16 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: '-60px' }}
      transition={{ duration: 0.5, ease: EASE }}
      className="grid grid-cols-1 gap-4 xl:grid-cols-3"
    >
      <div className="glow-lime flex items-center justify-center rounded-2xl border border-border bg-bg-surface p-8">
        <PostureGauge />
      </div>
      <div className="rounded-2xl border border-border bg-bg-surface p-6 xl:col-span-2">
        <SignalChart />
      </div>
    </motion.section>
  )
}

/* --------------------------- framework command grid --------------------------- */

const FILTERS = ['ALL', 'SECURITY', 'GOVERNANCE', 'PRIVACY', 'THREAT'] as const

function FrameworkCard({ fw, index }: { fw: FrameworkProgressMock; index: number }) {
  const Icon = FRAMEWORK_ICONS[fw.id] ?? Shield
  const reduce = useReducedMotion()
  return (
    <motion.div
      layout
      initial={reduce ? false : { opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, ease: EASE, delay: index * 0.05 }}
      whileHover={reduce ? undefined : { y: -4 }}
    >
      <Link
        to={`/audit/${fw.id}`}
        className="block rounded-2xl border border-border bg-bg-surface p-5 transition-all duration-[160ms] hover:border-[rgba(200,243,29,0.35)] hover:shadow-glow-lime"
      >
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-accent-dim">
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
                    initial={reduce ? false : { scaleX: 0 }}
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
            <span className="text-text-muted">Next up /</span> {fw.nextControl}
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
          02 / Framework Command Grid
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
            className="flex h-full min-h-40 flex-col items-center justify-center gap-2 rounded-2xl border border-dashed border-border-strong text-text-muted transition-colors duration-[160ms] hover:border-[var(--accent)] hover:text-[var(--accent)]"
          >
            <Plus className="size-5" />
            <span className="font-mono text-[11px] uppercase tracking-[0.08em]">Add framework</span>
          </Link>
        </motion.div>
      </motion.div>
    </section>
  )
}

/* ---------------------------- editorial stat strip ---------------------------- */

function StatStrip() {
  const { progress, evidenceCount } = useEngagementMetrics()
  const reduce = useReducedMotion()
  const answeredTotal = progress.total - progress.unanswered
  const stats: [string, number, string][] = [
    ['QUESTIONS ANSWERED', answeredTotal, `OF ${progress.total}`],
    ['EVIDENCE COLLECTED', evidenceCount, 'ARTIFACTS'],
    ['INTERVIEWS HELD', MOCK_DASHBOARD.interviewsDone, `OF ${MOCK_DASHBOARD.interviewsTotal}`],
    ['FINDINGS OPEN', MOCK_DASHBOARD.openFindings, `${MOCK_DASHBOARD.findingsBySeverity.high} HIGH SEVERITY`],
    ['DAYS IN FIELD', 21, 'OF 40 PLANNED'],
  ]
  return (
    <motion.section
      initial={reduce ? false : { opacity: 0 }}
      whileInView={{ opacity: 1 }}
      viewport={{ once: true, margin: '-80px' }}
      transition={{ duration: 0.6 }}
      className="-mx-6 bg-cream px-6 py-10 text-cream-ink [@media(min-width:1600px)]:-mx-8 [@media(min-width:1600px)]:px-8"
    >
      <div className="mb-8 flex items-center justify-between font-mono text-[11px] uppercase tracking-[0.14em] text-cream-muted">
        <span>03 / Engagement Ledger</span>
        <span>ENG-2025-0147 / FY25</span>
      </div>
      <div className="grid grid-cols-2 gap-x-6 gap-y-8 md:grid-cols-3 xl:grid-cols-5">
        {stats.map(([label, value, sub], i) => (
          <StatCell key={label} label={label} value={value} sub={sub} index={i} />
        ))}
      </div>
    </motion.section>
  )
}

function StatCell({ label, value, sub, index }: { label: string; value: number; sub: string; index: number }) {
  const display = useCountUp(value, 1000)
  const reduce = useReducedMotion()
  return (
    <motion.div
      initial={reduce ? false : { opacity: 0, y: 14 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: '-60px' }}
      transition={{ duration: 0.45, ease: EASE, delay: index * 0.07 }}
      className="border-l-2 border-cream-ink/80 pl-4"
    >
      <div className="font-mono text-[10px] uppercase leading-4 tracking-[0.14em] text-cream-muted">
        {label}
      </div>
      <div className="mt-2 font-display text-[44px] font-bold leading-none tracking-[-0.03em] tabular">
        {display}
      </div>
      <div className="mt-2 font-mono text-[10px] uppercase tracking-[0.12em] text-cream-muted">
        {sub}
      </div>
    </motion.div>
  )
}

/* ------------------------------- phase tracker ------------------------------ */

const PHASE_CHECKLISTS: Record<string, string[]> = {
  scoping: ['Frameworks selected 9/9', 'Stakeholder map approved', 'CDE boundary confirmed'],
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
  const reduce = useReducedMotion()
  const current = MOCK_DASHBOARD.currentPhase
  const currentFill = MOCK_DASHBOARD.currentPhaseProgress

  return (
    <motion.section
      initial={reduce ? false : { opacity: 0, y: 12 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: '-60px' }}
      transition={{ duration: 0.4, ease: EASE }}
      className="rounded-2xl border border-border bg-bg-surface p-6"
    >
      <div className="flex items-center justify-between">
        <div className="font-mono text-[11px] uppercase leading-4 tracking-[0.08em] text-text-muted">
          04 / Audit Phase
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
                    initial={reduce ? false : { scaleX: 0 }}
                    whileInView={{ scaleX: 1 }}
                    viewport={{ once: true }}
                    transition={{ duration: 0.9, ease: EASE, delay: 0.3 + i * 0.12 }}
                    className="h-full w-full origin-left bg-[var(--accent)]"
                    style={{ opacity: done || active ? 1 : 0.15 }}
                  />
                </div>
              )}
              {i < PHASES.length - 1 && (
                <div className="absolute right-0 top-3 h-0.5 w-1/2 overflow-hidden bg-border">
                  <motion.div
                    initial={reduce ? false : { scaleX: 0 } }
                    whileInView={{ scaleX: active ? currentFill / 100 : done ? 1 : 0 }}
                    viewport={{ once: true }}
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
                    ? 'border-[var(--accent)] bg-[var(--accent)] text-[#061316]'
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
                    animate={reduce ? undefined : { opacity: [1, 0.4, 1] }}
                    transition={{ duration: 1.6, repeat: Infinity, ease: 'easeInOut' }}
                  />
                ) : null}
                {active && (
                  <span className="absolute inset-0 rounded-full ring-2 ring-[rgba(200,243,29,0.4)]" />
                )}
              </button>
              <div
                className={clsx(
                  'mt-2 text-center font-mono text-[11px] uppercase leading-4 tracking-[0.08em]',
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
    <div className="rounded-2xl border border-border bg-bg-surface p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="font-mono text-[11px] uppercase leading-4 tracking-[0.08em] text-text-muted">
          05 / Domain Heat
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
  const reduce = useReducedMotion()
  return (
    <div className="flex flex-col rounded-2xl border border-border bg-bg-surface p-5">
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
            initial={reduce ? false : { opacity: 0, x: 8 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.25, ease: 'easeOut', delay: 0.15 + i * 0.03 }}
            className="flex items-start gap-2.5 rounded-md px-2 py-2 transition-colors duration-[120ms] hover:bg-bg-raised"
          >
            <motion.span
              className="mt-1.5 size-1.5 shrink-0 rounded-full"
              style={{ backgroundColor: STATUS_COLORS[entry.status] ?? STATUS_COLORS.na }}
              animate={i === 0 && !reduce ? { opacity: [1, 0.4, 1] } : undefined}
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
  const reduce = useReducedMotion()
  return (
    <section>
      <div className="font-mono text-[11px] uppercase leading-4 tracking-[0.08em] text-text-muted">
        06 / Upcoming Interviews
      </div>
      <div className="slim-scroll mt-3 flex gap-3 overflow-x-auto pb-2 [mask-image:linear-gradient(to_right,black_calc(100%-48px),transparent)]">
        {MOCK_INTERVIEWS.map((iv, i) => (
          <motion.div
            key={iv.name}
            initial={reduce ? false : { opacity: 0, y: 8 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.3, ease: EASE, delay: 0.1 + i * 0.04 }}
            whileHover={reduce ? undefined : { y: -2 }}
            className="flex w-[280px] shrink-0 flex-col rounded-2xl border border-border bg-bg-surface p-4 transition-all duration-[160ms] hover:border-[rgba(200,243,29,0.35)] hover:shadow-glow-lime"
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
              className="mt-3 rounded-md bg-[var(--accent)] px-3 py-1.5 text-center text-[13px] font-semibold text-[#061316] transition-all duration-[120ms] hover:bg-[var(--accent-strong)] active:scale-[0.97]"
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
    <div className="space-y-10">
      <Hero />
      <div className="-mx-6 [@media(min-width:1600px)]:-mx-8">
        <Ticker />
      </div>
      <PostureRow />
      <FrameworkGrid />
      <StatStrip />
      <PhaseTracker />
      <section className="grid grid-cols-1 gap-6 xl:grid-cols-3">
        <div className="xl:col-span-2">
          <HeatMap />
        </div>
        <ActivityFeed />
      </section>
      <InterviewStrip />
    </div>
  )
}
