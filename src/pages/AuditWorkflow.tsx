import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link, useParams } from 'react-router'
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import {
  ArrowLeft,
  ArrowRight,
  Check,
  ChevronDown,
  ChevronRight,
  CircleAlert,
  CornerDownLeft,
  FileText,
  Flag,
  Image as ImageIcon,
  ListFilter,
  Search,
  ShieldQuestion,
  Table2,
  X,
} from 'lucide-react'
import clsx from 'clsx'
import type { Answer, AnswerStatus, AuditQuestion, Framework } from '@/lib/types'
import { getFramework } from '@/data/frameworks'
import { getTerm } from '@/lib/glossary'
import { useAuditStore } from '@/lib/store'
import { Abbr } from '@/components/TermTip'
import StatusPill from '@/components/StatusPill'
import ProgressRing from '@/components/ProgressRing'
import AnswerSegmentedControl from '@/components/AnswerSegmentedControl'
import EvidenceChecklist from '@/components/EvidenceChecklist'
import RichText, { termsIn } from '@/pages/workflow-rich-text'

// Guided Audit Workflow — /audit/:frameworkId (design/workflow.md).
// Three-column workstation: audit plan tree (left, 280px) · question
// walkthrough + sticky answer dock (center) · context/evidence/history rail
// (right, 320px). Fully keyboard-driven; answers persist to the zustand store.

type Status = Exclude<AnswerStatus, null>
type Confidence = 'HIGH' | 'MED' | 'LOW'

const STATUS_COLOR: Record<Status, string> = {
  compliant: 'var(--status-compliant)',
  partial: 'var(--status-partial)',
  noncompliant: 'var(--status-noncompliant)',
  na: 'var(--status-na)',
}

const EMPTY_ANSWERS: Record<string, Answer> = {}

interface PlanItem {
  q: AuditQuestion
  phaseIdx: number
}

interface PhaseStat {
  total: number
  answered: number
  compliant: number
  partial: number
  noncompliant: number
  na: number
  pct: number
  complete: boolean
  verdict: Status | null
  evidence: number
}

function phaseShortName(name: string): string {
  return name
    .replace(/^Phase\s*\d+\s*[—–-]\s*/i, '')
    .replace(/\s*\([^)]*\)\s*/g, ' ')
    .replace(/\s{2,}/g, ' ')
    .trim()
}

function worstOf(stats: { compliant: number; partial: number; noncompliant: number; na: number }): Status | null {
  if (stats.noncompliant > 0) return 'noncompliant'
  if (stats.partial > 0) return 'partial'
  if (stats.compliant > 0) return 'compliant'
  if (stats.na > 0) return 'na'
  return null
}

function timeHM(iso: string): string {
  return new Date(iso).toLocaleTimeString('en-GB', { hour12: false }).slice(0, 5)
}

function timeHMS(iso: string): string {
  return new Date(iso).toLocaleTimeString('en-GB', { hour12: false })
}

// ---------- small building blocks ----------

function Kbd({ children }: { children: React.ReactNode }) {
  return (
    <kbd className="rounded border border-border-strong bg-bg-raised px-1 py-px font-mono text-[10px] leading-[14px] tracking-[0.04em] text-text-secondary">
      {children}
    </kbd>
  )
}

function Overline({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={clsx('font-mono text-[11px] font-medium uppercase leading-4 tracking-[0.08em] text-text-muted', className)}>
      {children}
    </div>
  )
}

function RoleChip({ role }: { role: string }) {
  const initials = role
    .split(/[\s/]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0])
    .join('')
    .toUpperCase()
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-bg-raised py-1 pl-1 pr-2.5 transition-colors duration-[120ms] hover:border-border-strong">
      <span className="flex size-5 items-center justify-center rounded-full bg-accent-dim font-mono text-[9px] font-semibold leading-none text-[var(--accent)]">
        {initials}
      </span>
      <span className="text-[12px] font-medium leading-4 text-text-secondary">
        <RichText text={role} />
      </span>
    </span>
  )
}

// ---------- invalid framework ----------

function FrameworkNotFound({ frameworkId }: { frameworkId?: string }) {
  return (
    <div className="-m-6 flex h-[calc(100dvh-96px)] flex-col items-center justify-center bg-bg-base [@media(min-width:1600px)]:-m-8">
      <span className="flex size-12 items-center justify-center rounded-lg border border-border bg-bg-surface">
        <ShieldQuestion className="size-6 text-text-muted" />
      </span>
      <h1 className="mt-4 font-display text-[22px] font-semibold leading-[30px] tracking-[-0.01em] text-text-primary">
        Unknown framework
      </h1>
      <p className="mt-1 font-mono text-[12px] leading-4 tracking-[0.02em] text-text-muted">
        {frameworkId ? `No framework registered as "${frameworkId}"` : 'No framework selected'}
      </p>
      <div className="mt-6 flex items-center gap-3">
        <Link
          to="/frameworks"
          className="rounded-md border border-border px-3 py-2 text-[13px] font-medium text-text-secondary transition-colors duration-[120ms] hover:border-border-strong hover:bg-bg-raised hover:text-text-primary"
        >
          Browse framework library
        </Link>
        <Link
          to="/audit/iso27001"
          className="rounded-md bg-[var(--accent)] px-3 py-2 text-[13px] font-semibold text-[#06251B] transition-colors duration-[120ms] hover:bg-[var(--accent-strong)]"
        >
          Start ISO 27001 audit
        </Link>
      </div>
    </div>
  )
}

export default function AuditWorkflow() {
  const { frameworkId } = useParams()
  const framework = frameworkId ? getFramework(frameworkId) : undefined
  if (!framework) return <FrameworkNotFound frameworkId={frameworkId} />
  const total = framework.phases.reduce((n, p) => n + p.questions.length, 0)
  if (total === 0) {
    return (
      <div className="-m-6 flex h-[calc(100dvh-96px)] flex-col items-center justify-center bg-bg-base [@media(min-width:1600px)]:-m-8">
        <span className="flex size-12 items-center justify-center rounded-lg border border-border bg-bg-surface">
          <ShieldQuestion className="size-6 text-text-muted" />
        </span>
        <h1 className="mt-4 font-display text-[22px] font-semibold leading-[30px] tracking-[-0.01em] text-text-primary">
          No audit questions yet
        </h1>
        <p className="mt-1 font-mono text-[12px] leading-4 tracking-[0.02em] text-text-muted">
          {framework.name} has no question bank loaded.
        </p>
        <Link
          to="/frameworks"
          className="mt-6 rounded-md border border-border px-3 py-2 text-[13px] font-medium text-text-secondary transition-colors duration-[120ms] hover:border-border-strong hover:bg-bg-raised hover:text-text-primary"
        >
          Browse framework library
        </Link>
      </div>
    )
  }
  // key remounts the workstation when the framework changes, resetting local state
  return <WorkflowShell key={framework.id} framework={framework} />
}

