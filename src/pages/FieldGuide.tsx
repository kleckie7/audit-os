import { useCallback, useEffect, useRef, useState } from 'react'
import { Link } from 'react-router'
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import type { LucideIcon } from 'lucide-react'
import {
  ArrowRight,
  Bot,
  Check,
  ChevronDown,
  CircleAlert,
  CreditCard,
  Crosshair,
  FileText,
  Grid3x3,
  Hexagon,
  Lock,
  MessagesSquare,
  Quote,
  ShieldCheck,
  Triangle,
} from 'lucide-react'
import clsx from 'clsx'
import ProgressRing from '@/components/ProgressRing'
import { Abbr } from '@/components/TermTip'
import { hasTerm } from '@/lib/glossary'
import { getFramework } from '@/data/frameworks'
import RichText from '@/pages/workflow-rich-text'

// Field Guide (/field-guide) — the auditor's engagement playbook.
// Seven chapters of practitioner craft: scoping, leadership interviews, control
// design, operating effectiveness, interview technique, framework entry points,
// findings & closing. Left sticky chapter nav with scroll-spy; localStorage-
// persisted document-request checklist.

const EASE: [number, number, number, number] = [0.22, 1, 0.36, 1]

/* ------------------------------- chapter meta ------------------------------- */

interface Chapter {
  id: string
  num: string
  kicker: string
  title: string
}

const CHAPTERS: Chapter[] = [
  { id: 'setup', num: '01', kicker: 'Before you talk to anyone', title: 'Engagement Setup' },
  { id: 'leadership', num: '02', kicker: 'Week 1', title: 'Leadership & Tone at the Top' },
  { id: 'control-design', num: '03', kicker: 'Weeks 1–3', title: 'Control Design: The Middle Layers' },
  { id: 'effectiveness', num: '04', kicker: 'Weeks 3–5', title: "Operating Effectiveness: Verify, Don't Trust" },
  { id: 'interview-craft', num: '05', kicker: 'Technique', title: 'The Interview Craft' },
  { id: 'framework-entry', num: '06', kicker: 'Where to open each book', title: 'Framework Entry Points' },
  { id: 'closing', num: '07', kicker: 'Land the plane', title: 'Findings & Closing' },
]

/* --------------------------------- helpers --------------------------------- */

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

function MonoLabel({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <span
      className={clsx(
        'font-mono text-[11px] font-medium uppercase leading-4 tracking-[0.08em] text-text-muted',
        className,
      )}
    >
      {children}
    </span>
  )
}

/** Cream editorial strip — a field-note callout that breaks the dark surface. */
function FieldNote({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="mt-6 rounded-lg bg-cream p-5">
      <div className="font-mono text-[10px] font-medium uppercase leading-4 tracking-[0.1em] text-cream-muted">
        {label}
      </div>
      <p className="mt-2 font-display text-[16px] font-medium leading-[24px] tracking-[-0.01em] text-cream-ink">
        {children}
      </p>
    </div>
  )
}

function ChapterHeader({ chapter }: { chapter: Chapter }) {
  return (
    <div className="border-b border-border pb-4">
      <div className="flex items-baseline gap-3">
        <span className="font-mono text-[12px] font-medium leading-4 tracking-[0.08em] text-[var(--accent)]">
          {chapter.num}
        </span>
        <MonoLabel>{chapter.kicker}</MonoLabel>
      </div>
      <h2 className="mt-2 font-display text-[24px] font-semibold leading-[30px] tracking-[-0.01em] text-text-primary">
        {chapter.title}
      </h2>
    </div>
  )
}

/** Quotable question card — mono index, quote styling, lime left rule. */
function QuestionCard({
  index,
  quote,
  note,
}: {
  index: string
  quote: string
  note?: string
}) {
  return (
    <div className="relative rounded-lg border border-border bg-bg-surface p-5 pl-6">
      <span className="absolute inset-y-0 left-0 w-0.5 rounded-l-lg bg-[var(--accent)]" aria-hidden />
      <div className="flex items-center justify-between">
        <MonoLabel>{index}</MonoLabel>
        <Quote className="size-3.5 text-text-muted" aria-hidden />
      </div>
      <p className="mt-3 font-display text-[16px] font-medium leading-[24px] text-text-primary">
        “<RichText text={quote} />”
      </p>
      {note && (
        <p className="mt-3 border-t border-border pt-3 text-[13px] leading-5 text-text-secondary">
          <RichText text={note} />
        </p>
      )}
    </div>
  )
}

/* --------------------------- scroll container utils ------------------------- */

function findScrollContainer(el: HTMLElement | null): HTMLElement | null {
  let node: HTMLElement | null = el
  while (node) {
    const oy = getComputedStyle(node).overflowY
    if (oy === 'auto' || oy === 'scroll') return node
    node = node.parentElement
  }
    return (document.scrollingElement as HTMLElement | null) ?? null
}

/* ------------------------ document request checklist ------------------------ */

interface DocItem {
  id: string
  label: string
  hint: string
}

const DOC_ITEMS: DocItem[] = [
  { id: 'org-chart', label: 'Org chart + IT org chart', hint: 'Reporting lines reveal who really owns security.' },
  { id: 'asset-inventory', label: 'Asset inventory & network diagrams', hint: 'The raw material for scope validation.' },
  { id: 'policies', label: 'Policies: infosec, HR, incident response, BCP/DR', hint: 'Check approval dates, owners, and review cadence.' },
  { id: 'risk-register', label: 'Risk register / last risk assessment', hint: 'Every control should trace back to a risk.' },
  { id: 'prior-audits', label: 'Prior audit reports & findings', hint: 'Repeat findings are a governance signal, not a control signal.' },
  { id: 'certs-soa', label: 'Existing certifications + Statement of Applicability', hint: 'Inherited scope and prior exclusions live here.' },
  { id: 'vendor-list', label: 'Vendor / third-party list', hint: 'Drives subservice organization and supplier review scope.' },
  { id: 'data-flows', label: 'Data-flow diagrams', hint: 'Mandatory when PCI DSS, HIPAA, or GDPR scope is in play.' },
]

const CHECKLIST_KEY = 'auditos.field-guide.doc-checklist.v1'

function loadChecks(): Record<string, boolean> {
  try {
    const raw = localStorage.getItem(CHECKLIST_KEY)
    if (!raw) return {}
    const parsed: unknown = JSON.parse(raw)
    if (parsed && typeof parsed === 'object') return parsed as Record<string, boolean>
  } catch {
    /* corrupted storage — start clean */
  }
  return {}
}

