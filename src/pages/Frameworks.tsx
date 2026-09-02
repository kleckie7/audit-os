import { useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router'
import { AnimatePresence, motion } from 'framer-motion'
import type { LucideIcon } from 'lucide-react'
import {
  Bot,
  ChevronDown,
  CreditCard,
  Crosshair,
  Globe,
  Grid3x3,
  HeartPulse,
  Hexagon,
  Layers,
  Lock,
  Search,
  ShieldCheck,
  ShieldHalf,
  Triangle,
} from 'lucide-react'
import clsx from 'clsx'
import StatusPill from '@/components/StatusPill'
import ProgressRing from '@/components/ProgressRing'
import { Abbr } from '@/components/TermTip'
import { hasTerm } from '@/lib/glossary'
import { useAuditStore } from '@/lib/store'
import { FRAMEWORKS } from '@/data/frameworks'
import type { Answer, Framework, Phase } from '@/lib/types'

// Framework Library (/frameworks) — design/frameworks.md.
// Data-driven cards from src/data/frameworks (9 real datasets) + 3 static
// "overview only" reference cards (CIS v8, GDPR, HIPAA) to match the design's
// 12-framework catalog.

const EASE: [number, number, number, number] = [0.22, 1, 0.36, 1]

type Category = Framework['category']
type CategoryFilter = 'all' | Category
type SortKey = 'relevance' | 'questions' | 'progress'
type AssessmentType = 'CERTIFIABLE' | 'SELF-ATTEST' | 'REGULATORY' | 'REFERENCE'

const CATEGORY_LABEL: Record<CategoryFilter, string> = {
  all: 'ALL',
  security: 'SECURITY',
  governance: 'GOVERNANCE',
  privacy: 'PRIVACY',
  threat: 'THREAT',
}

const ASSESSMENT_COLORS: Record<AssessmentType, string> = {
  CERTIFIABLE: 'var(--accent)',
  'SELF-ATTEST': 'var(--status-partial)',
  REGULATORY: 'var(--status-noncompliant)',
  REFERENCE: 'var(--status-na)',
}

interface FrameworkMeta {
  icon: LucideIcon
  issuer: string
  assessmentType: AssessmentType
  crosswalks: string[]
}

const META: Record<string, FrameworkMeta> = {
  iso27001: {
    icon: ShieldCheck,
    issuer: 'ISO/IEC',
    assessmentType: 'CERTIFIABLE',
    crosswalks: ['SOC 2', 'NIST', 'PCI DSS'],
  },
  iso42001: {
    icon: Bot,
    issuer: 'ISO/IEC',
    assessmentType: 'CERTIFIABLE',
    crosswalks: ['NIST', 'ISO', 'AIMS'],
  },
  'nist-csf': {
    icon: Hexagon,
    issuer: 'NIST',
    assessmentType: 'SELF-ATTEST',
    crosswalks: ['ISO', 'SOC 2', 'NIST'],
  },
  'nist-800-53': {
    icon: Layers,
    issuer: 'NIST',
    assessmentType: 'REGULATORY',
    crosswalks: ['CSF', 'ISO', 'FedRAMP'],
  },
  coso: {
    icon: Triangle,
    issuer: 'COSO',
    assessmentType: 'SELF-ATTEST',
    crosswalks: ['SOX', 'COBIT', 'SOC 2'],
  },
  cobit: {
    icon: Grid3x3,
    issuer: 'ISACA',
    assessmentType: 'SELF-ATTEST',
    crosswalks: ['COSO', 'ISO', 'ITIL'],
  },
  'mitre-attack': {
    icon: Crosshair,
    issuer: 'MITRE Corporation',
    assessmentType: 'REFERENCE',
    crosswalks: ['CSF', 'CVE', 'NIST'],
  },
  soc2: {
    icon: Lock,
    issuer: 'AICPA',
    assessmentType: 'CERTIFIABLE',
    crosswalks: ['ISO', 'TSC', 'PCI DSS'],
  },
  'pci-dss': {
    icon: CreditCard,
    issuer: 'PCI SSC',
    assessmentType: 'REGULATORY',
    crosswalks: ['ISO', 'SOC 2', 'NIST'],
  },
}

interface ReferenceFramework {
  id: string
  name: string
  shortName: string
  version: string
  issuer: string
  category: Category
  description: string
  statsLine: string
  assessmentType: AssessmentType
  icon: LucideIcon
  crosswalks: string[]
}

// Design catalog entries without full question datasets — overview only.
const REFERENCE_FRAMEWORKS: ReferenceFramework[] = [
  {
    id: 'cis-v8',
    name: 'CIS Critical Security Controls v8',
    shortName: 'CIS Controls v8',
    version: 'v8.1',
    issuer: 'Center for Internet Security',
    category: 'security',
    description:
      'Eighteen prioritized controls with 153 safeguards, organized into three implementation groups (IG1–IG3) for prescriptive, action-oriented cyber defense.',
    statsLine: '18 CONTROLS · 153 SAFEGUARDS · 3 IMPLEMENTATION GROUPS',
    assessmentType: 'SELF-ATTEST',
    icon: ShieldHalf,
    crosswalks: ['CSF', 'ISO', 'SOC 2'],
  },
  {
    id: 'gdpr',
    name: 'EU General Data Protection Regulation',
    shortName: 'GDPR',
    version: 'Reg. (EU) 2016/679',
    issuer: 'European Union',
    category: 'privacy',
    description:
      'Key audit articles mapped to review points: Art. 5 principles, Art. 25 data protection by design, Art. 30 records of processing, Art. 32 security, Art. 33 breach notification, Art. 35 DPIA.',
    statsLine: '99 ARTICLES · 6 KEY AUDIT ARTICLES · ART. 5 · 25 · 30 · 32 · 33 · 35',
    assessmentType: 'REGULATORY',
    icon: Globe,
    crosswalks: ['DPIA', 'RoPA', 'DPO'],
  },
  {
    id: 'hipaa',
    name: 'HIPAA Security Rule',
    shortName: 'HIPAA',
    version: '45 CFR §164.308–316',
    issuer: 'US HHS / OCR',
    category: 'privacy',
    description:
      'Administrative, physical and technical safeguards for electronic protected health information (ePHI), spanning §164.308 through §164.316 with required and addressable implementation specs.',
    statsLine: '3 SAFEGUARD FAMILIES · §164.308–316 · REQUIRED + ADDRESSABLE SPECS',
    assessmentType: 'REGULATORY',
    icon: HeartPulse,
    crosswalks: ['PHI', 'ISO', 'NIST'],
  },
]

/* ---------------------------------- helpers --------------------------------- */

interface Counts {
  compliant: number
  partial: number
  noncompliant: number
  na: number
  unanswered: number
  total: number
}

function emptyCounts(total: number): Counts {
  return { compliant: 0, partial: 0, noncompliant: 0, na: 0, unanswered: total, total }
}

function countPhase(phase: Phase, answers: Record<string, Answer>): Counts {
  const counts = emptyCounts(phase.questions.length)
  for (const q of phase.questions) {
    const a = answers[q.id]
    if (!a || a.status === null) continue
    counts.unanswered -= 1
    counts[a.status] += 1
  }
  return counts
}

function countFramework(fw: Framework, answers: Record<string, Answer>): Counts {
  const total = fw.phases.reduce((n, p) => n + p.questions.length, 0)
  const acc = emptyCounts(total)
  for (const p of fw.phases) {
    const c = countPhase(p, answers)
    acc.compliant += c.compliant
    acc.partial += c.partial
    acc.noncompliant += c.noncompliant
    acc.na += c.na
  }
  acc.unanswered = total - (acc.compliant + acc.partial + acc.noncompliant + acc.na)
  return acc
}

function answeredPct(c: Counts): number {
  return c.total === 0 ? 0 : Math.round(((c.total - c.unanswered) / c.total) * 100)
}

/** Estimated fieldwork effort: ~10 min per guided question. */
function estHours(questions: number): number {
  return Math.max(2, Math.round((questions * 10) / 60))
}

function worstStatus(c: Counts): { status: 'compliant' | 'partial' | 'noncompliant' | 'na'; label?: string } {
  if (c.noncompliant > 0) return { status: 'noncompliant' }
  if (c.partial > 0) return { status: 'partial' }
  if (c.unanswered === c.total) return { status: 'na', label: 'NOT STARTED' }
  if (c.unanswered > 0) return { status: 'partial', label: 'IN PROGRESS' }
  return { status: 'compliant' }
}

function relativeActivity(iso: string | null): string {
  if (!iso) return 'NO ACTIVITY'
  const mins = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000))
  if (mins < 60) return `${mins}M AGO`
  const hours = Math.round(mins / 60)
  if (hours < 24) return `${hours}H AGO`
  return `${Math.round(hours / 24)}D AGO`
}

