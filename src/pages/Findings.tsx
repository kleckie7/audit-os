import { useMemo, useState } from 'react'
import { Link } from 'react-router'
import { AnimatePresence, motion } from 'framer-motion'
import {
  AlertTriangle,
  ArrowRight,
  ArrowUpDown,
  Check,
  ChevronDown,
  Clock,
  Download,
  Plus,
  Search,
  TrendingDown,
  X,
} from 'lucide-react'
import {
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  PolarAngleAxis,
  PolarGrid,
  Radar,
  RadarChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { saveAs } from 'file-saver'
import clsx from 'clsx'
import StatusPill from '@/components/StatusPill'
import SeverityPill from '@/components/SeverityPill'
import ProgressRing from '@/components/ProgressRing'
import { Abbr } from '@/components/TermTip'
import { useAuditStore } from '@/lib/store'
import { useFindingsStore } from '@/lib/findings-store'
import type { Remediation, RemediationStatus } from '@/lib/findings-store'
import { FRAMEWORKS, allQuestions, getFramework } from '@/data/frameworks'
import type { Answer, AuditQuestion, FindingSeverity, Framework } from '@/lib/types'

// Findings & Scoring (/findings) — design/findings.md.
// Scores and the findings register are computed from the engagement's answers
// (compliant = full weight, partial = half, non-compliant = zero, N/A
// excluded). When the engagement has little answer data, a deterministic demo
// answer set is merged in for display so the analytics stay meaningful.

const EASE: [number, number, number, number] = [0.22, 1, 0.36, 1]

/* ------------------------------ deterministic rng --------------------------- */

function hash32(s: string): number {
  let h = 2166136261
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return h >>> 0
}

function rand01(seed: number, salt: number): number {
  let t = seed + salt * 0x9e3779b9
  t = Math.imul(t ^ (t >>> 15), t | 1)
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296
}

const DEMO_BASE = Date.UTC(2025, 0, 6)

/** Deterministic demo answer for a question (only used to pad thin data). */
function demoAnswer(q: AuditQuestion): Answer | null {
  const seed = hash32(q.id)
  if (rand01(seed, 1) > 0.42) return null // 42% assessed coverage
  const r = rand01(seed, 2)
  const status =
    r < 0.6 ? 'compliant' : r < 0.77 ? 'partial' : r < 0.87 ? 'noncompliant' : 'na'
  const days = Math.floor(rand01(seed, 3) * 38)
  return {
    status,
    notes: '',
    evidenceChecked: [],
    flagged: status === 'noncompliant' && rand01(seed, 4) > 0.5,
    updatedAt: new Date(DEMO_BASE + days * 86400000).toISOString(),
  }
}

/* --------------------------------- scoring --------------------------------- */

/** Weighted score 0–100 for a question set, or null when nothing applicable. */
function weightedScore(questions: AuditQuestion[], answers: Record<string, Answer>): number | null {
  let earned = 0
  let max = 0
  for (const q of questions) {
    const a = answers[q.id]
    if (!a?.status || a.status === 'na') continue
    max += q.weight
    earned += q.weight * (a.status === 'compliant' ? 1 : 0.5)
  }
  return max > 0 ? Math.round((earned / max) * 100) : null
}

/* --------------------------------- findings -------------------------------- */

export interface Finding {
  id: string
  questionId: string | null
  frameworkId: string
  frameworkShort: string
  controlRef: string
  title: string
  description: string
  severity: FindingSeverity
  likelihood: 'L' | 'M' | 'H'
  impact: 'L' | 'M' | 'H'
  ownerDefault: string
  createdAt: string
  evidence: string[]
  steps: string[]
  answerStatus: 'partial' | 'noncompliant'
  weight: 1 | 2 | 3
}

const TIERS: FindingSeverity[] = ['critical', 'high', 'medium', 'low']

/** noncompliant w3 → critical/high, w2 → high/medium, w1 → medium/low; partial one tier lower. */
function severityFor(status: 'partial' | 'noncompliant', weight: 1 | 2 | 3, seed: number): FindingSeverity {
  const base = status === 'noncompliant' ? 3 - weight : 4 - weight // index into TIERS
  const lo = Math.min(3, base)
  const hi = Math.min(3, base + 1)
  return TIERS[rand01(seed, 11) < 0.5 ? lo : hi]
}

const L_I: Record<FindingSeverity, ['L' | 'M' | 'H', 'L' | 'M' | 'H']> = {
  critical: ['H', 'H'],
  high: ['M', 'H'],
  medium: ['M', 'M'],
  low: ['L', 'M'],
}

function findingFromQuestion(
  q: AuditQuestion,
  fw: Framework,
  a: Answer,
  status: 'partial' | 'noncompliant',
): Omit<Finding, 'id'> {
  const seed = hash32(q.id)
  const severity = severityFor(status, q.weight, seed)
  const [likelihood, impact] = L_I[severity]
  const title = q.question.length > 96 ? `${q.question.slice(0, 96).trimEnd()}…` : q.question
  const description =
    `${q.whyItMatters} Assessment result: ${status === 'noncompliant' ? 'non-compliant' : 'partially compliant'}.` +
    (a.notes ? ` Auditor note: ${a.notes}` : '')
  const steps =
    q.probes.length > 0
      ? q.probes.slice(0, 3)
      : q.guidance
          .split(/(?<=[.!?])\s+/)
          .slice(0, 3)
  return {
    questionId: q.id,
    frameworkId: fw.id,
    frameworkShort: fw.shortName,
    controlRef: q.controlRef,
    title,
    description,
    severity,
    likelihood,
    impact,
    ownerDefault: q.interviewees[0] ?? 'Control Owner',
    createdAt: a.updatedAt,
    evidence: q.evidence,
    steps,
    answerStatus: status,
    weight: q.weight,
  }
}

/* ------------------------------- domain radar ------------------------------ */

const AXES: { label: string; match: RegExp }[] = [
  { label: 'GOVERNANCE', match: /govern|leadership|polic|context|scop|planning|tone|edm/i },
  { label: 'ACCESS', match: /access|identity|authentication|physical/i },
  { label: 'THREAT DETECTION', match: /detect|monitor|att&ck|threat|command & control|exfiltration|persistence|privilege escalation|credential|lateral|discovery|collection|initial access|execution|defense evasion/i },
  { label: 'RESILIENCE', match: /incident|continuity|recover|availability|respond/i },
  { label: 'PRIVACY', match: /privacy|data protection|confidential|personal|stored data|transmission|data flows/i },
  { label: 'ASSURANCE', match: /finding|report|deficienc|evaluation|poa&m|certification|capability|performance|management objectives|mea|wrap-up/i },
  { label: 'RISK', match: /risk/i },
  { label: 'OPERATIONS', match: /./ },
]

function axisFor(fw: Framework, phaseName: string): string {
  if (fw.category === 'threat' && !/planning|scoping/i.test(phaseName)) return 'THREAT DETECTION'
  return AXES.find((a) => a.match.test(phaseName))!.label
}

/* --------------------------------- helpers --------------------------------- */

const SEV_COLOR: Record<FindingSeverity, string> = {
  critical: 'var(--severity-critical)',
  high: 'var(--severity-high)',
  medium: 'var(--severity-medium)',
  low: 'var(--severity-low)',
}

const SEV_RANK: Record<FindingSeverity, number> = { critical: 0, high: 1, medium: 2, low: 3 }

const REM_STATUS: Record<RemediationStatus, { label: string; pill: 'na' | 'partial' | 'compliant' | 'fieldwork' }> = {
  open: { label: 'OPEN', pill: 'na' },
  'in-remediation': { label: 'IN REMEDIATION', pill: 'partial' },
  accepted: { label: 'ACCEPTED', pill: 'fieldwork' },
  closed: { label: 'CLOSED', pill: 'compliant' },
}

const DUE_DAYS: Record<FindingSeverity, number> = { critical: 7, high: 14, medium: 30, low: 60 }

function defaultRemediation(f: Finding): Remediation {
  const due = new Date(new Date(f.createdAt).getTime() + DUE_DAYS[f.severity] * 86400000)
  return {
    owner: f.ownerDefault,
    dueDate: due.toISOString().slice(0, 10),
    status: 'open',
    response: '',
    inReport: false,
  }
}

function fmtDue(iso: string): string {
  return new Date(`${iso}T00:00:00`)
    .toLocaleDateString('en-GB', { day: '2-digit', month: 'short' })
    .toUpperCase()
}

function fmtStamp(iso: string): string {
  const d = new Date(iso)
  return `${d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short' }).toUpperCase()} ${d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', hour12: false })}`
}

/** TermTip-styled chart tooltip. */
function ChartTooltip({ active, payload, label }: { active?: boolean; payload?: { name?: string; value?: number; color?: string }[]; label?: string }) {
  if (!active || !payload || payload.length === 0) return null
  return (
    <div className="rounded-[10px] border border-border-strong bg-bg-overlay px-3 py-2 shadow-popover">
      {label != null && (
        <div className="font-mono text-[10px] uppercase tracking-[0.08em] text-text-muted">{label}</div>
      )}
      {payload.map((p, i) => (
        <div key={i} className="mt-0.5 flex items-center gap-2 font-mono text-[11px] tabular">
          <span className="size-1.5 rounded-full" style={{ backgroundColor: p.color ?? 'var(--accent)' }} />
          <span className="text-text-secondary">{p.name}:</span>
          <span className="text-text-primary">{p.value}</span>
        </div>
      ))}
    </div>
  )
}

/* ------------------------------ score overview ----------------------------- */

interface ScoreRow {
  fw: Framework
  score: number | null
  delta: number
}

function FrameworkScoresPanel({ rows }: { rows: ScoreRow[] }) {
  return (
    <section className="rounded-lg border border-border bg-bg-surface p-5">
      <h2 className="text-[16px] font-semibold leading-6 text-text-primary">Framework scores</h2>
      <div className="mt-3 space-y-2.5">
        {rows.map((r, i) => (
          <motion.div
            key={r.fw.id}
            initial={{ opacity: 0, y: 8 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, amount: 0.8 }}
            transition={{ duration: 0.3, delay: i * 0.06, ease: EASE }}
            className="flex items-center gap-3"
          >
            <ProgressRing value={r.score ?? 0} size={20} showLabel={false} />
            <Abbr term={r.fw.shortName} className="min-w-0 flex-1 truncate text-[13px] text-text-secondary">
              {r.fw.shortName}
            </Abbr>
            <motion.span
              initial={{ scale: 0.8, opacity: 0 }}
              whileInView={{ scale: 1, opacity: 1 }}
              viewport={{ once: true }}
              transition={{ duration: 0.2, delay: 0.2 + i * 0.06 }}
              className="rounded-full px-1.5 py-px font-mono text-[10px] tabular"
              style={{
                color: r.delta >= 0 ? 'var(--accent)' : 'var(--status-noncompliant)',
                backgroundColor:
                  r.delta >= 0 ? 'rgba(52,211,153,0.12)' : 'rgba(248,113,113,0.12)',
              }}
            >
              {r.delta >= 0 ? `+${r.delta}%` : `${r.delta}%`}
            </motion.span>
            <span className="w-10 text-right font-mono text-[12px] tabular text-text-primary">
              {r.score == null ? '—' : `${r.score}%`}
            </span>
          </motion.div>
        ))}
      </div>
      <p className="mt-4 border-t border-border pt-3 font-mono text-[10px] uppercase tracking-[0.06em] text-text-muted">
        Weighted: critical ×3, high ×2, medium ×1
      </p>
    </section>
  )
}

function DomainRadarPanel({ data }: { data: { axis: string; current: number; target: number }[] }) {
  return (
    <section className="rounded-lg border border-border bg-bg-surface p-5">
      <h2 className="text-[16px] font-semibold leading-6 text-text-primary">Domain radar</h2>
      <div className="mt-2 h-[300px]">
        <ResponsiveContainer width="100%" height="100%">
          <RadarChart data={data} outerRadius="72%">
            <PolarGrid stroke="rgba(34,43,51,0.6)" />
            <PolarAngleAxis
              dataKey="axis"
              tick={{ fill: 'var(--text-muted)', fontSize: 10, fontFamily: 'JetBrains Mono, monospace' }}
            />
            <Radar
              name="Target"
              dataKey="target"
              stroke="var(--text-muted)"
              strokeDasharray="4 4"
              fill="none"
              isAnimationActive
              animationDuration={900}
            />
            <Radar
              name="Current"
              dataKey="current"
              stroke="var(--accent)"
              strokeWidth={2}
              fill="var(--accent)"
              fillOpacity={0.2}
              isAnimationActive
              animationDuration={900}
            />
            <Tooltip content={<ChartTooltip />} />
          </RadarChart>
        </ResponsiveContainer>
      </div>
      <p className="font-mono text-[10px] uppercase tracking-[0.06em] text-text-muted">
        Current weighted score vs. 85% target profile
      </p>
    </section>
  )
}

interface SevRow {
  fwShort: string
  counts: Record<FindingSeverity, number>
  ids: Record<FindingSeverity, string[]>
  total: number
}

function SeverityDistPanel({ rows, openTotal }: { rows: SevRow[]; openTotal: number }) {
  const max = Math.max(1, ...rows.map((r) => r.total))
  const [hover, setHover] = useState<{ fw: string; sev: FindingSeverity } | null>(null)
  const sevs: FindingSeverity[] = ['critical', 'high', 'medium', 'low']
  return (
    <section className="rounded-lg border border-border bg-bg-surface p-5">
      <div className="flex items-baseline justify-between">
        <h2 className="text-[16px] font-semibold leading-6 text-text-primary">Severity distribution</h2>
        <span className="font-mono text-[12px] tabular text-[var(--status-noncompliant)]">{openTotal} OPEN</span>
      </div>
      <div className="relative mt-4 space-y-2.5">
        {rows.map((r, i) => (
          <div key={r.fwShort} className="flex items-center gap-3">
            <Abbr
              term={r.fwShort}
              className="w-24 shrink-0 truncate font-mono text-[10px] uppercase tracking-[0.04em] text-text-secondary"
            >
              {r.fwShort}
            </Abbr>
            <div className="flex h-4 min-w-0 flex-1 overflow-hidden rounded-sm bg-bg-raised">
              {sevs.map((sev) => {
                const n = r.counts[sev]
                if (n === 0) return null
                const dim = hover && !(hover.fw === r.fwShort && hover.sev === sev)
                return (
                  <motion.div
                    key={sev}
                    initial={{ scaleX: 0 }}
                    whileInView={{ scaleX: 1 }}
                    viewport={{ once: true }}
                    transition={{ duration: 0.6, delay: i * 0.06, ease: 'easeOut' }}
                    onMouseEnter={() => setHover({ fw: r.fwShort, sev })}
                    onMouseLeave={() => setHover(null)}
                    className="relative h-full origin-left cursor-default transition-opacity duration-[140ms]"
                    style={{
                      width: `${(n / max) * 100}%`,
                      backgroundColor: SEV_COLOR[sev],
                      opacity: dim ? 0.4 : 1,
                    }}
                  />
                )
              })}
              {r.total === 0 && (
                <span className="px-2 font-mono text-[9px] leading-4 text-text-muted">0</span>
              )}
            </div>
            <span className="w-8 shrink-0 text-right font-mono text-[11px] tabular text-text-secondary">
              {r.total}
            </span>
          </div>
        ))}
        {hover && (
          <div className="pointer-events-none absolute -top-2 right-0 z-10 max-w-56 rounded-[10px] border border-border-strong bg-bg-overlay px-3 py-2 shadow-popover">
            <div className="font-mono text-[10px] uppercase tracking-[0.08em]" style={{ color: SEV_COLOR[hover.sev] }}>
              {hover.fw} · {hover.sev}
            </div>
            <div className="mt-1 font-mono text-[10px] leading-4 text-text-secondary">
              {rows.find((r) => r.fwShort === hover.fw)?.ids[hover.sev].join(', ')}
            </div>
          </div>
        )}
      </div>
      <div className="mt-4 flex flex-wrap gap-3 border-t border-border pt-3">
        {sevs.map((s) => (
          <span key={s} className="flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-[0.04em] text-text-muted">
            <span className="size-1.5 rounded-full" style={{ backgroundColor: SEV_COLOR[s] }} />
            {s}
          </span>
        ))}
      </div>
    </section>
  )
}

/* ------------------------------ filter toolbar ----------------------------- */

function FilterChip({
  active,
  color,
  onClick,
  children,
}: {
  active: boolean
  color?: string
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={clsx(
        'relative overflow-hidden rounded-full border px-2.5 py-1 font-mono text-[11px] uppercase tracking-[0.04em] transition-all duration-[140ms]',
        active
          ? 'border-transparent font-semibold'
          : 'border-border text-text-muted hover:border-border-strong hover:text-text-secondary',
      )}
      style={
        active
          ? {
              color: color ?? 'var(--accent)',
              backgroundColor: `color-mix(in srgb, ${color ?? 'var(--accent)'} 14%, transparent)`,
            }
          : undefined
      }
    >
      {children}
    </button>
  )
}

/* ------------------------------ findings register -------------------------- */

interface RegRow {
  f: Finding
  rem: Remediation
}

type SortKey = 'id' | 'severity' | 'status' | 'due'

function SortHeader({
  label,
  k,
  sortKey,
  dir,
  onSort,
  className,
}: {
  label: string
  k?: SortKey
  sortKey: SortKey
  dir: 1 | -1
  onSort: (k: SortKey) => void
  className?: string
}) {
  const active = k != null && sortKey === k
  return (
    <button
      type="button"
      disabled={!k}
      onClick={() => k && onSort(k)}
      className={clsx(
        'flex items-center gap-1 font-mono text-[11px] uppercase tracking-[0.08em]',
        active ? 'text-text-primary' : 'text-text-muted',
        k && 'transition-colors duration-[120ms] hover:text-text-secondary',
        className,
      )}
    >
      {label}
      {k && (
        <ArrowUpDown
          className={clsx(
            'size-3 transition-transform duration-[160ms]',
            active ? 'text-[var(--accent)]' : 'text-border-strong',
            active && dir === -1 && 'rotate-180',
          )}
        />
      )}
    </button>
  )
}

function OwnerChip({ name }: { name: string }) {
  const initials = name
    .split(/[\s/()]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0])
    .join('')
    .toUpperCase()
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className="flex size-5 shrink-0 items-center justify-center rounded-full border border-border-strong bg-accent-dim font-display text-[9px] font-semibold text-[var(--accent)]">
        {initials}
      </span>
      <span className="max-w-28 truncate text-[12px] text-text-secondary">{name}</span>
    </span>
  )
}