function DocumentChecklist() {
  const [checks, setChecks] = useState<Record<string, boolean>>(loadChecks)

  useEffect(() => {
    try {
      localStorage.setItem(CHECKLIST_KEY, JSON.stringify(checks))
    } catch {
      /* storage full or unavailable — checks stay in-memory */
    }
  }, [checks])

  const done = DOC_ITEMS.filter((d) => checks[d.id]).length
  const pct = Math.round((done / DOC_ITEMS.length) * 100)

  const toggle = (id: string) => setChecks((c) => ({ ...c, [id]: !c[id] }))
  const reset = () => setChecks({})

  return (
    <div className="mt-6 rounded-xl border border-border bg-bg-surface">
      <div className="flex items-center justify-between gap-4 border-b border-border px-5 py-4">
        <div>
          <MonoLabel className="text-[var(--accent)]">Interactive</MonoLabel>
          <h3 className="mt-1 font-display text-[18px] font-semibold leading-6 text-text-primary">
            Document Request Checklist
          </h3>
          <p className="mt-1 text-[13px] leading-5 text-text-secondary">
            Send this before day one. Checks persist on this device.
          </p>
        </div>
        <div className="flex shrink-0 flex-col items-center gap-1.5">
          <ProgressRing value={pct} size={40} />
          <span className="font-mono text-[10px] tabular uppercase leading-4 tracking-[0.08em] text-text-muted">
            {done}/{DOC_ITEMS.length} requested
          </span>
        </div>
      </div>
      <ul className="divide-y divide-border">
        {DOC_ITEMS.map((item, i) => {
          const checked = !!checks[item.id]
          return (
            <li key={item.id}>
              <button
                type="button"
                onClick={() => toggle(item.id)}
                aria-pressed={checked}
                className="flex w-full items-start gap-3 px-5 py-3 text-left transition-colors duration-[120ms] hover:bg-bg-raised"
              >
                <span
                  className={clsx(
                    'mt-0.5 flex size-4 shrink-0 items-center justify-center rounded border transition-all duration-[140ms]',
                    checked
                      ? 'border-[var(--accent)] bg-[var(--accent)] text-[#061316]'
                      : 'border-border-strong bg-bg-base',
                  )}
                >
                  {checked && <Check className="size-3" strokeWidth={3} />}
                </span>
                <span className="w-10 shrink-0 font-mono text-[11px] leading-5 tracking-[0.04em] text-text-muted">
                  DR-{String(i + 1).padStart(2, '0')}
                </span>
                <span className="min-w-0 flex-1">
                  <span
                    className={clsx(
                      'block text-[13px] font-medium leading-5 transition-colors duration-[140ms]',
                      checked ? 'text-text-muted line-through' : 'text-text-primary',
                    )}
                  >
                    <RichText text={item.label} />
                  </span>
                  <span className="block text-[12px] leading-[18px] text-text-muted">{item.hint}</span>
                </span>
              </button>
            </li>
          )
        })}
      </ul>
      {done > 0 && (
        <div className="border-t border-border px-5 py-3">
          <button
            type="button"
            onClick={reset}
            className="font-mono text-[11px] uppercase leading-4 tracking-[0.08em] text-text-muted transition-colors duration-[120ms] hover:text-text-secondary"
          >
            Reset checklist
          </button>
        </div>
      )}
    </div>
  )
}

/* ------------------------------ chapter bodies ------------------------------ */

function Chapter01() {
  const fourQuestions = [
    {
      q: 'WHY',
      title: 'The driver',
      body: 'Certification, customer requirement, regulator, board mandate, or M&A diligence. The driver changes everything: tone, depth, and the standard of evidence. A regulator-driven audit demands defensible proof; a customer-driven one demands a clean report on a deadline.',
    },
    {
      q: 'WHICH',
      title: 'The frameworks',
      body: 'Pin down every framework in scope — and ask about combined audits early. ISO 27001 and SOC 2 share roughly 70% of their controls; testing once and mapping twice is the difference between a five-week engagement and a nine-week one.',
    },
    {
      q: 'SCOPE',
      title: 'The boundaries',
      body: 'In and out: business units, systems, locations, data types. Document exclusions explicitly — an undocumented exclusion becomes a scope dispute in week four, and the auditor always loses that argument.',
    },
    {
      q: 'WHEN / HOW MUCH',
      title: 'Timeline, budget, history',
      body: 'Deadlines, fee constraints, and prior audit history. A failed prior audit or a pile of repeat findings tells you where the bodies are buried before you ask a single question.',
    },
  ]

  return (
    <>
      <p className="mt-5 text-[14px] leading-[22px] text-text-secondary">
        <RichText text="Every audit is won or lost in the scoping conversation. Before you interview anyone, nail down who hired you — CIO, CISO, CFO, or Compliance — because the sponsor's agenda shapes the engagement's politics. Then lock the four questions below." />
      </p>
      <div className="mt-4 flex flex-wrap gap-1.5">
        {['CIO', 'CISO', 'CFO', 'COMPLIANCE'].map((r) => (
          <span
            key={r}
            className="rounded-full border border-border px-2.5 py-0.5 font-mono text-[11px] leading-4 tracking-[0.04em] text-text-secondary"
          >
            {hasTerm(r) ? <Abbr term={r} /> : r}
          </span>
        ))}
        <MonoLabel className="self-center">/ possible sponsors</MonoLabel>
      </div>

      <div className="mt-6 grid grid-cols-1 gap-3 md:grid-cols-2">
        {fourQuestions.map((f) => (
          <div key={f.q} className="rounded-lg border border-border bg-bg-surface p-5">
            <MonoLabel className="text-[var(--accent)]">{f.q}</MonoLabel>
            <h3 className="mt-1.5 font-display text-[16px] font-semibold leading-[22px] text-text-primary">
              {f.title}
            </h3>
            <p className="mt-2 text-[13px] leading-5 text-text-secondary">
              <RichText text={f.body} />
            </p>
          </div>
        ))}
      </div>

      <DocumentChecklist />

      <FieldNote label="Field note / engagement setup">
        Scope is the only part of an audit you fully control. Get exclusions in writing, get the
        sponsor to sign them, and every later dispute becomes a conversation about a document —
        not about you.
      </FieldNote>
    </>
  )
}

