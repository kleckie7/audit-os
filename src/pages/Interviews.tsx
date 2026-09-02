import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import {
  ArrowLeft,
  ArrowRight,
  CalendarClock,
  Check,
  ChevronDown,
  Flag,
  Mic,
  Pause,
  Play,
  Plus,
  UserPlus,
  X,
} from 'lucide-react'
import clsx from 'clsx'
import StatusPill from '@/components/StatusPill'
import ProgressRing from '@/components/ProgressRing'
import { Abbr } from '@/components/TermTip'
import { useAuditStore } from '@/lib/store'
import { FRAMEWORKS } from '@/data/frameworks'
import type { AnswerStatus, AuditQuestion } from '@/lib/types'

// Interview Mode (/interviews) — design/interview.md.
// The stakeholder role directory is derived dynamically from the
// `interviewees` fields across every framework question bank; raw role
// strings are bucketed into canonical audit-stakeholder roles.

const EASE: [number, number, number, number] = [0.22, 1, 0.36, 1]

/* ------------------------------ role bucketing ----------------------------- */

interface RoleDef {
  id: string
  name: string
  /** Glossary term used for the TermTip on the role name (when one exists). */
  term?: string
  /** Matches raw `interviewees` strings from the question banks. */
  match: RegExp
  blurb: string
}

const ROLE_DEFS: RoleDef[] = [
  { id: 'ciso', name: 'CISO / Head of Security', term: 'CISO', match: /ciso|chief ai officer|isso|security officer|qsa/i, blurb: 'Governance, risk appetite, security program' },
  { id: 'it-ops', name: 'IT Operations Manager', match: /it ops|it manager|system owner|system administrator|service delivery|devops|sre lead|database administrator|\bcio\b|network engineer|pmo/i, blurb: 'Infrastructure, change management, backups, logging' },
  { id: 'iam', name: 'IAM Administrator', term: 'IAM', match: /identity and access|iam admin/i, blurb: 'Provisioning, RBAC, MFA, access reviews' },
  { id: 'sec-ops', name: 'Security Operations (SOC)', term: 'SOC (Security Operations Center)', match: /security engineer|soc analyst|soc manager|soc\/mdr|detection engineer|incident responder|threat intel/i, blurb: 'Monitoring, detection coverage, incident response' },
  { id: 'eng', name: 'Engineering Lead', match: /dev lead|software|\bcto\b|ml engineering|data science|data engineering|product manager|qa lead/i, blurb: 'SDLC, secure coding, secrets, AI/ML lifecycle' },
  { id: 'hr', name: 'HR Director', match: /\bhr\b|human resources/i, blurb: 'Screening, onboarding / offboarding, training, discipline' },
  { id: 'dpo', name: 'DPO / Legal Counsel', term: 'DPO', match: /dpo|legal/i, blurb: 'GDPR obligations, DPIAs, breach notification, contracts' },
  { id: 'finance', name: 'Finance Controller', match: /\bcfo\b|controller|acquirer/i, blurb: 'COSO control environment, segregation of duties, reporting' },
  { id: 'exec', name: 'Executive Sponsor (CEO / Board)', match: /\bceo\b|top management|board/i, blurb: 'COSO / COBIT tone-at-the-top, governance oversight' },
  { id: 'facilities', name: 'Facilities Manager', match: /facilities|retail\/store/i, blurb: 'Physical access, environmental controls' },
  { id: 'risk', name: 'Risk & Compliance Lead', match: /risk manager|compliance officer|it governance officer/i, blurb: 'Risk assessment, treatment plans, compliance obligations' },
  { id: 'audit', name: 'Internal Auditor', match: /internal auditor/i, blurb: 'Internal audit program, monitoring activities' },
  { id: 'procurement', name: 'Procurement / Vendor Manager', match: /procurement|vendor/i, blurb: 'Third-party risk, supplier contracts, due diligence' },
  { id: 'business', name: 'Business Process Owner', term: 'Control Owner', match: /business process|end users|customer|sales|e-commerce|communications|control owners/i, blurb: 'Day-to-day control execution, process walkthroughs' },
]

// IAM administrator script: access-identity questions routed to IT/security
// roles in the raw data are additionally routed to the IAM bucket.
const IAM_QUESTION_RE =
  /access (rights|control|review)|provisioning|deprovision|authenticat|\bmfa\b|\brbac\b|privileged|identity|credential|least privilege/i
const IAM_SOURCE_ROLES = new Set(['it-ops', 'ciso', 'sec-ops'])

export interface ScriptQuestion {
  question: AuditQuestion
  frameworkId: string
  frameworkName: string
  frameworkShort: string
  phaseId: string
  /** Short topic label derived from the phase name. */
  topic: string
}

export interface RoleStats {
  def: RoleDef
  questions: ScriptQuestion[]
  frameworks: { id: string; short: string }[]
  minutes: number
  /** Top 3 topic labels by question share. */
  topics: string[]
}

function shortTopic(phaseName: string): string {
  let t = phaseName.replace(/^phase\s*\d+\s*[—-]\s*/i, '')
  t = t.split('(')[0].trim()
  return t.length > 34 ? `${t.slice(0, 34).trimEnd()}…` : t
}

function bucketOf(role: string): RoleDef | undefined {
  return ROLE_DEFS.find((d) => d.match.test(role))
}

/** Build the full role directory from the framework question banks. */
function buildRoleDirectory(): RoleStats[] {
  const byRole = new Map<string, ScriptQuestion[]>()
  for (const fw of FRAMEWORKS) {
    for (const phase of fw.phases) {
      const topic = shortTopic(phase.name)
      for (const q of phase.questions) {
        const buckets = new Set<string>()
        for (const raw of q.interviewees) {
          const def = bucketOf(raw)
          if (def) buckets.add(def.id)
        }
        if (
          [...buckets].some((b) => IAM_SOURCE_ROLES.has(b)) &&
          IAM_QUESTION_RE.test(`${q.question} ${q.controlRef}`)
        ) {
          buckets.add('iam')
        }
        const entry: ScriptQuestion = {
          question: q,
          frameworkId: fw.id,
          frameworkName: fw.name,
          frameworkShort: fw.shortName,
          phaseId: phase.id,
          topic,
        }
        for (const b of buckets) {
          const list = byRole.get(b) ?? []
          list.push(entry)
          byRole.set(b, list)
        }
      }
    }
  }
  return ROLE_DEFS.map((def) => {
    const questions = byRole.get(def.id) ?? []
    const fwMap = new Map<string, string>()
    const topicCount = new Map<string, number>()
    for (const s of questions) {
      fwMap.set(s.frameworkId, s.frameworkShort)
      topicCount.set(s.topic, (topicCount.get(s.topic) ?? 0) + 1)
    }
    const topics = [...topicCount.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([t]) => t.toUpperCase())
    return {
      def,
      questions,
      frameworks: [...fwMap.entries()].map(([id, short]) => ({ id, short })),
      minutes: Math.max(10, Math.round(questions.length * 1.1)),
      topics,
    }
  })
    .filter((r) => r.questions.length > 0)
    .sort((a, b) => b.questions.length - a.questions.length)
}