// ---------- workstation shell ----------

function WorkflowShell({ framework }: { framework: Framework }) {
  const reduceMotion = useReducedMotion()
  const answers = useAuditStore((s) => s.engagement?.answers ?? EMPTY_ANSWERS)
  const lastSavedAt = useAuditStore((s) => s.lastSavedAt)
  const setAnswer = useAuditStore((s) => s.setAnswer)
  const toggleFlag = useAuditStore((s) => s.toggleFlag)
  const loadMockEngagement = useAuditStore((s) => s.loadMockEngagement)

  // Seed an engagement on first load if none exists (persisted store may be empty).
  useEffect(() => {
    if (!useAuditStore.getState().engagement) loadMockEngagement()
  }, [loadMockEngagement])

  // Flatten phases → questions, remembering each question's phase.
  const items = useMemo<PlanItem[]>(
    () =>
      framework.phases.flatMap((p, phaseIdx) => p.questions.map((q) => ({ q, phaseIdx }))),
    [framework],
  )
  const phases = framework.phases

  const [index, setIndex] = useState(() => {
    const a = useAuditStore.getState().engagement?.answers ?? EMPTY_ANSWERS
    const firstOpen = items.findIndex((it) => !a[it.q.id]?.status)
    return firstOpen === -1 ? 0 : firstOpen
  })
  const current = items[Math.min(index, items.length - 1)]
  const answer = answers[current.q.id]

  const [remainingOnly, setRemainingOnly] = useState(false)
  const [search, setSearch] = useState('')
  const [expanded, setExpanded] = useState<ReadonlySet<number>>(() => new Set([current.phaseIdx]))
  const [autoNext, setAutoNext] = useState(true)
  const [savedPulse, setSavedPulse] = useState(false)
  const [guidanceOpen, setGuidanceOpen] = useState(true)
  const [notes, setNotes] = useState(answer?.notes ?? '')
  const [confidence, setConfidence] = useState<Confidence>('HIGH')
  const [attachments, setAttachments] = useState<Record<string, string[]>>({})
  const [tab, setTab] = useState<'context' | 'evidence' | 'history'>('context')
  const [interstitial, setInterstitial] = useState<number | null>(null)
  const shownInterstitial = useRef<Set<number>>(new Set())

  const notesAreaRef = useRef<HTMLTextAreaElement>(null)
  const evidenceRef = useRef<HTMLDivElement>(null)
  const centerScrollRef = useRef<HTMLDivElement>(null)
  const pendingNotes = useRef<{ id: string; value: string } | null>(null)

  // ----- notes autosave (debounced) -----
  const flushNotes = useCallback(() => {
    const p = pendingNotes.current
    if (!p) return
    pendingNotes.current = null
    const st = useAuditStore.getState().engagement?.answers[p.id]?.status ?? null
    setAnswer(p.id, { status: st, notes: p.value })
  }, [setAnswer])

  useEffect(() => {
    const t = window.setInterval(flushNotes, 800)
    return () => {
      window.clearInterval(t)
      flushNotes()
    }
  }, [flushNotes])

  // ----- per-question state sync -----
  useEffect(() => {
    setNotes(answers[current.q.id]?.notes ?? '')
    setConfidence('HIGH')
    setGuidanceOpen(true)
    pendingNotes.current = null
    centerScrollRef.current?.scrollTo({ top: 0 })
    const ta = notesAreaRef.current
    if (ta) {
      ta.style.height = 'auto'
      ta.style.height = `${ta.scrollHeight}px`
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [current.q.id])

  // Keep the current phase expanded in the plan tree.
  useEffect(() => {
    setExpanded((prev) => {
      if (prev.has(current.phaseIdx)) return prev
      const next = new Set(prev)
      next.add(current.phaseIdx)
      return next
    })
  }, [current.phaseIdx])

  // ----- derived stats -----
  const phaseStats = useMemo<PhaseStat[]>(
    () =>
      phases.map((p) => {
        const c = { compliant: 0, partial: 0, noncompliant: 0, na: 0, unanswered: 0, evidence: 0 }
        for (const q of p.questions) {
          const a = answers[q.id]
          if (!a?.status) c.unanswered += 1
          else c[a.status] += 1
          c.evidence += a?.evidenceChecked.length ?? 0
        }
        const answered = p.questions.length - c.unanswered
        return {
          total: p.questions.length,
          answered,
          compliant: c.compliant,
          partial: c.partial,
          noncompliant: c.noncompliant,
          na: c.na,
          pct: p.questions.length ? Math.round((answered / p.questions.length) * 100) : 0,
          complete: p.questions.length > 0 && c.unanswered === 0,
          verdict: worstOf(c),
          evidence: c.evidence,
        }
      }),
    [phases, answers],
  )

  const totalAnswered = phaseStats.reduce((n, s) => n + s.answered, 0)
  const overallPct = items.length ? Math.round((totalAnswered / items.length) * 100) : 0

  const history = useMemo(
    () =>
      items
        .map((it) => ({ it, a: answers[it.q.id] }))
        .filter((r): r is { it: PlanItem; a: Answer } => !!r.a && (!!r.a.status || r.a.flagged || !!r.a.notes))
        .sort((x, y) => y.a.updatedAt.localeCompare(x.a.updatedAt))
        .slice(0, 30),
    [items, answers],
  )

  // ----- navigation -----
  const goTo = useCallback(
    (i: number) => {
      flushNotes()
      setIndex(Math.max(0, Math.min(items.length - 1, i)))
    },
    [flushNotes, items.length],
  )
  const goToPhase = useCallback(
    (phaseIdx: number) => {
      const i = items.findIndex((it) => it.phaseIdx === phaseIdx)
      if (i >= 0) goTo(i)
    },
    [items, goTo],
  )

  // ----- answer capture -----
  const choose = useCallback(
    (status: Status) => {
      pendingNotes.current = null
      setAnswer(current.q.id, { status, notes })
      // Domain-completion interstitial when this answer completes the phase.
      const st = useAuditStore.getState().engagement?.answers ?? EMPTY_ANSWERS
      const phase = phases[current.phaseIdx]
      const complete = phase.questions.length > 0 && phase.questions.every((pq) => !!st[pq.id]?.status)
      if (complete && !shownInterstitial.current.has(current.phaseIdx)) {
        shownInterstitial.current.add(current.phaseIdx)
        setInterstitial(current.phaseIdx)
      }
    },
    [current, notes, phases, setAnswer],
  )

  const saveAndNext = useCallback(() => {
    if (!useAuditStore.getState().engagement?.answers[current.q.id]?.status) return
    flushNotes()
    setSavedPulse(true)
    window.setTimeout(() => setSavedPulse(false), 900)
    if (autoNext) window.setTimeout(() => goTo(index + 1), 200)
  }, [autoNext, current.q.id, flushNotes, goTo, index])

  const advanceFromInterstitial = useCallback(() => {
    if (interstitial === null) return
    setInterstitial(null)
    const nextPhase = interstitial + 1
    if (nextPhase < phases.length) goToPhase(nextPhase)
  }, [interstitial, phases.length, goToPhase])

  const toggleEvidence = useCallback(
    (item: string) => {
      const prev = answers[current.q.id]?.evidenceChecked ?? []
      const next = prev.includes(item) ? prev.filter((e) => e !== item) : [...prev, item]
      setAnswer(current.q.id, { status: answers[current.q.id]?.status ?? null, evidenceChecked: next })
    },
    [answers, current.q.id, setAnswer],
  )

  // ----- keyboard map (design §4): 1–4 answer · ←/→ navigate · E evidence · N notes · F flag · G guidance · ↵ save -----
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey || e.defaultPrevented) return
      if (e.key === 'Escape') {
        setInterstitial(null)
        return
      }
      const t = e.target as HTMLElement | null
      const editing =
        t?.tagName === 'INPUT' || t?.tagName === 'TEXTAREA' || t?.tagName === 'SELECT' || !!t?.isContentEditable
      if (editing) return
      if (interstitial !== null) {
        if (e.key === 'Enter') advanceFromInterstitial()
        return
      }
      switch (e.key) {
        case '1':
          choose('compliant')
          break
        case '2':
          choose('partial')
          break
        case '3':
          choose('noncompliant')
          break
        case '4':
          choose('na')
          break
        case 'Enter':
          e.preventDefault()
          saveAndNext()
          break
        case 'ArrowRight':
        case 'ArrowDown':
          e.preventDefault()
          goTo(index + 1)
          break
        case 'ArrowLeft':
        case 'ArrowUp':
          e.preventDefault()
          goTo(index - 1)
          break
        case 'f':
        case 'F':
          toggleFlag(current.q.id)
          break
        case 'n':
        case 'N':
          e.preventDefault()
          notesAreaRef.current?.focus()
          break
        case 'e':
        case 'E':
          evidenceRef.current?.scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth', block: 'start' })
          break
        case 'g':
        case 'G':
          setGuidanceOpen((o) => !o)
          break
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [choose, saveAndNext, goTo, index, toggleFlag, current.q.id, interstitial, advanceFromInterstitial, reduceMotion])

  const currentStats = phaseStats[current.phaseIdx]

  const relatedTerms = useMemo(
    () => termsIn(current.q.question, current.q.guidance, current.q.whyItMatters).slice(0, 10),
    [current],
  )
  const relatedFrameworks = useMemo(
    () => [...new Set(relatedTerms.flatMap((t) => getTerm(t)?.frameworks ?? []))],
    [relatedTerms],
  )

  const flatIndex = useMemo(() => new Map(items.map((it, i) => [it.q.id, i])), [items])
  const query = search.trim().toLowerCase()

  return (
    <div className="-m-6 flex h-[calc(100dvh-96px)] flex-col overflow-hidden bg-bg-base [@media(min-width:1600px)]:-m-8">
      {/* ============ Section 1 — Audit header strip ============ */}
      <div className="flex h-14 shrink-0 items-center gap-3 border-b border-border bg-bg-surface px-4">
        <nav className="flex min-w-0 items-center gap-1.5 text-[13px]">
          <span className="whitespace-nowrap font-medium text-text-primary">
            <RichText text={framework.name} />
          </span>
          <span className="text-text-muted">›</span>
          <PhaseMenu
            phases={phases}
            stats={phaseStats}
            current={current.phaseIdx}
            onJump={goToPhase}
          />
        </nav>

        {/* Segmented domain switcher */}
        <div className="hidden items-center gap-px overflow-hidden rounded-md border border-border bg-border xl:flex">
          {phases.map((p, i) => (
            <button
              key={p.id}
              type="button"
              title={phaseShortName(p.name)}
              onClick={() => goToPhase(i)}
              className={clsx(
                'flex h-7 items-center gap-1.5 px-2.5 font-mono text-[11px] font-medium leading-4 transition-colors duration-[120ms]',
                i === current.phaseIdx
                  ? 'bg-accent-dim text-[var(--accent)]'
                  : 'bg-bg-base text-text-muted hover:bg-bg-raised hover:text-text-secondary',
              )}
            >
              P{i + 1}
              {phaseStats[i].complete && <span className="size-1 rounded-full bg-[var(--accent)]" />}
            </button>
          ))}
        </div>

        <div className="flex-1" />

        {/* Overall progress */}
        <div className="hidden items-center gap-2.5 md:flex">
          <div className="h-1.5 w-60 overflow-hidden rounded-full bg-bg-raised">
            <motion.div
              className="h-full rounded-full bg-[var(--accent)]"
              initial={false}
              animate={{ width: `${overallPct}%` }}
              transition={{ duration: 0.4, ease: 'easeOut' }}
            />
          </div>
          <span className="whitespace-nowrap font-mono text-[11px] tabular leading-4 tracking-[0.02em] text-text-secondary">
            {totalAnswered} / {items.length} · {overallPct}%
          </span>
        </div>

        {/* Autosave indicator — dot flashes once on each save */}
        <div className="hidden items-center gap-1.5 lg:flex" title="Autosave">
          <motion.span
            key={lastSavedAt ?? 'idle'}
            initial={{ opacity: 1 }}
            animate={{ opacity: [1, 0.3, 1] }}
            transition={{ duration: 0.6 }}
            className="size-1.5 rounded-full bg-[var(--accent)]"
          />
          <span className="font-mono text-[11px] uppercase leading-4 tracking-[0.04em] text-text-muted">
            Saved {lastSavedAt ? timeHMS(lastSavedAt) : '--:--:--'}
          </span>
        </div>

        {/* Auto-advance toggle */}
        <button
          type="button"
          role="switch"
          aria-checked={autoNext}
          onClick={() => setAutoNext((v) => !v)}
          className={clsx(
            'hidden items-center gap-2 rounded-md border px-2 py-1.5 transition-colors duration-[120ms] sm:flex',
            autoNext ? 'border-[var(--accent)] bg-accent-dim' : 'border-border hover:border-border-strong',
          )}
          title="Advance to the next question after saving"
        >
          <span
            className={clsx(
              'font-mono text-[10px] font-medium uppercase leading-3 tracking-[0.08em]',
              autoNext ? 'text-[var(--accent)]' : 'text-text-muted',
            )}
          >
            Auto-next
          </span>
          <span
            className={clsx(
              'relative h-3.5 w-6 rounded-full transition-colors duration-[160ms]',
              autoNext ? 'bg-[var(--accent)]' : 'bg-bg-raised',
            )}
          >
            <motion.span
              layout
              transition={{ duration: 0.16 }}
              className={clsx(
                'absolute top-0.5 size-2.5 rounded-full',
                autoNext ? 'right-0.5 bg-[#06251B]' : 'left-0.5 bg-text-muted',
              )}
            />
          </span>
        </button>

        {/* Finish domain */}
        <button
          type="button"
          disabled={!currentStats.complete}
          onClick={() => {
            shownInterstitial.current.add(current.phaseIdx)
            setInterstitial(current.phaseIdx)
          }}
          className={clsx(
            'flex items-center gap-1.5 whitespace-nowrap rounded-md px-3 py-1.5 text-[12px] font-semibold transition-all duration-[120ms]',
            currentStats.complete
              ? 'bg-[var(--accent)] text-[#06251B] hover:bg-[var(--accent-strong)] active:scale-[0.97]'
              : 'cursor-not-allowed border border-border text-text-muted',
          )}
        >
          Finish domain
          <ArrowRight className="size-3.5" />
        </button>
      </div>

      {/* ============ Columns ============ */}
      <div className="flex min-h-0 flex-1">
        {/* ============ Section 2 — Left rail: audit plan tree ============ */}
        <aside className="hidden w-[280px] shrink-0 flex-col border-r border-border bg-bg-surface lg:flex">
          <div className="space-y-2 border-b border-border p-3">
            <div className="flex items-center justify-between">
              <Overline>Audit plan</Overline>
              <button
                type="button"
                aria-pressed={remainingOnly}
                onClick={() => setRemainingOnly((v) => !v)}
                className={clsx(
                  'flex items-center gap-1 rounded-full border px-2 py-0.5 font-mono text-[10px] font-medium uppercase leading-4 tracking-[0.06em] transition-colors duration-[120ms]',
                  remainingOnly
                    ? 'border-[var(--accent)] bg-accent-dim text-[var(--accent)]'
                    : 'border-border text-text-muted hover:border-border-strong hover:text-text-secondary',
                )}
              >
                <ListFilter className="size-3" />
                Remaining only
              </button>
            </div>
            <label className="flex items-center gap-2 rounded-md border border-border bg-bg-base px-2 py-1.5 focus-within:border-border-strong">
              <Search className="size-3.5 shrink-0 text-text-muted" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Filter controls…"
                className="w-full bg-transparent text-[12px] leading-4 text-text-primary placeholder:text-text-muted focus:outline-none"
              />
              {search && (
                <button type="button" aria-label="Clear filter" onClick={() => setSearch('')} className="text-text-muted hover:text-text-secondary">
                  <XIcon />
                </button>
              )}
            </label>
          </div>

          <div className="slim-scroll min-h-0 flex-1 overflow-y-auto py-1">
            {phases.map((p, pi) => {
              const stats = phaseStats[pi]
              const isOpen = expanded.has(pi) || !!query
              const leaves = p.questions.filter((q) => {
                if (remainingOnly && answers[q.id]?.status) return false
                if (query && !`${q.controlRef} ${q.question}`.toLowerCase().includes(query)) return false
                return true
              })
              if (query && leaves.length === 0) return null
              return (
                <div key={p.id}>
                  {/* Phase node */}
                  <button
                    type="button"
                    onClick={() =>
                      setExpanded((prev) => {
                        const next = new Set(prev)
                        if (next.has(pi)) next.delete(pi)
                        else next.add(pi)
                        return next
                      })
                    }
                    className="flex h-9 w-full items-center gap-2 px-3 text-left transition-colors duration-[120ms] hover:bg-bg-raised"
                  >
                    <motion.span
                      initial={false}
                      animate={{ rotate: isOpen ? 90 : 0 }}
                      transition={{ duration: 0.2 }}
                      className="text-text-muted"
                    >
                      <ChevronRightIcon />
                    </motion.span>
                    <span className="min-w-0 flex-1 truncate font-mono text-[11px] font-medium uppercase leading-4 tracking-[0.06em] text-text-secondary">
                      {pi + 1}. {phaseShortName(p.name)}
                    </span>
                    <ProgressRing value={stats.pct} size={20} showLabel={false} />
                    <span className="font-mono text-[10px] tabular leading-4 text-text-muted">
                      {stats.answered}/{stats.total}
                    </span>
                  </button>

                  {/* Control leaves */}
                  <AnimatePresence initial={false}>
                    {isOpen && (
                      <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: 'auto', opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.22, ease: 'easeInOut' }}
                        className="overflow-hidden"
                      >
                        {leaves.length === 0 && (
                          <div className="py-1 pl-9 pr-3 font-mono text-[10px] uppercase tracking-[0.06em] text-text-muted">
                            All answered
                          </div>
                        )}
                        {leaves.map((q) => {
                          const fi = flatIndex.get(q.id)!
                          const a = answers[q.id]
                          const st = a?.status ?? null
                          const isCurrent = fi === index
                          return (
                            <button
                              key={q.id}
                              type="button"
                              onClick={() => goTo(fi)}
                              className={clsx(
                                'relative flex h-9 w-full items-center gap-2 pl-8 pr-3 text-left transition-colors duration-[120ms]',
                                isCurrent ? 'bg-accent-dim' : 'hover:bg-bg-raised',
                              )}
                            >
                              {isCurrent && (
                                <motion.span
                                  layoutId="wf-current-leaf"
                                  transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
                                  className="absolute left-0 top-1.5 h-6 w-0.5 rounded-r bg-[var(--accent)]"
                                />
                              )}
                              <motion.span
                                key={st ?? 'open'}
                                initial={st ? { scale: 0.6 } : false}
                                animate={{ scale: st ? [0.6, 1.15, 1] : 1 }}
                                transition={{ duration: 0.2, ease: 'easeOut' }}
                                className="size-2 shrink-0 rounded-full border"
                                style={
                                  st
                                    ? { backgroundColor: STATUS_COLOR[st], borderColor: STATUS_COLOR[st] }
                                    : { borderColor: 'var(--text-muted)' }
                                }
                              />
                              <span
                                className={clsx(
                                  'min-w-0 flex-1 truncate font-mono text-[11px] leading-4 tracking-[0.01em]',
                                  isCurrent ? 'text-text-primary' : 'text-text-secondary',
                                )}
                                title={q.controlRef}
                              >
                                {q.controlRef}
                              </span>
                              {a?.flagged && (
                                <Flag className="size-3 shrink-0 text-[var(--flag)]" fill="currentColor" />
                              )}
                            </button>
                          )
                        })}
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              )
            })}
          </div>
        </aside>

        {/* ============ Section 3 — Center: control card + question walkthrough ============ */}
        <div ref={centerScrollRef} className="slim-scroll relative min-w-0 flex-1 overflow-y-auto">
          <div className="mx-auto w-full max-w-[760px] px-6 pb-[120px] pt-8">
            <AnimatePresence mode="wait" initial={false}>
              <motion.div
                key={current.q.id}
                variants={{
                  hidden: {},
                  show: { transition: { staggerChildren: reduceMotion ? 0 : 0.04 } },
                }}
                initial="hidden"
                animate="show"
                exit={reduceMotion ? { opacity: 0, transition: { duration: 0.12 } } : { opacity: 0, x: -16, transition: { duration: 0.16 } }}
              >
                {/* 3a — Control header */}
                <motion.div variants={centerItem(reduceMotion)}>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="rounded-md bg-accent-dim px-2 py-1 font-mono text-[12px] font-medium leading-4 tracking-[0.02em] text-[var(--accent)]">
                      {current.q.controlRef}
                    </span>
                    {answer?.status && <StatusPill status={answer.status} />}
                    {answer?.status && (
                      <span className="font-mono text-[10px] uppercase leading-4 tracking-[0.06em] text-text-muted">
                        Answered {timeHM(answer.updatedAt)} — edit below
                      </span>
                    )}
                    <span className="ml-auto font-mono text-[11px] tabular leading-4 text-text-muted">
                      {index + 1} / {items.length}
                    </span>
                  </div>
                  <h1 className="mt-3 text-[16px] font-medium leading-[26px] text-text-primary">
                    <RichText text={current.q.question} />
                  </h1>
                  {/* Objective / why it matters */}
                  <div className="mt-4 border-l-2 border-[var(--accent)] pl-3">
                    <Overline>Why it matters</Overline>
                    <p className="mt-1 text-[14px] leading-[22px] text-text-secondary">
                      <RichText text={current.q.whyItMatters} />
                    </p>
                  </div>
                </motion.div>

                {/* Who to ask */}
                <motion.div variants={centerItem(reduceMotion)} className="mt-6">
                  <Overline>Who to ask</Overline>
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {current.q.interviewees.map((role) => (
                      <RoleChip key={role} role={role} />
                    ))}
                  </div>
                </motion.div>

                {/* 3b — Guidance accordion */}
                <motion.div variants={centerItem(reduceMotion)} className="mt-6">
                  <button
                    type="button"
                    onClick={() => setGuidanceOpen((o) => !o)}
                    aria-expanded={guidanceOpen}
                    className="flex w-full items-center gap-2 rounded-md px-1 py-1 text-left transition-colors duration-[120ms] hover:bg-bg-raised"
                  >
                    <motion.span
                      initial={false}
                      animate={{ rotate: guidanceOpen ? 90 : 0 }}
                      transition={{ duration: 0.2 }}
                      className="text-text-muted"
                    >
                      <ChevronRightIcon />
                    </motion.span>
                    <Overline className="flex-1">What good looks like</Overline>
                    <Kbd>G</Kbd>
                  </button>
                  <AnimatePresence initial={false}>
                    {guidanceOpen && (
                      <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: 'auto', opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.24, ease: 'easeInOut' }}
                        className="overflow-hidden"
                      >
                        <div className="rounded-md border border-border bg-bg-surface p-3">
                          {current.q.guidance ? (
                            <p className="text-[13px] leading-5 text-text-secondary">
                              <RichText text={current.q.guidance} />
                            </p>
                          ) : (
                            <p className="flex items-center gap-2 text-[13px] leading-5 text-text-muted">
                              <CircleAlert className="size-3.5 text-[var(--status-partial)]" />
                              Guidance pending for this control — flag for content team
                            </p>
                          )}
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </motion.div>

                {/* Follow-up probes */}
                {current.q.probes.length > 0 && (
                  <motion.div variants={centerItem(reduceMotion)} className="mt-6">
                    <Overline>Follow-up probes</Overline>
                    <ol className="mt-2 space-y-2">
                      {current.q.probes.map((probe, i) => (
                        <li key={i} className="flex gap-3 rounded-md border border-border bg-bg-surface px-3 py-2">
                          <span className="font-mono text-[11px] tabular leading-5 text-text-muted">
                            {String(i + 1).padStart(2, '0')}
                          </span>
                          <span className="text-[13px] leading-5 text-text-secondary">
                            <RichText text={probe} />
                          </span>
                        </li>
                      ))}
                    </ol>
                  </motion.div>
                )}

                {/* 3c — Evidence checklist */}
                <motion.div variants={centerItem(reduceMotion)} className="mt-6" ref={evidenceRef}>
                  <Overline className="mb-2 flex items-center gap-2">
                    Evidence to collect
                    <Kbd>E</Kbd>
                  </Overline>
                  <EvidenceChecklist
                    key={current.q.id}
                    items={current.q.evidence}
                    checked={answer?.evidenceChecked ?? []}
                    onToggle={toggleEvidence}
                    attachments={attachments[current.q.id] ?? []}
                    onAttach={(files) =>
                      setAttachments((prev) => ({
                        ...prev,
                        [current.q.id]: [
                          ...(prev[current.q.id] ?? []),
                          ...Array.from(files).map((f) => f.name),
                        ],
                      }))
                    }
                    onRemoveAttachment={(name) =>
                      setAttachments((prev) => ({
                        ...prev,
                        [current.q.id]: (prev[current.q.id] ?? []).filter((n) => n !== name),
                      }))
                    }
                  />
                </motion.div>

                {/* 3d — Notes & flag */}
                <motion.div variants={centerItem(reduceMotion)} className="mt-6">
                  <Overline className="mb-2 flex items-center gap-2">
                    Notes
                    <Kbd>N</Kbd>
                  </Overline>
                  <textarea
                    ref={notesAreaRef}
                    value={notes}
                    rows={3}
                    onChange={(e) => {
                      setNotes(e.target.value)
                      pendingNotes.current = { id: current.q.id, value: e.target.value }
                    }}
                    onInput={(e) => {
                      const el = e.currentTarget
                      el.style.height = 'auto'
                      el.style.height = `${el.scrollHeight}px`
                    }}
                    onBlur={flushNotes}
                    placeholder="Field notes — observations, names, ticket refs…"
                    className="max-h-44 w-full resize-none rounded-md border border-border bg-bg-raised px-3 py-2 text-[14px] leading-[22px] text-text-primary placeholder:text-text-muted focus:border-border-strong focus:outline-none"
                  />
                  <div className="mt-2 flex justify-end">
                    <button
                      type="button"
                      aria-pressed={!!answer?.flagged}
                      onClick={() => toggleFlag(current.q.id)}
                      className={clsx(
                        'flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-[12px] font-medium transition-all duration-[120ms] active:scale-[0.97]',
                        answer?.flagged
                          ? 'border-[var(--flag)] bg-[color-mix(in_srgb,var(--flag)_12%,transparent)] text-[var(--flag)]'
                          : 'border-border text-text-muted hover:border-border-strong hover:text-text-secondary',
                      )}
                    >
                      <Flag className="size-3.5" fill={answer?.flagged ? 'currentColor' : 'none'} />
                      Flag for follow-up
                      <Kbd>F</Kbd>
                    </button>
                  </div>
                </motion.div>
              </motion.div>
            </AnimatePresence>
          </div>

          {/* ============ Section 4 — Answer dock (sticky) ============ */}
          <motion.div
            initial={reduceMotion ? { opacity: 0 } : { y: '100%' }}
            animate={reduceMotion ? { opacity: 1 } : { y: 0 }}
            transition={{ duration: 0.26, delay: 0.15, ease: [0.22, 1, 0.36, 1] }}
            className="sticky bottom-0 z-20 border-t border-border bg-[color-mix(in_srgb,var(--bg-surface)_95%,transparent)] backdrop-blur-[8px]"
          >
            <div className="mx-auto flex max-w-[760px] flex-wrap items-center gap-3 px-6 pt-3">
              <AnswerSegmentedControl
                value={answer?.status ?? null}
                onChange={choose}
                className="w-[min(420px,100%)] shrink-0"
              />
              {/* Confidence select */}
              <div className="flex items-center gap-px overflow-hidden rounded-md border border-border bg-border" role="group" aria-label="Confidence">
                {(['HIGH', 'MED', 'LOW'] as Confidence[]).map((c) => (
                  <button
                    key={c}
                    type="button"
                    aria-pressed={confidence === c}
                    onClick={() => setConfidence(c)}
                    className={clsx(
                      'h-10 bg-bg-base px-2.5 font-mono text-[11px] font-medium leading-4 tracking-[0.06em] transition-colors duration-[120ms]',
                      confidence === c
                        ? 'text-[var(--accent)]'
                        : 'text-text-muted hover:bg-bg-raised hover:text-text-secondary',
                    )}
                    style={confidence === c ? { backgroundColor: 'var(--accent-dim)' } : undefined}
                  >
                    {c}
                  </button>
                ))}
              </div>
              <div className="flex-1" />
              <button
                type="button"
                onClick={() => goTo(index - 1)}
                disabled={index === 0}
                className="flex items-center gap-1.5 rounded-md border border-border px-3 py-2 text-[13px] font-medium text-text-secondary transition-all duration-[120ms] hover:border-border-strong hover:bg-bg-raised hover:text-text-primary active:scale-[0.97] disabled:cursor-not-allowed disabled:opacity-40"
              >
                <ArrowLeft className="size-3.5" />
                Prev
              </button>
              <button
                type="button"
                onClick={saveAndNext}
                disabled={!answer?.status}
                className={clsx(
                  'flex items-center gap-1.5 rounded-md px-3 py-2 text-[13px] font-semibold transition-all duration-[160ms] active:scale-[0.97]',
                  answer?.status
                    ? 'bg-[var(--accent)] text-[#06251B] hover:bg-[var(--accent-strong)]'
                    : 'cursor-not-allowed border border-border text-text-muted',
                  savedPulse && 'shadow-[0_0_0_1px_var(--accent),0_0_16px_rgba(200,243,29,0.35)]',
                )}
              >
                {savedPulse ? (
                  <>
                    <Check className="size-4" />
                    Saved
                  </>
                ) : (
                  <>
                    Save & next
                    <CornerDownLeft className="size-3.5" />
                  </>
                )}
              </button>
            </div>
            {/* Keyboard hint row */}
            <div className="mx-auto flex max-w-[760px] flex-wrap items-center gap-x-3 gap-y-1 px-6 pb-2 pt-1.5 font-mono text-[11px] leading-4 text-text-muted">
              <span className="flex items-center gap-1"><Kbd>1</Kbd>–<Kbd>4</Kbd> answer</span>
              <span className="flex items-center gap-1"><Kbd>←</Kbd><Kbd>→</Kbd> navigate</span>
              <span className="flex items-center gap-1"><Kbd>E</Kbd> evidence</span>
              <span className="flex items-center gap-1"><Kbd>N</Kbd> notes</span>
              <span className="flex items-center gap-1"><Kbd>F</Kbd> flag</span>
              <span className="flex items-center gap-1"><Kbd>G</Kbd> guidance</span>
              <span className="flex items-center gap-1"><Kbd>⌘K</Kbd> jump</span>
              <span className="flex items-center gap-1"><Kbd>↵</Kbd> save & next</span>
            </div>
          </motion.div>
        </div>

        {/* ============ Section 5 — Right rail: context panel ============ */}
        <aside className="hidden w-[320px] shrink-0 flex-col border-l border-border bg-bg-surface xl:flex">
          <div className="flex shrink-0 items-center gap-1 border-b border-border px-3 pt-2">
            {(['context', 'evidence', 'history'] as const).map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => setTab(t)}
                className={clsx(
                  'relative px-2.5 pb-2 pt-1 font-mono text-[11px] font-medium uppercase leading-4 tracking-[0.08em] transition-colors duration-[120ms]',
                  tab === t ? 'text-[var(--accent)]' : 'text-text-muted hover:text-text-secondary',
                )}
              >
                {t}
                {tab === t && (
                  <motion.span
                    layoutId="wf-rail-tab"
                    transition={{ duration: 0.2, ease: 'easeOut' }}
                    className="absolute inset-x-2 bottom-0 h-0.5 rounded-t bg-[var(--accent)]"
                  />
                )}
              </button>
            ))}
          </div>
          <div className="slim-scroll min-h-0 flex-1 overflow-y-auto p-3">
            <AnimatePresence mode="wait" initial={false}>
              <motion.div
                key={tab}
                variants={{ hidden: {}, show: { transition: { staggerChildren: 0.025 } } }}
                initial="hidden"
                animate="show"
                exit={{ opacity: 0, transition: { duration: 0.15 } }}
              >
                {tab === 'context' && (
                  <>
                    <motion.div variants={railItem}>
                      <Overline>Framework</Overline>
                      <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                        <span className="text-[13px] font-medium leading-[18px] text-text-primary">
                          <RichText text={framework.name} />
                        </span>
                        <span className="rounded-full bg-bg-raised px-1.5 py-px font-mono text-[10px] leading-4 text-text-secondary">
                          v{framework.version}
                        </span>
                        <span className="rounded-full bg-bg-raised px-1.5 py-px font-mono text-[10px] uppercase leading-4 tracking-[0.06em] text-text-muted">
                          {framework.category}
                        </span>
                      </div>
                    </motion.div>
                    <motion.div variants={railItem} className="mt-4">
                      <Overline>Scoring weight</Overline>
                      <div className="mt-1.5 flex items-center gap-1">
                        {[1, 2, 3].map((w) => (
                          <span
                            key={w}
                            className={clsx(
                              'h-1.5 w-6 rounded-full',
                              w <= current.q.weight ? 'bg-[var(--accent)]' : 'bg-bg-raised',
                            )}
                          />
                        ))}
                        <span className="ml-1 font-mono text-[11px] tabular leading-4 text-text-secondary">
                          W{current.q.weight}
                        </span>
                      </div>
                    </motion.div>
                    <motion.div variants={railItem} className="mt-4">
                      <Overline>Related terms</Overline>
                      {relatedTerms.length > 0 ? (
                        <div className="mt-1.5 flex flex-wrap gap-1.5">
                          {relatedTerms.map((t) => (
                            <span
                              key={t}
                              title={getTerm(t)?.fullName}
                              className="rounded-full border border-border bg-bg-raised px-2 py-0.5 font-mono text-[11px] leading-4 text-text-secondary transition-all duration-[120ms] hover:-translate-y-px hover:border-border-strong"
                            >
                              <Abbr term={t}>{t}</Abbr>
                            </span>
                          ))}
                        </div>
                      ) : (
                        <p className="mt-1.5 text-[12px] leading-[18px] text-text-muted">
                          No glossary terms referenced by this question.
                        </p>
                      )}
                    </motion.div>
                    {relatedFrameworks.length > 0 && (
                      <motion.div variants={railItem} className="mt-4">
                        <Overline>Also satisfies</Overline>
                        <div className="mt-1.5 flex flex-wrap gap-1.5">
                          {relatedFrameworks.map((f) => (
                            <span
                              key={f}
                              className="rounded-full border border-border bg-bg-raised px-2 py-0.5 font-mono text-[11px] leading-4 text-text-secondary transition-all duration-[120ms] hover:-translate-y-px hover:border-border-strong"
                            >
                              {f}
                            </span>
                          ))}
                        </div>
                        <p className="mt-2 text-[12px] leading-[18px] text-text-muted">
                          Evidence for this control pre-fills reviews in these frameworks — one
                          interview, many frameworks.
                        </p>
                      </motion.div>
                    )}
                  </>
                )}

                {tab === 'evidence' && (
                  <>
                    <motion.div variants={railItem}>
                      <Overline>
                        {current.q.controlRef} · {(answer?.evidenceChecked ?? []).length}/
                        {current.q.evidence.length} collected
                      </Overline>
                    </motion.div>
                    {current.q.evidence.map((item) => {
                      const checked = answer?.evidenceChecked.includes(item)
                      const Icon = railFileIcon(item)
                      return (
                        <motion.div
                          key={item}
                          variants={railItem}
                          className="mt-1.5 flex items-center gap-2.5 rounded-md border border-border bg-bg-base p-2"
                        >
                          <span
                            className={clsx(
                              'flex size-8 shrink-0 items-center justify-center rounded-md border',
                              checked
                                ? 'border-[var(--accent)] bg-accent-dim text-[var(--accent)]'
                                : 'border-border bg-bg-raised text-text-muted',
                            )}
                          >
                            <Icon className="size-4" />
                          </span>
                          <span className="min-w-0 flex-1 truncate font-mono text-[11px] leading-4 text-text-secondary" title={item}>
                            {item}
                          </span>
                          {checked && <Check className="size-3.5 shrink-0 text-[var(--accent)]" />}
                        </motion.div>
                      )
                    })}
                    {(attachments[current.q.id] ?? []).map((name) => {
                      const Icon = railFileIcon(name)
                      return (
                        <motion.div
                          key={name}
                          variants={railItem}
                          className="mt-1.5 flex items-center gap-2.5 rounded-md border border-border bg-bg-base p-2"
                        >
                          <span className="flex size-8 shrink-0 items-center justify-center rounded-md border border-border-strong bg-bg-raised text-[var(--accent)]">
                            <Icon className="size-4" />
                          </span>
                          <span className="min-w-0 flex-1 truncate font-mono text-[11px] leading-4 text-text-secondary">
                            {name}
                          </span>
                          <span className="font-mono text-[9px] uppercase tracking-[0.06em] text-text-muted">
                            attached
                          </span>
                        </motion.div>
                      )
                    })}
                  </>
                )}

                {tab === 'history' && (
                  <>
                    {history.length === 0 && (
                      <motion.p variants={railItem} className="mt-1 text-[12px] leading-[18px] text-text-muted">
                        No audit history yet — answers you record appear here.
                      </motion.p>
                    )}
                    {history.map(({ it, a }) => (
                      <motion.button
                        key={it.q.id + a.updatedAt}
                        variants={railItem}
                        type="button"
                        onClick={() => goTo(flatIndex.get(it.q.id)!)}
                        className="mt-1.5 flex w-full items-center gap-2.5 rounded-md border border-border bg-bg-base p-2 text-left transition-colors duration-[120ms] hover:border-border-strong hover:bg-bg-raised"
                      >
                        <img src="/avatar-jm.svg" alt="" className="size-6 shrink-0 rounded-full border border-border" />
                        <span className="min-w-0 flex-1">
                          <span className="flex items-center gap-1.5">
                            <span className="font-mono text-[10px] uppercase leading-4 tracking-[0.04em] text-text-secondary">
                              J. Mercer
                            </span>
                            {a.status && <StatusPill status={a.status} />}
                            {a.flagged && <Flag className="size-3 text-[var(--flag)]" fill="currentColor" />}
                          </span>
                          <span className="block truncate font-mono text-[10px] leading-4 text-text-muted">
                            {it.q.controlRef}
                          </span>
                        </span>
                        <span className="shrink-0 font-mono text-[10px] tabular leading-4 text-text-muted">
                          {timeHM(a.updatedAt)}
                        </span>
                      </motion.button>
                    ))}
                  </>
                )}
              </motion.div>
            </AnimatePresence>
          </div>
        </aside>
      </div>

      {/* ============ Section 6 — Domain completion interstitial ============ */}
      <AnimatePresence>
        {interstitial !== null && (
          <div className="fixed inset-0 z-[80] flex items-center justify-center p-6">
            <motion.button
              type="button"
              aria-label="Close"
              onClick={() => setInterstitial(null)}
              className="absolute inset-0 cursor-default bg-black/60"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
            />
            <motion.div
              role="dialog"
              aria-modal="true"
              aria-label="Domain complete"
              initial={reduceMotion ? { opacity: 0 } : { opacity: 0, scale: 0.96, y: 8 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={reduceMotion ? { opacity: 0 } : { opacity: 0, scale: 0.96, y: 8 }}
              transition={{ duration: 0.24, ease: [0.22, 1, 0.36, 1] }}
              className="relative w-[480px] max-w-full overflow-hidden rounded-lg border border-border-strong bg-bg-overlay p-8 shadow-popover"
            >
              <img
                src="/contour.svg"
                alt=""
                className="pointer-events-none absolute inset-x-0 top-0 w-full opacity-[0.12]"
              />
              <div className="relative">
                <Overline className="text-center">Domain complete</Overline>
                <div className="relative mx-auto mt-5 flex w-fit justify-center">
                  {!reduceMotion && (
                    <motion.span
                      aria-hidden
                      className="absolute inset-0 m-auto size-24 rounded-full"
                      initial={{ boxShadow: '0 0 0 0 rgba(200,243,29,0.45)' }}
                      animate={{ boxShadow: '0 0 0 20px rgba(200,243,29,0)' }}
                      transition={{ duration: 1, ease: 'easeOut' }}
                    />
                  )}
                  <ProgressRing value={phaseStats[interstitial].pct} size={96} />
                </div>
                <h2 className="mt-4 text-center font-display text-[22px] font-semibold leading-[30px] tracking-[-0.01em] text-text-primary">
                  {phaseShortName(phases[interstitial].name)}
                </h2>
                {phaseStats[interstitial].verdict && (
                  <div className="mt-2 flex justify-center">
                    <StatusPill
                      status={phaseStats[interstitial].verdict!}
                      label={`Verdict: ${
                        phaseStats[interstitial].verdict === 'noncompliant'
                          ? 'NON-COMPLIANT'
                          : phaseStats[interstitial].verdict!.toUpperCase()
                      }`}
                    />
                  </div>
                )}
                <motion.div
                  variants={{ hidden: {}, show: { transition: { staggerChildren: 0.05 } } }}
                  initial="hidden"
                  animate="show"
                  className="mt-5 flex items-center justify-center gap-2 font-mono text-[11px] uppercase leading-4 tracking-[0.06em] text-text-secondary"
                >
                  <motion.span variants={railItem} className="tabular">
                    {phaseStats[interstitial].total} controls
                  </motion.span>
                  <span className="text-border-strong">·</span>
                  <motion.span variants={railItem} className="tabular">
                    {phaseStats[interstitial].partial + phaseStats[interstitial].noncompliant} gaps
                  </motion.span>
                  <span className="text-border-strong">·</span>
                  <motion.span variants={railItem} className="tabular">
                    {phaseStats[interstitial].evidence} evidence items
                  </motion.span>
                </motion.div>
                <div className="mt-6 flex items-center justify-center gap-3">
                  <button
                    type="button"
                    onClick={() => setInterstitial(null)}
                    className="rounded-md border border-border px-3 py-2 text-[13px] font-medium text-text-secondary transition-colors duration-[120ms] hover:border-border-strong hover:bg-bg-raised hover:text-text-primary"
                  >
                    Review answers
                  </button>
                  {interstitial + 1 < phases.length ? (
                    <button
                      type="button"
                      onClick={advanceFromInterstitial}
                      className="flex items-center gap-1.5 rounded-md bg-[var(--accent)] px-3 py-2 text-[13px] font-semibold text-[#06251B] transition-all duration-[120ms] hover:bg-[var(--accent-strong)] active:scale-[0.97]"
                    >
                      Next domain
                      <ArrowRight className="size-3.5" />
                    </button>
                  ) : (
                    <Link
                      to="/findings"
                      className="flex items-center gap-1.5 rounded-md bg-[var(--accent)] px-3 py-2 text-[13px] font-semibold text-[#06251B] transition-all duration-[120ms] hover:bg-[var(--accent-strong)] active:scale-[0.97]"
                    >
                      Open findings
                      <ArrowRight className="size-3.5" />
                    </Link>
                  )}
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  )
}

// ---------- shared motion variants + micro components ----------

const railItem = {
  hidden: { opacity: 0, y: 6 },
  show: { opacity: 1, y: 0, transition: { duration: 0.18, ease: 'easeOut' as const } },
}

function centerItem(reduce: boolean | null) {
  return reduce
    ? { hidden: { opacity: 0 }, show: { opacity: 1, transition: { duration: 0.12 } } }
    : {
        hidden: { opacity: 0, x: 16 },
        show: {
          opacity: 1,
          x: 0,
          transition: { duration: 0.22, ease: [0.22, 1, 0.36, 1] as [number, number, number, number] },
        },
      }
}

function railFileIcon(name: string) {
  const n = name.toLowerCase()
  if (/screenshot|png|jpe?g|image|photo|diagram|chart/.test(n)) return ImageIcon
  if (/export|csv|xls|log|matrix|table|register|inventory|list/.test(n)) return Table2
  return FileText
}

function ChevronRightIcon() {
  return <ChevronRight className="size-3.5" />
}

function XIcon() {
  return <X className="size-3" />
}

function PhaseMenu({
  phases,
  stats,
  current,
  onJump,
}: {
  phases: Framework['phases']
  stats: PhaseStat[]
  current: number
  onJump: (i: number) => void
}) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false)
    }
    const onEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onEsc)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onEsc)
    }
  }, [open])

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="flex max-w-64 items-center gap-1 truncate rounded px-1.5 py-0.5 font-mono text-[11px] uppercase leading-4 tracking-[0.06em] text-text-secondary transition-colors duration-[120ms] hover:bg-bg-raised hover:text-text-primary"
      >
        <span className="truncate">{phaseShortName(phases[current].name)}</span>
        <ChevronDown className={clsx('size-3 shrink-0 transition-transform duration-[160ms]', open && 'rotate-180')} />
      </button>
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: 4, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 4, scale: 0.98 }}
            transition={{ duration: 0.14, ease: 'easeOut' }}
            className="absolute left-0 top-full z-40 mt-1 w-80 rounded-lg border border-border-strong bg-bg-overlay p-1 shadow-popover"
          >
            {phases.map((p, i) => (
              <button
                key={p.id}
                type="button"
                onClick={() => {
                  onJump(i)
                  setOpen(false)
                }}
                className={clsx(
                  'flex w-full items-center gap-2.5 rounded-md px-2.5 py-2 text-left transition-colors duration-[120ms]',
                  i === current ? 'bg-accent-dim' : 'hover:bg-bg-raised',
                )}
              >
                <span className="font-mono text-[10px] leading-4 text-text-muted">P{i + 1}</span>
                <span
                  className={clsx(
                    'min-w-0 flex-1 truncate text-[13px] leading-[18px]',
                    i === current ? 'font-medium text-[var(--accent)]' : 'text-text-secondary',
                  )}
                >
                  {phaseShortName(p.name)}
                </span>
                {stats[i].complete && <Check className="size-3.5 text-[var(--accent)]" />}
                <span className="font-mono text-[10px] tabular leading-4 text-text-muted">
                  {stats[i].answered}/{stats[i].total}
                </span>
              </button>
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