function Chapter02() {
  const order = [
    { who: 'CEO / Top Management', why: 'Risk appetite, strategy, and whether security is a value or a cost center.' },
    { who: 'Board / Audit Committee', why: 'What governance actually sees — and how often.' },
    { who: 'CFO', why: 'Budget reality, financial-reporting reliance, and who signs off on risk acceptance.' },
    { who: 'CISO / CIO', why: 'The security program as leadership understands it — before you test how it actually runs.' },
  ]

  const questions: { index: string; quote: string; note?: string }[] = [
    {
      index: 'Q-01 / BOARD VISIBILITY',
      quote: 'How does the board get visibility into security and risk? Show me the last reports they received.',
      note: 'Ask for the artifact, not the description. A real report with a real date beats a confident answer.',
    },
    {
      index: 'Q-02 / RISK ACCEPTANCE',
      quote: 'Who owns risk acceptance, and at what thresholds?',
      note: 'If the answer is "the CISO," push: risk acceptance is a business decision, not a security one.',
    },
    {
      index: 'Q-03 / VELOCITY CONFLICT',
      quote: 'When security and business velocity conflict, what actually happens — give me a recent example.',
      note: 'The word "recent" does the work. Everyone has a policy; few have an example.',
    },
    {
      index: 'Q-04 / CHANGE AFTER FAILURE',
      quote: 'What changed after your last incident or audit finding?',
      note: 'Tests whether findings produce remediation or just reports. Ask what is different now, specifically.',
    },
  ]

  return (
    <>
      <p className="mt-5 text-[14px] leading-[22px] text-text-secondary">
        <RichText text="Interview leadership first, in this order — because you test governance before controls. If leadership cannot articulate risk appetite, everything downstream is decorative: policies nobody funded, controls nobody owns, findings nobody fixes." />
      </p>

      <div className="mt-6 rounded-lg border border-border bg-bg-surface">
        <div className="border-b border-border px-5 py-3">
          <MonoLabel>Interview order / week 1</MonoLabel>
        </div>
        <ol className="divide-y divide-border">
          {order.map((o, i) => (
            <li key={o.who} className="flex items-start gap-4 px-5 py-3">
              <span className="w-8 shrink-0 font-mono text-[12px] font-medium leading-5 tabular text-[var(--accent)]">
                {String(i + 1).padStart(2, '0')}
              </span>
              <div className="min-w-0 flex-1">
                <div className="text-[13px] font-medium leading-5 text-text-primary">
                  <RichText text={o.who} />
                </div>
                <div className="text-[12px] leading-[18px] text-text-muted">
                  <RichText text={o.why} />
                </div>
              </div>
              {i < order.length - 1 && (
                <ArrowRight className="mt-1 size-3.5 shrink-0 rotate-90 text-text-muted" aria-hidden />
              )}
            </li>
          ))}
        </ol>
      </div>

      <div className="mt-6 grid grid-cols-1 gap-3 xl:grid-cols-2">
        {questions.map((q) => (
          <QuestionCard key={q.index} index={q.index} quote={q.quote} note={q.note} />
        ))}
      </div>

      <div className="mt-6 rounded-lg border border-border bg-bg-surface p-5">
        <MonoLabel className="text-[var(--accent)]">What you are listening for</MonoLabel>
        <ul className="mt-3 space-y-2">
          {[
            'Consistency between executives — ask three leaders the same question and compare. Divergence is the finding.',
            'Real sign-off and review dates on policies — a policy last reviewed four years ago is a decoration, not a control.',
            'Whether security has budget and authority, or just responsibility. Responsibility without authority is the classic root cause.',
          ].map((t) => (
            <li key={t} className="flex items-start gap-2.5 text-[13px] leading-5 text-text-secondary">
              <span className="mt-[9px] size-1 shrink-0 rounded-full bg-[var(--accent)]" aria-hidden />
              <RichText text={t} />
            </li>
          ))}
        </ul>
        <div className="mt-4 flex flex-wrap items-center gap-1.5 border-t border-border pt-4">
          <MonoLabel>Maps to:</MonoLabel>
          {['ISO 27001 Cl. 5 / A.5.1', 'COSO P1–P5', 'COBIT EDM', 'CSF GOVERN'].map((m) => (
            <span
              key={m}
              className="rounded-full bg-bg-raised px-2 py-0.5 font-mono text-[10px] uppercase leading-4 tracking-[0.04em] text-text-secondary"
            >
              <RichText text={m} />
            </span>
          ))}
        </div>
      </div>
    </>
  )
}

function Chapter03() {
  const rows: { who: string; test: string }[] = [
    { who: 'CISO', test: 'ISMS scope, risk methodology, and how the program measures itself.' },
    { who: 'IT Manager / Ops', test: 'Asset management, change management, logging, backups, patching cadence.' },
    { who: 'HR', test: 'Screening, onboarding/offboarding, security training — the A.6 people controls.' },
    { who: 'Facilities', test: 'Physical access, badge provisioning, visitor logs — the A.7 physical layer.' },
    { who: 'Procurement / Vendor Mgmt', test: 'Supplier due diligence, contract security clauses, ongoing vendor review.' },
    { who: 'Dev Lead', test: 'Secure SDLC: code review, dependency management, separation of environments.' },
    { who: 'DPO / Legal', test: 'Privacy obligations, data classification, records of processing.' },
    { who: 'Controller', test: 'Segregation of duties and financial reporting controls — the COSO / SOX layer.' },
  ]

  const walkthroughs = [
    {
      title: 'Terminated-employee walkthrough',
      body: 'Pick one leaver from the last quarter. Pull the HR termination date, the ticket, and the timestamp every account was disabled. A three-day gap between them is a finding with a paper trail.',
    },
    {
      title: 'Access review evidence',
      body: 'Do not accept "we review access quarterly." Ask for the last review: who signed it, what they looked at, and what they removed. A review with zero removals, ever, is a review nobody reads.',
    },
    {
      title: 'Incident log walkthrough',
      body: 'Walk one incident from detection to post-mortem. You are looking for timestamps, escalation, and whether the corrective action actually closed.',
    },
  ]

  return (
    <>
      <p className="mt-5 text-[14px] leading-[22px] text-text-secondary">
        <RichText text="Weeks one through three are about control design: does the control, as designed, address the risk? Work the middle layers top-down so each interview gives you context for the next." />
      </p>

      <div className="mt-6 overflow-hidden rounded-lg border border-border bg-bg-surface">
        <div className="border-b border-border px-5 py-3">
          <MonoLabel>Interview order / who → what you test</MonoLabel>
        </div>
        <div className="slim-scroll overflow-x-auto">
          <table className="w-full min-w-[560px] border-collapse">
            <thead>
              <tr className="border-b border-border-strong">
                <th className="h-10 px-5 text-left font-mono text-[11px] font-medium uppercase leading-4 tracking-[0.08em] text-text-muted">
                  #
                </th>
                <th className="h-10 px-3 text-left font-mono text-[11px] font-medium uppercase leading-4 tracking-[0.08em] text-text-muted">
                  Interviewee
                </th>
                <th className="h-10 px-3 pr-5 text-left font-mono text-[11px] font-medium uppercase leading-4 tracking-[0.08em] text-text-muted">
                  What you test
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr
                  key={r.who}
                  className="border-b border-border transition-colors duration-[120ms] last:border-0 hover:bg-bg-raised"
                >
                  <td className="px-5 py-2.5 font-mono text-[12px] tabular leading-5 text-[var(--accent)]">
                    {String(i + 1).padStart(2, '0')}
                  </td>
                  <td className="whitespace-nowrap px-3 py-2.5 text-[13px] font-medium leading-5 text-text-primary">
                    <RichText text={r.who} />
                  </td>
                  <td className="px-3 py-2.5 pr-5 text-[13px] leading-5 text-text-secondary">
                    <RichText text={r.test} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <p className="mt-6 text-[14px] leading-[22px] text-text-secondary">
        <RichText text="In this phase your style shifts from tell me to show me. Design questions become walkthroughs — follow one real transaction, ticket, or person through the control instead of discussing the control in the abstract." />
      </p>
      <div className="mt-4 grid grid-cols-1 gap-3 lg:grid-cols-3">
        {walkthroughs.map((w, i) => (
          <div key={w.title} className="rounded-lg border border-border bg-bg-surface p-5">
            <MonoLabel>Walkthrough {String(i + 1).padStart(2, '0')}</MonoLabel>
            <h3 className="mt-1.5 font-display text-[15px] font-semibold leading-5 text-text-primary">
              {w.title}
            </h3>
            <p className="mt-2 text-[13px] leading-5 text-text-secondary">
              <RichText text={w.body} />
            </p>
          </div>
        ))}
      </div>
    </>
  )
}