/* --------------------------- persisted page state -------------------------- */

interface SessionEntry {
  questionId: string
  controlRef: string
  frameworkShort: string
  topic: string
  status: Exclude<AnswerStatus, null>
  notes: string
  flagged: boolean
  at: string
}

interface SessionRecord {
  id: string
  roleId: string
  roleName: string
  startedAt: string
  completedAt: string
  durationSec: number
  total: number
  answered: number
  followUps: number
  entries: SessionEntry[]
}

interface InterviewPrefs {
  /** Question ids excluded per role (from the script drawer). */
  excluded: Record<string, string[]>
  /** roleId -> schedule label, e.g. "TUE 10:00". */
  scheduled: Record<string, string>
  history: SessionRecord[]
}

const PREFS_KEY = 'auditos-interviews-v1'
const EMPTY_PREFS: InterviewPrefs = { excluded: {}, scheduled: {}, history: [] }

function loadPrefs(): InterviewPrefs {
  try {
    const raw = localStorage.getItem(PREFS_KEY)
    if (!raw) return EMPTY_PREFS
    const parsed = JSON.parse(raw) as Partial<InterviewPrefs>
    return {
      excluded: parsed.excluded ?? {},
      scheduled: parsed.scheduled ?? {},
      history: parsed.history ?? [],
    }
  } catch {
    return EMPTY_PREFS
  }
}

/* --------------------------------- helpers --------------------------------- */

function fmtClock(totalSec: number): string {
  const h = Math.floor(totalSec / 3600)
  const m = Math.floor((totalSec % 3600) / 60)
  const s = totalSec % 60
  const mm = String(m).padStart(2, '0')
  const ss = String(s).padStart(2, '0')
  return h > 0 ? `${String(h).padStart(2, '0')}:${mm}:${ss}` : `${mm}:${ss}`
}

function fmtDate(iso: string): string {
  const d = new Date(iso)
  return d
    .toLocaleDateString('en-GB', { day: '2-digit', month: 'short' })
    .toUpperCase()
}

function fmtTime(iso: string): string {
  return new Date(iso).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', hour12: false })
}

const STATUS_DOT: Record<string, string> = {
  compliant: 'var(--status-compliant)',
  partial: 'var(--status-partial)',
  noncompliant: 'var(--status-noncompliant)',
  na: 'var(--status-na)',
}

const WEEKDAYS = ['MON', 'TUE', 'WED', 'THU', 'FRI']
const SLOTS = ['09:30', '10:00', '11:30', '14:00', '15:30']

function nextScheduleLabel(seed: number): string {
  return `${WEEKDAYS[seed % WEEKDAYS.length]} ${SLOTS[seed % SLOTS.length]}`
}

/* --------------------------------- RoleChip -------------------------------- */

function RoleChip({ name, size = 'md' }: { name: string; size?: 'sm' | 'md' }) {
  const initials = name
    .split(/[\s/()]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0])
    .join('')
    .toUpperCase()
  return (
    <span className="inline-flex items-center gap-2">
      <span
        className={clsx(
          'flex shrink-0 items-center justify-center rounded-full border border-border-strong bg-accent-dim font-display font-semibold text-[var(--accent)]',
          size === 'md' ? 'size-8 text-[12px]' : 'size-6 text-[10px]',
        )}
      >
        {initials}
      </span>
      <span className={clsx('truncate font-medium text-text-primary', size === 'md' ? 'text-[14px]' : 'text-[12px]')}>
        {name}
      </span>
    </span>
  )
}

/* --------------------------------- role card ------------------------------- */

type SessionState =
  | { kind: 'none' }
  | { kind: 'scheduled'; label: string }
  | { kind: 'complete'; answered: number; total: number }

function RoleCard({
  role,
  state,
  index,
  onViewScript,
  onStart,
}: {
  role: RoleStats
  state: SessionState
  index: number
  onViewScript: () => void
  onStart: () => void
}) {
  const pct =
    state.kind === 'complete' && state.total > 0
      ? Math.round((state.answered / state.total) * 100)
      : 0
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, ease: EASE, delay: index * 0.05 }}
      className="group flex flex-col rounded-lg border border-border bg-bg-surface p-5 transition-[transform,border-color] duration-[160ms] hover:-translate-y-0.5 hover:border-border-strong"
    >
      <div className="flex items-center gap-2.5">
        <RoleChip name={role.def.name} />
      </div>
      <p className="mt-2 text-[12px] leading-[18px] text-text-muted">{role.def.blurb}</p>

      <div className="mt-3 flex flex-wrap items-center gap-x-2 font-mono text-[11px] tabular tracking-[0.02em] text-text-secondary">
        <span className="text-text-primary">{role.questions.length} QUESTIONS</span>
        <span className="text-border-strong">·</span>
        <span>{role.frameworks.length} FRAMEWORKS</span>
        <span className="text-border-strong">·</span>
        <span>~{role.minutes} MIN</span>
      </div>

      {/* topic preview */}
      <div className="mt-3 flex flex-wrap gap-1.5">
        {role.topics.map((t) => (
          <span
            key={t}
            className="max-w-40 truncate rounded-full bg-bg-raised px-2 py-0.5 font-mono text-[10px] uppercase tracking-[0.04em] text-text-muted"
            title={t}
          >
            {t}
          </span>
        ))}
      </div>

      {/* session status */}
      <div className="mt-4">
        {state.kind === 'complete' ? (
          <div>
            <StatusPill status="compliant" label={`COMPLETE ${state.answered}/${state.total}`} />
            <div className="mt-2 h-0.5 w-full overflow-hidden rounded-full bg-bg-raised">
              <motion.div
                initial={{ width: 0 }}
                whileInView={{ width: `${pct}%` }}
                viewport={{ once: true }}
                transition={{ duration: 0.5, ease: 'easeOut' }}
                className="h-full rounded-full bg-[var(--accent)]"
              />
            </div>
          </div>
        ) : state.kind === 'scheduled' ? (
          <StatusPill status="partial" label={`SCHEDULED ${state.label}`} />
        ) : (
          <StatusPill status="na" label="NOT SCHEDULED" />
        )}
      </div>

      <div className="mt-4 flex items-center gap-2 border-t border-border pt-4">
        <button
          type="button"
          onClick={onViewScript}
          className="rounded-md border border-border px-3 py-1.5 text-[12px] font-medium text-text-secondary transition-colors duration-[120ms] hover:border-border-strong hover:bg-bg-raised hover:text-text-primary"
        >
          View script
        </button>
        <button
          type="button"
          onClick={onStart}
          className="group/btn flex items-center gap-1.5 rounded-md bg-[var(--accent)] px-3 py-1.5 text-[12px] font-semibold text-bg-base transition-colors duration-[120ms] hover:bg-[var(--accent-strong)] active:scale-[0.97]"
        >
          {state.kind === 'complete' ? 'New session' : 'Start session'}
          <ArrowRight className="size-3.5 transition-transform duration-[160ms] group-hover/btn:translate-x-[3px]" />
        </button>
      </div>
    </motion.div>
  )
}