function phaseLabel(phase: Phase, index: number): { code: string; name: string } {
  const stripped = phase.name.replace(/^Phase\s+\d+\s*[—–-]\s*/i, '')
  return { code: `PH-${index + 1}`, name: stripped }
}

function roleCount(fw: Framework): number {
  const roles = new Set<string>()
  for (const p of fw.phases) for (const q of p.questions) for (const r of q.interviewees) roles.add(r)
  return roles.size
}

function lastActivity(fw: Framework, answers: Record<string, Answer>): string | null {
  let latest: string | null = null
  for (const p of fw.phases)
    for (const q of p.questions) {
      const a = answers[q.id]
      if (a && (!latest || a.updatedAt > latest)) latest = a.updatedAt
    }
  return latest
}

/** Render through TermTip's <Abbr> only when the glossary knows the term. */
function MaybeAbbr({
  term,
  children,
  className,
}: {
  term: string
  children?: React.ReactNode
  className?: string
}) {
  if (!hasTerm(term)) return <span className={className}>{children ?? term}</span>
  return (
    <Abbr term={term} className={className}>
      {children}
    </Abbr>
  )
}

function useDebounced<T>(value: T, delay = 150): T {
  const [v, setV] = useState(value)
  useEffect(() => {
    const t = setTimeout(() => setV(value), delay)
    return () => clearTimeout(t)
  }, [value, delay])
  return v
}