function Chapter04() {
  const rules = [
    {
      title: 'Triangulate everything',
      body: 'Policy says X, the admin shows Y, the user does Z. The finding lives in the gap between the three. Never write up a single source.',
    },
    {
      title: 'Ask open, then verify closed',
      body: 'Open questions surface the truth; closed verification pins it down. Open for discovery, closed for evidence.',
    },
    {
      title: 'Consistency is the fastest maturity test',
      body: 'Ask the same question of three people in three teams. Immature programs diverge immediately; mature ones bore you with identical answers.',
    },
    {
      title: "Evidence or it didn't happen",
      body: 'If you cannot point to an artifact — a log, a ticket, a signed review — it is a claim, not a control. Claims do not survive report review.',
    },
  ]

  return (
    <>
      <p className="mt-5 text-[14px] leading-[22px] text-text-secondary">
        <RichText text="Design can be perfect and operation can still fail. Weeks three through five test operating effectiveness: did the control run, every time, for the whole period? Verify, do not trust." />
      </p>

      <div className="mt-6 grid grid-cols-1 gap-3 lg:grid-cols-3">
        <div className="rounded-lg border border-border bg-bg-surface p-5">
          <MonoLabel className="text-[var(--accent)]">Method / sampling</MonoLabel>
          <h3 className="mt-1.5 font-display text-[15px] font-semibold leading-5 text-text-primary">
            Sample, then trace end-to-end
          </h3>
          <p className="mt-2 text-[13px] leading-5 text-text-secondary">
            <RichText text="Take 25 of 400 changes. For each sampled item, trace it from request through approval, testing, and deployment. Sampling is not skimming — one item traced completely beats twenty items glanced at." />
          </p>
        </div>
        <div className="rounded-lg border border-border bg-bg-surface p-5">
          <MonoLabel className="text-[var(--accent)]">Method / behavior</MonoLabel>
          <h3 className="mt-1.5 font-display text-[15px] font-semibold leading-5 text-text-primary">
            Ask end users, not just owners
          </h3>
          <p className="mt-2 text-[13px] leading-5 text-text-secondary">
            <RichText text="Control owners describe the design; end users describe the reality. Ask a developer what actually happens when a deploy breaks at 2 a.m. Behavioral questions reveal the control as operated." />
          </p>
        </div>
        <div className="rounded-lg border border-border bg-bg-surface p-5">
          <MonoLabel className="text-[var(--accent)]">Method / detection</MonoLabel>
          <h3 className="mt-1.5 font-display text-[15px] font-semibold leading-5 text-text-primary">
            ATT&CK-style live demos
          </h3>
          <p className="mt-2 text-[13px] leading-5 text-text-secondary">
            <RichText text="Pick a technique from MITRE ATT&CK and ask the SOC to show you the alert firing — the rule, the log source, a real past firing. A detection that has never fired is a hypothesis, not a control." />
          </p>
        </div>
      </div>

      <div className="mt-6">
        <MonoLabel>Golden rules / operating effectiveness</MonoLabel>
        <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-2">
          {rules.map((r, i) => (
            <div
              key={r.title}
              className="relative rounded-lg border border-border bg-bg-surface p-5 pl-6"
            >
              <span className="absolute inset-y-0 left-0 w-0.5 rounded-l-lg bg-[var(--accent)]" aria-hidden />
              <div className="font-mono text-[12px] font-medium leading-4 tabular text-[var(--accent)]">
                R-{String(i + 1).padStart(2, '0')}
              </div>
              <h3 className="mt-1.5 font-display text-[16px] font-semibold leading-[22px] text-text-primary">
                {r.title}
              </h3>
              <p className="mt-2 text-[13px] leading-5 text-text-secondary">
                <RichText text={r.body} />
              </p>
            </div>
          ))}
        </div>
      </div>
    </>
  )
}