function Register({
  rows,
  selected,
  onToggleSelect,
  onToggleAll,
  onOpen,
  sortKey,
  dir,
  onSort,
  nowIso,
}: {
  rows: RegRow[]
  selected: Set<string>
  onToggleSelect: (id: string) => void
  onToggleAll: () => void
  onOpen: (row: RegRow) => void
  sortKey: SortKey
  dir: 1 | -1
  onSort: (k: SortKey) => void
  nowIso: string
}) {
  const today = nowIso.slice(0, 10)
  return (
    <div className="overflow-hidden rounded-lg border border-border bg-bg-surface">
      {/* header */}
      <div className="sticky top-0 z-10 grid grid-cols-[36px_64px_2fr_1.3fr_110px_90px_1.1fr_130px_72px] items-center gap-3 border-b border-border-strong bg-bg-raised px-4 py-3">
        <input
          type="checkbox"
          checked={rows.length > 0 && rows.every((r) => selected.has(r.f.id))}
          onChange={onToggleAll}
          aria-label="Select all"
          className="size-3.5 accent-[#34D399]"
        />
        <SortHeader label="ID" k="id" sortKey={sortKey} dir={dir} onSort={onSort} />
        <SortHeader label="Finding" sortKey={sortKey} dir={dir} onSort={onSort} />
        <SortHeader label="Framework / Control" sortKey={sortKey} dir={dir} onSort={onSort} />
        <SortHeader label="Severity" k="severity" sortKey={sortKey} dir={dir} onSort={onSort} />
        <SortHeader label="L × I" sortKey={sortKey} dir={dir} onSort={onSort} />
        <SortHeader label="Owner" sortKey={sortKey} dir={dir} onSort={onSort} />
        <SortHeader label="Status" k="status" sortKey={sortKey} dir={dir} onSort={onSort} />
        <SortHeader label="Due" k="due" sortKey={sortKey} dir={dir} onSort={onSort} />
      </div>

      <AnimatePresence initial={false}>
        {rows.map((r) => {
          const overdue = r.rem.dueDate < today && r.rem.status !== 'closed' && r.rem.status !== 'accepted'
          return (
            <motion.div
              key={r.f.id}
              layout="position"
              initial={{ opacity: 0.4 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.18 }}
              onClick={() => onOpen(r)}
              className="grid cursor-pointer grid-cols-[36px_64px_2fr_1.3fr_110px_90px_1.1fr_130px_72px] items-center gap-3 border-b border-border px-4 py-2.5 transition-colors duration-[120ms] last:border-b-0 hover:bg-bg-raised"
            >
              <input
                type="checkbox"
                checked={selected.has(r.f.id)}
                onChange={() => onToggleSelect(r.f.id)}
                onClick={(e) => e.stopPropagation()}
                aria-label={`Select ${r.f.id}`}
                className="size-3.5 accent-[#34D399]"
              />
              <span className="font-mono text-[12px] tabular text-text-primary transition-colors duration-[120ms] hover:text-[var(--accent)]">
                {r.f.id}
              </span>
              <span className="min-w-0">
                <span className="block truncate text-[14px] leading-5 text-text-primary">{r.f.title}</span>
                <span className="block truncate text-[12px] leading-4 text-text-muted">{r.f.description}</span>
              </span>
              <span className="flex min-w-0 flex-wrap items-center gap-1">
                <Abbr
                  term={r.f.frameworkShort}
                  className="rounded-full bg-bg-raised px-1.5 py-px font-mono text-[10px] text-text-secondary no-underline"
                >
                  {r.f.frameworkShort}
                </Abbr>
                <span className="truncate font-mono text-[11px] tabular text-text-muted">{r.f.controlRef}</span>
              </span>
              <span>
                {r.f.severity === 'critical' ? (
                  <motion.span
                    initial={{ scale: 1 }}
                    whileInView={{ scale: [1, 1.12, 1] }}
                    viewport={{ once: true }}
                    transition={{ duration: 0.3 }}
                    className="inline-block"
                  >
                    <SeverityPill severity={r.f.severity} />
                  </motion.span>
                ) : (
                  <SeverityPill severity={r.f.severity} />
                )}
              </span>
              <span className="font-mono text-[11px] tabular text-text-secondary">
                {r.f.likelihood} × {r.f.impact}
              </span>
              <OwnerChip name={r.rem.owner} />
              <span>
                <StatusPill status={REM_STATUS[r.rem.status].pill} label={REM_STATUS[r.rem.status].label} />
              </span>
              <span
                className={clsx(
                  'font-mono text-[11px] tabular',
                  overdue ? 'text-[var(--status-noncompliant)]' : 'text-text-secondary',
                )}
              >
                {fmtDue(r.rem.dueDate)}
              </span>
            </motion.div>
          )
        })}
      </AnimatePresence>
    </div>
  )
}