/* ------------------------------- stacked bar -------------------------------- */

function StackedBar({ counts, className }: { counts: Counts; className?: string }) {
  const pct = (n: number) => (counts.total === 0 ? 0 : (n / counts.total) * 100)
  return (
    <div
      className={clsx('flex h-1.5 w-full overflow-hidden rounded-full bg-bg-raised', className)}
      role="img"
      aria-label={`${answeredPct(counts)}% assessed`}
    >
      <div className="h-full bg-[var(--status-compliant)]" style={{ width: `${pct(counts.compliant)}%` }} />
      <div className="h-full bg-[var(--status-partial)]" style={{ width: `${pct(counts.partial)}%` }} />
      <div className="h-full bg-[var(--status-noncompliant)]" style={{ width: `${pct(counts.noncompliant)}%` }} />
      <div className="h-full bg-[var(--status-na)]" style={{ width: `${pct(counts.na)}%` }} />
    </div>
  )
}

/* ------------------------------ reference card ------------------------------ */

function ReferenceCard({ fw, index }: { fw: ReferenceFramework; index: number }) {
  const Icon = fw.icon
  return (
    <motion.article
      id={`fw-card-${fw.id}`}
      initial={{ opacity: 0, y: 16 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: '-40px' }}
      transition={{ duration: 0.4, ease: EASE, delay: Math.min(index, 6) * 0.06 }}
      className="relative rounded-lg border border-border bg-bg-surface p-6 opacity-70"
    >
      <span className="absolute right-4 top-4 rounded-full border border-border-strong bg-bg-raised px-2 py-0.5 font-mono text-[10px] font-medium uppercase leading-4 tracking-[0.08em] text-text-muted">
        Overview only
      </span>
      <div className="flex gap-6">
        {/* identity */}
        <div className="w-[300px] shrink-0">
          <div className="flex items-center gap-3">
            <span className="flex size-12 items-center justify-center rounded-md border border-border bg-bg-raised">
              <Icon className="size-5 text-text-muted" />
            </span>
            <div>
              <h2 className="font-display text-[20px] font-semibold leading-[26px] tracking-[-0.01em] text-text-secondary">
                <MaybeAbbr term={fw.shortName}>{fw.shortName}</MaybeAbbr>
              </h2>
              <div className="mt-0.5 font-mono text-[11px] uppercase leading-4 tracking-[0.02em] text-text-muted">
                {fw.issuer} · {fw.version}
              </div>
            </div>
          </div>
          <div className="mt-3 flex flex-wrap gap-1.5">
            <span className="rounded-full bg-bg-raised px-2 py-0.5 font-mono text-[10px] font-medium uppercase leading-4 tracking-[0.08em] text-text-muted">
              {CATEGORY_LABEL[fw.category]}
            </span>
          </div>
        </div>

        <div className="w-px shrink-0 bg-border" />

        {/* description */}
        <div className="min-w-0 flex-1">
          <p className="text-[14px] leading-[22px] text-text-secondary">{fw.description}</p>
          <div className="mt-3 font-mono text-[12px] leading-4 tracking-[0.02em] text-text-muted">
            {fw.statsLine}
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-1.5">
            <span className="font-mono text-[10px] uppercase leading-4 tracking-[0.08em] text-text-muted">
              Maps to:
            </span>
            {fw.crosswalks.map((c) => (
              <span
                key={c}
                className="rounded-full border border-border px-2 py-0.5 font-mono text-[11px] leading-4 text-text-muted"
              >
                <MaybeAbbr term={c}>{c}</MaybeAbbr>
              </span>
            ))}
          </div>
        </div>

        <div className="w-px shrink-0 bg-border" />

        {/* actions */}
        <div className="flex w-[200px] shrink-0 flex-col items-stretch justify-center gap-2.5">
          <button
            type="button"
            disabled
            className="cursor-not-allowed rounded-md border border-border px-3 py-2 text-[13px] font-medium text-text-muted"
          >
            Not launchable
          </button>
          <span className="text-center font-mono text-[10px] uppercase leading-4 tracking-[0.08em] text-text-muted">
            Reference dataset pending
          </span>
        </div>
      </div>
    </motion.article>
  )
}