function Chapter05() {
  const funnel = [
    {
      step: 'Open',
      time: '~10 MIN',
      body: 'Let them describe their process in their own words, uninterrupted. You are mapping the terrain, not testing it yet. Take notes; mark the seams.',
    },
    {
      step: 'Narrow',
      time: 'PROBE',
      body: 'Follow the seams: handoffs, exceptions, busy periods, new hires. "What happens when the approver is on vacation?" is where designs quietly break.',
    },
    {
      step: 'Closed verification',
      time: 'EVIDENCE',
      body: 'Pin it to an artifact: show me ticket HD-4821. Closed questions with a specific evidence request convert testimony into proof.',
    },
    {
      step: 'The naive question',
      time: 'DISARM',
      body: 'Help me understand why you would do it that way? Asked without judgment, the naive question gets people to explain the workaround they would never volunteer.',
    },
  ]

  const situations = [
    {
      title: 'The over-talker',
      body: 'Twenty minutes of narrative, zero artifacts. Redirect to documents: "That is helpful context — show me where that lives." Paper ends monologues.',
    },
    {
      title: 'The defensive control owner',
      body: 'They hear findings as personal criticism. Make it collaborative: you are testing the process, not the person. Ask them to walk you through it as the expert.',
    },
    {
      title: 'The answer you know is wrong',
      body: 'Do not argue. Triangulate quietly: ask the same question elsewhere, then request the evidence. Let the absent artifact speak — it is more credible than your contradiction.',
    },
    {
      title: 'Scope creep',
      body: 'A fascinating issue outside scope appears mid-interview. Log it, keep moving, and let the sponsor decide whether it enters the engagement. Your job is coverage, not discovery for its own sake.',
    },
    {
      title: 'The gift finding',
      body: 'Someone volunteers a colleague\u2019s failure. Verify it independently and never attribute the source. An unverified gift becomes a political incident with your name on it.',
    },
  ]

  return (
    <>
      <p className="mt-5 text-[14px] leading-[22px] text-text-secondary">
        <RichText text="Interviews produce the raw material of every finding. The craft is a repeatable funnel plus a few hard rules." />
      </p>

      {/* The Funnel */}
      <div className="mt-6 rounded-lg border border-border bg-bg-surface">
        <div className="flex items-center justify-between border-b border-border px-5 py-3">
          <MonoLabel className="text-[var(--accent)]">The Funnel / 4 steps</MonoLabel>
          <MessagesSquare className="size-4 text-text-muted" aria-hidden />
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4">
          {funnel.map((f, i) => (
            <div
              key={f.step}
              className={clsx(
                'relative p-5',
                i < funnel.length - 1 && 'border-border max-xl:border-b md:max-xl:odd:border-r xl:border-r',
              )}
            >
              <div className="flex items-baseline justify-between gap-2">
                <span className="font-mono text-[12px] font-medium leading-4 tabular text-[var(--accent)]">
                  {String(i + 1).padStart(2, '0')}
                </span>
                <MonoLabel>{f.time}</MonoLabel>
              </div>
              <h3 className="mt-2 font-display text-[16px] font-semibold leading-[22px] text-text-primary">
                {f.step}
              </h3>
              <p className="mt-2 text-[13px] leading-5 text-text-secondary">
                <RichText text={f.body} />
              </p>
            </div>
          ))}
        </div>
      </div>

      <div className="mt-6 grid grid-cols-1 gap-3 lg:grid-cols-2">
        <div className="rounded-lg border border-border bg-bg-surface p-5">
          <MonoLabel className="text-[var(--accent)]">Rule / embrace silence</MonoLabel>
          <p className="mt-2 text-[13px] leading-5 text-text-secondary">
            <RichText text="After an answer, wait. Silence is uncomfortable, and people fill it — usually with the thing they were deciding whether to tell you. The second half of the answer is often the finding." />
          </p>
        </div>
        <div className="rounded-lg border border-border bg-bg-surface p-5">
          <MonoLabel className="text-[var(--accent)]">Rule / evidence-able questions only</MonoLabel>
          <p className="mt-2 text-[13px] leading-5 text-text-secondary">
            <RichText text="Never ask a question you cannot evidence. Is MFA enforced? is always yes. Show me the conditional access policy is evidence. If a question cannot end in an artifact, rephrase it until it can." />
          </p>
        </div>
      </div>

      {/* Working papers */}
      <div className="mt-6 rounded-lg border border-border bg-bg-surface p-5">
        <MonoLabel className="text-[var(--accent)]">Working papers / the record</MonoLabel>
        <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-4">
          {[
            ['Answer + why', 'What they said, and the reasoning they gave for it.'],
            ['Evidence identifier', 'Ticket, log, document name and version — something retrievable.'],
            ['Interviewee + date', 'Who said it and when. Findings need attribution.'],
            ['Follow-up flag', 'Anything unresolved gets flagged, not forgotten.'],
          ].map(([t, d]) => (
            <div key={t} className="rounded-md border border-border bg-bg-base p-3">
              <div className="font-mono text-[11px] font-medium uppercase leading-4 tracking-[0.06em] text-text-primary">
                {t}
              </div>
              <div className="mt-1 text-[12px] leading-[18px] text-text-muted">
                <RichText text={d} />
              </div>
            </div>
          ))}
        </div>
        <p className="mt-4 border-t border-border pt-4 font-display text-[15px] font-medium leading-[22px] text-text-primary">
          If it is not written down with evidence, it did not happen.
        </p>
      </div>

      {/* Difficult situations */}
      <div className="mt-6">
        <MonoLabel>The five difficult situations</MonoLabel>
        <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
          {situations.map((s, i) => (
            <div key={s.title} className="rounded-lg border border-border bg-bg-surface p-5">
              <div className="flex items-center gap-2">
                <CircleAlert className="size-3.5 shrink-0 text-[var(--flag)]" aria-hidden />
                <MonoLabel>S-{String(i + 1).padStart(2, '0')}</MonoLabel>
              </div>
              <h3 className="mt-2 font-display text-[15px] font-semibold leading-5 text-text-primary">
                {s.title}
              </h3>
              <p className="mt-2 text-[13px] leading-5 text-text-secondary">
                <RichText text={s.body} />
              </p>
            </div>
          ))}
        </div>
      </div>
    </>
  )
}

/* -------------------------- framework entry points -------------------------- */

interface EntryPoint {
  frameworkId: string
  icon: LucideIcon
  startWith: string
  body: string
}

const ENTRY_POINTS: EntryPoint[] = [
  {
    frameworkId: 'iso27001',
    icon: ShieldCheck,
    startWith: 'The Statement of Applicability',
    body: 'The SoA is the table of contents of their security program — every control, included or excluded, with justification. A wrong SoA means a wrong ISMS; everything you test downstream inherits the error.',
  },
  {
    frameworkId: 'soc2',
    icon: Lock,
    startWith: 'The system description (Section III)',
    body: 'Read the system description and boundary first, then the subservice organization carve-outs. Whatever they carved out, they still owe you complementary controls for.',
  },
  {
    frameworkId: 'pci-dss',
    icon: CreditCard,
    startWith: 'The CDE data-flow diagram',
    body: 'Eighty percent of PCI pain is scope. Get the cardholder data environment diagram, confirm segmentation, and demand segmentation evidence before you test a single requirement.',
  },
  {
    frameworkId: 'nist-csf',
    icon: Hexagon,
    startWith: 'The Current Profile',
    body: 'CSF is a gap-analysis tool, not a checklist. Start from their Current Profile — or build one with them — and let the distance to the Target Profile set the agenda.',
  },
  {
    frameworkId: 'coso',
    icon: Triangle,
    startWith: 'The financial close process',
    body: 'Map the close and the segregation of duties around it, then walk one journal entry end-to-end: who prepared it, who approved it, what stopped them doing both.',
  },
  {
    frameworkId: 'cobit',
    icon: Grid3x3,
    startWith: 'A design-factors workshop',
    body: 'COBIT opens as a facilitated conversation with the CIO and business owners about governance design factors — not a document review. The framework prices the conversation, so run it.',
  },
  {
    frameworkId: 'mitre-attack',
    icon: Crosshair,
    startWith: 'The SOC detection coverage map',
    body: 'Ask for the ATT&CK Navigator layer showing what they detect. Coverage should be threat-informed — mapped to the techniques their threat model actually faces — not policy-informed.',
  },
  {
    frameworkId: 'iso42001',
    icon: Bot,
    startWith: 'The AI system inventory',
    body: 'No registry of AI systems — including shadow AI and third-party models — is finding number one. You cannot govern what you have not listed.',
  },
]