/* ------------------------------ bulk action bar ---------------------------- */

function BulkBar({
  count,
  onAddToReport,
  onSetStatus,
  onAssignOwner,
  onExport,
  onClear,
}: {
  count: number
  onAddToReport: () => void
  onSetStatus: (s: RemediationStatus) => void
  onAssignOwner: (owner: string) => void
  onExport: () => void
  onClear: () => void
}) {
  const [owner, setOwner] = useState('')
  return (
    <motion.div
      initial={{ opacity: 0, y: -8, height: 0 }}
      animate={{ opacity: 1, y: 0, height: 'auto' }}
      exit={{ opacity: 0, y: -8, height: 0 }}
      transition={{ duration: 0.2 }}
      className="mb-3 overflow-hidden rounded-lg border border-border-strong bg-bg-overlay"
    >
      <div className="flex flex-wrap items-center gap-2 px-4 py-2.5">
        <span className="font-mono text-[11px] tabular uppercase tracking-[0.04em] text-[var(--accent)]">
          {count} selected
        </span>
        <div className="h-4 w-px bg-border" />
        <button
          type="button"
          onClick={onAddToReport}
          className="rounded-md border border-border px-2.5 py-1 text-[12px] text-text-secondary transition-colors duration-[120ms] hover:bg-bg-raised hover:text-text-primary"
        >
          Add to report
        </button>
        <select
          defaultValue=""
          onChange={(e) => {
            if (e.target.value) onSetStatus(e.target.value as RemediationStatus)
            e.target.value = ''
          }}
          className="rounded-md border border-border bg-bg-base px-2 py-1 text-[12px] text-text-secondary"
        >
          <option value="" disabled>
            Set status…
          </option>
          <option value="open">Open</option>
          <option value="in-remediation">In remediation</option>
          <option value="accepted">Accepted</option>
          <option value="closed">Closed</option>
        </select>
        <span className="flex items-center gap-1.5">
          <input
            value={owner}
            onChange={(e) => setOwner(e.target.value)}
            placeholder="Assign owner…"
            className="w-36 rounded-md border border-border bg-bg-base px-2 py-1 text-[12px] text-text-primary placeholder:text-text-muted"
          />
          <button
            type="button"
            disabled={!owner.trim()}
            onClick={() => {
              onAssignOwner(owner.trim())
              setOwner('')
            }}
            className="rounded-md border border-border px-2 py-1 text-[12px] text-text-secondary transition-colors duration-[120ms] hover:bg-bg-raised hover:text-text-primary disabled:opacity-40"
          >
            Apply
          </button>
        </span>
        <button
          type="button"
          onClick={onExport}
          className="flex items-center gap-1.5 rounded-md border border-border px-2.5 py-1 text-[12px] text-text-secondary transition-colors duration-[120ms] hover:bg-bg-raised hover:text-text-primary"
        >
          <Download className="size-3.5" />
          Export selection (CSV)
        </button>
        <div className="flex-1" />
        <button
          type="button"
          onClick={onClear}
          className="rounded-md p-1 text-text-muted transition-colors duration-[120ms] hover:text-text-primary"
          aria-label="Clear selection"
        >
          <X className="size-4" />
        </button>
      </div>
    </motion.div>
  )
}