/* ------------------------------ framework card ------------------------------ */

function FrameworkCard({
  fw,
  index,
  answers,
  expanded,
  onToggle,
  flash,
}: {
  fw: Framework
  index: number
  answers: Record<string, Answer>
  expanded: boolean
  onToggle: () => void
  flash: boolean
}) {
  const meta = META[fw.id]
  const counts = useMemo(() => countFramework(fw, answers), [fw, answers])
  const pct = answeredPct(counts)
  const questions = counts.total
  const roles = useMemo(() => roleCount(fw), [fw])
  const hours = estHours(questions)
  const activity = relativeActivity(lastActivity(fw, answers))
  const Icon = meta?.icon ?? Layers

  const cta =
    pct === 100 ? 'Review answers' : pct > 0 ? 'Resume audit' : 'Start guided audit'

  return (
    <motion.article
      id={`fw-card-${fw.id}`}
      layout="position"
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: EASE, delay: Math.min(index, 6) * 0.06 }}
      className={clsx(
        'rounded-lg border bg-bg-surface transition-colors duration-[160ms]',
        flash
          ? 'border-[var(--accent)] shadow-[inset_0_0_0_1px_var(--accent)]'
          : 'border-border hover:border-border-strong',
      )}
    >
      <div className="flex gap-6 p-6">
        {/* identity column */}
        <div className="w-[300px] shrink-0">
          <div className="flex items-center gap-3">
            <span className="flex size-12 items-center justify-center rounded-md border border-border bg-accent-dim transition-colors duration-[160ms]">
              <Icon className="size-5 text-[var(--accent)]" />
            </span>
            <div className="min-w-0">
              <h2 className="font-display text-[20px] font-semibold leading-[26px] tracking-[-0.01em] text-text-primary">
                <MaybeAbbr term={fw.shortName}>{fw.shortName}</MaybeAbbr>
              </h2>
              <div className="mt-0.5 font-mono text-[11px] uppercase leading-4 tracking-[0.02em] text-text-muted">
                {meta?.issuer ?? '—'} · {fw.version}
              </div>
            </div>
          </div>
          <div className="mt-2 text-[12px] leading-[18px] text-text-muted">{fw.name}</div>
          <div className="mt-3 flex flex-wrap gap-1.5">
            <span className="rounded-full bg-accent-dim px-2 py-0.5 font-mono text-[10px] font-medium uppercase leading-4 tracking-[0.08em] text-[var(--accent)]">
              {CATEGORY_LABEL[fw.category]}
            </span>
            {pct === 100 && <StatusPill status="compliant" label="COMPLETE" />}
          </div>
        </div>

        <div className="w-px shrink-0 bg-border" />

        {/* stats column */}
        <div className="min-w-0 flex-1">
          <p className="line-clamp-3 text-[14px] leading-[22px] text-text-secondary">
            {fw.description}
          </p>
          <div className="mt-3 font-mono text-[12px] leading-4 tracking-[0.02em] text-text-primary">
            {questions} QUESTIONS · {fw.phases.length} PHASES · {roles} ROLES · ~{hours} HRS
          </div>

          {/* per-phase mini bars */}
          <div className="mt-4 flex items-end gap-3">
            {fw.phases.map((p, i) => {
              const pc = countPhase(p, answers)
              const { code } = phaseLabel(p, i)
              return (
                <div key={p.id} className="min-w-0 flex-1" title={`${p.name} — ${answeredPct(pc)}% assessed`}>
                  <StackedBar counts={pc} />
                  <div className="mt-1 truncate font-mono text-[10px] leading-4 tracking-[0.04em] text-text-muted">
                    {code} · {pc.total}
                  </div>
                </div>
              )
            })}
          </div>

          {/* crosswalks */}
          {meta && (
            <div className="mt-4 flex flex-wrap items-center gap-1.5">
              <span className="font-mono text-[10px] uppercase leading-4 tracking-[0.08em] text-text-muted">
                Maps to:
              </span>
              {meta.crosswalks.map((c) => (
                <span
                  key={c}
                  className="rounded-full border border-border px-2 py-0.5 font-mono text-[11px] leading-4 text-text-secondary"
                >
                  <MaybeAbbr term={c}>{c}</MaybeAbbr>
                </span>
              ))}
            </div>
          )}
        </div>

        <div className="w-px shrink-0 bg-border" />

        {/* actions column */}
        <div className="flex w-[200px] shrink-0 flex-col items-stretch gap-2.5">
          <div className="flex items-center justify-center">
            <ProgressRing value={pct} size={40} />
          </div>
          <Link
            to={`/audit/${fw.id}`}
            className={clsx(
              'rounded-md px-3 py-2 text-center text-[13px] font-medium transition-all duration-[120ms] active:scale-[0.97]',
              pct > 0
                ? 'bg-[var(--accent)] text-[#0A0D10] hover:bg-[var(--accent-strong)]'
                : 'border border-[var(--accent)] text-[var(--accent)] hover:bg-accent-dim',
            )}
          >
            {cta}
          </Link>
          <button
            type="button"
            onClick={onToggle}
            aria-expanded={expanded}
            className="flex items-center justify-center gap-1.5 rounded-md border border-border px-3 py-2 text-[13px] text-text-secondary transition-colors duration-[120ms] hover:border-border-strong hover:bg-bg-raised hover:text-text-primary"
          >
            View structure
            <ChevronDown
              className={clsx('size-3.5 transition-transform duration-[160ms]', expanded && 'rotate-180')}
            />
          </button>
          <span className="text-center font-mono text-[10px] uppercase leading-4 tracking-[0.08em] text-text-muted">
            Last activity {activity}
          </span>
        </div>
      </div>

      {/* domain structure accordion */}
      <AnimatePresence initial={false}>
        {expanded && (
          <motion.div
            key="structure"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.26, ease: 'easeInOut' }}
            className="overflow-hidden border-t border-border"
          >
            <div className="grid grid-cols-1 gap-2 p-6 lg:grid-cols-2">
              {fw.phases.map((p, i) => (
                <PhaseRow key={p.id} fw={fw} phase={p} index={i} answers={answers} />
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.article>
  )
}

/* -------------------------------- phase row --------------------------------- */

function PhaseRow({
  fw,
  phase,
  index,
  answers,
}: {
  fw: Framework
  phase: Phase
  index: number
  answers: Record<string, Answer>
}) {
  const [showRefs, setShowRefs] = useState(false)
  const counts = countPhase(phase, answers)
  const { code, name } = phaseLabel(phase, index)
  const worst = worstStatus(counts)

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.24, delay: index * 0.025 }}
      className="rounded-md border border-border bg-bg-base p-3"
    >
      <div className="flex items-center gap-3">
        <span className="w-10 shrink-0 font-mono text-[12px] font-medium leading-4 tracking-[0.02em] text-[var(--accent)]">
          {code}
        </span>
        <div className="min-w-0 flex-1">
          <div className="truncate text-[13px] font-medium leading-[18px] text-text-primary" title={name}>
            {name}
          </div>
          <div className="mt-1 flex items-center gap-2">
            <StackedBar counts={counts} className="max-w-32" />
            <span className="shrink-0 font-mono text-[11px] leading-4 tabular text-text-muted">
              {phase.questions.length} Q · {answeredPct(counts)}%
            </span>
          </div>
        </div>
        <StatusPill status={worst.status} label={worst.label} />
        <button
          type="button"
          onClick={() => setShowRefs((v) => !v)}
          aria-expanded={showRefs}
          className="shrink-0 rounded border border-border px-1.5 py-0.5 font-mono text-[10px] uppercase leading-4 tracking-[0.04em] text-text-muted transition-colors duration-[120ms] hover:border-border-strong hover:text-text-secondary"
        >
          Refs
        </button>
        <Link
          to={`/audit/${fw.id}`}
          aria-label={`Open ${fw.shortName} audit at ${code}`}
          className="shrink-0 rounded p-1 text-text-muted transition-colors duration-[120ms] hover:bg-bg-raised hover:text-[var(--accent)]"
        >
          <ChevronDown className="size-4 -rotate-90" />
        </Link>
      </div>

      <AnimatePresence initial={false}>
        {showRefs && (
          <motion.div
            key="refs"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2, ease: 'easeInOut' }}
            className="overflow-hidden"
          >
            <div className="slim-scroll mt-2 max-h-28 overflow-y-auto border-t border-border pt-2">
              <ul className="space-y-1">
                {phase.questions.map((q) => (
                  <li
                    key={q.id}
                    className="truncate font-mono text-[11px] leading-4 tracking-[0.02em] text-text-secondary"
                    title={q.controlRef}
                  >
                    <span className="text-text-muted">{q.id}</span> — {q.controlRef}
                  </li>
                ))}
              </ul>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  )
}