function Chapter06() {
  return (
    <>
      <p className="mt-5 text-[14px] leading-[22px] text-text-secondary">
        <RichText text="Every framework has a front door — the one artifact that reveals whether the program is real. Open there. Each card jumps straight into the guided audit for that framework." />
      </p>
      <div className="mt-6 grid grid-cols-1 gap-3 md:grid-cols-2">
        {ENTRY_POINTS.map((ep) => {
          const fw = getFramework(ep.frameworkId)
          const Icon = ep.icon
          return (
            <Link
              key={ep.frameworkId}
              to={`/audit/${ep.frameworkId}`}
              className="group relative flex flex-col rounded-lg border border-border bg-bg-surface p-5 transition-all duration-[160ms] hover:border-[var(--accent)] hover:shadow-[0_0_24px_-8px_rgba(200,243,29,0.35)]"
            >
              <div className="flex items-center gap-3">
                <span className="flex size-10 shrink-0 items-center justify-center rounded-md border border-border bg-accent-dim">
                  <Icon className="size-4 text-[var(--accent)]" />
                </span>
                <div className="min-w-0">
                  <h3 className="truncate font-display text-[16px] font-semibold leading-[22px] text-text-primary">
                    {fw ? <MaybeAbbr term={fw.shortName}>{fw.shortName}</MaybeAbbr> : ep.frameworkId}
                  </h3>
                  <div className="font-mono text-[10px] uppercase leading-4 tracking-[0.06em] text-text-muted">
                    {fw?.version ?? ''}
                  </div>
                </div>
                <ArrowRight className="ml-auto size-4 shrink-0 text-text-muted transition-all duration-[160ms] group-hover:translate-x-0.5 group-hover:text-[var(--accent)]" aria-hidden />
              </div>
              <div className="mt-3 font-mono text-[11px] font-medium uppercase leading-4 tracking-[0.06em] text-[var(--accent)]">
                Start with: <RichText text={ep.startWith} />
              </div>
              <p className="mt-2 flex-1 text-[13px] leading-5 text-text-secondary">
                <RichText text={ep.body} />
              </p>
              <div className="mt-3 border-t border-border pt-3 font-mono text-[10px] uppercase leading-4 tracking-[0.08em] text-text-muted transition-colors duration-[160ms] group-hover:text-text-secondary">
                Open guided audit →
              </div>
            </Link>
          )
        })}
      </div>
    </>
  )
}