/* ------------------------------- script drawer ----------------------------- */

function ScriptDrawer({
  role,
  excluded,
  onToggleExclude,
  onStart,
  onClose,
}: {
  role: RoleStats
  excluded: Set<string>
  onToggleExclude: (questionId: string) => void
  onStart: () => void
  onClose: () => void
}) {
  // Group by framework, then phase/topic, preserving document order.
  const groups = useMemo(() => {
    const byFw = new Map<string, { short: string; topics: Map<string, ScriptQuestion[]> }>()
    for (const s of role.questions) {
      if (!byFw.has(s.frameworkId)) byFw.set(s.frameworkId, { short: s.frameworkShort, topics: new Map() })
      const fw = byFw.get(s.frameworkId)!
      const key = `${s.phaseId}::${s.topic}`
      if (!fw.topics.has(key)) fw.topics.set(key, [])
      fw.topics.get(key)!.push(s)
    }
    return [...byFw.entries()].map(([fwId, v]) => ({ fwId, ...v }))
  }, [role])

  const included = role.questions.length - role.questions.filter((s) => excluded.has(s.question.id)).length

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
        exit={{ x: 480 }}
        transition={{ duration: 0.24, ease: EASE }}
        className="fixed right-0 top-0 z-[71] flex h-full w-full max-w-[480px] flex-col border-l border-border-strong bg-bg-overlay shadow-popover"
      >
        <div className="flex items-start justify-between gap-3 border-b border-border px-5 py-4">
          <div>
            <div className="font-mono text-[10px] uppercase tracking-[0.08em] text-text-muted">
              Interview script
            </div>
            <div className="mt-1 flex items-center gap-2">
              {role.def.term ? (
                <Abbr term={role.def.term} className="font-display text-[16px] font-semibold text-text-primary">
                  {role.def.name}
                </Abbr>
              ) : (
                <span className="font-display text-[16px] font-semibold text-text-primary">{role.def.name}</span>
              )}
            </div>
            <div className="mt-1 font-mono text-[11px] tabular text-text-secondary">
              {included} OF {role.questions.length} INCLUDED · {role.frameworks.length} FRAMEWORKS · ~{role.minutes} MIN
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close script"
            className="rounded-md p-1.5 text-text-muted transition-colors duration-[120ms] hover:bg-bg-raised hover:text-text-primary"
          >
            <X className="size-4" />
          </button>
        </div>

        <div className="slim-scroll flex-1 overflow-y-auto px-5 py-3">
          {groups.map((g) => (
            <div key={g.fwId} className="mb-4">
              <div className="sticky top-0 -mx-5 bg-bg-overlay px-5 py-2">
                <Abbr term={g.short} className="font-mono text-[11px] font-medium uppercase tracking-[0.08em] text-[var(--accent)]">
                  {g.short}
                </Abbr>
              </div>
              {[...g.topics.entries()].map(([key, list]) => {
                const topic = key.split('::')[1]
                return (
                  <div key={key} className="mb-2">
                    <div className="py-1.5 font-mono text-[10px] uppercase tracking-[0.06em] text-text-muted">
                      {topic} <span className="text-border-strong">{list.length}</span>
                    </div>
                    {list.map((s) => {
                      const off = excluded.has(s.question.id)
                      return (
                        <label
                          key={s.question.id}
                          className={clsx(
                            'flex cursor-pointer items-start gap-2.5 rounded-md px-2 py-2 transition-colors duration-[120ms] hover:bg-bg-raised',
                            off && 'opacity-45',
                          )}
                        >
                          <input
                            type="checkbox"
                            checked={!off}
                            onChange={() => onToggleExclude(s.question.id)}
                            className="mt-0.5 size-3.5 shrink-0 accent-[#C8F31D]"
                          />
                          <span className="min-w-0">
                            <span className="font-mono text-[11px] tabular tracking-[0.02em] text-text-muted">
                              {s.question.controlRef}
                            </span>
                            <span className={clsx('block truncate text-[13px] leading-[18px] text-text-secondary', off && 'line-through')}>
                              {s.question.question}
                            </span>
                          </span>
                        </label>
                      )
                    })}
                  </div>
                )
              })}
            </div>
          ))}
        </div>

        <div className="flex items-center justify-between gap-3 border-t border-border px-5 py-3">
          <span className="font-mono text-[11px] text-text-muted">Uncheck to exclude from session</span>
          <button
            type="button"
            onClick={onStart}
            disabled={included === 0}
            className="flex items-center gap-1.5 rounded-md bg-[var(--accent)] px-3.5 py-2 text-[12px] font-semibold text-bg-base transition-colors duration-[120ms] hover:bg-[var(--accent-strong)] active:scale-[0.97] disabled:cursor-not-allowed disabled:opacity-40"
          >
            <Mic className="size-3.5" />
            Start session ({included})
          </button>
        </div>
      </motion.aside>
    </>
  )
}

/* ------------------------------ live session ------------------------------- */

interface LiveAnswer {
  status: AnswerStatus
  notes: string
  flagged: boolean
}

const ANSWER_OPTIONS: { status: Exclude<AnswerStatus, null>; label: string; key: string }[] = [
  { status: 'compliant', label: 'Compliant', key: '1' },
  { status: 'partial', label: 'Partial', key: '2' },
  { status: 'noncompliant', label: 'Non-Compliant', key: '3' },
  { status: 'na', label: 'N/A', key: '4' },
]