/* ----------------------------- comparison table ----------------------------- */

interface TableRow {
  id: string
  name: string
  shortName: string
  issuer: string
  version: string
  controls: number
  controlsLabel: string
  domains: number
  domainsLabel: string
  hours: number
  type: AssessmentType
  progress: number | null
  reference: boolean
}

type TableSortKey = 'name' | 'issuer' | 'controls' | 'domains' | 'hours' | 'type' | 'progress'

function CompareTable({
  rows,
  onJump,
}: {
  rows: TableRow[]
  onJump: (id: string) => void
}) {
  const [sort, setSort] = useState<{ key: TableSortKey; dir: 1 | -1 }>({ key: 'controls', dir: -1 })

  const sorted = useMemo(() => {
    const copy = [...rows]
    copy.sort((a, b) => {
      const av = a[sort.key]
      const bv = b[sort.key]
      if (av == null && bv == null) return 0
      if (av == null) return 1
      if (bv == null) return -1
      if (typeof av === 'number' && typeof bv === 'number') return (av - bv) * sort.dir
      return String(av).localeCompare(String(bv)) * sort.dir
    })
    return copy
  }, [rows, sort])

  const header = (key: TableSortKey, label: string, align: 'left' | 'right' = 'left') => (
    <th
      key={key}
      className={clsx(
        'h-12 select-none px-3 font-mono text-[11px] font-medium uppercase leading-4 tracking-[0.08em] text-text-muted',
        align === 'right' ? 'text-right' : 'text-left',
      )}
    >
      <button
        type="button"
        onClick={() =>
          setSort((s) => ({ key, dir: s.key === key && s.dir === 1 ? -1 : 1 }))
        }
        className={clsx(
          'inline-flex items-center gap-1 transition-colors duration-[120ms] hover:text-text-secondary',
          sort.key === key && 'text-[var(--accent)]',
        )}
      >
        {label}
        <ChevronDown
          className={clsx(
            'size-3 transition-transform duration-[160ms]',
            sort.key === key && sort.dir === 1 && 'rotate-180',
            sort.key !== key && 'opacity-40',
          )}
        />
      </button>
    </th>
  )

  return (
    <motion.section
      initial={{ opacity: 0, y: 12 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: '-80px' }}
      transition={{ duration: 0.3, ease: EASE }}
      className="mt-8 rounded-lg border border-border bg-bg-surface"
    >
      <div className="flex items-center justify-between border-b border-border px-4 py-3">
        <h2 className="text-[16px] font-semibold leading-6 text-text-primary">Compare frameworks</h2>
        <span className="font-mono text-[11px] uppercase leading-4 tracking-[0.08em] text-text-muted">
          {rows.length} entries
        </span>
      </div>
      <div className="slim-scroll overflow-x-auto">
        <table className="w-full min-w-[900px] border-collapse">
          <thead>
            <tr className="border-b border-border-strong">
              {header('name', 'Framework')}
              {header('issuer', 'Issuer')}
              <th className="h-12 px-3 text-left font-mono text-[11px] font-medium uppercase leading-4 tracking-[0.08em] text-text-muted">
                Version
              </th>
              {header('controls', 'Controls/Reqs', 'right')}
              {header('domains', 'Domains', 'right')}
              {header('hours', 'Est. Effort', 'right')}
              {header('type', 'Assessment Type')}
              {header('progress', 'Progress', 'right')}
            </tr>
          </thead>
          <tbody>
            {sorted.map((r) => (
              <tr
                key={r.id}
                onClick={() => onJump(r.id)}
                className={clsx(
                  'h-10 cursor-pointer border-b border-border transition-colors duration-[120ms] last:border-0 hover:bg-bg-raised',
                  r.reference && 'opacity-60',
                )}
              >
                <td className="px-3">
                  <div className="text-[13px] font-medium leading-[18px] text-text-primary">
                    <MaybeAbbr term={r.shortName}>{r.shortName}</MaybeAbbr>
                    {r.reference && (
                      <span className="ml-2 rounded-full border border-border px-1.5 py-px font-mono text-[9px] uppercase leading-4 tracking-[0.08em] text-text-muted">
                        Overview only
                      </span>
                    )}
                  </div>
                </td>
                <td className="px-3 text-[13px] leading-[18px] text-text-secondary">{r.issuer}</td>
                <td className="px-3 font-mono text-[12px] leading-4 tracking-[0.02em] text-text-secondary">
                  {r.version}
                </td>
                <td
                  className="px-3 text-right font-mono text-[12px] leading-4 tabular tracking-[0.02em] text-text-primary"
                  title={r.controlsLabel}
                >
                  {r.controlsLabel}
                </td>
                <td className="px-3 text-right font-mono text-[12px] leading-4 tabular tracking-[0.02em] text-text-secondary">
                  {r.domainsLabel}
                </td>
                <td className="px-3 text-right font-mono text-[12px] leading-4 tabular tracking-[0.02em] text-text-secondary">
                  {r.hours > 0 ? `~${r.hours} HRS` : '—'}
                </td>
                <td className="px-3">
                  <span
                    className="inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 font-mono text-[10px] font-medium uppercase leading-4 tracking-[0.04em]"
                    style={{
                      color: ASSESSMENT_COLORS[r.type],
                      backgroundColor: `color-mix(in srgb, ${ASSESSMENT_COLORS[r.type]} 12%, transparent)`,
                    }}
                  >
                    <span className="size-1.5 rounded-full" style={{ backgroundColor: ASSESSMENT_COLORS[r.type] }} />
                    {r.type}
                  </span>
                </td>
                <td className="px-3">
                  <div className="flex justify-end">
                    {r.progress == null ? (
                      <span className="font-mono text-[11px] leading-4 text-text-muted">—</span>
                    ) : (
                      <ProgressRing value={r.progress} size={20} showLabel={false} animate={false} />
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </motion.section>
  )
}

/* ---------------------------------- page ----------------------------------- */

export default function Frameworks() {
  const engagement = useAuditStore((s) => s.engagement)
  const loadMockEngagement = useAuditStore((s) => s.loadMockEngagement)

  // Seed an engagement if none exists so progress rings have data.
  useEffect(() => {
    if (!engagement) loadMockEngagement()
  }, [engagement, loadMockEngagement])

  const answers = useMemo(() => engagement?.answers ?? {}, [engagement])

  const [query, setQuery] = useState('')
  const debouncedQuery = useDebounced(query, 150)
  const [category, setCategory] = useState<CategoryFilter>('all')
  const [sort, setSort] = useState<SortKey>('relevance')
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [flashId, setFlashId] = useState<string | null>(null)
  const flashTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const progressById = useMemo(() => {
    const map = new Map<string, number>()
    for (const fw of FRAMEWORKS) map.set(fw.id, answeredPct(countFramework(fw, answers)))
    return map
  }, [answers])

  const matches = (fw: Framework, q: string): boolean => {
    if (!q) return true
    const hay = `${fw.name} ${fw.shortName} ${fw.version} ${fw.description}`.toLowerCase()
    if (hay.includes(q)) return true
    return fw.phases.some((p) =>
      p.questions.some((question) => question.controlRef.toLowerCase().includes(q)),
    )
  }

  const visible = useMemo(() => {
    const q = debouncedQuery.trim().toLowerCase()
    const filtered = FRAMEWORKS.filter(
      (fw) => (category === 'all' || fw.category === category) && matches(fw, q),
    )
    const sorted = [...filtered]
    if (sort === 'questions') {
      sorted.sort((a, b) => countFramework(b, answers).total - countFramework(a, answers).total)
    } else if (sort === 'progress') {
      sorted.sort((a, b) => (progressById.get(b.id) ?? 0) - (progressById.get(a.id) ?? 0))
    }
    return sorted
  }, [debouncedQuery, category, sort, answers, progressById])

  const visibleReferences = useMemo(() => {
    const q = debouncedQuery.trim().toLowerCase()
    return REFERENCE_FRAMEWORKS.filter((fw) => {
      if (category !== 'all' && fw.category !== category) return false
      if (!q) return true
      return `${fw.name} ${fw.shortName} ${fw.version} ${fw.description} ${fw.statsLine}`
        .toLowerCase()
        .includes(q)
    })
  }, [debouncedQuery, category])

  const tableRows = useMemo<TableRow[]>(() => {
    const real: TableRow[] = FRAMEWORKS.map((fw) => {
      const total = fw.phases.reduce((n, p) => n + p.questions.length, 0)
      return {
        id: fw.id,
        name: fw.name,
        shortName: fw.shortName,
        issuer: META[fw.id]?.issuer ?? '—',
        version: fw.version,
        controls: total,
        controlsLabel: String(total),
        domains: fw.phases.length,
        domainsLabel: String(fw.phases.length),
        hours: estHours(total),
        type: META[fw.id]?.assessmentType ?? 'REFERENCE',
        progress: progressById.get(fw.id) ?? 0,
        reference: false,
      }
    })
    const refs: TableRow[] = REFERENCE_FRAMEWORKS.map((fw) => ({
      id: fw.id,
      name: fw.name,
      shortName: fw.shortName,
      issuer: fw.issuer,
      version: fw.version,
      controls: 0,
      controlsLabel: fw.statsLine.split('·')[0]?.trim() ?? '—',
      domains: 0,
      domainsLabel: fw.statsLine.split('·')[1]?.trim() ?? '—',
      hours: 0,
      type: fw.assessmentType,
      progress: null,
      reference: true,
    }))
    return [...real, ...refs]
  }, [progressById])

  const jumpToCard = (id: string) => {
    document.getElementById(`fw-card-${id}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' })
    if (flashTimer.current) clearTimeout(flashTimer.current)
    setFlashId(id)
    flashTimer.current = setTimeout(() => setFlashId(null), 600)
  }

  const noResults = visible.length === 0 && visibleReferences.length === 0

  return (
    <div>
      {/* Section 1 — header */}
      <header className="relative overflow-hidden">
        <img
          src="/contour.svg"
          alt=""
          aria-hidden
          className="pointer-events-none absolute right-0 top-0 h-full object-cover opacity-30"
        />
        <motion.div
          initial="hidden"
          animate="show"
          variants={{ show: { transition: { staggerChildren: 0.06 } } }}
          className="relative"
        >
          <motion.div
            variants={{ hidden: { opacity: 0, y: 12 }, show: { opacity: 1, y: 0 } }}
            transition={{ duration: 0.35, ease: EASE }}
            className="font-mono text-[11px] font-medium uppercase leading-4 tracking-[0.08em] text-text-muted"
          >
            Reference
          </motion.div>
          <motion.h1
            variants={{ hidden: { opacity: 0, y: 12 }, show: { opacity: 1, y: 0 } }}
            transition={{ duration: 0.35, ease: EASE }}
            className="mt-2 font-display text-[30px] font-semibold leading-[38px] tracking-[-0.02em] text-text-primary"
          >
            Framework Library
          </motion.h1>
          <motion.p
            variants={{ hidden: { opacity: 0, y: 12 }, show: { opacity: 1, y: 0 } }}
            transition={{ duration: 0.35, ease: EASE }}
            className="mt-2 max-w-2xl text-[14px] leading-[22px] text-text-secondary"
          >
            Twelve frameworks, one workflow. Every control broken into guided questions, evidence
            checklists, and interview scripts.
          </motion.p>
        </motion.div>
      </header>

      {/* sticky toolbar */}
      <div className="sticky top-0 z-30 -mx-6 mt-6 border-y border-border bg-bg-base/90 px-6 py-3 backdrop-blur-[8px] [@media(min-width:1600px)]:-mx-8 [@media(min-width:1600px)]:px-8">
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex w-72 items-center gap-2 rounded-md border border-border bg-bg-base px-3 py-1.5 transition-all duration-[120ms] focus-within:border-[var(--accent)] focus-within:shadow-[0_0_0_2px_rgba(52,211,153,0.4)]">
            <Search className="size-3.5 shrink-0 text-text-muted" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search frameworks, controls, domains…"
              className="w-full bg-transparent text-[13px] text-text-primary placeholder:text-text-muted focus:outline-none"
            />
            <kbd className="shrink-0 rounded border border-border-strong bg-bg-raised px-1 py-px font-mono text-[11px] leading-[14px] tracking-[0.04em] text-text-secondary">
              ⌘K
            </kbd>
          </div>

          <div className="flex items-center gap-1.5">
            {(Object.keys(CATEGORY_LABEL) as CategoryFilter[]).map((c, i) => (
              <motion.button
                key={c}
                type="button"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: i * 0.02 }}
                onClick={() => setCategory(c)}
                className={clsx(
                  'rounded-full px-3 py-1 font-mono text-[11px] font-medium uppercase leading-4 tracking-[0.08em] transition-all duration-[140ms]',
                  category === c
                    ? 'bg-accent-dim text-[var(--accent)] shadow-[inset_0_0_0_1px_var(--accent)]'
                    : 'border border-border text-text-muted hover:border-border-strong hover:text-text-secondary',
                )}
              >
                {CATEGORY_LABEL[c]}
              </motion.button>
            ))}
          </div>

          <div className="ml-auto flex items-center gap-2">
            <span className="font-mono text-[11px] uppercase leading-4 tracking-[0.08em] text-text-muted">
              Sort
            </span>
            <select
              value={sort}
              onChange={(e) => setSort(e.target.value as SortKey)}
              className="rounded-md border border-border bg-bg-base px-2 py-1.5 text-[13px] text-text-secondary transition-colors duration-[120ms] hover:border-border-strong focus:border-[var(--accent)] focus:outline-none"
            >
              <option value="relevance">Relevance</option>
              <option value="questions">Questions</option>
              <option value="progress">Progress</option>
            </select>
          </div>
        </div>
      </div>

      {/* Section 2 — cards */}
      {noResults ? (
        <div className="mt-8 flex flex-col items-center rounded-lg border border-border bg-bg-surface px-6 py-16 text-center">
          <img src="/empty-search.svg" alt="" className="w-56 opacity-90" />
          <p className="mt-4 text-[14px] text-text-secondary">
            No matches — try a control ID like <span className="font-mono text-[12px] text-text-primary">A.5.15</span>
          </p>
        </div>
      ) : (
        <div className="mt-6 space-y-4">
          <AnimatePresence mode="popLayout">
            {visible.map((fw, i) => (
              <FrameworkCard
                key={fw.id}
                fw={fw}
                index={i}
                answers={answers}
                expanded={expandedId === fw.id}
                onToggle={() => setExpandedId((id) => (id === fw.id ? null : fw.id))}
                flash={flashId === fw.id}
              />
            ))}
          </AnimatePresence>
          {visibleReferences.map((fw, i) => (
            <ReferenceCard key={fw.id} fw={fw} index={visible.length + i} />
          ))}
        </div>
      )}

      {/* Section 4 — comparison strip */}
      <CompareTable rows={tableRows} onJump={jumpToCard} />
    </div>
  )
}