function Chapter07() {
  const fourCs = [
    { c: 'Condition', body: 'What is — the factual state you observed, with evidence. "MFA is not enforced for 14 of 92 remote accounts."' },
    { c: 'Criteria', body: 'What should be — the policy, control, or requirement being measured against. Name the clause.' },
    { c: 'Cause', body: 'Why it happened — the root cause, not the symptom. "No owner reviews exceptions" is a cause; "accounts were missed" is not.' },
    { c: 'Effect', body: 'So what — the risk exposure in business terms. This is the sentence leadership reads twice.' },
  ]

  const severity = [
    {
      term: 'Material Weakness',
      color: 'var(--severity-critical)',
      body: 'A deficiency severe enough that material error or breach is a reasonable possibility. Reserved for failures that undermine reliance on the whole system of controls.',
    },
    {
      term: 'Significant Deficiency',
      color: 'var(--severity-high)',
      body: 'Less severe than a material weakness, but important enough to merit the attention of those charged with governance. Leadership must see it, by name.',
    },
    {
      term: 'Deficiency',
      color: 'var(--severity-medium)',
      body: 'A control is missing or not operating as designed. Document, assign, remediate — and watch for repeats, which escalate.',
    },
  ]

  const script = [
    'Start with what works — genuine strengths, named specifically.',
    'Findings by severity, worst first. Every finding already socialized; zero surprises in the room.',
    'Management responses and remediation dates, agreed live where possible.',
    'Issue the draft report.',
    'Factual accuracy review — management corrects facts, not conclusions.',
    'Final report issued.',
  ]

  return (
    <>
      <p className="mt-5 text-[14px] leading-[22px] text-text-secondary">
        <RichText text="A finding is an argument, and arguments have structure. The four C's keep every finding defensible under review." />
      </p>

      {/* Four C's */}
      <div className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {fourCs.map((f, i) => (
          <div key={f.c} className="rounded-lg border border-border bg-bg-surface p-5">
            <div className="flex items-baseline gap-2">
              <span className="font-mono text-[12px] font-medium leading-4 tabular text-[var(--accent)]">
                C-{String(i + 1).padStart(2, '0')}
              </span>
              <h3 className="font-display text-[16px] font-semibold leading-[22px] text-text-primary">{f.c}</h3>
            </div>
            <p className="mt-2 text-[13px] leading-5 text-text-secondary">
              <RichText text={f.body} />
            </p>
          </div>
        ))}
      </div>

      {/* Severity vocabulary */}
      <div className="mt-6 rounded-lg border border-border bg-bg-surface">
        <div className="border-b border-border px-5 py-3">
          <MonoLabel>Severity vocabulary / say it precisely</MonoLabel>
        </div>
        <div className="divide-y divide-border">
          {severity.map((s) => (
            <div key={s.term} className="flex items-start gap-4 px-5 py-4">
              <span
                className="mt-1.5 size-2 shrink-0 rounded-full"
                style={{ backgroundColor: s.color }}
                aria-hidden
              />
              <div>
                <div className="text-[13px] font-semibold leading-5 text-text-primary">
                  <MaybeAbbr term={s.term}>{s.term}</MaybeAbbr>
                </div>
                <p className="mt-1 text-[13px] leading-5 text-text-secondary">
                  <RichText text={s.body} />
                </p>
              </div>
            </div>
          ))}
          <div className="px-5 py-4">
            <p className="text-[13px] leading-5 text-text-secondary">
              <RichText text="Beyond the audit-grade vocabulary, weight criticality by risk: a medium finding on a crown-jewel system outranks a high finding on a sandbox. Severity follows risk, not just the control gap." />
            </p>
          </div>
        </div>
      </div>

      {/* Closing meeting script */}
      <div className="mt-6 rounded-lg border border-border bg-bg-surface">
        <div className="flex items-center justify-between border-b border-border px-5 py-3">
          <MonoLabel>Closing meeting / the script</MonoLabel>
          <FileText className="size-4 text-text-muted" aria-hidden />
        </div>
        <ol className="divide-y divide-border">
          {script.map((s, i) => (
            <li key={s} className="flex items-start gap-4 px-5 py-3">
              <span className="w-8 shrink-0 font-mono text-[12px] font-medium leading-5 tabular text-[var(--accent)]">
                {String(i + 1).padStart(2, '0')}
              </span>
              <span className="text-[13px] leading-5 text-text-secondary">
                <RichText text={s} />
              </span>
            </li>
          ))}
        </ol>
      </div>

      <div className="relative mt-6 rounded-lg border border-border bg-bg-surface p-5 pl-6">
        <span className="absolute inset-y-0 left-0 w-0.5 rounded-l-lg bg-[var(--accent)]" aria-hidden />
        <Quote className="size-4 text-[var(--accent)]" aria-hidden />
        <p className="mt-2 font-display text-[18px] font-medium leading-[26px] tracking-[-0.01em] text-text-primary">
          Never let the report be the first time leadership sees a finding.
        </p>
        <p className="mt-2 text-[13px] leading-5 text-text-secondary">
          Socialize findings as you go. The closing meeting confirms; it must never surprise.
        </p>
      </div>

      {/* Tie-in */}
      <Link
        to="/reports"
        className="group mt-6 flex items-center gap-4 rounded-xl border border-[var(--accent)]/40 bg-accent-dim p-5 transition-all duration-[160ms] hover:border-[var(--accent)] hover:shadow-[0_0_24px_-6px_rgba(200,243,29,0.35)]"
      >
        <span className="flex size-11 shrink-0 items-center justify-center rounded-md bg-[var(--accent)]">
          <FileText className="size-5 text-[#061316]" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="font-mono text-[10px] uppercase leading-4 tracking-[0.08em] text-[var(--accent)]">
            AuditOS tie-in
          </div>
          <div className="mt-0.5 font-display text-[16px] font-semibold leading-[22px] text-text-primary">
            Your working papers become the report
          </div>
          <p className="mt-1 text-[13px] leading-5 text-text-secondary">
            Findings, answers, and evidence captured in AuditOS assemble into the engagement report.
          </p>
        </div>
        <ArrowRight className="size-4 shrink-0 text-[var(--accent)] transition-transform duration-[160ms] group-hover:translate-x-0.5" aria-hidden />
      </Link>
    </>
  )
}

/* ---------------------------------- page ----------------------------------- */

const CHAPTER_BODY: Record<string, () => React.ReactElement> = {
  setup: Chapter01,
  leadership: Chapter02,
  'control-design': Chapter03,
  effectiveness: Chapter04,
  'interview-craft': Chapter05,
  'framework-entry': Chapter06,
  closing: Chapter07,
}

