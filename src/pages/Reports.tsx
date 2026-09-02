import { useEffect, useMemo, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { AnimatePresence, Reorder, motion, useDragControls, useReducedMotion } from 'framer-motion'
import {
  Check,
  ChevronDown,
  Download,
  FileDown,
  FileJson,
  FileSpreadsheet,
  GripVertical,
  Minus,
  Plus,
  Printer,
  Upload,
  X,
} from 'lucide-react'
import clsx from 'clsx'
import { saveAs } from 'file-saver'
import { useAuditStore } from '@/lib/store'
import type { Answer, AuditQuestion, Engagement, Framework } from '@/lib/types'
import { FRAMEWORKS, allQuestions, getFramework } from '@/data/frameworks'
import { allTerms } from '@/lib/glossary'
import type { GlossaryTerm } from '@/lib/glossary'
import { Abbr } from '@/components/TermTip'
import './reports-print.css'

// ---------------------------------------------------------------------------
// Reports & Export — report builder with live print-ready A4 preview.
// All numbers are computed live from the audit store (design/reports.md).
// ---------------------------------------------------------------------------

type TemplateId = 'exec' | 'full' | 'findings' | 'evidence'
type SectionId =
  | 'cover'
  | 'methodology'
  | 'dashboard'
  | 'chapters'
  | 'findings'
  | 'summary'
  | 'interviews'
  | 'evidence'
  | 'gaps'
  | 'glossary'
  | 'signoff'

interface SectionState {
  id: SectionId
  enabled: boolean
}

const SECTION_LABELS: Record<SectionId, string> = {
  cover: 'Cover & engagement summary',
  methodology: 'Methodology',
  dashboard: 'Executive dashboard',
  chapters: 'Per-framework chapters',
  findings: 'Findings register',
  summary: 'Findings summary',
  interviews: 'Interview log',
  evidence: 'Evidence index',
  gaps: 'Evidence coverage gaps',
  glossary: 'Glossary appendix',
  signoff: 'Sign-off page',
}

const TEMPLATES: Record<
  TemplateId,
  { label: string; meta: string; desc: string; sections: SectionId[] }
> = {
  exec: {
    label: 'Executive Summary',
    meta: '2 PAGES · SCORES, TOP FINDINGS, VERDICT',
    desc: 'Board-ready snapshot: overall posture, per-framework scores and the findings that matter.',
    sections: ['cover', 'dashboard', 'signoff'],
  },
  full: {
    label: 'Full Audit Report',
    meta: '~24 PAGES · EVERYTHING, PER-FRAMEWORK CHAPTERS',
    desc: 'The complete deliverable — methodology, dashboards, framework chapters, registers and sign-off.',
    sections: [
      'cover',
      'methodology',
      'dashboard',
      'chapters',
      'findings',
      'interviews',
      'evidence',
      'glossary',
      'signoff',
    ],
  },
  findings: {
    label: 'Findings Register',
    meta: 'TABULAR · ALL FINDINGS + REMEDIATION PLAN',
    desc: 'Every open finding with severity, ownership, due dates and the remediation plan.',
    sections: ['cover', 'summary', 'findings', 'signoff'],
  },
  evidence: {
    label: 'Evidence Log',
    meta: 'TABULAR · EVIDENCE INDEX + COVERAGE GAPS',
    desc: 'What evidence was collected per control, and where the audit trail still has gaps.',
    sections: ['cover', 'evidence', 'gaps', 'signoff'],
  },
}

function defaultSections(): Record<TemplateId, SectionState[]> {
  const out = {} as Record<TemplateId, SectionState[]>
  for (const id of Object.keys(TEMPLATES) as TemplateId[]) {
    out[id] = TEMPLATES[id].sections.map((s) => ({ id: s, enabled: true }))
  }
  return out
}

// ---------------------------------------------------------------------------
// Report model — derived live from the engagement in the store.
// ---------------------------------------------------------------------------

type Severity = 'critical' | 'high' | 'medium' | 'low'

interface ReportFinding {
  id: string
  title: string
  frameworkId: string
  frameworkName: string
  control: string
  severity: Severity
  likelihood: string
  impact: string
  owner: string
  status: 'Open'
  due: string
  remediation: string
  answerStatus: 'partial' | 'noncompliant'
  flagged: boolean
}

interface DomainRow {
  name: string
  assessed: number
  total: number
  compliantPct: number | null
  status: 'compliant' | 'partial' | 'noncompliant' | 'na'
}

interface FrameworkReport {
  fw: Framework
  answered: number
  total: number
  counts: { compliant: number; partial: number; noncompliant: number; na: number }
  score: number | null
  domains: DomainRow[]
  findings: ReportFinding[]
}

interface ResolvedAnswer {
  key: string
  answer: Answer
  fwId: string
  question: AuditQuestion | null
  phaseName: string
}

interface EvidenceRow {
  frameworkId: string
  frameworkName: string
  control: string
  expected: number
  collected: number
  status: 'complete' | 'partial' | 'missing'
}

interface InterviewRow {
  stakeholder: string
  date: string
  questions: number
  followUps: number
}

interface ReportModel {
  engagement: Engagement
  frameworks: FrameworkReport[]
  findings: ReportFinding[]
  totals: { compliant: number; partial: number; noncompliant: number; na: number; answered: number; total: number }
  overallScore: number | null
  evidence: { expected: number; checked: number; coveragePct: number | null; rows: EvidenceRow[] }
  interviews: InterviewRow[]
  glossaryTerms: GlossaryTerm[]
  assessedAny: boolean
}

// Global question index: questionId → framework + phase.
interface QEntry {
  fw: Framework
  question: AuditQuestion
  phaseName: string
}
const Q_INDEX = new Map<string, QEntry>()
for (const fw of FRAMEWORKS) {
  for (const phase of fw.phases) {
    for (const q of phase.questions) {
      Q_INDEX.set(q.id, { fw, question: q, phaseName: phase.name })
    }
  }
}

/** Resolve an answers-map key to a question. Handles legacy `-qNNN` keys
 *  (1-based index into the framework's question order) used by seed data. */
function resolveAnswerKey(key: string): { fwId: string; question: AuditQuestion | null; phaseName: string } | null {
  const exact = Q_INDEX.get(key)
  if (exact) return { fwId: exact.fw.id, question: exact.question, phaseName: exact.phaseName }
  const m = key.match(/^(.+)-q(\d+)$/)
  if (m) {
    const fw = getFramework(m[1])
    if (fw) {
      const qs = allQuestions(fw.id)
      const idx = Math.max(0, Math.min(qs.length - 1, parseInt(m[2], 10) - 1))
      const question = qs[idx] ?? null
      const phaseName = question
        ? (fw.phases.find((p) => p.questions.some((q) => q.id === question.id))?.name ?? '')
        : ''
      return { fwId: fw.id, question, phaseName }
    }
  }
  return null
}

const SEVERITY_META: Record<Severity, { likelihood: string; impact: string; color: string }> = {
  critical: { likelihood: 'Likely', impact: 'Severe', color: '#EF4444' },
  high: { likelihood: 'Likely', impact: 'Major', color: '#F97316' },
  medium: { likelihood: 'Possible', impact: 'Moderate', color: '#D4A937' },
  low: { likelihood: 'Unlikely', impact: 'Minor', color: '#64748B' },
}

const STATUS_COLORS = {
  compliant: '#10B981',
  partial: '#D4A937',
  noncompliant: '#DC2626',
  na: '#94A3B8',
} as const

function addDays(iso: string, days: number): string {
  const d = new Date(iso)
  d.setDate(d.getDate() + days)
  return d.toISOString().slice(0, 10)
}

function buildModel(engagement: Engagement, scopeIds: string[]): ReportModel {
  const answers = engagement.answers ?? {}

  // Resolve every recorded answer to its framework/question.
  const resolved: ResolvedAnswer[] = []
  for (const [key, answer] of Object.entries(answers)) {
    if (!answer || answer.status === null) continue
    const r = resolveAnswerKey(key)
    if (r && scopeIds.includes(r.fwId)) {
      resolved.push({ key, answer, fwId: r.fwId, question: r.question, phaseName: r.phaseName })
    }
  }
  const byFramework = new Map<string, ResolvedAnswer[]>()
  for (const r of resolved) {
    const list = byFramework.get(r.fwId) ?? []
    list.push(r)
    byFramework.set(r.fwId, list)
  }

  // Findings: partial + non-compliant answers.
  const findings: ReportFinding[] = []
  let findingN = 0
  for (const r of resolved) {
    if (r.answer.status !== 'partial' && r.answer.status !== 'noncompliant') continue
    findingN += 1
    const fw = getFramework(r.fwId)
    const severity: Severity =
      r.answer.status === 'noncompliant' ? (r.answer.flagged ? 'critical' : 'high') : r.answer.flagged ? 'high' : 'medium'
    findings.push({
      id: `F-${String(findingN).padStart(3, '0')}`,
      title: r.question?.controlRef ?? `${fw?.shortName ?? r.fwId} control ${r.key}`,
      frameworkId: r.fwId,
      frameworkName: fw?.shortName ?? r.fwId,
      control: r.question?.controlRef ?? r.key,
      severity,
      likelihood: SEVERITY_META[severity].likelihood,
      impact: SEVERITY_META[severity].impact,
      owner: r.question?.interviewees[0] ?? engagement.auditor,
      status: 'Open',
      due: addDays(engagement.startedAt, 45),
      remediation:
        r.answer.notes ||
        r.question?.guidance.slice(0, 160) ||
        'Remediation owner to confirm corrective action plan.',
      answerStatus: r.answer.status,
      flagged: r.answer.flagged,
    })
  }
  const severityRank: Record<Severity, number> = { critical: 0, high: 1, medium: 2, low: 3 }
  findings.sort((a, b) => severityRank[a.severity] - severityRank[b.severity])

  // Per-framework reports.
  const frameworks: FrameworkReport[] = []
  for (const fwId of scopeIds) {
    const fw = getFramework(fwId)
    if (!fw) continue
    const questions = allQuestions(fwId)
    const list = byFramework.get(fwId) ?? []
    const counts = { compliant: 0, partial: 0, noncompliant: 0, na: 0 }
    let weightSum = 0
    let scoreSum = 0
    for (const r of list) {
      const s = r.answer.status
      if (s === 'compliant' || s === 'partial' || s === 'noncompliant' || s === 'na') counts[s] += 1
      if (s !== 'na' && s !== null) {
        const w = r.question?.weight ?? 1
        weightSum += w
        scoreSum += w * (s === 'compliant' ? 1 : s === 'partial' ? 0.5 : 0)
      }
    }
    const score = weightSum > 0 ? Math.round((scoreSum / weightSum) * 100) : null

    const domains: DomainRow[] = fw.phases.map((phase) => {
      const phaseAnswered = list.filter((r) => r.phaseName === phase.name)
      const compliant = phaseAnswered.filter((r) => r.answer.status === 'compliant').length
      const partial = phaseAnswered.filter((r) => r.answer.status === 'partial').length
      const noncompliant = phaseAnswered.filter((r) => r.answer.status === 'noncompliant').length
      const scored = compliant + partial + noncompliant
      const compliantPct = scored > 0 ? Math.round(((compliant + partial * 0.5) / scored) * 100) : null
      const short = phase.name.replace(/^Phase \d+ — /, '')
      return {
        name: short.length > 46 ? `${short.slice(0, 46)}…` : short,
        assessed: phaseAnswered.length,
        total: phase.questions.length,
        compliantPct,
        status:
          scored === 0
            ? 'na'
            : noncompliant > 0
              ? 'noncompliant'
              : partial > 0
                ? 'partial'
                : 'compliant',
      }
    })

    frameworks.push({
      fw,
      answered: list.length,
      total: questions.length,
      counts,
      score,
      domains,
      findings: findings.filter((f) => f.frameworkId === fwId),
    })
  }

  const totals = { compliant: 0, partial: 0, noncompliant: 0, na: 0, answered: resolved.length, total: 0 }
  for (const fr of frameworks) {
    totals.compliant += fr.counts.compliant
    totals.partial += fr.counts.partial
    totals.noncompliant += fr.counts.noncompliant
    totals.na += fr.counts.na
    totals.total += fr.total
  }
  const scoredFrameworks = frameworks.filter((f) => f.score !== null)
  const overallScore =
    scoredFrameworks.length > 0
      ? Math.round(scoredFrameworks.reduce((a, f) => a + (f.score ?? 0), 0) / scoredFrameworks.length)
      : null

  // Evidence coverage.
  const evidenceRows: EvidenceRow[] = []
  let expected = 0
  let checked = 0
  for (const r of resolved) {
    if (!r.question) continue
    const exp = r.question.evidence.length
    const got = r.answer.evidenceChecked.length
    expected += exp
    checked += got
    evidenceRows.push({
      frameworkId: r.fwId,
      frameworkName: getFramework(r.fwId)?.shortName ?? r.fwId,
      control: r.question.controlRef,
      expected: exp,
      collected: r.answer.evidenceChecked.length,
      status: exp === 0 ? 'complete' : got >= exp ? 'complete' : got > 0 ? 'partial' : 'missing',
    })
  }
  const coveragePct = expected > 0 ? Math.round((checked / expected) * 100) : null

  // Interview log: answered questions grouped by primary stakeholder.
  const interviewMap = new Map<string, { date: string; questions: number; followUps: number }>()
  for (const r of resolved) {
    const who = r.question?.interviewees[0] ?? engagement.auditor
    const row = interviewMap.get(who) ?? { date: r.answer.updatedAt, questions: 0, followUps: 0 }
    row.questions += 1
    if (r.answer.flagged) row.followUps += 1
    if (r.answer.updatedAt > row.date) row.date = r.answer.updatedAt
    interviewMap.set(who, row)
  }
  const interviews: InterviewRow[] = [...interviewMap.entries()]
    .map(([stakeholder, v]) => ({ stakeholder, date: v.date.slice(0, 10), questions: v.questions, followUps: v.followUps }))
    .sort((a, b) => b.questions - a.questions)

  // Glossary appendix: terms tagged with in-scope frameworks.
  const scopeNames = new Set(
    scopeIds.flatMap((id) => {
      const fw = getFramework(id)
      return fw ? [fw.shortName, fw.name] : [id]
    }),
  )
  const glossaryTerms = allTerms()
    .filter((t) => t.frameworks.some((f) => [...scopeNames].some((sn) => sn.startsWith(f) || f.startsWith(sn))))
    .slice(0, 16)

  return {
    engagement,
    frameworks,
    findings,
    totals,
    overallScore,
    evidence: { expected, checked, coveragePct, rows: evidenceRows },
    interviews,
    glossaryTerms,
    assessedAny: resolved.length > 0,
  }
}

// ---------------------------------------------------------------------------
// Export history (localStorage) + CSV/JSON builders.
// ---------------------------------------------------------------------------

interface ExportRecord {
  file: string
  format: 'PDF' | 'CSV' | 'JSON'
  template: string
  generatedBy: string
  date: string
  size: string
}

const HISTORY_KEY = 'auditos-export-history'
const TEMPLATE_KEY = 'auditos-report-template'
const PRINT_TIP_KEY = 'auditos-print-tip-dismissed'

const SEED_HISTORY: ExportRecord[] = [
  { file: 'full-audit-report-2025-02-04.pdf', format: 'PDF', template: 'Full Audit Report', generatedBy: 'J. Mercer', date: '2025-02-04 16:42', size: '2.4 MB' },
  { file: 'findings-register-2025-02-04.csv', format: 'CSV', template: 'Findings Register', generatedBy: 'J. Mercer', date: '2025-02-04 16:10', size: '48 KB' },
  { file: 'answer-matrix-2025-02-03.csv', format: 'CSV', template: 'Full Audit Report', generatedBy: 'R. Okafor', date: '2025-02-03 11:27', size: '312 KB' },
  { file: 'engagement-export-2025-01-31.json', format: 'JSON', template: 'Full Audit Report', generatedBy: 'J. Mercer', date: '2025-01-31 18:03', size: '1.1 MB' },
  { file: 'executive-summary-2025-01-28.pdf', format: 'PDF', template: 'Executive Summary', generatedBy: 'A. Chen', date: '2025-01-28 09:15', size: '640 KB' },
  { file: 'evidence-log-2025-01-24.csv', format: 'CSV', template: 'Evidence Log', generatedBy: 'J. Mercer', date: '2025-01-24 14:50', size: '96 KB' },
]

function loadHistory(): ExportRecord[] {
  try {
    const raw = localStorage.getItem(HISTORY_KEY)
    if (raw) return JSON.parse(raw) as ExportRecord[]
  } catch {
    /* ignore */
  }
  localStorage.setItem(HISTORY_KEY, JSON.stringify(SEED_HISTORY))
  return SEED_HISTORY
}

function csvEscape(value: string | number): string {
  const s = String(value)
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

function toCsv(header: string[], rows: (string | number)[][]): string {
  return [header, ...rows].map((r) => r.map(csvEscape).join(',')).join('\n')
}

function kb(size: number): string {
  return size > 1024 * 1024 ? `${(size / (1024 * 1024)).toFixed(1)} MB` : `${Math.max(1, Math.round(size / 1024))} KB`
}

function todayStamp(): string {
  return new Date().toISOString().slice(0, 10)
}

function nowStamp(): string {
  const d = new Date()
  return `${todayStamp()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

// ---------------------------------------------------------------------------
// A4 sheet components — light print theme (white paper, #111 text, #DDD rules).
// ---------------------------------------------------------------------------

const PAGE_W = 794

interface PrintCfg {
  reportId: string
  period: string
  auditor: string
  client: string
  templateLabel: string
  watermark: boolean
  includeNA: boolean
  includeEvidence: boolean
  logoDataUrl: string | null
}

function Sheet({
  children,
  footerLeft,
  pageNum,
  pageTotal,
  onBlockClick,
}: {
  children: ReactNode
  footerLeft: string
  pageNum: number
  pageTotal: number
  onBlockClick?: () => void
}) {
  return (
    <div className="a4-page" onClick={onBlockClick} role={onBlockClick ? 'button' : undefined}>
      {children}
      <div className="a4-footer">
        <span>{footerLeft}</span>
        <span>
          PAGE {pageNum} OF {pageTotal}
        </span>
      </div>
    </div>
  )
}

/** Chapter header: mono numbering + title + hairline. */
function ChapterHead({ num, title, sub }: { num: string; title: string; sub?: string }) {
  return (
    <div className="mb-5 border-b border-[#BBBBBB] pb-3">
      <div className="a4-mono text-[9px] uppercase tracking-[0.12em] text-[#777777]">{num}</div>
      <h2 className="a4-display mt-1 text-[19px] font-semibold leading-6 text-[#111111]">{title}</h2>
      {sub && <p className="mt-1 text-[11px] leading-4 text-[#555555]">{sub}</p>}
    </div>
  )
}

function PrintRing({ value, size = 96 }: { value: number; size?: number }) {
  const stroke = size >= 90 ? 7 : 4
  const r = (size - stroke) / 2
  const c = 2 * Math.PI * r
  const off = c * (1 - value / 100)
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="#E5E7EB" strokeWidth={stroke} />
      <circle
        cx={size / 2}
        cy={size / 2}
        r={r}
        fill="none"
        stroke="#10B981"
        strokeWidth={stroke}
        strokeDasharray={c}
        strokeDashoffset={off}
        strokeLinecap="round"
        transform={`rotate(-90 ${size / 2} ${size / 2})`}
      />
      <text
        x="50%"
        y="50%"
        dy="0.35em"
        textAnchor="middle"
        fill="#111111"
        fontSize={size >= 90 ? 22 : 12}
        fontWeight={600}
        fontFamily="'Space Grotesk', 'Inter', sans-serif"
      >
        {value}%
      </text>
    </svg>
  )
}

function SeverityTag({ severity }: { severity: Severity }) {
  const color = SEVERITY_META[severity].color
  return (
    <span
      className="a4-mono inline-block rounded-full px-1.5 py-px text-[8.5px] uppercase tracking-[0.06em]"
      style={{ color, border: `1px solid ${color}`, backgroundColor: `${color}14` }}
    >
      {severity}
    </span>
  )
}

function StatusWord({ status }: { status: 'compliant' | 'partial' | 'noncompliant' | 'na' }) {
  const color = STATUS_COLORS[status]
  const label = status === 'na' ? 'N/A' : status === 'noncompliant' ? 'Non-compliant' : status[0].toUpperCase() + status.slice(1)
  return (
    <span className="a4-mono text-[9px] uppercase tracking-[0.06em]" style={{ color }}>
      ● {label}
    </span>
  )
}

// --- Cover -----------------------------------------------------------------

function CoverSheet({ model, cfg }: { model: ReportModel; cfg: PrintCfg }) {
  const e = model.engagement
  return (
    <>
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-2">
          <img src="/logo.svg" alt="" className="size-7" />
          <span className="a4-display text-[15px] font-semibold text-[#111111]">AuditOS</span>
        </div>
        {cfg.logoDataUrl && (
          <img src={cfg.logoDataUrl} alt="Client logo" className="max-h-10 max-w-32 object-contain" />
        )}
      </div>

      <div className="mt-16">
        <div className="a4-mono text-[9px] uppercase tracking-[0.14em] text-[#777777]">
          {e.id} · {cfg.period}
        </div>
        <h1 className="a4-display mt-3 text-[28px] font-semibold leading-[34px] tracking-[-0.01em] text-[#111111]">
          {cfg.client}
        </h1>
        <p className="a4-display mt-2 text-[17px] font-medium leading-6 text-[#333333]">
          {e.name} — {cfg.templateLabel}
        </p>
        <p className="mt-4 max-w-[480px] text-[12px] leading-[18px] text-[#555555]">
          Integrated <Abbr term="GRC">GRC</Abbr> audit across {model.frameworks.length} frameworks. Prepared under
          the engagement scope approved at kickoff; findings reflect fieldwork evidence collected to date.
        </p>
      </div>

      <div className="a4-contour-band mt-10 h-[180px] w-full rounded-sm" />

      <div className="a4-mono mt-auto grid grid-cols-2 gap-x-8 gap-y-2 pt-8 text-[9px] uppercase tracking-[0.08em] text-[#555555]">
        <div>
          <span className="text-[#999999]">REPORT ID</span>
          <div className="mt-0.5 text-[10px] text-[#111111]">{cfg.reportId}</div>
        </div>
        <div>
          <span className="text-[#999999]">PERIOD</span>
          <div className="mt-0.5 text-[10px] text-[#111111]">{cfg.period}</div>
        </div>
        <div>
          <span className="text-[#999999]">LEAD AUDITOR</span>
          <div className="mt-0.5 text-[10px] text-[#111111]">{cfg.auditor}</div>
        </div>
        <div>
          <span className="text-[#999999]">GENERATED</span>
          <div className="mt-0.5 text-[10px] text-[#111111]">{todayStamp()}</div>
        </div>
      </div>

      {cfg.watermark && (
        <div
          className="a4-mono pointer-events-none absolute right-14 top-24 rounded border-2 px-3 py-1 text-[13px] font-semibold uppercase tracking-[0.2em]"
          style={{ color: '#DC2626', borderColor: '#DC2626', transform: 'rotate(-8deg)', opacity: 0.85 }}
        >
          Confidential
        </div>
      )}
    </>
  )
}

// --- Methodology -----------------------------------------------------------

function MethodologySheet({ model }: { model: ReportModel }) {
  return (
    <>
      <ChapterHead num="SECTION 01" title="Methodology" sub="How this engagement was executed and scored" />
      <div className="space-y-3 text-[12px] leading-[18px] text-[#333333]">
        <p>
          This engagement was executed as an integrated <Abbr term="GRC">GRC</Abbr> audit: each in-scope framework was
          assessed control-by-control using the AuditOS guided workflow, with every answer backed by interview
          testimony and documentary evidence. For <Abbr term="ISO">ISO</Abbr> management-system standards the{' '}
          <Abbr term="SoA">SoA</Abbr> and risk-treatment artifacts were tested first; for{' '}
          <Abbr term="SOC 2">SOC 2</Abbr> the <Abbr term="TSC">TSC</Abbr> criteria drove sampling.
        </p>
        <p>
          Each control received one of four ratings — <strong>Compliant</strong>, <strong>Partial</strong>,{' '}
          <strong>Non-Compliant</strong> or <strong>N/A</strong> — weighted 1–3 by audit significance. Framework scores
          are the weight-adjusted mean of scored (non-N/A) controls, where Partial counts 50%. Findings are raised from
          every Partial or Non-Compliant rating and tracked with severity, owner, due date and remediation plan in the
          register.
        </p>
        <p>
          Evidence coverage of {model.evidence.coveragePct ?? 0}% was achieved across{' '}
          {model.evidence.expected} requested artifacts. Coverage gaps are listed in the evidence index and do not
          constitute findings on their own, but limit assurance on the affected controls. Recovery objectives were
          tested against actual restore drills per <Abbr term="RTO">RTO</Abbr>/<Abbr term="RPO">RPO</Abbr>
          targets in the <Abbr term="BCP">BCP</Abbr>.
        </p>
      </div>
      <div className="a4-hairline mt-6 grid grid-cols-3 gap-4 border-t pt-4">
        {[
          ['RATING SCALE', '4-POINT · WEIGHTED 1–3'],
          ['SAMPLING', 'RISK-BASED · 25% MINIMUM'],
          ['EVIDENCE STANDARD', 'INSPECT · OBSERVE · REPERFORM'],
        ].map(([k, v]) => (
          <div key={k}>
            <div className="a4-mono text-[8.5px] uppercase tracking-[0.1em] text-[#999999]">{k}</div>
            <div className="a4-mono mt-1 text-[10px] text-[#111111]">{v}</div>
          </div>
        ))}
      </div>
    </>
  )
}

// --- Executive dashboard ----------------------------------------------------

function DashboardSheet({ model, withVerdict }: { model: ReportModel; withVerdict: boolean }) {
  const score = model.overallScore
  const verdict =
    score === null
      ? 'Assessment not yet started — complete at least one framework chapter to produce a compliance verdict.'
      : score >= 85
        ? 'ON TRACK — the control environment is operating effectively with isolated remediation items.'
        : score >= 60
          ? 'REMEDIATION REQUIRED — material gaps exist in specific domains; a tracked remediation plan is included in this report.'
          : 'SIGNIFICANT GAPS — foundational controls are missing; remediation should precede any certification attempt.'
  return (
    <>
      <ChapterHead
        num="SECTION 02"
        title="Executive Dashboard"
        sub={`${model.totals.answered} of ${model.totals.total} controls assessed across ${model.frameworks.length} frameworks`}
      />
      <div className="flex items-center gap-8">
        <div className="shrink-0">{score !== null ? <PrintRing value={score} /> : <PrintRing value={0} />}</div>
        <div className="flex-1">
          <div className="a4-mono text-[8.5px] uppercase tracking-[0.1em] text-[#999999]">Overall weighted score</div>
          <p className="mt-1 text-[12px] leading-[18px] text-[#333333]">{verdict}</p>
          <div className="mt-3 flex gap-4">
            {(
              [
                ['compliant', model.totals.compliant],
                ['partial', model.totals.partial],
                ['noncompliant', model.totals.noncompliant],
                ['na', model.totals.na],
              ] as const
            ).map(([k, v]) => (
              <div key={k}>
                <div className="a4-mono text-[8.5px] uppercase tracking-[0.08em]" style={{ color: STATUS_COLORS[k] }}>
                  {k === 'na' ? 'N/A' : k === 'noncompliant' ? 'NON-COMPLIANT' : k.toUpperCase()}
                </div>
                <div className="a4-display text-[18px] font-semibold text-[#111111]">{v}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="mt-6">
        <div className="a4-mono mb-2 text-[8.5px] uppercase tracking-[0.1em] text-[#999999]">
          Per-framework weighted scores
        </div>
        <div className="space-y-2">
          {model.frameworks.map((fr) => (
            <div key={fr.fw.id} className="flex items-center gap-3">
              <span className="w-32 truncate text-[11px] font-medium text-[#111111]">{fr.fw.shortName}</span>
              <span className="h-2 flex-1 overflow-hidden rounded-full bg-[#EEEEEE]">
                <span
                  className="block h-full rounded-full"
                  style={{
                    width: `${fr.score ?? 0}%`,
                    backgroundColor:
                      fr.score === null ? '#E5E7EB' : fr.score >= 85 ? '#10B981' : fr.score >= 60 ? '#D4A937' : '#DC2626',
                  }}
                />
              </span>
              <span className="a4-mono w-14 text-right text-[10px] text-[#333333]">
                {fr.score === null ? '—' : `${fr.score}%`}
              </span>
            </div>
          ))}
        </div>
      </div>

      <div className="mt-6">
        <div className="a4-mono mb-2 text-[8.5px] uppercase tracking-[0.1em] text-[#999999]">
          Top findings ({Math.min(5, model.findings.length)} of {model.findings.length})
        </div>
        <table>
          <thead>
            <tr>
              <th className="w-12">ID</th>
              <th>Finding</th>
              <th className="w-20">Framework</th>
              <th className="w-20">Severity</th>
            </tr>
          </thead>
          <tbody>
            {model.findings.slice(0, 5).map((f) => (
              <tr key={f.id}>
                <td className="a4-mono text-[10px]">{f.id}</td>
                <td>{f.title}</td>
                <td>{f.frameworkName}</td>
                <td>
                  <SeverityTag severity={f.severity} />
                </td>
              </tr>
            ))}
            {model.findings.length === 0 && (
              <tr>
                <td colSpan={4} className="text-[#777777]">
                  No findings raised yet — findings appear here as soon as a control is rated Partial or Non-Compliant.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {withVerdict && (
        <div className="a4-hairline mt-auto border-t pt-4">
          <div className="a4-mono text-[8.5px] uppercase tracking-[0.1em] text-[#999999]">Audit verdict</div>
          <p className="a4-display mt-1 text-[14px] font-semibold leading-5 text-[#111111]">{verdict.split('—')[0]}</p>
          <p className="mt-1 text-[11px] leading-4 text-[#555555]">
            Evidence coverage {model.evidence.coveragePct ?? 0}% · {model.findings.length} open findings ·{' '}
            {model.totals.answered}/{model.totals.total} controls assessed.
          </p>
        </div>
      )}
    </>
  )
}

// --- Framework chapter ------------------------------------------------------

function ChapterSheet({ fr, chapterNum, includeNA }: { fr: FrameworkReport; chapterNum: string; includeNA: boolean }) {
  return (
    <>
      <ChapterHead
        num={`CHAPTER ${chapterNum}`}
        title={fr.fw.name}
        sub={`${fr.answered} of ${fr.total} controls assessed · ${fr.findings.length} findings`}
      />
      <div className="flex items-center gap-5">
        <div className="shrink-0">
          {fr.score !== null ? <PrintRing value={fr.score} size={56} /> : <PrintRing value={0} size={56} />}
        </div>
        <div className="flex gap-4">
          {(
            [
              ['compliant', fr.counts.compliant],
              ['partial', fr.counts.partial],
              ['noncompliant', fr.counts.noncompliant],
              ['na', fr.counts.na],
            ] as const
          ).map(([k, v]) => (
            <div key={k}>
              <div className="a4-mono text-[8px] uppercase tracking-[0.08em]" style={{ color: STATUS_COLORS[k] }}>
                {k === 'na' ? 'N/A' : k === 'noncompliant' ? 'NON-COMP.' : k.toUpperCase()}
              </div>
              <div className="a4-display text-[15px] font-semibold text-[#111111]">{v}</div>
            </div>
          ))}
        </div>
      </div>

      <div className="mt-5">
        <div className="a4-mono mb-1.5 text-[8.5px] uppercase tracking-[0.1em] text-[#999999]">Domains / phases</div>
        <table>
          <thead>
            <tr>
              <th>Domain</th>
              <th className="w-20">Assessed</th>
              <th className="w-20">Compliant %</th>
              <th className="w-24">Status</th>
            </tr>
          </thead>
          <tbody>
            {fr.domains.map((d) => (
              <tr key={d.name}>
                <td>{d.name}</td>
                <td className="a4-mono text-[10px]">
                  {d.assessed}/{d.total}
                </td>
                <td className="a4-mono text-[10px]">{d.compliantPct === null ? '—' : `${d.compliantPct}%`}</td>
                <td>
                  <StatusWord status={d.status} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {fr.findings.length > 0 && (
        <div className="mt-5">
          <div className="a4-mono mb-1.5 text-[8.5px] uppercase tracking-[0.1em] text-[#999999]">
            Findings in this chapter
          </div>
          <div className="space-y-2.5">
            {fr.findings.map((f) => (
              <div key={f.id} className="rounded-sm border border-[#DDDDDD] p-3">
                <div className="flex items-center gap-2">
                  <span className="a4-mono text-[9px] text-[#777777]">{f.id}</span>
                  <SeverityTag severity={f.severity} />
                  {f.flagged && (
                    <span className="a4-mono text-[8.5px] uppercase tracking-[0.06em] text-[#F97316]">⚑ flagged</span>
                  )}
                </div>
                <div className="mt-1 text-[11.5px] font-medium leading-4 text-[#111111]">{f.title}</div>
                <p className="mt-1 text-[10.5px] leading-[15px] text-[#555555]">{f.remediation}</p>
                <div className="a4-mono mt-1.5 text-[8.5px] uppercase tracking-[0.06em] text-[#999999]">
                  Owner {f.owner} · Due {f.due} · {f.status}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
      {includeNA && fr.counts.na > 0 && (
        <p className="mt-4 text-[10px] leading-4 text-[#777777]">
          {fr.counts.na} control(s) rated N/A are included in scope totals but excluded from scoring.
        </p>
      )}
    </>
  )
}

// --- Findings register -------------------------------------------------------

function FindingsSummarySheet({ model }: { model: ReportModel }) {
  const bySeverity: Record<Severity, number> = { critical: 0, high: 0, medium: 0, low: 0 }
  for (const f of model.findings) bySeverity[f.severity] += 1
  return (
    <>
      <ChapterHead num="SECTION 02" title="Findings Summary" sub="Severity distribution and ownership" />
      <div className="grid grid-cols-4 gap-4">
        {(Object.keys(bySeverity) as Severity[]).map((s) => (
          <div key={s} className="rounded-sm border border-[#DDDDDD] p-3">
            <SeverityTag severity={s} />
            <div className="a4-display mt-2 text-[24px] font-semibold text-[#111111]">{bySeverity[s]}</div>
            <div className="a4-mono text-[8px] uppercase tracking-[0.08em] text-[#999999]">open findings</div>
          </div>
        ))}
      </div>
      <p className="mt-5 text-[12px] leading-[18px] text-[#333333]">
        {model.findings.length} findings are open across {model.frameworks.length} frameworks. Every finding carries a
        named owner, a due date within 45 days of engagement start, and a remediation summary reviewed during
        fieldwork. Flagged findings (⚑) require auditor follow-up before report finalization.
      </p>
    </>
  )
}

function FindingsSheet({ model }: { model: ReportModel }) {
  return (
    <>
      <ChapterHead
        num="REGISTER"
        title="Findings Register & Remediation Plan"
        sub={`${model.findings.length} open findings · generated ${todayStamp()}`}
      />
      <table>
        <thead>
          <tr>
            <th className="w-10">ID</th>
            <th>Finding / remediation</th>
            <th className="w-16">Fwk</th>
            <th className="w-16">Severity</th>
            <th className="w-20">Owner</th>
            <th className="w-16">Due</th>
            <th className="w-12">Status</th>
          </tr>
        </thead>
        <tbody>
          {model.findings.map((f) => (
            <tr key={f.id}>
              <td className="a4-mono text-[9.5px]">{f.id}</td>
              <td>
                <div className="text-[10.5px] font-medium text-[#111111]">{f.title}</div>
                <div className="mt-0.5 text-[9.5px] leading-[13px] text-[#666666]">{f.remediation}</div>
              </td>
              <td className="text-[10px]">{f.frameworkName}</td>
              <td>
                <SeverityTag severity={f.severity} />
              </td>
              <td className="text-[10px]">{f.owner}</td>
              <td className="a4-mono text-[9.5px]">{f.due}</td>
              <td className="a4-mono text-[9.5px] uppercase text-[#DC2626]">{f.status}</td>
            </tr>
          ))}
          {model.findings.length === 0 && (
            <tr>
              <td colSpan={7} className="text-[#777777]">
                No findings in scope. Rate a control Partial or Non-Compliant in the guided audit to raise one.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </>
  )
}

// --- Interview log -----------------------------------------------------------

function InterviewsSheet({ model }: { model: ReportModel }) {
  return (
    <>
      <ChapterHead num="LOG" title="Interview Log" sub="Stakeholder sessions derived from answered controls" />
      <table>
        <thead>
          <tr>
            <th>Stakeholder</th>
            <th className="w-24">Last session</th>
            <th className="w-20">Questions</th>
            <th className="w-20">Follow-ups</th>
          </tr>
        </thead>
        <tbody>
          {model.interviews.map((r) => (
            <tr key={r.stakeholder}>
              <td className="font-medium text-[#111111]">{r.stakeholder}</td>
              <td className="a4-mono text-[10px]">{r.date}</td>
              <td className="a4-mono text-[10px]">{r.questions}</td>
              <td className="a4-mono text-[10px]" style={{ color: r.followUps > 0 ? '#F97316' : '#111111' }}>
                {r.followUps}
              </td>
            </tr>
          ))}
          {model.interviews.length === 0 && (
            <tr>
              <td colSpan={4} className="text-[#777777]">
                No interview activity recorded yet.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </>
  )
}

// --- Evidence ----------------------------------------------------------------

function EvidenceSheet({ model, summaryOnly }: { model: ReportModel; summaryOnly?: boolean }) {
  const e = model.evidence
  return (
    <>
      <ChapterHead
        num="INDEX"
        title="Evidence Index"
        sub={`${e.checked} of ${e.expected} artifacts collected · coverage ${e.coveragePct ?? 0}%`}
      />
      <div className="mb-4 flex items-center gap-3">
        <span className="h-2 flex-1 overflow-hidden rounded-full bg-[#EEEEEE]">
          <span className="block h-full rounded-full bg-[#10B981]" style={{ width: `${e.coveragePct ?? 0}%` }} />
        </span>
        <span className="a4-mono text-[10px] text-[#333333]">{e.coveragePct ?? 0}%</span>
      </div>
      {!summaryOnly && (
        <table>
          <thead>
            <tr>
              <th>Control</th>
              <th className="w-20">Framework</th>
              <th className="w-16">Expected</th>
              <th className="w-16">Collected</th>
              <th className="w-20">Status</th>
            </tr>
          </thead>
          <tbody>
            {e.rows.map((r, i) => (
              <tr key={`${r.control}-${i}`}>
                <td>{r.control}</td>
                <td className="text-[10px]">{r.frameworkName}</td>
                <td className="a4-mono text-[10px]">{r.expected}</td>
                <td className="a4-mono text-[10px]">{r.collected}</td>
                <td>
                  <StatusWord status={r.status === 'complete' ? 'compliant' : r.status === 'partial' ? 'partial' : 'noncompliant'} />
                </td>
              </tr>
            ))}
            {e.rows.length === 0 && (
              <tr>
                <td colSpan={5} className="text-[#777777]">
                  No evidence requested yet — answered controls with evidence checklists populate this index.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      )}
    </>
  )
}

function EvidenceGapsSheet({ model }: { model: ReportModel }) {
  const gaps = model.evidence.rows.filter((r) => r.status !== 'complete')
  return (
    <>
      <ChapterHead num="GAPS" title="Evidence Coverage Gaps" sub={`${gaps.length} controls with incomplete evidence`} />
      <table>
        <thead>
          <tr>
            <th>Control</th>
            <th className="w-20">Framework</th>
            <th className="w-24">Missing items</th>
          </tr>
        </thead>
        <tbody>
          {gaps.map((r, i) => (
            <tr key={`${r.control}-gap-${i}`}>
              <td>{r.control}</td>
              <td className="text-[10px]">{r.frameworkName}</td>
              <td className="a4-mono text-[10px] text-[#DC2626]">{Math.max(0, r.expected - r.collected)}</td>
            </tr>
          ))}
          {gaps.length === 0 && (
            <tr>
              <td colSpan={3} className="text-[#777777]">
                No coverage gaps — every requested artifact has been collected.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </>
  )
}

// --- Glossary appendix ---------------------------------------------------------

function GlossarySheet({ model }: { model: ReportModel }) {
  return (
    <>
      <ChapterHead num="APPENDIX A" title="Glossary" sub="Terms used throughout this report" />
      <div className="grid grid-cols-2 gap-x-6 gap-y-3">
        {model.glossaryTerms.map((t) => (
          <div key={t.term}>
            <div className="text-[11px] font-semibold text-[#111111]">
              <Abbr term={t.term} />{' '}
              <span className="font-normal text-[#555555]">— {t.fullName}</span>
            </div>
            <p className="mt-0.5 text-[9.5px] leading-[13px] text-[#666666]">{t.definition.slice(0, 150)}…</p>
          </div>
        ))}
      </div>
    </>
  )
}

// --- Sign-off ------------------------------------------------------------------

function SignoffSheet({ model, cfg }: { model: ReportModel; cfg: PrintCfg }) {
  const Line = ({ label, value }: { label: string; value?: string }) => (
    <div className="mt-10">
      <div className="a4-mono text-[8.5px] uppercase tracking-[0.1em] text-[#999999]">{label}</div>
      {value && <div className="mt-1 text-[12px] text-[#111111]">{value}</div>}
      <div className="mt-6 border-b border-[#999999]" />
      <div className="a4-mono mt-1 flex justify-between text-[8px] uppercase tracking-[0.08em] text-[#999999]">
        <span>Signature</span>
        <span>Date</span>
      </div>
    </div>
  )
  return (
    <>
      <ChapterHead num="SIGN-OFF" title="Approval & Sign-off" sub={cfg.reportId} />
      <p className="text-[12px] leading-[18px] text-[#333333]">
        This report was prepared by {cfg.auditor} for {cfg.client} under engagement {model.engagement.id}. Signatures
        below confirm the findings register has been reviewed, remediation owners have accepted their actions, and the
        report is approved for distribution to the audit committee.
      </p>
      <Line label={`Lead auditor — ${cfg.auditor}`} />
      <Line label="Client representative" />
      <div className="a4-hairline mt-auto border-t pt-4">
        <div className="a4-mono text-[8.5px] uppercase tracking-[0.1em] text-[#999999]">Distribution</div>
        <p className="a4-mono mt-1 text-[9.5px] text-[#555555]">
          AUDIT COMMITTEE · <Abbr term="CISO">CISO</Abbr> · <Abbr term="DPO">DPO</Abbr> · ENGAGEMENT FILE (
          {cfg.reportId})
        </p>
      </div>
    </>
  )
}

// ---------------------------------------------------------------------------
// Builder-rail atoms (dark theme side).
// ---------------------------------------------------------------------------

function Panel({
  anchorId,
  title,
  flash,
  defaultOpen = true,
  children,
}: {
  anchorId: string
  title: string
  flash: boolean
  defaultOpen?: boolean
  children: ReactNode
}) {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <section
      id={anchorId}
      className={clsx(
        'rounded-lg border bg-bg-surface transition-colors duration-300',
        flash ? 'border-[var(--accent)] shadow-[0_0_0_1px_var(--accent)]' : 'border-border',
      )}
    >
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center justify-between px-4 py-3 text-left"
      >
        <span className="text-overline text-text-secondary">{title}</span>
        <ChevronDown
          className={clsx('size-4 text-text-muted transition-transform duration-[240ms]', open && 'rotate-180')}
        />
      </button>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.24, ease: 'easeInOut' }}
            className="overflow-hidden"
          >
            <div className="border-t border-border px-4 py-3">{children}</div>
          </motion.div>
        )}
      </AnimatePresence>
    </section>
  )
}

function Toggle({
  checked,
  onChange,
  label,
}: {
  checked: boolean
  onChange: (v: boolean) => void
  label: string
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className="flex w-full items-center justify-between gap-3 rounded-md px-2 py-1.5 text-left transition-colors duration-[120ms] hover:bg-bg-raised"
    >
      <span className="text-[13px] text-text-secondary">{label}</span>
      <span
        className={clsx(
          'relative w-8 shrink-0 rounded-full transition-colors duration-[140ms]',
          checked ? 'bg-[var(--accent)]' : 'bg-bg-raised ring-1 ring-border-strong',
        )}
        style={{ height: 18 }}
      >
        <span
          className={clsx(
            'absolute top-[2px] size-3.5 rounded-full bg-white transition-transform duration-[140ms]',
            checked ? 'translate-x-[14px]' : 'translate-x-[2px]',
          )}
        />
      </span>
    </button>
  )
}

function SortableSectionRow({
  section,
  onToggle,
}: {
  section: SectionState
  onToggle: () => void
}) {
  const controls = useDragControls()
  return (
    <Reorder.Item
      value={section.id}
      dragListener={false}
      dragControls={controls}
      whileDrag={{ scale: 1.02 }}
      transition={{ duration: 0.2 }}
      className="flex items-center gap-2 rounded-md border border-border bg-bg-base px-2 py-2"
    >
      <button
        type="button"
        onPointerDown={(e) => controls.start(e)}
        aria-label="Drag to reorder section"
        className="cursor-grab touch-none text-text-muted transition-colors hover:text-text-secondary active:cursor-grabbing"
      >
        <GripVertical className="size-3.5" />
      </button>
      <button
        type="button"
        role="checkbox"
        aria-checked={section.enabled}
        onClick={onToggle}
        className={clsx(
          'flex size-4 shrink-0 items-center justify-center rounded border transition-colors duration-[120ms]',
          section.enabled
            ? 'border-[var(--accent)] bg-accent-dim text-[var(--accent)]'
            : 'border-border-strong text-transparent hover:border-text-muted',
        )}
      >
        <Check className="size-3" />
      </button>
      <span
        className={clsx(
          'flex-1 text-[13px] transition-colors',
          section.enabled ? 'text-text-primary' : 'text-text-muted line-through',
        )}
      >
        {SECTION_LABELS[section.id]}
      </span>
    </Reorder.Item>
  )
}

// ---------------------------------------------------------------------------
// Scaled A4 sheet — measures natural height and scales with transform.
// ---------------------------------------------------------------------------

function ScaledSheet({ zoom, children }: { zoom: number; children: ReactNode }) {
  const innerRef = useRef<HTMLDivElement>(null)
  const [height, setHeight] = useState(1123)
  useEffect(() => {
    const el = innerRef.current
    if (!el) return
    const update = () => setHeight(el.offsetHeight)
    update()
    const ro = new ResizeObserver(update)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])
  return (
    <div className="report-scale-wrap" style={{ width: PAGE_W * zoom, height: height * zoom }}>
      <div
        ref={innerRef}
        className="report-scale"
        style={{ width: PAGE_W, transform: `scale(${zoom})`, transformOrigin: 'top left' }}
      >
        {children}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Main page.
// ---------------------------------------------------------------------------

type ExportKind = 'pdf' | 'csv-findings' | 'csv-answers' | 'json'

const EXPORT_ROWS: {
  id: ExportKind
  icon: typeof Printer
  title: string
  kbd?: string
  detail: string
  meta?: string
}[] = [
  { id: 'pdf', icon: Printer, title: 'PDF — Print-ready', kbd: '⌘P', detail: 'Best for client presentation.' },
  {
    id: 'csv-findings',
    icon: FileSpreadsheet,
    title: 'CSV — Findings register',
    detail: 'Opens in Excel / GRC tools.',
    meta: 'id, title, framework, control, severity, likelihood, impact, owner, status, due, remediation',
  },
  {
    id: 'csv-answers',
    icon: FileSpreadsheet,
    title: 'CSV — Answer matrix',
    detail: 'Full audit trail.',
    meta: 'framework, phase, control, question, answer, evidence_checked, evidence_expected, flagged, notes, updated_at',
  },
  {
    id: 'json',
    icon: FileJson,
    title: 'JSON — Complete engagement',
    detail: 'For archival or import into another AuditOS workspace.',
    meta: 'auditos-export v1',
  },
]

interface BuilderCfg {
  template: TemplateId
  sections: Record<TemplateId, SectionState[]>
  scope: string[]
  client: string
  auditor: string
  periodStart: string
  periodEnd: string
  reportId: string
  includeEvidence: boolean
  includeNA: boolean
  watermark: boolean
}

function formatPeriod(start: string, end: string): string {
  const fmt = (iso: string) =>
    new Date(`${iso}T00:00:00`).toLocaleDateString('en-US', { month: 'short', day: '2-digit' }).toUpperCase()
  const year = end.slice(0, 4)
  return `${fmt(start)} – ${fmt(end)}, ${year}`
}

export default function Reports() {
  const engagement = useAuditStore((s) => s.engagement)
  const loadMockEngagement = useAuditStore((s) => s.loadMockEngagement)
  const reduceMotion = useReducedMotion()

  // Seed from the bundled mock engagement when no engagement exists.
  useEffect(() => {
    if (!useAuditStore.getState().engagement) loadMockEngagement()
  }, [loadMockEngagement])

  const [template, setTemplate] = useState<TemplateId>('full')
  const [sections, setSections] = useState<Record<TemplateId, SectionState[]>>(defaultSections)
  const [scope, setScope] = useState<string[] | null>(null) // null → all engagement frameworks
  const [client, setClient] = useState('')
  const [auditor, setAuditor] = useState('')
  const [periodStart, setPeriodStart] = useState('')
  const [periodEnd, setPeriodEnd] = useState('2025-02-14')
  const [reportId, setReportId] = useState('RPT-2025-0147-A')
  const [includeEvidence, setIncludeEvidence] = useState(true)
  const [includeNA, setIncludeNA] = useState(false)
  const [watermark, setWatermark] = useState(true)
  const [logoDataUrl, setLogoDataUrl] = useState<string | null>(null)
  const [zoom, setZoom] = useState(0.7)
  const [menuOpen, setMenuOpen] = useState(false)
  const [busy, setBusy] = useState<ExportKind | null>(null)
  const [done, setDone] = useState<ExportKind | null>(null)
  const [tilt, setTilt] = useState(false)
  const [toast, setToast] = useState<string | null>(null)
  const [history, setHistory] = useState<ExportRecord[]>([])
  const [flashPanel, setFlashPanel] = useState<string | null>(null)
  const [hydrated, setHydrated] = useState(false)
  const [printTipDismissed, setPrintTipDismissed] = useState(
    () => typeof localStorage !== 'undefined' && localStorage.getItem(PRINT_TIP_KEY) === '1',
  )

  const menuRef = useRef<HTMLDivElement>(null)
  const sheetRefs = useRef<(HTMLDivElement | null)[]>([])
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Hydrate from saved template + history once engagement is known.
  useEffect(() => {
    if (!engagement || hydrated) return
    setHistory(loadHistory())
    try {
      const raw = localStorage.getItem(TEMPLATE_KEY)
      if (raw) {
        const cfg = JSON.parse(raw) as BuilderCfg
        if (cfg.template && TEMPLATES[cfg.template]) setTemplate(cfg.template)
        if (cfg.sections) setSections({ ...defaultSections(), ...cfg.sections })
        if (Array.isArray(cfg.scope)) setScope(cfg.scope)
        if (cfg.client) setClient(cfg.client)
        if (cfg.auditor) setAuditor(cfg.auditor)
        if (cfg.periodStart) setPeriodStart(cfg.periodStart)
        if (cfg.periodEnd) setPeriodEnd(cfg.periodEnd)
        if (cfg.reportId) setReportId(cfg.reportId)
        setIncludeEvidence(cfg.includeEvidence ?? true)
        setIncludeNA(cfg.includeNA ?? false)
        setWatermark(cfg.watermark ?? true)
      }
    } catch {
      /* ignore corrupt template */
    }
    setHydrated(true)
  }, [engagement, hydrated])

  // Prefill engagement-derived fields (unless overridden by saved template).
  useEffect(() => {
    if (!engagement) return
    setClient((v) => v || engagement.client)
    setAuditor((v) => v || engagement.auditor)
    setPeriodStart((v) => v || engagement.startedAt.slice(0, 10))
    setReportId((v) => v || `RPT-${engagement.id.replace('ENG-', '')}-A`)
  }, [engagement])

  const engagementFrameworks = useMemo(
    () => (engagement ? engagement.frameworks.filter((id) => getFramework(id)) : []),
    [engagement],
  )
  const activeScope = scope ?? engagementFrameworks

  const model = useMemo(
    () => (engagement ? buildModel(engagement, activeScope) : null),
    [engagement, activeScope],
  )

  const cfg: PrintCfg = {
    reportId,
    period: periodStart && periodEnd ? formatPeriod(periodStart, periodEnd) : 'JAN 06 – FEB 14, 2025',
    auditor: auditor || engagement?.auditor || 'J. Mercer',
    client: client || engagement?.client || 'Client',
    templateLabel: TEMPLATES[template].label,
    watermark,
    includeNA,
    includeEvidence,
    logoDataUrl,
  }

  const enabledSections = sections[template].filter((s) => s.enabled).map((s) => s.id)

  // Compose the ordered list of A4 sheets.
  const sheets: { key: string; section: SectionId; label: string; node: ReactNode }[] = []
  if (model) {
    for (const sid of enabledSections) {
      if (sid === 'cover') {
        sheets.push({ key: 'cover', section: 'cover', label: 'COVER', node: <CoverSheet model={model} cfg={cfg} /> })
      } else if (sid === 'methodology') {
        sheets.push({ key: 'methodology', section: 'methodology', label: 'METHOD', node: <MethodologySheet model={model} /> })
      } else if (sid === 'dashboard') {
        sheets.push({
          key: 'dashboard',
          section: 'dashboard',
          label: 'DASH',
          node: <DashboardSheet model={model} withVerdict={template === 'exec'} />,
        })
      } else if (sid === 'chapters') {
        model.frameworks.forEach((fr, i) => {
          sheets.push({
            key: `chapter-${fr.fw.id}`,
            section: 'chapters',
            label: fr.fw.shortName.toUpperCase().slice(0, 8),
            node: <ChapterSheet fr={fr} chapterNum={`${String(i + 3).padStart(2, '0')} — ${fr.fw.shortName}`} includeNA={includeNA} />,
          })
        })
      } else if (sid === 'summary') {
        sheets.push({ key: 'summary', section: 'summary', label: 'SUMMARY', node: <FindingsSummarySheet model={model} /> })
      } else if (sid === 'findings') {
        sheets.push({ key: 'findings', section: 'findings', label: 'FINDINGS', node: <FindingsSheet model={model} /> })
      } else if (sid === 'interviews') {
        sheets.push({ key: 'interviews', section: 'interviews', label: 'INTERVIEW', node: <InterviewsSheet model={model} /> })
      } else if (sid === 'evidence') {
        sheets.push({
          key: 'evidence',
          section: 'evidence',
          label: 'EVIDENCE',
          node: <EvidenceSheet model={model} summaryOnly={!includeEvidence} />,
        })
      } else if (sid === 'gaps') {
        sheets.push({ key: 'gaps', section: 'gaps', label: 'GAPS', node: <EvidenceGapsSheet model={model} /> })
      } else if (sid === 'glossary') {
        sheets.push({ key: 'glossary', section: 'glossary', label: 'GLOSSARY', node: <GlossarySheet model={model} /> })
      } else if (sid === 'signoff') {
        sheets.push({ key: 'signoff', section: 'signoff', label: 'SIGN-OFF', node: <SignoffSheet model={model} cfg={cfg} /> })
      }
    }
  }

  // Close export menu on outside click.
  useEffect(() => {
    if (!menuOpen) return
    const onDown = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [menuOpen])

  const showToast = (msg: string) => {
    if (toastTimer.current) clearTimeout(toastTimer.current)
    setToast(msg)
    toastTimer.current = setTimeout(() => setToast(null), 4000)
  }

  const pushHistory = (record: ExportRecord) => {
    setHistory((h) => {
      const next = [record, ...h].slice(0, 12)
      try {
        localStorage.setItem(HISTORY_KEY, JSON.stringify(next))
      } catch {
        /* ignore */
      }
      return next
    })
  }

  const fileSlug = TEMPLATES[template].label.toLowerCase().replace(/[^a-z0-9]+/g, '-')

  const buildCsvFindings = (): string =>
    toCsv(
      ['id', 'title', 'framework', 'control', 'severity', 'likelihood', 'impact', 'owner', 'status', 'due', 'remediation'],
      (model?.findings ?? []).map((f) => [
        f.id, f.title, f.frameworkName, f.control, f.severity, f.likelihood, f.impact, f.owner, f.status, f.due, f.remediation,
      ]),
    )

  const buildCsvAnswers = (): string => {
    const rows: (string | number)[][] = []
    if (engagement) {
      for (const fwId of activeScope) {
        const fw = getFramework(fwId)
        if (!fw) continue
        for (const phase of fw.phases) {
          for (const q of phase.questions) {
            const a = engagement.answers[q.id]
            rows.push([
              fw.shortName, phase.name, q.controlRef, q.question,
              a?.status ? a.status.toUpperCase() : 'UNANSWERED',
              a?.evidenceChecked.length ?? 0, q.evidence.length,
              a?.flagged ? 'YES' : 'NO',
              a?.notes ?? '', a?.updatedAt ?? '',
            ])
          }
        }
      }
    }
    return toCsv(
      ['framework', 'phase', 'control', 'question', 'answer', 'evidence_checked', 'evidence_expected', 'flagged', 'notes', 'updated_at'],
      rows,
    )
  }

  const buildJson = (): string =>
    JSON.stringify(
      {
        schema: 'auditos-export v1',
        exportedAt: new Date().toISOString(),
        report: { id: reportId, template: TEMPLATES[template].label, period: cfg.period },
        engagement: engagement && {
          id: engagement.id,
          client: cfg.client,
          name: engagement.name,
          auditor: cfg.auditor,
          startedAt: engagement.startedAt,
          frameworks: activeScope,
        },
        frameworks: model?.frameworks.map((fr) => ({
          id: fr.fw.id,
          name: fr.fw.name,
          version: fr.fw.version,
          score: fr.score,
          answered: fr.answered,
          total: fr.total,
          counts: fr.counts,
          domains: fr.domains,
        })),
        answers: engagement?.answers ?? {},
        findings: model?.findings ?? [],
        evidence: model?.evidence ?? null,
        interviews: model?.interviews ?? [],
      },
      null,
      2,
    )

  const performExport = (kind: ExportKind): ExportRecord => {
    const stamp = todayStamp()
    if (kind === 'pdf') {
      window.print()
      return { file: `${fileSlug}-${stamp}.pdf`, format: 'PDF', template: TEMPLATES[template].label, generatedBy: cfg.auditor, date: nowStamp(), size: '—' }
    }
    if (kind === 'csv-findings') {
      const csv = buildCsvFindings()
      const file = `findings-register-${stamp}.csv`
      saveAs(new Blob([csv], { type: 'text/csv;charset=utf-8' }), file)
      return { file, format: 'CSV', template: TEMPLATES[template].label, generatedBy: cfg.auditor, date: nowStamp(), size: kb(new Blob([csv]).size) }
    }
    if (kind === 'csv-answers') {
      const csv = buildCsvAnswers()
      const file = `answer-matrix-${stamp}.csv`
      saveAs(new Blob([csv], { type: 'text/csv;charset=utf-8' }), file)
      return { file, format: 'CSV', template: TEMPLATES[template].label, generatedBy: cfg.auditor, date: nowStamp(), size: kb(new Blob([csv]).size) }
    }
    const json = buildJson()
    const file = `engagement-export-${stamp}.json`
    saveAs(new Blob([json], { type: 'application/json;charset=utf-8' }), file)
    return { file, format: 'JSON', template: TEMPLATES[template].label, generatedBy: cfg.auditor, date: nowStamp(), size: kb(new Blob([json]).size) }
  }

  const runExport = (kind: ExportKind) => {
    if (busy) return
    setBusy(kind)
    setDone(null)
    window.setTimeout(
      () => {
        const record = performExport(kind)
        pushHistory(record)
        showToast(`${record.file} · ${record.size}`)
        setBusy(null)
        setDone(kind)
        window.setTimeout(() => {
          setDone(null)
          setMenuOpen(false)
        }, 900)
      },
      reduceMotion ? 0 : 600,
    )
  }

  const saveTemplate = () => {
    const cfgToSave: BuilderCfg = {
      template, sections, scope: activeScope, client, auditor,
      periodStart, periodEnd, reportId, includeEvidence, includeNA, watermark,
    }
    try {
      localStorage.setItem(TEMPLATE_KEY, JSON.stringify(cfgToSave))
      showToast('Template saved — restored on your next visit')
    } catch {
      showToast('Could not save template (storage unavailable)')
    }
  }

  const flashConfig = (panel: string) => {
    setFlashPanel(panel)
    document.getElementById(`cfg-${panel}`)?.scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth', block: 'center' })
    window.setTimeout(() => setFlashPanel(null), 700)
  }

  const panelForSection = (sid: SectionId): string =>
    sid === 'cover' ? 'branding' : sid === 'chapters' ? 'scope' : 'sections'

  const footerLeft = `${engagement?.id ?? 'ENG-2025-0147'} · ${reportId}`

  if (!engagement || !model) {
    return (
      <div className="rounded-lg border border-border bg-bg-surface p-8 text-[14px] text-text-secondary">
        Preparing engagement data…
      </div>
    )
  }

  const inputCls =
    'w-full rounded-md border border-border bg-bg-base px-2.5 py-1.5 text-[13px] text-text-primary placeholder:text-text-muted focus:border-[var(--accent)] focus:outline-none'

  return (
    <div className="reports-page space-y-6">
      {/* ---------------------------------------------------------------- */}
      {/* Header                                                            */}
      {/* ---------------------------------------------------------------- */}
      <motion.div
        initial={reduceMotion ? false : { opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
        className="no-print flex items-start justify-between gap-4"
      >
        <div>
          <div className="text-overline text-text-muted">Workspace</div>
          <h1 className="mt-1 font-display text-[30px] font-semibold leading-[38px] tracking-[-0.02em] text-text-primary">
            Reports & Export
          </h1>
          <p className="mt-1 max-w-xl text-[14px] leading-[22px] text-text-secondary">
            Every number in the preview is live audit data. Configure sections on the left — the document updates as
            you work.
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <button
            type="button"
            onClick={saveTemplate}
            className="rounded-md border border-border px-3.5 py-2 text-[13px] font-medium text-text-secondary transition-colors duration-[120ms] hover:border-border-strong hover:bg-bg-raised hover:text-text-primary active:scale-[0.97]"
          >
            Save template
          </button>
          <div className="relative" ref={menuRef}>
            <button
              type="button"
              onClick={() => setMenuOpen((o) => !o)}
              className="flex items-center gap-2 rounded-md bg-[var(--accent)] px-4 py-2 text-[13px] font-semibold text-[#0A0D10] transition-colors duration-[120ms] hover:bg-[var(--accent-strong)] active:scale-[0.97]"
            >
              <FileDown className="size-4" />
              Export
            </button>
            <AnimatePresence>
              {menuOpen && (
                <motion.div
                  initial={{ opacity: 0, scale: 0.96, y: -4 }}
                  animate={{ opacity: 1, scale: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.96, y: -4 }}
                  transition={{ duration: 0.14, ease: 'easeOut' }}
                  className="absolute right-0 top-full z-40 mt-2 w-[320px] rounded-[10px] border border-border-strong bg-bg-overlay p-1.5 shadow-[0_12px_32px_rgba(0,0,0,0.5)]"
                >
                  {EXPORT_ROWS.map((row, i) => (
                    <motion.button
                      key={row.id}
                      type="button"
                      initial={reduceMotion ? false : { opacity: 0, y: 4 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ duration: 0.14, delay: reduceMotion ? 0 : i * 0.03 }}
                      onClick={() => runExport(row.id)}
                      onMouseEnter={() => row.id === 'pdf' && setTilt(true)}
                      onMouseLeave={() => row.id === 'pdf' && setTilt(false)}
                      className="flex w-full items-start gap-3 rounded-md px-2.5 py-2.5 text-left transition-colors duration-[120ms] hover:bg-bg-raised"
                    >
                      <span className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-md bg-bg-raised text-text-secondary">
                        {done === row.id ? (
                          <Check className="size-4 text-[var(--accent)]" />
                        ) : (
                          <row.icon className="size-4" />
                        )}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="flex items-center gap-2">
                          <span className="text-[13px] font-medium text-text-primary">{row.title}</span>
                          {row.kbd && (
                            <kbd className="rounded border border-border-strong bg-bg-raised px-1 py-px font-mono text-[10px] leading-[14px] text-text-secondary">
                              {row.kbd}
                            </kbd>
                          )}
                        </span>
                        <span className="mt-0.5 block text-[12px] text-text-muted">{row.detail}</span>
                        {row.meta && (
                          <span className="mt-1 block truncate font-mono text-[10px] text-text-muted" title={row.meta}>
                            {row.meta}
                          </span>
                        )}
                        {busy === row.id && (
                          <span className="mt-2 block h-1 w-full overflow-hidden rounded-full bg-bg-base">
                            <motion.span
                              className="block h-full rounded-full bg-[var(--accent)]"
                              initial={{ width: '0%' }}
                              animate={{ width: '100%' }}
                              transition={{ duration: 0.6, ease: 'easeInOut' }}
                            />
                          </span>
                        )}
                      </span>
                    </motion.button>
                  ))}
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>
      </motion.div>

      {/* ---------------------------------------------------------------- */}
      {/* Workspace: builder rail + live preview                            */}
      {/* ---------------------------------------------------------------- */}
      <div className="reports-workspace flex items-start gap-6">
        {/* Builder rail */}
        <aside className="no-print sticky top-0 w-[360px] shrink-0 space-y-3 self-start">
          <Panel anchorId="cfg-template" title="Template" flash={flashPanel === 'template'}>
            <div className="space-y-3">
              {(Object.keys(TEMPLATES) as TemplateId[]).map((id) => {
                const t = TEMPLATES[id]
                const selected = template === id
                return (
                  <button
                    key={id}
                    type="button"
                    role="radio"
                    aria-checked={selected}
                    onClick={() => setTemplate(id)}
                    className={clsx(
                      'w-full rounded-lg border p-3 text-left transition-colors duration-[140ms]',
                      selected
                        ? 'border-[var(--accent)] bg-accent-dim'
                        : 'border-border bg-bg-base hover:border-border-strong',
                    )}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-[14px] font-semibold text-text-primary">{t.label}</span>
                      <span
                        className={clsx(
                          'size-3.5 rounded-full border-2',
                          selected ? 'border-[var(--accent)] bg-[var(--accent)]' : 'border-border-strong',
                        )}
                      />
                    </div>
                    <div className="mt-1 font-mono text-[10px] tracking-[0.06em] text-text-muted">{t.meta}</div>
                    <p className="mt-1.5 text-[12px] leading-[18px] text-text-secondary">{t.desc}</p>
                  </button>
                )
              })}
            </div>
          </Panel>

          <Panel anchorId="cfg-scope" title="Scope" flash={flashPanel === 'scope'}>
            <div className="mb-2 flex items-center justify-between">
              <span className="text-overline text-text-muted">Frameworks ({activeScope.length})</span>
              <button
                type="button"
                onClick={() => setScope(activeScope.length === engagementFrameworks.length ? [] : [...engagementFrameworks])}
                className="font-mono text-[11px] uppercase tracking-[0.04em] text-[var(--accent)] hover:text-[var(--accent-strong)]"
              >
                {activeScope.length === engagementFrameworks.length ? 'Clear' : 'Select all'}
              </button>
            </div>
            <div className="grid grid-cols-2 gap-1.5">
              {engagementFrameworks.map((id) => {
                const fw = getFramework(id)!
                const on = activeScope.includes(id)
                return (
                  <button
                    key={id}
                    type="button"
                    role="checkbox"
                    aria-checked={on}
                    onClick={() =>
                      setScope(on ? activeScope.filter((f) => f !== id) : [...activeScope, id])
                    }
                    className={clsx(
                      'flex items-center gap-1.5 rounded-md border px-2 py-1.5 text-left font-mono text-[11px] transition-colors duration-[120ms]',
                      on ? 'border-[var(--accent)] bg-accent-dim text-[var(--accent)]' : 'border-border text-text-secondary hover:border-border-strong',
                    )}
                  >
                    <Check className={clsx('size-3 shrink-0', on ? 'opacity-100' : 'opacity-0')} />
                    <span className="truncate">{fw.shortName}</span>
                  </button>
                )
              })}
            </div>
            <div className="mt-3 grid grid-cols-2 gap-2">
              <label className="block">
                <span className="text-overline text-text-muted">Period start</span>
                <input type="date" value={periodStart} onChange={(e) => setPeriodStart(e.target.value)} className={clsx(inputCls, 'mt-1 font-mono text-[12px]')} />
              </label>
              <label className="block">
                <span className="text-overline text-text-muted">Period end</span>
                <input type="date" value={periodEnd} onChange={(e) => setPeriodEnd(e.target.value)} className={clsx(inputCls, 'mt-1 font-mono text-[12px]')} />
              </label>
            </div>
            <div className="mt-3 space-y-2">
              <label className="block">
                <span className="text-overline text-text-muted">Client</span>
                <input value={client} onChange={(e) => setClient(e.target.value)} className={clsx(inputCls, 'mt-1')} />
              </label>
              <label className="block">
                <span className="text-overline text-text-muted">Lead auditor</span>
                <input value={auditor} onChange={(e) => setAuditor(e.target.value)} className={clsx(inputCls, 'mt-1')} />
              </label>
            </div>
          </Panel>

          <Panel anchorId="cfg-sections" title={`Sections — ${TEMPLATES[template].label}`} flash={flashPanel === 'sections'}>
            <Reorder.Group
              axis="y"
              values={sections[template].map((s) => s.id)}
              onReorder={(ids) =>
                setSections((prev) => ({
                  ...prev,
                  [template]: ids.map((id) => prev[template].find((s) => s.id === id)!),
                }))
              }
              className="space-y-1.5"
            >
              {sections[template].map((s) => (
                <SortableSectionRow
                  key={s.id}
                  section={s}
                  onToggle={() =>
                    setSections((prev) => ({
                      ...prev,
                      [template]: prev[template].map((x) => (x.id === s.id ? { ...x, enabled: !x.enabled } : x)),
                    }))
                  }
                />
              ))}
            </Reorder.Group>
            <p className="mt-2 font-mono text-[10px] leading-4 text-text-muted">
              DRAG THE HANDLE TO REORDER · DISABLED SECTIONS DROP OUT OF THE PREVIEW
            </p>
          </Panel>

          <Panel anchorId="cfg-branding" title="Branding & options" flash={flashPanel === 'branding'} defaultOpen={false}>
            <label
              className={clsx(
                'flex cursor-pointer items-center justify-center gap-2 rounded-md border border-dashed border-border-strong px-3 py-4 text-[12px] text-text-muted transition-colors duration-[120ms] hover:border-[var(--accent)] hover:text-text-secondary',
              )}
            >
              <Upload className="size-4" />
              {logoDataUrl ? 'Client logo attached — click to replace' : 'Drop client logo or click to upload'}
              <input
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0]
                  if (!file) return
                  const reader = new FileReader()
                  reader.onload = () => setLogoDataUrl(String(reader.result))
                  reader.readAsDataURL(file)
                }}
              />
            </label>
            <label className="mt-3 block">
              <span className="text-overline text-text-muted">Report ID</span>
              <input value={reportId} onChange={(e) => setReportId(e.target.value)} className={clsx(inputCls, 'mt-1 font-mono text-[12px]')} />
            </label>
            <div className="mt-2 space-y-0.5">
              <Toggle checked={includeEvidence} onChange={setIncludeEvidence} label="Include evidence thumbnails" />
              <Toggle checked={includeNA} onChange={setIncludeNA} label="Include N/A controls" />
              <Toggle checked={watermark} onChange={setWatermark} label="Confidential watermark" />
            </div>
          </Panel>
        </aside>

        {/* Live preview canvas */}
        <div className="reports-canvas bg-dots min-w-0 flex-1 rounded-lg border border-border bg-bg-base p-6">
          {/* Print coach tip */}
          {!printTipDismissed && (
            <div className="no-print mb-4 flex items-center justify-between gap-3 rounded-md border border-border-strong bg-bg-overlay px-3 py-2">
              <p className="font-mono text-[11px] text-text-secondary">
                In the print dialog choose “Save as PDF”, margins: None, background graphics: ON.
              </p>
              <button
                type="button"
                aria-label="Dismiss print tip"
                onClick={() => {
                  setPrintTipDismissed(true)
                  try {
                    localStorage.setItem(PRINT_TIP_KEY, '1')
                  } catch {
                    /* ignore */
                  }
                }}
                className="text-text-muted transition-colors hover:text-text-primary"
              >
                <X className="size-3.5" />
              </button>
            </div>
          )}

          <div className="flex items-start gap-4">
            {/* Page thumbnails rail */}
            <div className="no-print sticky top-0 w-16 shrink-0 space-y-2 self-start">
              {sheets.map((s, i) => (
                <button
                  key={s.key}
                  type="button"
                  onClick={() => sheetRefs.current[i]?.scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth', block: 'start' })}
                  className="group flex w-16 flex-col items-center gap-1"
                  title={`Page ${i + 1} — ${s.label}`}
                >
                  <span className="flex aspect-[210/297] w-14 items-center justify-center rounded-[2px] border border-border-strong bg-[#161C22] font-mono text-[10px] text-text-muted shadow-[0_4px_12px_rgba(0,0,0,0.4)] transition-colors duration-[140ms] group-hover:border-[var(--accent)] group-hover:text-text-primary">
                    {i + 1}
                  </span>
                  <span className="w-full truncate text-center font-mono text-[8px] tracking-[0.06em] text-text-muted">
                    {s.label}
                  </span>
                </button>
              ))}
            </div>

            {/* Sheets */}
            <motion.div
              animate={{ rotate: tilt && !reduceMotion ? -1.5 : 0 }}
              transition={{ duration: 0.16 }}
              className="mx-auto space-y-6"
            >
              {!model.assessedAny && (
                <div className="no-print mb-2 rounded-md border border-dashed border-border-strong bg-bg-surface px-4 py-3 text-center font-mono text-[11px] text-text-secondary">
                  Complete at least one framework chapter to unlock the full report — showing cover + structure preview.
                </div>
              )}
              {sheets.map((s, i) => (
                <motion.div
                  key={s.key}
                  ref={(el) => {
                    sheetRefs.current[i] = el
                  }}
                  layout={reduceMotion ? false : 'position'}
                  initial={reduceMotion ? false : { opacity: 0, x: 24 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ duration: 0.22, ease: 'easeOut' }}
                >
                  <ScaledSheet zoom={zoom}>
                    <Sheet
                      footerLeft={footerLeft}
                      pageNum={i + 1}
                      pageTotal={sheets.length}
                      onBlockClick={() => flashConfig(panelForSection(s.section))}
                    >
                      {s.node}
                    </Sheet>
                  </ScaledSheet>
                </motion.div>
              ))}
              {sheets.length === 0 && (
                <div className="rounded-lg border border-dashed border-border-strong bg-bg-surface p-10 text-center text-[13px] text-text-muted">
                  All sections are disabled — enable at least one section in the builder rail.
                </div>
              )}
            </motion.div>
          </div>

          {/* Zoom controls */}
          <div className="no-print sticky bottom-4 mt-6 flex justify-end">
            <div className="flex items-center gap-1 rounded-md border border-border-strong bg-bg-overlay px-1.5 py-1 shadow-[0_12px_32px_rgba(0,0,0,0.5)]">
              <button
                type="button"
                aria-label="Zoom out"
                onClick={() => setZoom((z) => Math.max(0.4, Math.round((z - 0.1) * 10) / 10))}
                className="rounded p-1 text-text-secondary transition-colors hover:bg-bg-raised hover:text-text-primary"
              >
                <Minus className="size-3.5" />
              </button>
              <span className="w-12 text-center font-mono text-[11px] tabular text-text-secondary">
                {Math.round(zoom * 100)}%
              </span>
              <button
                type="button"
                aria-label="Zoom in"
                onClick={() => setZoom((z) => Math.min(1.3, Math.round((z + 0.1) * 10) / 10))}
                className="rounded p-1 text-text-secondary transition-colors hover:bg-bg-raised hover:text-text-primary"
              >
                <Plus className="size-3.5" />
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* ---------------------------------------------------------------- */}
      {/* Export history                                                     */}
      {/* ---------------------------------------------------------------- */}
      <motion.section
        initial={reduceMotion ? false : { opacity: 0, y: 12 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, amount: 0.2 }}
        transition={{ duration: 0.3 }}
        className="no-print rounded-lg border border-border bg-bg-surface"
      >
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <h2 className="text-overline text-text-secondary">Export history</h2>
          <span className="font-mono text-[11px] text-text-muted">{history.length} FILES</span>
        </div>
        <table className="w-full">
          <thead>
            <tr className="border-b border-border-strong text-left">
              {['File', 'Template', 'Generated by', 'Date', 'Size', ''].map((h) => (
                <th key={h} className="px-4 py-3 font-mono text-[11px] font-medium uppercase tracking-[0.08em] text-text-muted">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {history.map((r, i) => (
              <tr key={`${r.file}-${i}`} className="border-b border-border transition-colors duration-[120ms] last:border-0 hover:bg-bg-raised">
                <td className="px-4 py-3">
                  <div className="flex items-center gap-2.5">
                    <span className="flex size-7 items-center justify-center rounded-md bg-bg-raised text-text-muted">
                      {r.format === 'PDF' ? <Printer className="size-3.5" /> : r.format === 'CSV' ? <FileSpreadsheet className="size-3.5" /> : <FileJson className="size-3.5" />}
                    </span>
                    <span className="font-mono text-[12px] text-text-primary">{r.file}</span>
                    <span
                      className={clsx(
                        'rounded-full px-1.5 py-px font-mono text-[10px] leading-4',
                        r.format === 'PDF' && 'bg-[rgba(248,113,113,0.12)] text-[var(--status-noncompliant)]',
                        r.format === 'CSV' && 'bg-accent-dim text-[var(--accent)]',
                        r.format === 'JSON' && 'bg-[rgba(45,212,191,0.12)] text-[#2DD4BF]',
                      )}
                    >
                      {r.format}
                    </span>
                  </div>
                </td>
                <td className="px-4 py-3 text-[13px] text-text-secondary">{r.template}</td>
                <td className="px-4 py-3">
                  <span className="inline-flex items-center gap-1.5 rounded-full border border-border py-0.5 pl-0.5 pr-2">
                    <img src="/avatar-jm.svg" alt="" className="size-5 rounded-full" />
                    <span className="text-[12px] text-text-secondary">{r.generatedBy}</span>
                  </span>
                </td>
                <td className="px-4 py-3 font-mono text-[12px] tabular text-text-secondary">{r.date}</td>
                <td className="px-4 py-3 font-mono text-[12px] tabular text-text-secondary">{r.size}</td>
                <td className="px-4 py-3 text-right">
                  <button
                    type="button"
                    onClick={() =>
                      runExport(r.format === 'PDF' ? 'pdf' : r.format === 'JSON' ? 'json' : 'csv-findings')
                    }
                    className="inline-flex items-center gap-1.5 rounded-md border border-border px-2.5 py-1.5 text-[12px] font-medium text-text-secondary transition-colors duration-[120ms] hover:border-border-strong hover:bg-bg-raised hover:text-text-primary"
                  >
                    <Download className="size-3.5" />
                    Download
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </motion.section>

      {/* Toast */}
      <AnimatePresence>
        {toast && (
          <motion.div
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 24 }}
            transition={{ duration: 0.22, ease: 'easeOut' }}
            className="no-print fixed bottom-14 left-1/2 z-[80] flex -translate-x-1/2 items-center gap-2.5 rounded-md border border-border-strong bg-bg-overlay px-4 py-2.5 shadow-[0_12px_32px_rgba(0,0,0,0.5)]"
          >
            <Check className="size-4 text-[var(--accent)]" />
            <span className="font-mono text-[12px] text-text-primary">{toast}</span>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