function SessionOverlay({
  role,
  questions,
  attendees,
  onExit,
  onComplete,
  onScheduleNext,
}: {
  role: RoleStats
  questions: ScriptQuestion[]
  attendees: string[]
  onExit: () => void
  onComplete: (record: SessionRecord) => void
  onScheduleNext: () => void
}) {
  const reduce = useReducedMotion()
  const answers = useAuditStore((s) => s.engagement?.answers)
  const setAnswer = useAuditStore((s) => s.setAnswer)
  const toggleFlag = useAuditStore((s) => s.toggleFlag)

  const [idx, setIdx] = useState(0)
  const [elapsed, setElapsed] = useState(0)
  const [paused, setPaused] = useState(false)
  const [note, setNote] = useState('')
  const [hintOpen, setHintOpen] = useState(false)
  const [phase, setPhase] = useState<'session' | 'review' | 'summary'>('session')
  const [milestone, setMilestone] = useState<string | null>(null)
  const [synced, setSynced] = useState(false)
  const [startedAt] = useState(() => new Date().toISOString())
  const [guests, setGuests] = useState<string[]>([])
  const milestoneTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const noteRef = useRef<HTMLTextAreaElement>(null)

  const GUEST_POOL = ['D. Okafor', 'R. Kovac', 'S. Ibrahim', 'M. Lindqvist', 'A. Chen']

  const current = questions[idx]
  const storeAnswer = current ? answers?.[current.question.id] : undefined
  const currentAnswer: LiveAnswer = {
    status: storeAnswer?.status ?? null,
    notes: storeAnswer?.notes ?? '',
    flagged: storeAnswer?.flagged ?? false,
  }

  const answeredCount = useMemo(
    () => questions.filter((s) => answers?.[s.question.id]?.status).length,
    [questions, answers],
  )
  const followUps = useMemo(
    () => questions.filter((s) => answers?.[s.question.id]?.flagged),
    [questions, answers],
  )
  const skipped = useMemo(
    () => questions.filter((s) => !answers?.[s.question.id]?.status),
    [questions, answers],
  )

  // Session timer.
  useEffect(() => {
    if (paused || phase === 'summary') return
    const t = setInterval(() => setElapsed((e) => e + 1), 1000)
    return () => clearInterval(t)
  }, [paused, phase])

  // Load the current question's note into the editing buffer.
  useEffect(() => {
    setNote(storeAnswer?.notes ?? '')
    setHintOpen(false)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [idx])

  const saveNote = useCallback(() => {
    if (!current) return
    const existing = answers?.[current.question.id]
    if ((existing?.notes ?? '') === note) return
    setAnswer(current.question.id, { status: existing?.status ?? null, notes: note })
  }, [current, answers, note, setAnswer])

  const goTo = useCallback(
    (next: number) => {
      if (next < 0 || next >= questions.length) return
      saveNote()
      setIdx(next)
    },
    [questions.length, saveNote],
  )

  const answer = useCallback(
    (status: Exclude<AnswerStatus, null>) => {
      if (!current) return
      setAnswer(current.question.id, { status, notes: note })
      const newCount = answeredCount + (currentAnswer.status ? 0 : 1)
      if (newCount > 0 && newCount % 10 === 0) {
        setMilestone(`MILESTONE ${Math.round((newCount / questions.length) * 100)}% — ${newCount} ANSWERED`)
        if (milestoneTimer.current) clearTimeout(milestoneTimer.current)
        milestoneTimer.current = setTimeout(() => setMilestone(null), 2000)
      }
    },
    [current, setAnswer, note, answeredCount, currentAnswer.status, questions.length],
  )

  const flag = useCallback(() => {
    if (!current) return
    saveNote()
    toggleFlag(current.question.id)
  }, [current, saveNote, toggleFlag])

  // Keyboard shortcuts: 1–4 answer · ←/→ navigate · F flag · Enter next · ⌘S save note.
  useEffect(() => {
    if (phase !== 'session') return
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null
      const typing = target?.tagName === 'TEXTAREA' || target?.tagName === 'INPUT'
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 's') {
        e.preventDefault()
        saveNote()
        return
      }
      if (typing) return
      if (e.key >= '1' && e.key <= '4') {
        const opt = ANSWER_OPTIONS[Number(e.key) - 1]
        if (opt) answer(opt.status)
      } else if (e.key === 'ArrowRight') goTo(idx + 1)
      else if (e.key === 'ArrowLeft') goTo(idx - 1)
      else if (e.key.toLowerCase() === 'f') flag()
      else if (e.key === 'Enter') goTo(idx + 1)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [phase, answer, flag, goTo, idx, saveNote])

  useEffect(
    () => () => {
      if (milestoneTimer.current) clearTimeout(milestoneTimer.current)
    },
    [],
  )

  const finish = () => {
    saveNote()
    if (skipped.length > 0 && phase === 'session') setPhase('review')
    else setPhase('summary')
  }

  const completeSession = () => {
    const entries: SessionEntry[] = questions
      .map((s) => ({ s, a: answers?.[s.question.id] }))
      .filter((x): x is { s: ScriptQuestion; a: NonNullable<typeof x.a> } => Boolean(x.a?.status))
      .map(({ s, a }) => ({
        questionId: s.question.id,
        controlRef: s.question.controlRef,
        frameworkShort: s.frameworkShort,
        topic: s.topic,
        status: a.status as Exclude<AnswerStatus, null>,
        notes: a.notes,
        flagged: a.flagged,
        at: a.updatedAt,
      }))
    onComplete({
      id: `SES-${String(Date.now()).slice(-6)}`,
      roleId: role.def.id,
      roleName: role.def.name,
      startedAt,
      completedAt: new Date().toISOString(),
      durationSec: elapsed,
      total: questions.length,
      answered: answeredCount,
      followUps: followUps.length,
      entries,
    })
  }

  // Rail groups by topic.
  const railGroups = useMemo(() => {
    const map = new Map<string, { topic: string; items: { s: ScriptQuestion; i: number }[] }>()
    questions.forEach((s, i) => {
      const key = `${s.phaseId}::${s.topic}`
      if (!map.has(key)) map.set(key, { topic: s.topic, items: [] })
      map.get(key)!.items.push({ s, i })
    })
    return [...map.values()]
  }, [questions])

  // Summary per-framework breakdown.
  const fwBreakdown = useMemo(() => {
    const map = new Map<string, { short: string; answered: number; total: number }>()
    for (const s of questions) {
      const cur = map.get(s.frameworkId) ?? { short: s.frameworkShort, answered: 0, total: 0 }
      cur.total += 1
      if (answers?.[s.question.id]?.status) cur.answered += 1
      map.set(s.frameworkId, cur)
    }
    return [...map.values()]
  }, [questions, answers])

  const pct = questions.length ? Math.round((answeredCount / questions.length) * 100) : 0

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.2 }}
      className="fixed inset-0 z-[60] flex flex-col bg-bg-base"
    >
      {/* 3a — session top bar */}
      <div className="flex h-14 shrink-0 items-center gap-3 border-b border-border bg-bg-surface px-4">
        <button
          type="button"
          onClick={() => {
            saveNote()
            onExit()
          }}
          className="flex items-center gap-1.5 rounded-md px-2 py-1.5 text-[12px] font-medium text-text-secondary transition-colors duration-[120ms] hover:bg-bg-raised hover:text-text-primary"
        >
          <ArrowLeft className="size-3.5" />
          End session
        </button>
        <div className="h-5 w-px bg-border" />
        <span className="font-mono text-[12px] font-medium uppercase tracking-[0.04em] text-text-primary">
          Session — {role.def.name}
        </span>
        <RoleChip name={role.def.name} size="sm" />
        <div className="hidden items-center gap-1.5 lg:flex">
          {[...attendees, ...guests].map((a) => (
            <span key={a} className="group/att relative">
              <img src="/avatar-jm.svg" alt={a} title={a} className="size-6 rounded-full border border-border-strong" />
              {guests.includes(a) && (
                <button
                  type="button"
                  aria-label={`Remove ${a}`}
                  onClick={() => setGuests((g) => g.filter((x) => x !== a))}
                  className="absolute -right-1 -top-1 hidden size-3.5 items-center justify-center rounded-full bg-bg-overlay text-[8px] text-text-primary group-hover/att:flex"
                >
                  <X className="size-2.5" />
                </button>
              )}
            </span>
          ))}
          {guests.length < GUEST_POOL.length && (
            <button
              type="button"
              aria-label="Add attendee"
              title="Add attendee"
              onClick={() => setGuests((g) => [...g, GUEST_POOL[g.length]])}
              className="flex size-6 items-center justify-center rounded-full border border-dashed border-border-strong text-text-muted transition-colors duration-[120ms] hover:border-[var(--accent)] hover:text-[var(--accent)]"
            >
              <UserPlus className="size-3" />
            </button>
          )}
        </div>

        <div className="flex-1" />

        {/* elapsed timer + progress */}
        <span
          className={clsx(
            'font-mono text-[14px] tabular tracking-[0.02em]',
            paused ? 'text-text-muted' : 'text-text-primary',
          )}
        >
          {fmtClock(elapsed)}
        </span>
        {paused && <StatusPill status="na" label="PAUSED" />}
        <div className="flex items-center gap-2">
          <div className="h-1 w-24 overflow-hidden rounded-full bg-bg-raised">
            <div
              className="h-full rounded-full bg-[var(--accent)] transition-[width] duration-300"
              style={{ width: `${pct}%` }}
            />
          </div>
          <span className="font-mono text-[11px] tabular text-text-secondary">
            {answeredCount} / {questions.length}
          </span>
        </div>

        <button
          type="button"
          onClick={() => setPaused((p) => !p)}
          className="flex items-center gap-1.5 rounded-md border border-border px-2.5 py-1.5 text-[12px] font-medium text-text-secondary transition-colors duration-[120ms] hover:border-border-strong hover:bg-bg-raised hover:text-text-primary"
        >
          {paused ? <Play className="size-3.5" /> : <Pause className="size-3.5" />}
          {paused ? 'Resume' : 'Pause'}
        </button>
        {phase === 'session' && (
          <button
            type="button"
            onClick={finish}
            className="rounded-md bg-[var(--accent)] px-3 py-1.5 text-[12px] font-semibold text-bg-base transition-colors duration-[120ms] hover:bg-[var(--accent-strong)] active:scale-[0.97]"
          >
            Complete session
          </button>
        )}
      </div>

      <div className="flex min-h-0 flex-1">
        {/* 3b — question stage */}
        <div className="bg-dots flex min-w-0 flex-1 items-start justify-center overflow-y-auto px-8 py-10">
          <div className="w-full max-w-[820px]">
            {phase === 'session' && current && (
              <AnimatePresence mode="wait">
                <motion.div
                  key={current.question.id}
                  initial={reduce ? { opacity: 0 } : { opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={reduce ? { opacity: 0 } : { opacity: 0, y: -12 }}
                  transition={{ duration: reduce ? 0.08 : 0.22, ease: EASE }}
                >
                  <div className="font-mono text-[11px] uppercase tracking-[0.08em] text-text-muted">
                    {current.topic} · Question {idx + 1} of {questions.length}
                  </div>

                  {/* framework source chips */}
                  <div className="mt-3 flex flex-wrap items-center gap-1.5">
                    <Abbr
                      term={current.frameworkShort}
                      className="rounded-full border border-border-strong bg-bg-surface px-2 py-0.5 font-mono text-[11px] tracking-[0.02em] text-text-secondary no-underline"
                    >
                      {current.frameworkShort} {current.question.controlRef}
                    </Abbr>
                    {current.question.weight >= 2 && (
                      <span className="rounded-full bg-bg-raised px-2 py-0.5 font-mono text-[10px] uppercase tracking-[0.04em] text-text-muted">
                        Weight ×{current.question.weight}
                      </span>
                    )}
                  </div>

                  {/* the question — read-aloud size */}
                  <h2 className="mt-5 text-[20px] leading-[32px] text-text-primary">
                    {current.question.question}
                  </h2>

                  {/* answer capture row */}
                  <div className="mt-6 flex flex-wrap items-center gap-2">
                    <div className="flex overflow-hidden rounded-md border border-border">
                      {ANSWER_OPTIONS.map((opt) => {
                        const active = currentAnswer.status === opt.status
                        const color = STATUS_DOT[opt.status]
                        return (
                          <button
                            key={opt.status}
                            type="button"
                            onClick={() => answer(opt.status)}
                            className={clsx(
                              'relative flex h-8 items-center gap-1.5 border-r border-border px-3 text-[12px] font-medium transition-colors duration-[140ms] last:border-r-0',
                              active ? 'font-semibold' : 'text-text-secondary hover:bg-bg-raised hover:text-text-primary',
                            )}
                            style={
                              active
                                ? { backgroundColor: `color-mix(in srgb, ${color} 14%, transparent)`, color, borderColor: color }
                                : undefined
                            }
                          >
                            <span
                              className="size-1.5 rounded-full"
                              style={{ backgroundColor: active ? color : 'var(--border-strong)' }}
                            />
                            {opt.label}
                            <kbd className="rounded border border-border-strong bg-bg-raised px-1 font-mono text-[10px] leading-[14px] text-text-muted">
                              {opt.key}
                            </kbd>
                          </button>
                        )
                      })}
                    </div>
                    <button
                      type="button"
                      onClick={flag}
                      className={clsx(
                        'relative flex h-8 items-center gap-1.5 overflow-hidden rounded-md border px-3 text-[12px] font-medium transition-colors duration-[140ms]',
                        currentAnswer.flagged
                          ? 'border-[var(--flag)] bg-[rgba(249,115,22,0.14)] text-[var(--flag)]'
                          : 'border-border text-text-secondary hover:bg-bg-raised hover:text-text-primary',
                      )}
                    >
                      <Flag className="size-3.5" />
                      Follow-up
                      <kbd className="rounded border border-border-strong bg-bg-raised px-1 font-mono text-[10px] leading-[14px] text-text-muted">
                        F
                      </kbd>
                    </button>
                  </div>

                  {/* speaker notes */}
                  <textarea
                    ref={noteRef}
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                    onBlur={saveNote}
                    rows={4}
                    autoFocus
                    placeholder="Capture what they said — quote specifics, names, ticket numbers…"
                    className="mt-4 w-full resize-y rounded-md border border-border bg-bg-surface px-3 py-2.5 text-[14px] leading-[22px] text-text-primary placeholder:text-text-muted focus:border-border-strong focus:outline-none"
                  />
                  <div className="mt-1 flex items-center justify-between font-mono text-[10px] uppercase tracking-[0.06em] text-text-muted">
                    <span>Notes auto-tag to linked controls</span>
                    <span>⌘S saves</span>
                  </div>

                  {/* expected-answer hint */}
                  <button
                    type="button"
                    onClick={() => setHintOpen((o) => !o)}
                    className="mt-4 flex items-center gap-1.5 text-[12px] font-medium text-text-secondary transition-colors duration-[120ms] hover:text-text-primary"
                  >
                    <ChevronDown className={clsx('size-3.5 transition-transform duration-[160ms]', hintOpen && 'rotate-180')} />
                    What good looks like
                  </button>
                  <AnimatePresence>
                    {hintOpen && (
                      <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: 'auto', opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.2 }}
                        className="overflow-hidden"
                      >
                        <div className="mt-2 rounded-md border border-border bg-bg-surface p-3 text-[13px] leading-5 text-text-secondary">
                          {current.question.guidance}
                          {current.question.probes.length > 0 && (
                            <ul className="mt-2 list-inside list-disc space-y-1 text-text-muted">
                              {current.question.probes.map((p) => (
                                <li key={p}>{p}</li>
                              ))}
                            </ul>
                          )}
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>

                  {/* prev / next */}
                  <div className="mt-8 flex items-center justify-between">
                    <button
                      type="button"
                      onClick={() => goTo(idx - 1)}
                      disabled={idx === 0}
                      className="flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-[12px] font-medium text-text-secondary transition-colors duration-[120ms] hover:bg-bg-raised hover:text-text-primary disabled:opacity-40"
                    >
                      <ArrowLeft className="size-3.5" /> Prev
                    </button>
                    <span className="font-mono text-[11px] text-text-muted">← → navigate · Enter next</span>
                    <button
                      type="button"
                      onClick={() => goTo(idx + 1)}
                      disabled={idx === questions.length - 1}
                      className="flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-[12px] font-medium text-text-secondary transition-colors duration-[120ms] hover:bg-bg-raised hover:text-text-primary disabled:opacity-40"
                    >
                      Next <ArrowRight className="size-3.5" />
                    </button>
                  </div>
                </motion.div>
              </AnimatePresence>
            )}

            {phase === 'review' && (
              <motion.div
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.3, ease: EASE }}
                className="mx-auto max-w-[640px] rounded-lg border border-border bg-bg-surface p-6"
              >
                <div className="font-mono text-[11px] uppercase tracking-[0.08em] text-text-muted">
                  Review skipped
                </div>
                <h2 className="mt-1.5 font-display text-[22px] font-semibold leading-[30px] text-text-primary">
                  {skipped.length} question{skipped.length === 1 ? '' : 's'} still unanswered
                </h2>
                <p className="mt-2 text-[13px] leading-5 text-text-secondary">
                  Jump back to capture an answer, or complete the session with these marked as skipped.
                </p>
                <div className="slim-scroll mt-4 max-h-72 space-y-1 overflow-y-auto">
                  {skipped.map((s) => (
                    <button
                      key={s.question.id}
                      type="button"
                      onClick={() => {
                        setPhase('session')
                        setIdx(questions.indexOf(s))
                      }}
                      className="flex w-full items-center gap-2.5 rounded-md px-2 py-2 text-left transition-colors duration-[120ms] hover:bg-bg-raised"
                    >
                      <span className="size-1.5 shrink-0 rounded-full bg-[var(--status-na)]" />
                      <span className="shrink-0 font-mono text-[11px] text-text-muted">{s.question.controlRef}</span>
                      <span className="truncate text-[13px] text-text-secondary">{s.question.question}</span>
                    </button>
                  ))}
                </div>
                <div className="mt-5 flex items-center justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => setPhase('session')}
                    className="rounded-md border border-border px-3 py-1.5 text-[12px] font-medium text-text-secondary hover:bg-bg-raised hover:text-text-primary"
                  >
                    Back to session
                  </button>
                  <button
                    type="button"
                    onClick={() => setPhase('summary')}
                    className="rounded-md bg-[var(--accent)] px-3 py-1.5 text-[12px] font-semibold text-bg-base hover:bg-[var(--accent-strong)] active:scale-[0.97]"
                  >
                    Complete anyway
                  </button>
                </div>
              </motion.div>
            )}

            {phase === 'summary' && (
              <motion.div
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.35, ease: EASE }}
                className="mx-auto max-w-[640px] rounded-lg border border-border bg-bg-surface p-6"
              >
                <div className="flex items-center gap-6">
                  <ProgressRing value={pct} size={96} />
                  <div>
                    <div className="font-mono text-[11px] uppercase tracking-[0.08em] text-text-muted">
                      Session summary
                    </div>
                    <h2 className="mt-1 font-display text-[22px] font-semibold leading-[30px] text-text-primary">
                      {role.def.name}
                    </h2>
                    <div className="mt-2 font-mono text-[12px] tabular tracking-[0.02em] text-text-secondary">
                      {questions.length} QUESTIONS · {answeredCount} ANSWERED · {followUps.length} FOLLOW-UPS ·{' '}
                      {Math.max(1, Math.round(elapsed / 60))} MIN
                    </div>
                  </div>
                </div>

                {/* framework breakdown */}
                <div className="mt-6 space-y-2 border-t border-border pt-4">
                  {fwBreakdown.map((f, i) => (
                    <motion.div
                      key={f.short}
                      initial={{ opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ duration: 0.25, delay: i * 0.04 }}
                      className="flex items-center gap-3"
                    >
                      <Abbr term={f.short} className="w-28 shrink-0 font-mono text-[11px] uppercase tracking-[0.04em] text-text-secondary">
                        {f.short}
                      </Abbr>
                      <div className="h-1 flex-1 overflow-hidden rounded-full bg-bg-raised">
                        <motion.div
                          initial={{ width: 0 }}
                          animate={{ width: `${f.total ? (f.answered / f.total) * 100 : 0}%` }}
                          transition={{ duration: 0.5, ease: 'easeOut', delay: 0.1 + i * 0.04 }}
                          className="h-full rounded-full bg-[var(--accent)]"
                        />
                      </div>
                      <span className="w-12 text-right font-mono text-[11px] tabular text-text-muted">
                        {f.answered}/{f.total}
                      </span>
                    </motion.div>
                  ))}
                </div>

                {/* follow-ups */}
                {followUps.length > 0 && (
                  <div className="mt-6 border-t border-border pt-4">
                    <div className="font-mono text-[11px] uppercase tracking-[0.08em] text-[var(--flag)]">
                      Follow-ups — push to findings
                    </div>
                    <div className="mt-2 space-y-1">
                      {followUps.map((s) => (
                        <label
                          key={s.question.id}
                          className="flex cursor-pointer items-center gap-2.5 rounded-md px-2 py-1.5 transition-colors duration-[120ms] hover:bg-bg-raised"
                        >
                          <input type="checkbox" defaultChecked className="size-3.5 accent-[#F97316]" />
                          <span className="shrink-0 font-mono text-[11px] text-text-muted">{s.question.controlRef}</span>
                          <span className="truncate text-[13px] text-text-secondary">{s.question.question}</span>
                        </label>
                      ))}
                    </div>
                  </div>
                )}

                <div className="mt-6 flex items-center gap-2 border-t border-border pt-5">
                  <button
                    type="button"
                    onClick={() => {
                      if (!synced) {
                        setSynced(true)
                        completeSession()
                      } else {
                        onExit()
                      }
                    }}
                    className="flex items-center gap-1.5 rounded-md bg-[var(--accent)] px-3.5 py-2 text-[12px] font-semibold text-bg-base transition-colors duration-[120ms] hover:bg-[var(--accent-strong)] active:scale-[0.97]"
                  >
                    {synced ? <Check className="size-3.5" /> : null}
                    {synced ? 'Done — back to directory' : 'Sync answers to audit'}
                  </button>
                  {synced && (
                    <motion.span
                      initial={{ opacity: 0, x: -8 }}
                      animate={{ opacity: 1, x: 0 }}
                      className="font-mono text-[11px] uppercase tracking-[0.04em] text-[var(--accent)]"
                    >
                      {answeredCount} controls updated
                    </motion.span>
                  )}
                  {!synced && (
                    <button
                      type="button"
                      onClick={onScheduleNext}
                      className="rounded-md border border-border px-3 py-2 text-[12px] font-medium text-text-secondary hover:bg-bg-raised hover:text-text-primary"
                    >
                      Schedule next session
                    </button>
                  )}
                </div>
              </motion.div>
            )}
          </div>
        </div>

        {/* 3c — session rail */}
        <aside className="hidden w-[300px] shrink-0 flex-col border-l border-border bg-bg-surface lg:flex">
          <div className="border-b border-border px-4 py-3 font-mono text-[11px] uppercase tracking-[0.08em] text-text-muted">
            Script — {answeredCount}/{questions.length} answered
          </div>
          <div className="slim-scroll flex-1 overflow-y-auto py-1">
            {railGroups.map((g) => (
              <div key={g.topic}>
                <div className="px-4 pb-1 pt-3 font-mono text-[10px] uppercase tracking-[0.06em] text-text-muted">
                  {g.topic} <span className="text-border-strong">{g.items.length}</span>
                </div>
                {g.items.map(({ s, i }) => {
                  const st = answers?.[s.question.id]?.status
                  const active = i === idx && phase === 'session'
                  return (
                    <button
                      key={s.question.id}
                      type="button"
                      onClick={() => {
                        setPhase('session')
                        goTo(i)
                      }}
                      className={clsx(
                        'relative flex h-8 w-full items-center gap-2 px-4 text-left transition-colors duration-[120ms]',
                        active ? 'bg-bg-raised' : 'hover:bg-bg-raised',
                      )}
                    >
                      {active && (
                        <motion.span
                          layoutId="session-rail-indicator"
                          transition={{ duration: 0.2 }}
                          className="absolute left-0 top-0 h-full w-0.5 bg-[var(--accent)]"
                        />
                      )}
                      <span className="w-6 shrink-0 font-mono text-[10px] tabular text-text-muted">
                        {String(i + 1).padStart(2, '0')}
                      </span>
                      <motion.span
                        animate={st ? { scale: [0.6, 1.15, 1] } : { scale: 1 }}
                        transition={{ duration: 0.16 }}
                        className="size-1.5 shrink-0 rounded-full"
                        style={{ backgroundColor: st ? STATUS_DOT[st] : 'var(--border-strong)' }}
                      />
                      <span
                        className={clsx(
                          'truncate text-[12px] leading-4',
                          active ? 'text-text-primary' : 'text-text-secondary',
                        )}
                      >
                        {s.question.question}
                      </span>
                      {answers?.[s.question.id]?.flagged && (
                        <Flag className="ml-auto size-3 shrink-0 text-[var(--flag)]" />
                      )}
                    </button>
                  )
                })}
              </div>
            ))}
          </div>
        </aside>
      </div>

      {/* milestone toast */}
      <AnimatePresence>
        {milestone && (
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 16 }}
            transition={{ duration: 0.2 }}
            className="fixed bottom-6 left-1/2 z-[65] -translate-x-1/2 rounded-md border border-border-strong bg-bg-overlay px-4 py-2 font-mono text-[11px] uppercase tracking-[0.08em] text-[var(--accent)] shadow-popover"
          >
            {milestone}
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  )
}