export default function FieldGuide() {
  const reduceMotion = useReducedMotion()
  const rootRef = useRef<HTMLDivElement>(null)
  const articleRef = useRef<HTMLDivElement>(null)
  const [container, setContainer] = useState<HTMLElement | null>(null)
  const [active, setActive] = useState<string>(CHAPTERS[0].id)
  const [progress, setProgress] = useState(0)
  const [menuOpen, setMenuOpen] = useState(false)

  // Locate the Layout-owned scroll container (Lenis wrapper) after mount.
  useEffect(() => {
    setContainer(findScrollContainer(rootRef.current))
  }, [])

  // Scroll-spy: the chapter nearest the container top is active.
  useEffect(() => {
    if (!container) return
    const sections = CHAPTERS.map((c) => document.getElementById(`fg-${c.id}`)).filter(
      (el): el is HTMLElement => !!el,
    )
    if (sections.length === 0) return
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) setActive(entry.target.id.replace(/^fg-/, ''))
        }
      },
      { root: container, rootMargin: '-10% 0px -80% 0px', threshold: 0 },
    )
    for (const s of sections) observer.observe(s)
    return () => observer.disconnect()
  }, [container])

  // Reading progress across the chapter column.
  useEffect(() => {
    if (!container) return
    let raf = 0
    const update = () => {
      const article = articleRef.current
      if (!article) return
      const cRect = container.getBoundingClientRect()
      const aRect = article.getBoundingClientRect()
      const total = aRect.height - cRect.height
      const passed = cRect.top - aRect.top
      setProgress(total <= 0 ? 1 : Math.min(1, Math.max(0, passed / total)))
    }
    const onScroll = () => {
      cancelAnimationFrame(raf)
      raf = requestAnimationFrame(update)
    }
    update()
    container.addEventListener('scroll', onScroll, { passive: true })
    window.addEventListener('resize', onScroll)
    return () => {
      cancelAnimationFrame(raf)
      container.removeEventListener('scroll', onScroll)
      window.removeEventListener('resize', onScroll)
    }
  }, [container])

  const scrollToChapter = useCallback(
    (id: string) => {
      const el = document.getElementById(`fg-${id}`)
      if (!el || !container) return
      const cRect = container.getBoundingClientRect()
      const target = container.scrollTop + el.getBoundingClientRect().top - cRect.top - 56
      container.scrollTo({ top: target, behavior: reduceMotion ? 'auto' : 'smooth' })
      setActive(id)
      setMenuOpen(false)
    },
    [container, reduceMotion],
  )

  const activeChapter = CHAPTERS.find((c) => c.id === active) ?? CHAPTERS[0]

  const reveal = reduceMotion
    ? {}
    : {
        initial: { opacity: 0, y: 16 },
        whileInView: { opacity: 1, y: 0 },
        viewport: { once: true, margin: '-60px' },
        transition: { duration: 0.4, ease: EASE },
      }

  const navButton = (c: Chapter, mobile = false) => {
    const isActive = active === c.id
    return (
      <button
        key={c.id}
        type="button"
        onClick={() => scrollToChapter(c.id)}
        aria-current={isActive ? 'true' : undefined}
        className={clsx(
          'group relative flex w-full items-baseline gap-2.5 rounded-md px-2.5 py-2 text-left transition-colors duration-[140ms]',
          isActive ? 'bg-accent-dim' : 'hover:bg-bg-raised',
        )}
      >
        <span
          className={clsx(
            'font-mono text-[11px] font-medium leading-4 tabular tracking-[0.04em]',
            isActive ? 'text-[var(--accent)]' : 'text-text-muted group-hover:text-text-secondary',
          )}
        >
          {c.num}
        </span>
        <span className="min-w-0 flex-1">
          <span
            className={clsx(
              'block truncate text-[13px] leading-[18px]',
              isActive ? 'font-medium text-text-primary' : 'text-text-secondary group-hover:text-text-primary',
            )}
          >
            {c.title}
          </span>
          {!mobile && (
            <span className="block truncate font-mono text-[10px] uppercase leading-4 tracking-[0.06em] text-text-muted">
              {c.kicker}
            </span>
          )}
        </span>
        {isActive && (
          <span className="absolute inset-y-1 left-0 w-0.5 rounded-full bg-[var(--accent)]" aria-hidden />
        )}
      </button>
    )
  }

  return (
    <div ref={rootRef}>
      {/* ------------------------------- hero ------------------------------- */}
      <header className="hero-radial relative overflow-hidden rounded-xl border border-border bg-bg-surface">
        <img
          src="/contour.svg"
          alt=""
          aria-hidden
          className={clsx(
            'pointer-events-none absolute right-0 top-0 h-full object-cover opacity-25',
            !reduceMotion && 'drift-slow',
          )}
        />
        <div className="relative p-6 md:p-10">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <MonoLabel className="text-[var(--accent)]">AuditOS / Field Guide</MonoLabel>
            <MonoLabel>07 Chapters / Practitioner Craft</MonoLabel>
          </div>
          <h1 className="mt-4 font-display text-[36px] font-semibold leading-[42px] tracking-[-0.02em] text-text-primary md:text-[44px] md:leading-[50px]">
            The auditor&rsquo;s{' '}
            <span className="text-[var(--accent)] text-glow-lime">field guide</span>
          </h1>
          <p className="mt-3 max-w-2xl text-[14px] leading-[22px] text-text-secondary">
            <RichText text="The practical craft of running a real engagement — from the scoping call to the closing meeting. Seven chapters on who to talk to, what to ask, what to demand as evidence, and how to write findings that survive review." />
          </p>
          <div className="mt-5 flex flex-wrap gap-1.5">
            {CHAPTERS.map((c) => (
              <button
                key={c.id}
                type="button"
                onClick={() => scrollToChapter(c.id)}
                className="rounded-full border border-border px-2.5 py-0.5 font-mono text-[10px] uppercase leading-4 tracking-[0.06em] text-text-muted transition-colors duration-[140ms] hover:border-[var(--accent)] hover:text-[var(--accent)]"
              >
                {c.num} {c.title.split(':')[0]}
              </button>
            ))}
          </div>
        </div>
      </header>

      {/* --------------------- mobile chapter dropdown --------------------- */}
      <div className="sticky top-0 z-30 -mx-6 mt-4 border-y border-border bg-bg-base/90 px-6 py-2 backdrop-blur-[8px] lg:hidden [@media(min-width:1600px)]:-mx-8 [@media(min-width:1600px)]:px-8">
        <button
          type="button"
          onClick={() => setMenuOpen((v) => !v)}
          aria-expanded={menuOpen}
          className="flex w-full items-center gap-2.5 rounded-md px-2 py-1.5 text-left"
        >
          <span className="font-mono text-[11px] font-medium leading-4 tabular text-[var(--accent)]">
            {activeChapter.num}
          </span>
          <span className="flex-1 truncate text-[13px] font-medium text-text-primary">
            {activeChapter.title}
          </span>
          <ChevronDown
            className={clsx('size-4 text-text-muted transition-transform duration-[160ms]', menuOpen && 'rotate-180')}
          />
        </button>
        <AnimatePresence initial={false}>
          {menuOpen && (
            <motion.div
              key="chapter-menu"
              initial={reduceMotion ? false : { height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={reduceMotion ? { opacity: 0 } : { height: 0, opacity: 0 }}
              transition={{ duration: 0.2, ease: 'easeInOut' }}
              className="overflow-hidden"
            >
              <div className="space-y-0.5 pb-2">{CHAPTERS.map((c) => navButton(c, true))}</div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* --------------------------- body grid --------------------------- */}
      <div className="mt-6 grid grid-cols-1 gap-8 lg:grid-cols-[220px_minmax(0,1fr)] xl:gap-12">
        {/* sticky chapter nav */}
        <nav aria-label="Field guide chapters" className="hidden self-start lg:sticky lg:top-6 lg:block">
          <MonoLabel className="px-2.5">Chapters</MonoLabel>
          <div className="mt-2 space-y-0.5">{CHAPTERS.map((c) => navButton(c))}</div>
          <div className="mt-4 border-t border-border px-2.5 pt-3">
            <MonoLabel>Reading</MonoLabel>
            <div className="mt-1.5 h-0.5 w-full overflow-hidden rounded-full bg-bg-raised">
              <div
                className="h-full rounded-full bg-[var(--accent)] transition-[width] duration-150"
                style={{ width: `${Math.round(progress * 100)}%` }}
              />
            </div>
            <div className="mt-1 font-mono text-[10px] tabular leading-4 text-text-muted">
              {Math.round(progress * 100)}%
            </div>
          </div>
        </nav>

        {/* content column */}
        <div className="min-w-0">
          {/* reading progress bar — top of content column */}
          <div className="sticky top-0 z-20 -mt-2 hidden pb-2 pt-2 lg:block" aria-hidden>
            <div className="h-0.5 w-full overflow-hidden rounded-full bg-border/60">
              <div
                className="h-full rounded-full bg-[var(--accent)]"
                style={{ width: `${Math.round(progress * 100)}%` }}
              />
            </div>
          </div>

          <div ref={articleRef} className="space-y-14 pb-4">
            {CHAPTERS.map((c) => {
              const Body = CHAPTER_BODY[c.id]
              return (
                <motion.section
                  key={c.id}
                  id={`fg-${c.id}`}
                  aria-label={`${c.num} ${c.title}`}
                  {...reveal}
                >
                  <ChapterHeader chapter={c} />
                  <Body />
                </motion.section>
              )
            })}
          </div>
        </div>
      </div>
    </div>
  )
}