/* ------------------------------ finding drawer ----------------------------- */

function DrawerSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25, ease: EASE }}
      className="border-b border-border px-5 py-4"
    >
      <div className="mb-2 font-mono text-[10px] uppercase tracking-[0.08em] text-text-muted">{title}</div>
      {children}
    </motion.div>
  )
}

function FindingDrawer({
  row,
  onPatch,
  onClose,
}: {
  row: RegRow
  onPatch: (patch: Partial<Remediation>) => void
  onClose: () => void
}) {
  const { f, rem } = row
  // Parent renders this drawer with key={f.id}, so state resets per finding.
  const [response, setResponse] = useState(rem.response)

  return (
    <>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 0.6 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.2 }}
        onClick={onClose}
        className="fixed inset-0 z-[70] bg-black"
      />
      <motion.aside
        initial={{ x: 480 }}
        animate={{ x: 0 }}
        exit={{ x: 480, transition: { duration: 0.18 } }}
        transition={{ duration: 0.24, ease: EASE }}
        className="fixed right-0 top-0 z-[71] flex h-full w-full max-w-[480px] flex-col border-l border-border-strong bg-bg-overlay shadow-popover"
      >
        <div className="flex items-center gap-2 border-b border-border px-5 py-4">
          <span className="font-mono text-[14px] font-medium tabular text-text-primary">{f.id}</span>
          <SeverityPill severity={f.severity} />
          <StatusPill status={REM_STATUS[rem.status].pill} label={REM_STATUS[rem.status].label} />
          <div className="flex-1" />
          <button
            type="button"
            onClick={onClose}
            aria-label="Close finding"
            className="rounded-md p-1.5 text-text-muted transition-colors duration-[120ms] hover:bg-bg-raised hover:text-text-primary"
          >
            <X className="size-4" />
          </button>
        </div>

        <div className="slim-scroll flex-1 overflow-y-auto">
          <DrawerSection title="Description">
            <h3 className="text-[15px] font-medium leading-6 text-text-primary">{f.title}</h3>
            <p className="mt-2 text-[14px] leading-[22px] text-text-secondary">{f.description}</p>
          </DrawerSection>

          <DrawerSection title="Affected controls">
            <div className="flex flex-wrap items-center gap-2">
              <Abbr
                term={f.frameworkShort}
                className="rounded-full border border-border-strong px-2 py-0.5 font-mono text-[11px] text-text-secondary no-underline"
              >
                {f.frameworkShort}
              </Abbr>
              <span className="font-mono text-[12px] tabular text-text-primary">{f.controlRef}</span>
              {f.questionId && (
                <Link
                  to={`/audit/${f.frameworkId}`}
                  className="ml-auto text-[12px] font-medium text-[var(--accent)] transition-colors duration-[120ms] hover:text-[var(--accent-strong)]"
                >
                  Open in audit →
                </Link>
              )}
            </div>
            <div className="mt-2 font-mono text-[11px] tabular text-text-muted">
              Likelihood {f.likelihood} × Impact {f.impact} · Weight ×{f.weight}
            </div>
          </DrawerSection>

          <DrawerSection title="Evidence">
            {f.evidence.length > 0 ? (
              <div className="flex flex-wrap gap-1.5">
                {f.evidence.map((ev) => (
                  <span
                    key={ev}
                    className="rounded-md border border-border bg-bg-surface px-2 py-1 font-mono text-[11px] text-text-secondary"
                  >
                    {ev}
                  </span>
                ))}
              </div>
            ) : (
              <p className="text-[12px] text-text-muted">No evidence items linked yet.</p>
            )}
          </DrawerSection>

          <DrawerSection title="Recommended remediation">
            <ol className="space-y-1.5">
              {f.steps.map((s, i) => (
                <li key={i} className="flex gap-2 text-[13px] leading-5 text-text-secondary">
                  <span className="shrink-0 font-mono text-[11px] tabular text-text-muted">{i + 1}.</span>
                  {s}
                </li>
              ))}
            </ol>
          </DrawerSection>

          <DrawerSection title="Remediation tracking">
            <div className="grid grid-cols-2 gap-3">
              <label className="block">
                <span className="mb-1 block font-mono text-[10px] uppercase tracking-[0.06em] text-text-muted">
                  Owner
                </span>
                <input
                  value={rem.owner}
                  onChange={(e) => onPatch({ owner: e.target.value })}
                  className="w-full rounded-md border border-border bg-bg-surface px-2.5 py-1.5 text-[13px] text-text-primary"
                />
              </label>
              <label className="block">
                <span className="mb-1 block font-mono text-[10px] uppercase tracking-[0.06em] text-text-muted">
                  Due date
                </span>
                <input
                  type="date"
                  value={rem.dueDate}
                  onChange={(e) => onPatch({ dueDate: e.target.value })}
                  className="w-full rounded-md border border-border bg-bg-surface px-2.5 py-1.5 font-mono text-[12px] text-text-primary [color-scheme:dark]"
                />
              </label>
              <label className="block">
                <span className="mb-1 block font-mono text-[10px] uppercase tracking-[0.06em] text-text-muted">
                  Status
                </span>
                <select
                  value={rem.status}
                  onChange={(e) => onPatch({ status: e.target.value as RemediationStatus })}
                  className="w-full rounded-md border border-border bg-bg-surface px-2.5 py-1.5 text-[13px] text-text-primary"
                >
                  <option value="open">Open</option>
                  <option value="in-remediation">In remediation</option>
                  <option value="accepted">Accepted (risk)</option>
                  <option value="closed">Closed</option>
                </select>
              </label>
              <label className="flex items-end gap-2 pb-1.5">
                <input
                  type="checkbox"
                  checked={rem.inReport}
                  onChange={(e) => onPatch({ inReport: e.target.checked })}
                  className="size-3.5 accent-[#34D399]"
                />
                <span className="text-[12px] text-text-secondary">Include in report</span>
              </label>
            </div>
          </DrawerSection>

          <DrawerSection title="Management response">
            <textarea
              value={response}
              onChange={(e) => setResponse(e.target.value)}
              onBlur={() => onPatch({ response })}
              rows={3}
              placeholder="Record management's response for the report…"
              className="w-full resize-y rounded-md border border-border bg-bg-surface px-3 py-2 text-[13px] leading-5 text-text-primary placeholder:text-text-muted focus:border-border-strong focus:outline-none"
            />
            <div className="mt-1 font-mono text-[10px] uppercase tracking-[0.06em] text-text-muted">
              Recorded by JM · {fmtStamp(new Date().toISOString())}
            </div>
          </DrawerSection>

          <DrawerSection title="Activity">
            <div className="space-y-1.5">
              <div className="flex items-center gap-2 font-mono text-[11px] uppercase tracking-[0.04em] text-text-muted">
                <span className="size-1.5 rounded-full bg-[var(--status-noncompliant)]" />
                Created from {f.controlRef} · {fmtStamp(f.createdAt)}
              </div>
              {rem.status !== 'open' && (
                <div className="flex items-center gap-2 font-mono text-[11px] uppercase tracking-[0.04em] text-text-muted">
                  <span className="size-1.5 rounded-full bg-[var(--accent)]" />
                  Status → {REM_STATUS[rem.status].label}
                </div>
              )}
              {rem.inReport && (
                <div className="flex items-center gap-2 font-mono text-[11px] uppercase tracking-[0.04em] text-text-muted">
                  <span className="size-1.5 rounded-full bg-[var(--accent)]" />
                  Added to report draft
                </div>
              )}
            </div>
          </DrawerSection>
        </div>
      </motion.aside>
    </>
  )
}