/* ------------------------------ session history ---------------------------- */

function HistoryTable({ history }: { history: SessionRecord[] }) {
  const [openId, setOpenId] = useState<string | null>(null)
  if (history.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-border-strong bg-bg-surface p-8 text-center">
        <p className="font-mono text-[11px] uppercase tracking-[0.08em] text-text-muted">
          No sessions recorded yet
        </p>
        <p className="mt-1 text-[13px] text-text-secondary">
          Start your first interview from the role directory above — transcripts land here.
        </p>
      </div>
    )
  }
  return (
    <div className="overflow-hidden rounded-lg border border-border bg-bg-surface">
      <div className="grid grid-cols-[90px_1.4fr_90px_1fr_90px_1.6fr_32px] items-center gap-3 border-b border-border bg-bg-raised px-4 py-3 font-mono text-[11px] uppercase tracking-[0.08em] text-text-muted">
        <span>Date</span>
        <span>Stakeholder</span>
        <span>Questions</span>
        <span>Frameworks</span>
        <span>Follow-ups</span>
        <span>Notes</span>
        <span />
      </div>
      {history.map((rec) => {
        const fws = [...new Set(rec.entries.map((e) => e.frameworkShort))]
        const firstNote = rec.entries.find((e) => e.notes)?.notes ?? '—'
        const open = openId === rec.id
        return (
          <div key={rec.id} className="border-b border-border last:border-b-0">
            <button
              type="button"
              onClick={() => setOpenId(open ? null : rec.id)}
              className="grid w-full grid-cols-[90px_1.4fr_90px_1fr_90px_1.6fr_32px] items-center gap-3 px-4 py-2.5 text-left transition-colors duration-[120ms] hover:bg-bg-raised"
            >
              <span className="font-mono text-[12px] tabular text-text-secondary">{fmtDate(rec.completedAt)}</span>
              <RoleChip name={rec.roleName} size="sm" />
              <span className="font-mono text-[12px] tabular text-text-primary">
                {rec.answered}/{rec.total}
              </span>
              <span className="flex flex-wrap gap-1">
                {fws.slice(0, 3).map((f) => (
                  <span key={f} className="rounded-full bg-bg-raised px-1.5 py-px font-mono text-[10px] text-text-secondary">
                    {f}
                  </span>
                ))}
                {fws.length > 3 && (
                  <span className="font-mono text-[10px] text-text-muted">+{fws.length - 3}</span>
                )}
              </span>
              <span
                className={clsx(
                  'font-mono text-[12px] tabular',
                  rec.followUps > 0 ? 'text-[var(--status-partial)]' : 'text-text-muted',
                )}
              >
                {rec.followUps}
              </span>
              <span className="truncate text-[12px] text-text-muted">{firstNote}</span>
              <ChevronDown
                className={clsx('size-4 text-text-muted transition-transform duration-[160ms]', open && 'rotate-180')}
              />
            </button>
            <AnimatePresence>
              {open && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: 'auto', opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  transition={{ duration: 0.26 }}
                  className="overflow-hidden"
                >
                  <div className="border-t border-border bg-bg-base px-4 py-3">
                    <div className="mb-2 font-mono text-[10px] uppercase tracking-[0.08em] text-text-muted">
                      Transcript · {fmtTime(rec.startedAt)} → {fmtTime(rec.completedAt)} · {fmtClock(rec.durationSec)}
                    </div>
                    <div className="slim-scroll max-h-72 space-y-2 overflow-y-auto pr-2">
                      {rec.entries.map((e) => (
                        <div key={e.questionId} className="flex items-start gap-3">
                          <span className="mt-1 shrink-0 font-mono text-[10px] tabular text-text-muted">
                            {fmtTime(e.at)}
                          </span>
                          <span
                            className="mt-1.5 size-1.5 shrink-0 rounded-full"
                            style={{ backgroundColor: STATUS_DOT[e.status] }}
                          />
                          <div className="min-w-0">
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="font-mono text-[11px] text-text-muted">{e.controlRef}</span>
                              <StatusPill status={e.status} />
                              {e.flagged && <Flag className="size-3 text-[var(--flag)]" />}
                            </div>
                            {e.notes && (
                              <p className="mt-0.5 text-[12px] leading-[18px] text-text-secondary">{e.notes}</p>
                            )}
                          </div>
                        </div>
                      ))}
                      {rec.entries.length === 0 && (
                        <p className="text-[12px] text-text-muted">No answers captured in this session.</p>
                      )}
                    </div>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        )
      })}
    </div>
  )
}

/* ---------------------------------- page ----------------------------------- */

type View = { name: 'directory' } | { name: 'session'; role: RoleStats }

export default function Interviews() {
  const directory = useMemo(() => buildRoleDirectory(), [])
  const [prefs, setPrefs] = useState<InterviewPrefs>(loadPrefs)
  const [view, setView] = useState<View>({ name: 'directory' })
  const [scriptRole, setScriptRole] = useState<RoleStats | null>(null)

  useEffect(() => {
    localStorage.setItem(PREFS_KEY, JSON.stringify(prefs))
  }, [prefs])

  const sessionStateFor = (roleId: string): SessionState => {
    const recs = prefs.history.filter((h) => h.roleId === roleId)
    if (recs.length > 0) {
      const last = recs[recs.length - 1]
      return { kind: 'complete', answered: last.answered, total: last.total }
    }
    const sched = prefs.scheduled[roleId]
    if (sched) return { kind: 'scheduled', label: sched }
    return { kind: 'none' }
  }

  const completedRoles = new Set(prefs.history.map((h) => h.roleId)).size

  const toggleExclude = (roleId: string, questionId: string) =>
    setPrefs((p) => {
      const cur = new Set(p.excluded[roleId] ?? [])
      if (cur.has(questionId)) cur.delete(questionId)
      else cur.add(questionId)
      return { ...p, excluded: { ...p.excluded, [roleId]: [...cur] } }
    })

  const scheduleRole = (roleId: string) =>
    setPrefs((p) => ({
      ...p,
      scheduled: { ...p.scheduled, [roleId]: nextScheduleLabel(Object.keys(p.scheduled).length) },
    }))

  const newSession = () => {
    const next = directory.find((r) => sessionStateFor(r.def.id).kind === 'none')
    if (next) {
      scheduleRole(next.def.id)
      setScriptRole(next)
    } else if (directory[0]) {
      setScriptRole(directory[0])
    }
  }

  const sessionQuestions = (role: RoleStats): ScriptQuestion[] => {
    const ex = new Set(prefs.excluded[role.def.id] ?? [])
    return role.questions.filter((s) => !ex.has(s.question.id))
  }

  const onSessionComplete = (record: SessionRecord) =>
    setPrefs((p) => ({ ...p, history: [...p.history, record] }))

  return (
    <div>
      {/* Section 1 — page header */}
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
            Interview Mode
          </motion.h1>
          <motion.p
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.35, ease: EASE, delay: 0.12 }}
            className="mt-2 max-w-2xl text-[14px] leading-[22px] text-text-secondary"
          >
            Every question, routed to the person who can answer it. Pick a stakeholder — AuditOS builds
            the script from all {FRAMEWORKS.length} active frameworks, de-duplicated and ordered by topic.
          </motion.p>
        </div>
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.2, delay: 0.18 }}
          className="flex items-center gap-2"
        >
          <span className="rounded-full border border-border px-3 py-1.5 font-mono text-[11px] tabular tracking-[0.04em] text-text-secondary">
            {directory.length} SESSIONS PLANNED · {completedRoles} COMPLETE
          </span>
          <button
            type="button"
            onClick={newSession}
            className="flex items-center gap-1.5 rounded-md bg-[var(--accent)] px-3 py-1.5 text-[12px] font-semibold text-bg-base transition-colors duration-[120ms] hover:bg-[var(--accent-strong)] active:scale-[0.97]"
          >
            <Plus className="size-3.5" />
            New session
          </button>
        </motion.div>
      </div>

      {/* Section 2 — stakeholder role directory */}
      <div className="mt-6 grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
        {directory.map((role, i) => (
          <RoleCard
            key={role.def.id}
            role={role}
            index={i}
            state={sessionStateFor(role.def.id)}
            onViewScript={() => setScriptRole(role)}
            onStart={() => setView({ name: 'session', role })}
          />
        ))}
      </div>

      {/* Section 5 — session history */}
      <div className="mt-8">
        <div className="mb-3 flex items-center gap-2">
          <CalendarClock className="size-4 text-text-muted" />
          <h2 className="text-[16px] font-semibold leading-6 text-text-primary">Session history</h2>
          <span className="font-mono text-[11px] tabular text-text-muted">{prefs.history.length}</span>
        </div>
        <HistoryTable history={prefs.history} />
      </div>

      {/* script drawer */}
      <AnimatePresence>
        {scriptRole && (
          <ScriptDrawer
            role={scriptRole}
            excluded={new Set(prefs.excluded[scriptRole.def.id] ?? [])}
            onToggleExclude={(qid) => toggleExclude(scriptRole.def.id, qid)}
            onStart={() => {
              setView({ name: 'session', role: scriptRole })
              setScriptRole(null)
            }}
            onClose={() => setScriptRole(null)}
          />
        )}
      </AnimatePresence>

      {/* live session overlay */}
      <AnimatePresence>
        {view.name === 'session' && (
          <SessionOverlay
            role={view.role}
            questions={sessionQuestions(view.role)}
            attendees={['J. Mercer']}
            onExit={() => setView({ name: 'directory' })}
            onComplete={onSessionComplete}
            onScheduleNext={() => {
              scheduleRole(view.role.def.id)
              setView({ name: 'directory' })
            }}
          />
        )}
      </AnimatePresence>
    </div>
  )
}