/* ----------------------------- new finding drawer --------------------------- */

function NewFindingDrawer({
  frameworks,
  nextId,
  onSave,
  onClose,
}: {
  frameworks: Framework[]
  nextId: string
  onSave: (data: { title: string; description: string; frameworkId: string; controlRef: string; severity: FindingSeverity }) => void
  onClose: () => void
}) {
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [frameworkId, setFrameworkId] = useState(frameworks[0]?.id ?? '')
  const [controlRef, setControlRef] = useState('')
  const [severity, setSeverity] = useState<FindingSeverity>('medium')
  const valid = title.trim().length > 0 && frameworkId

  return (
    <>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 0.6 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.2 }}
        onClick={onClose}
        className="fixed inset-0 z-[70] bg-black"
      />
      <motion.aside
        initial={{ x: 480 }}
        animate={{ x: 0 }}
        exit={{ x: 480, transition: { duration: 0.18 } }}
        transition={{ duration: 0.24, ease: EASE }}
        className="fixed right-0 top-0 z-[71] flex h-full w-full max-w-[480px] flex-col border-l border-border-strong bg-bg-overlay shadow-popover"
      >
        <div className="flex items-center gap-2 border-b border-border px-5 py-4">
          <span className="font-mono text-[14px] tabular text-text-primary">{nextId}</span>
          <span className="font-mono text-[11px] uppercase tracking-[0.08em] text-text-muted">New finding</span>
          <div className="flex-1" />
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="rounded-md p-1.5 text-text-muted transition-colors duration-[120ms] hover:bg-bg-raised hover:text-text-primary"
          >
            <X className="size-4" />
          </button>
        </div>
        <div className="flex-1 space-y-4 overflow-y-auto px-5 py-4">
          <label className="block">
            <span className="mb-1 block font-mono text-[10px] uppercase tracking-[0.06em] text-text-muted">Title</span>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. MFA not enforced on remote access"
              className="w-full rounded-md border border-border bg-bg-surface px-3 py-2 text-[14px] text-text-primary placeholder:text-text-muted"
            />
          </label>
          <label className="block">
            <span className="mb-1 block font-mono text-[10px] uppercase tracking-[0.06em] text-text-muted">Description</span>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={4}
              placeholder="What was observed, where, and why it matters…"
              className="w-full resize-y rounded-md border border-border bg-bg-surface px-3 py-2 text-[13px] leading-5 text-text-primary placeholder:text-text-muted"
            />
          </label>
          <div className="grid grid-cols-2 gap-3">
            <label className="block">
              <span className="mb-1 block font-mono text-[10px] uppercase tracking-[0.06em] text-text-muted">Framework</span>
              <select
                value={frameworkId}
                onChange={(e) => setFrameworkId(e.target.value)}
                className="w-full rounded-md border border-border bg-bg-surface px-2.5 py-2 text-[13px] text-text-primary"
              >
                {frameworks.map((fw) => (
                  <option key={fw.id} value={fw.id}>
                    {fw.shortName}
                  </option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className="mb-1 block font-mono text-[10px] uppercase tracking-[0.06em] text-text-muted">Control ref</span>
              <input
                value={controlRef}
                onChange={(e) => setControlRef(e.target.value)}
                placeholder="A.8.5"
                className="w-full rounded-md border border-border bg-bg-surface px-3 py-2 font-mono text-[13px] text-text-primary placeholder:text-text-muted"
              />
            </label>
          </div>
          <div>
            <span className="mb-1 block font-mono text-[10px] uppercase tracking-[0.06em] text-text-muted">Severity</span>
            <div className="flex gap-2">
              {(['critical', 'high', 'medium', 'low'] as FindingSeverity[]).map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => setSeverity(s)}
                  className={clsx(
                    'rounded-full border px-3 py-1 font-mono text-[11px] uppercase tracking-[0.04em] transition-colors duration-[140ms]',
                    severity === s ? 'border-transparent' : 'border-border text-text-muted hover:text-text-secondary',
                  )}
                  style={
                    severity === s
                      ? { color: SEV_COLOR[s], backgroundColor: `color-mix(in srgb, ${SEV_COLOR[s]} 14%, transparent)` }
                      : undefined
                  }
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        </div>
        <div className="flex justify-end gap-2 border-t border-border px-5 py-3">
          <button
            type="button"
            onClick={onClose}
            className="rounded-md border border-border px-3 py-2 text-[12px] font-medium text-text-secondary hover:bg-bg-raised hover:text-text-primary"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={!valid}
            onClick={() => onSave({ title: title.trim(), description: description.trim(), frameworkId, controlRef: controlRef.trim() || '—', severity })}
            className="rounded-md bg-[var(--accent)] px-3.5 py-2 text-[12px] font-semibold text-bg-base transition-colors duration-[120ms] hover:bg-[var(--accent-strong)] active:scale-[0.97] disabled:opacity-40"
          >
            Create finding
          </button>
        </div>
      </motion.aside>
    </>
  )
}

/* ------------------------------ aging & trends ----------------------------- */

function AgingTrends({ rows, nowIso }: { rows: RegRow[]; nowIso: string }) {
  const anchor = new Date(nowIso).getTime()
  const aging = useMemo(() => {
    const buckets = [
      { bucket: '0–7D', critical: 0, high: 0, medium: 0, low: 0 },
      { bucket: '8–30D', critical: 0, high: 0, medium: 0, low: 0 },
      { bucket: '31–60D', critical: 0, high: 0, medium: 0, low: 0 },
      { bucket: '60+D', critical: 0, high: 0, medium: 0, low: 0 },
    ]
    for (const r of rows) {
      if (r.rem.status === 'closed') continue
      const age = Math.max(0, Math.floor((anchor - new Date(r.f.createdAt).getTime()) / 86400000))
      const b = age <= 7 ? buckets[0] : age <= 30 ? buckets[1] : age <= 60 ? buckets[2] : buckets[3]
      b[r.f.severity] += 1
    }
    return buckets
  }, [rows, anchor])

  const trend = useMemo(() => {
    const weeks: { week: string; opened: number; closed: number }[] = []
    for (let i = 5; i >= 0; i--) {
      const end = anchor - i * 7 * 86400000
      const start = end - 7 * 86400000
      const opened = rows.filter((r) => {
        const t = new Date(r.f.createdAt).getTime()
        return t > start && t <= end
      }).length
      const closed = rows.filter((r) => {
        if (r.rem.status !== 'closed') return false
        const closeOffset = 3 + Math.floor(rand01(hash32(r.f.id), 21) * 18)
        const closeT = new Date(r.f.createdAt).getTime() + closeOffset * 86400000
        return closeT > start && closeT <= end
      }).length
      weeks.push({ week: fmtDue(new Date(start).toISOString().slice(0, 10)), opened, closed })
    }
    return weeks
  }, [rows, anchor])

  const axisTick = { fill: 'var(--text-muted)', fontSize: 10, fontFamily: 'JetBrains Mono, monospace' }

  return (
    <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
      <section className="rounded-lg border border-border bg-bg-surface p-5">
        <div className="flex items-center gap-2">
          <Clock className="size-4 text-text-muted" />
          <h2 className="text-[16px] font-semibold leading-6 text-text-primary">Finding aging</h2>
        </div>
        <div className="mt-3 h-[220px]">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={aging} barCategoryGap="28%">
              <CartesianGrid stroke="rgba(34,43,51,0.6)" vertical={false} />
              <XAxis dataKey="bucket" tick={axisTick} axisLine={false} tickLine={false} />
              <YAxis allowDecimals={false} tick={axisTick} axisLine={false} tickLine={false} width={28} />
              <Tooltip content={<ChartTooltip />} cursor={{ fill: 'rgba(34,43,51,0.25)' }} />
              <Bar dataKey="critical" name="Critical" stackId="a" fill="var(--severity-critical)" isAnimationActive animationDuration={600} />
              <Bar dataKey="high" name="High" stackId="a" fill="var(--severity-high)" isAnimationActive animationDuration={600} />
              <Bar dataKey="medium" name="Medium" stackId="a" fill="var(--severity-medium)" isAnimationActive animationDuration={600} />
              <Bar dataKey="low" name="Low" stackId="a" fill="var(--severity-low)" isAnimationActive animationDuration={600} radius={[2, 2, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </section>

      <section className="rounded-lg border border-border bg-bg-surface p-5">
        <div className="flex items-center gap-2">
          <TrendingDown className="size-4 text-text-muted" />
          <h2 className="text-[16px] font-semibold leading-6 text-text-primary">Closure trend — 6 weeks</h2>
        </div>
        <div className="mt-3 h-[220px]">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={trend}>
              <CartesianGrid stroke="rgba(34,43,51,0.6)" vertical={false} />
              <XAxis dataKey="week" tick={axisTick} axisLine={false} tickLine={false} />
              <YAxis allowDecimals={false} tick={axisTick} axisLine={false} tickLine={false} width={28} />
              <Tooltip content={<ChartTooltip />} cursor={{ stroke: 'rgba(34,43,51,0.8)' }} />
              <Line type="monotone" dataKey="opened" name="Opened" stroke="#F87171" strokeWidth={2} dot={false} isAnimationActive animationDuration={900} />
              <Line type="monotone" dataKey="closed" name="Closed" stroke="#34D399" strokeWidth={2} dot={false} isAnimationActive animationDuration={900} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </section>
    </div>
  )
}

/* ---------------------------------- page ----------------------------------- */

export default function Findings() {
  const engagement = useAuditStore((s) => s.engagement)
  const remediationMap = useFindingsStore((s) => s.remediation)
  const custom = useFindingsStore((s) => s.custom)
  const updateRemediation = useFindingsStore((s) => s.updateRemediation)
  const bulkUpdateRemediation = useFindingsStore((s) => s.bulkUpdateRemediation)
  const addCustomFinding = useFindingsStore((s) => s.addCustomFinding)

  const frameworks = useMemo(
    () => FRAMEWORKS.filter((f) => engagement?.frameworks.includes(f.id) ?? true),
    [engagement],
  )

  // Effective answers: real engagement answers take precedence; thin data is
  // padded with a deterministic demo answer set so the analytics are usable.
  const { answers, demo } = useMemo(() => {
    const real = engagement?.answers ?? {}
    const realCount = Object.values(real).filter((a) => a.status).length
    if (realCount >= 30) return { answers: real, demo: false }
    const merged: Record<string, Answer> = { ...real }
    for (const fw of frameworks) {
      for (const q of allQuestions(fw.id)) {
        if (merged[q.id]?.status) continue
        const d = demoAnswer(q)
        if (d) merged[q.id] = d
      }
    }
    return { answers: merged, demo: true }
  }, [engagement, frameworks])

  // Auto-generate findings from partial / non-compliant answers + custom.
  const findings = useMemo(() => {
    const list: Omit<Finding, 'id'>[] = []
    for (const fw of frameworks) {
      for (const q of allQuestions(fw.id)) {
        const a = answers[q.id]
        if (a?.status === 'partial' || a?.status === 'noncompliant') {
          list.push(findingFromQuestion(q, fw, a, a.status))
        }
      }
    }
    list.sort(
      (x, y) =>
        SEV_RANK[x.severity] - SEV_RANK[y.severity] ||
        frameworks.findIndex((f) => f.id === x.frameworkId) - frameworks.findIndex((f) => f.id === y.frameworkId) ||
        x.controlRef.localeCompare(y.controlRef),
    )
    const numbered: Finding[] = list.map((f, i) => ({ ...f, id: `F-${String(i + 1).padStart(3, '0')}` }))
    const customs: Finding[] = custom.map((c) => ({
      ...c,
      questionId: null,
      likelihood: L_I[c.severity][0],
      impact: L_I[c.severity][1],
      ownerDefault: 'Control Owner',
      evidence: [],
      steps: ['Define remediation plan', 'Assign owner', 'Verify fix with evidence'],
      answerStatus: 'noncompliant',
      weight: 2,
    }))
    return [...numbered, ...customs]
  }, [frameworks, answers, custom])

  // Effective remediation per finding (defaults + auditor overrides).
  const rows: RegRow[] = useMemo(
    () =>
      findings.map((f) => ({
        f,
        rem: { ...defaultRemediation(f), ...remediationMap[f.id] } as Remediation,
      })),
    [findings, remediationMap],
  )

  // Audit timeline anchor — "today" is the most recent activity in the data.
  const nowIso = useMemo(
    () => rows.reduce((m, r) => (r.f.createdAt > m ? r.f.createdAt : m), new Date().toISOString()),
    [rows],
  )

  /* filters + sorting */
  const [sevSel, setSevSel] = useState<Set<FindingSeverity>>(new Set())
  const [statusSel, setStatusSel] = useState<Set<RemediationStatus>>(new Set())
  const [fwSel, setFwSel] = useState<Set<string>>(new Set())
  const [query, setQuery] = useState('')
  const [fwDropOpen, setFwDropOpen] = useState(false)
  const [sortKey, setSortKey] = useState<SortKey>('severity')
  const [dir, setDir] = useState<1 | -1>(1)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [openId, setOpenId] = useState<string | null>(null)
  const [newOpen, setNewOpen] = useState(false)
  const [reportFlash, setReportFlash] = useState<string | null>(null)

  const toggleSet = <T,>(set: Set<T>, v: T): Set<T> => {
    const next = new Set(set)
    if (next.has(v)) next.delete(v)
    else next.add(v)
    return next
  }

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    return rows.filter((r) => {
      if (sevSel.size > 0 && !sevSel.has(r.f.severity)) return false
      if (statusSel.size > 0 && !statusSel.has(r.rem.status)) return false
      if (fwSel.size > 0 && !fwSel.has(r.f.frameworkId)) return false
      if (q) {
        const hay = `${r.f.id} ${r.f.title} ${r.f.description} ${r.f.controlRef} ${r.f.frameworkShort} ${r.rem.owner}`.toLowerCase()
        if (!hay.includes(q)) return false
      }
      return true
    })
  }, [rows, sevSel, statusSel, fwSel, query])

  const sorted = useMemo(() => {
    const arr = [...filtered]
    const cmp = (a: RegRow, b: RegRow): number => {
      switch (sortKey) {
        case 'severity':
          return SEV_RANK[a.f.severity] - SEV_RANK[b.f.severity]
        case 'due':
          return a.rem.dueDate.localeCompare(b.rem.dueDate)
        case 'status':
          return a.rem.status.localeCompare(b.rem.status)
        default:
          return a.f.id.localeCompare(b.f.id)
      }
    }
    arr.sort((a, b) => cmp(a, b) * dir)
    return arr
  }, [filtered, sortKey, dir])

  const onSort = (k: SortKey) => {
    if (sortKey === k) setDir((d) => (d === 1 ? -1 : 1))
    else {
      setSortKey(k)
      setDir(1)
    }
  }

  /* overview derivations */
  const scoreRows: ScoreRow[] = useMemo(
    () =>
      frameworks.map((fw) => ({
        fw,
        score: weightedScore(allQuestions(fw.id), answers),
        delta: Math.round(rand01(hash32(fw.id), 7) * 8) - 3,
      })),
    [frameworks, answers],
  )

  const radarData = useMemo(() => {
    const acc = new Map<string, { earned: number; max: number }>()
    for (const fw of frameworks) {
      for (const p of fw.phases) {
        const axis = axisFor(fw, p.name)
        const cur = acc.get(axis) ?? { earned: 0, max: 0 }
        for (const q of p.questions) {
          const a = answers[q.id]
          if (!a?.status || a.status === 'na') continue
          cur.max += q.weight
          cur.earned += q.weight * (a.status === 'compliant' ? 1 : 0.5)
        }
        acc.set(axis, cur)
      }
    }
    return AXES.map((a) => a.label)
      .filter((l) => (acc.get(l)?.max ?? 0) > 0)
      .map((l) => ({ axis: l, current: Math.round((acc.get(l)!.earned / acc.get(l)!.max) * 100), target: 85 }))
  }, [frameworks, answers])

  const isOpen = (r: RegRow) => r.rem.status === 'open' || r.rem.status === 'in-remediation'
  const openRows = useMemo(() => rows.filter(isOpen), [rows])

  const sevRows: SevRow[] = useMemo(
    () =>
      frameworks.map((fw) => {
        const counts: Record<FindingSeverity, number> = { critical: 0, high: 0, medium: 0, low: 0 }
        const ids: Record<FindingSeverity, string[]> = { critical: [], high: [], medium: [], low: [] }
        for (const r of openRows) {
          if (r.f.frameworkId !== fw.id) continue
          counts[r.f.severity] += 1
          ids[r.f.severity].push(r.f.id)
        }
        return { fwShort: fw.shortName, counts, ids, total: counts.critical + counts.high + counts.medium + counts.low }
      }),
    [frameworks, openRows],
  )

  const sevCounts = useMemo(() => {
    const c: Record<FindingSeverity, number> = { critical: 0, high: 0, medium: 0, low: 0 }
    for (const r of rows) c[r.f.severity] += 1
    return c
  }, [rows])

  const statusCounts = useMemo(() => {
    const c: Record<RemediationStatus, number> = { open: 0, 'in-remediation': 0, accepted: 0, closed: 0 }
    for (const r of rows) c[r.rem.status] += 1
    return c
  }, [rows])

  /* bulk actions */
  const selectedIds = [...selected]
  const addSelectedToReport = () => {
    bulkUpdateRemediation(selectedIds, { inReport: true })
    setReportFlash(`${selectedIds.length} ADDED TO REPORT`)
    setTimeout(() => setReportFlash(null), 2400)
    setSelected(new Set())
  }
  const exportCsv = () => {
    const sel = rows.filter((r) => selected.has(r.f.id))
    const esc = (s: string) => `"${s.replace(/"/g, '""')}"`
    const csv = [
      'id,title,framework,control,severity,likelihood,impact,owner,status,due,description',
      ...sel.map((r) =>
        [r.f.id, esc(r.f.title), r.f.frameworkShort, r.f.controlRef, r.f.severity, r.f.likelihood, r.f.impact, esc(r.rem.owner), r.rem.status, r.rem.dueDate, esc(r.f.description)].join(','),
      ),
    ].join('\n')
    saveAs(new Blob([csv], { type: 'text/csv;charset=utf-8' }), 'auditos-findings-selection.csv')
    setSelected(new Set())
  }

  const openRow = openId ? rows.find((r) => r.f.id === openId) ?? null : null

  const addAllToReport = () => {
    bulkUpdateRemediation(filtered.map((r) => r.f.id), { inReport: true })
    setReportFlash(`${filtered.length} ADDED TO REPORT`)
    setTimeout(() => setReportFlash(null), 2400)
  }

  const newFindingId = `F-${String(100 + custom.length + 1).padStart(3, '0')}`

  const saveNewFinding = (data: { title: string; description: string; frameworkId: string; controlRef: string; severity: FindingSeverity }) => {
    const fw = getFramework(data.frameworkId)
    addCustomFinding({
      id: newFindingId,
      title: data.title,
      description: data.description || data.title,
      frameworkId: data.frameworkId,
      frameworkShort: fw?.shortName ?? data.frameworkId,
      controlRef: data.controlRef,
      severity: data.severity,
      createdAt: new Date().toISOString(),
    })
    setNewOpen(false)
  }

  return (
    <div>
      {/* Section 1 — header */}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.35, ease: EASE }}
            className="font-mono text-[11px] uppercase leading-4 tracking-[0.08em] text-text-muted"
          >
            Workspace
          </motion.div>
          <motion.h1
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.35, ease: EASE, delay: 0.06 }}
            className="mt-1.5 font-display text-[30px] font-semibold leading-[38px] tracking-[-0.02em] text-text-primary"
          >
            Findings &amp; Scoring
          </motion.h1>
          <motion.p
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.35, ease: EASE, delay: 0.12 }}
            className="mt-2 max-w-2xl text-[14px] leading-[22px] text-text-secondary"
          >
            {openRows.length} open findings across {frameworks.length} frameworks — weighted by control
            criticality.
            {demo && (
              <span className="ml-2 font-mono text-[11px] uppercase tracking-[0.04em] text-text-muted">
                · Demo answer data until fieldwork lands
              </span>
            )}
          </motion.p>
        </div>
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.2, delay: 0.18 }}
          className="flex items-center gap-2"
        >
          <AnimatePresence>
            {reportFlash && (
              <motion.span
                initial={{ opacity: 0, x: -8 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0 }}
                className="flex items-center gap-1.5 font-mono text-[11px] uppercase tracking-[0.04em] text-[var(--accent)]"
              >
                <Check className="size-3.5" />
                {reportFlash}
              </motion.span>
            )}
          </AnimatePresence>
          <button
            type="button"
            onClick={addAllToReport}
            disabled={filtered.length === 0}
            className="rounded-md border border-border px-3 py-1.5 text-[12px] font-medium text-text-secondary transition-colors duration-[120ms] hover:border-border-strong hover:bg-bg-raised hover:text-text-primary disabled:opacity-40"
          >
            Add all to report
          </button>
          <button
            type="button"
            onClick={() => setNewOpen(true)}
            className="flex items-center gap-1.5 rounded-md bg-[var(--accent)] px-3 py-1.5 text-[12px] font-semibold text-bg-base transition-colors duration-[120ms] hover:bg-[var(--accent-strong)] active:scale-[0.97]"
          >
            <Plus className="size-3.5" />
            New finding
          </button>
        </motion.div>
      </div>

      {findings.length === 0 ? (
        /* empty state */
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.35, ease: EASE }}
          className="mt-8 flex flex-col items-center rounded-lg border border-dashed border-border-strong bg-bg-surface px-8 py-14 text-center"
        >
          <img src="/empty-findings.svg" alt="" className="w-60 opacity-90" />
          <h2 className="mt-5 font-display text-[18px] font-semibold text-text-primary">
            No findings yet — keep auditing
          </h2>
          <p className="mt-2 max-w-md text-[13px] leading-5 text-text-secondary">
            Findings are generated automatically when controls are marked Partial or Non-Compliant in the
            Guided Audit or during interview sessions.
          </p>
          <Link
            to="/audit/iso27001"
            className="mt-5 flex items-center gap-1.5 rounded-md bg-[var(--accent)] px-3.5 py-2 text-[12px] font-semibold text-bg-base transition-colors duration-[120ms] hover:bg-[var(--accent-strong)]"
          >
            Open guided audit <ArrowRight className="size-3.5" />
          </Link>
        </motion.div>
      ) : (
        <>
          {/* filter toolbar */}
          <div className="sticky top-0 z-20 -mx-6 mt-5 border-y border-border bg-bg-base px-6 py-3 [@media(min-width:1600px)]:-mx-8 [@media(min-width:1600px)]:px-8">
            <div className="flex flex-wrap items-center gap-2">
              {(['critical', 'high', 'medium', 'low'] as FindingSeverity[]).map((s) => (
                <FilterChip key={s} active={sevSel.has(s)} color={SEV_COLOR[s]} onClick={() => setSevSel(toggleSet(sevSel, s))}>
                  {s} {sevCounts[s]}
                </FilterChip>
              ))}
              <div className="h-4 w-px bg-border" />
              {/* framework multi-select */}
              <div className="relative">
                <button
                  type="button"
                  onClick={() => setFwDropOpen((o) => !o)}
                  className={clsx(
                    'flex items-center gap-1.5 rounded-full border px-2.5 py-1 font-mono text-[11px] uppercase tracking-[0.04em] transition-colors duration-[140ms]',
                    fwSel.size > 0
                      ? 'border-transparent bg-accent-dim font-semibold text-[var(--accent)]'
                      : 'border-border text-text-muted hover:border-border-strong hover:text-text-secondary',
                  )}
                >
                  Frameworks {fwSel.size > 0 ? fwSel.size : 'ALL'}
                  <ChevronDown className={clsx('size-3 transition-transform duration-[160ms]', fwDropOpen && 'rotate-180')} />
                </button>
                {fwDropOpen && (
                  <>
                    <div className="fixed inset-0 z-10" onClick={() => setFwDropOpen(false)} />
                    <div className="absolute left-0 top-full z-20 mt-1.5 w-52 rounded-[10px] border border-border-strong bg-bg-overlay p-1.5 shadow-popover">
                      {frameworks.map((fw) => (
                        <label
                          key={fw.id}
                          className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-[12px] text-text-secondary transition-colors duration-[120ms] hover:bg-bg-raised hover:text-text-primary"
                        >
                          <input
                            type="checkbox"
                            checked={fwSel.has(fw.id)}
                            onChange={() => setFwSel(toggleSet(fwSel, fw.id))}
                            className="size-3.5 accent-[#34D399]"
                          />
                          {fw.shortName}
                        </label>
                      ))}
                    </div>
                  </>
                )}
              </div>
              <div className="h-4 w-px bg-border" />
              {(['open', 'in-remediation', 'accepted', 'closed'] as RemediationStatus[]).map((s) => (
                <FilterChip key={s} active={statusSel.has(s)} onClick={() => setStatusSel(toggleSet(statusSel, s))}>
                  {REM_STATUS[s].label} {statusCounts[s]}
                </FilterChip>
              ))}
              <div className="flex-1" />
              <span className="relative">
                <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-text-muted" />
                <input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search findings…"
                  className="w-52 rounded-md border border-border bg-bg-surface py-1.5 pl-8 pr-3 text-[12px] text-text-primary placeholder:text-text-muted focus:border-border-strong focus:outline-none"
                />
              </span>
            </div>
          </div>

          {/* all-closed banner */}
          {rows.length > 0 && openRows.length === 0 && (
            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              className="mt-4 flex items-center gap-3 rounded-lg border border-[var(--accent)] bg-accent-dim px-4 py-3"
            >
              <Check className="size-4 text-[var(--accent)]" />
              <span className="font-mono text-[11px] uppercase tracking-[0.06em] text-[var(--accent)]">
                All findings closed — ready for final report
              </span>
              <Link to="/reports" className="ml-auto flex items-center gap-1 text-[12px] font-medium text-[var(--accent)] hover:text-[var(--accent-strong)]">
                Build report <ArrowRight className="size-3.5" />
              </Link>
            </motion.div>
          )}

          {/* Section 2 — score overview */}
          <div className="mt-4 grid grid-cols-1 gap-4 xl:grid-cols-3">
            <FrameworkScoresPanel rows={scoreRows} />
            <DomainRadarPanel data={radarData} />
            <SeverityDistPanel rows={sevRows} openTotal={openRows.length} />
          </div>

          {/* Section 3 — register */}
          <div className="mt-6">
            <div className="mb-3 flex items-center gap-2">
              <AlertTriangle className="size-4 text-text-muted" />
              <h2 className="text-[16px] font-semibold leading-6 text-text-primary">Findings register</h2>
              <span className="font-mono text-[11px] tabular text-text-muted">
                {filtered.length} OF {rows.length}
              </span>
            </div>

            <AnimatePresence>
              {selected.size > 0 && (
                <BulkBar
                  count={selected.size}
                  onAddToReport={addSelectedToReport}
                  onSetStatus={(s) => {
                    bulkUpdateRemediation(selectedIds, { status: s })
                    setSelected(new Set())
                  }}
                  onAssignOwner={(owner) => {
                    bulkUpdateRemediation(selectedIds, { owner })
                    setSelected(new Set())
                  }}
                  onExport={exportCsv}
                  onClear={() => setSelected(new Set())}
                />
              )}
            </AnimatePresence>

            {sorted.length === 0 ? (
              <div className="flex flex-col items-center rounded-lg border border-dashed border-border-strong bg-bg-surface px-8 py-12 text-center">
                <img src="/empty-search.svg" alt="" className="w-52 opacity-90" />
                <p className="mt-4 text-[14px] font-medium text-text-primary">No findings match these filters</p>
                <button
                  type="button"
                  onClick={() => {
                    setSevSel(new Set())
                    setStatusSel(new Set())
                    setFwSel(new Set())
                    setQuery('')
                  }}
                  className="mt-3 rounded-md border border-border px-3 py-1.5 text-[12px] font-medium text-text-secondary hover:bg-bg-raised hover:text-text-primary"
                >
                  Clear filters
                </button>
              </div>
            ) : (
              <Register
                rows={sorted}
                selected={selected}
                onToggleSelect={(id) => setSelected(toggleSet(selected, id))}
                onToggleAll={() =>
                  setSelected((sel) => (sorted.every((r) => sel.has(r.f.id)) ? new Set() : new Set(sorted.map((r) => r.f.id))))
                }
                onOpen={(r) => setOpenId(r.f.id)}
                sortKey={sortKey}
                dir={dir}
                onSort={onSort}
                nowIso={nowIso}
              />
            )}
          </div>

          {/* Section 5 — aging & trends */}
          <div className="mt-6">
            <AgingTrends rows={rows} nowIso={nowIso} />
          </div>
        </>
      )}

      {/* drawers */}
      <AnimatePresence>
        {openRow && (
          <FindingDrawer
            key={openRow.f.id}
            row={openRow}
            onPatch={(patch) => updateRemediation(openRow.f.id, patch)}
            onClose={() => setOpenId(null)}
          />
        )}
      </AnimatePresence>
      <AnimatePresence>
        {newOpen && (
          <NewFindingDrawer frameworks={frameworks} nextId={newFindingId} onSave={saveNewFinding} onClose={() => setNewOpen(false)} />
        )}
      </AnimatePresence>
    </div>
  )
}
