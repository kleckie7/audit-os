import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router'
import { motion, useReducedMotion } from 'framer-motion'
import { ArrowRight, BarChart3, BookOpen, ClipboardCheck, Layers, MessagesSquare, Search } from 'lucide-react'
import clsx from 'clsx'
import { allTerms, getTerm, searchTerms } from '@/lib/glossary'
import type { GlossaryTerm } from '@/lib/glossary'
import { Abbr } from '@/components/TermTip'
import './glossary.css'

// ---------------------------------------------------------------------------
// Glossary — searchable directory of every term in the shared registry, with
// a live TermTip demo strip. Supports /glossary#<term> deep links.
// ---------------------------------------------------------------------------

const CATEGORY_TINTS: Record<string, string> = {
  FRAMEWORK: '#34D399',
  STANDARD: '#D4A937',
  REGULATION: '#F87171',
  ROLE: '#FBBF24',
  TECHNOLOGY: '#2DD4BF',
  METRIC: '#64748B',
  CONCEPT: '#9BA7B1',
}

function tintFor(category: string): string {
  return CATEGORY_TINTS[category] ?? '#9BA7B1'
}

function termAnchor(term: string): string {
  return `term-${term.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`
}

/** Demo-strip segment: plain text or a live TermTip term. */
type DemoSegment = { text: string } | { term: string }

const DEMO: DemoSegment[] = [
  { text: 'During a ' },
  { term: 'GRC' },
  { text: ' engagement, an ' },
  { term: 'ISO' },
  { text: ' 27001 audit tests the ' },
  { term: 'SoA' },
  { text: ' against Annex A controls, while NIST ' },
  { term: 'CSF' },
  { text: ' scores maturity across six functions. ' },
  { term: 'COSO' },
  { text: ' evaluates the control environment, ' },
  { term: 'COBIT' },
  { text: ' governs IT processes, and ' },
  { term: 'MITRE ATT&CK' },
  { text: ' maps detection coverage. Expect to collect evidence from the ' },
  { term: 'SIEM' },
  { text: ', verify ' },
  { term: 'MFA' },
  { text: ' on ' },
  { term: 'IAM' },
  { text: ' roles, and confirm ' },
  { term: 'RTO' },
  { text: '/' },
  { term: 'RPO' },
  { text: ' targets in the ' },
  { term: 'BCP' },
  { text: '.' },
]

const RELATED_CARDS = [
  { label: 'Frameworks', target: 'Library', to: '/frameworks', icon: Layers },
  { label: 'Controls & questions', target: 'Guided Audit', to: '/audit/iso27001', icon: ClipboardCheck },
  { label: 'Roles', target: 'Interview Mode', to: '/interviews', icon: MessagesSquare },
  { label: 'Metrics', target: 'Findings & Scoring', to: '/findings', icon: BarChart3 },
]

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('')

export default function Glossary() {
  const reduceMotion = useReducedMotion()
  const { hash } = useLocation()
  const navigate = useNavigate()

  const [query, setQuery] = useState('')
  const [category, setCategory] = useState('ALL')
  const [flashTerm, setFlashTerm] = useState<string | null>(null)
  const [flashLetter, setFlashLetter] = useState<string | null>(null)
  const flashTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const terms = useMemo(() => allTerms(), [])
  const categories = useMemo(() => [...new Set(terms.map((t) => t.category))].sort(), [terms])

  // SEE ALSO: terms referenced inside a term's definition / full name.
  const seeAlso = useMemo(() => {
    const matchers = terms.map((t) => ({
      entry: t,
      re: new RegExp(`\\b${t.term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i'),
    }))
    const map = new Map<string, GlossaryTerm[]>()
    for (const t of terms) {
      const related: GlossaryTerm[] = []
      for (const m of matchers) {
        if (m.entry.term === t.term) continue
        if (m.re.test(t.definition) || m.re.test(t.fullName)) {
          related.push(m.entry)
          if (related.length >= 3) break
        }
      }
      map.set(t.term, related)
    }
    return map
  }, [terms])

  const filtered = useMemo(() => {
    const base = searchTerms(query)
    return category === 'ALL' ? base : base.filter((t) => t.category === category)
  }, [query, category])

  const groups = useMemo(() => {
    const map = new Map<string, GlossaryTerm[]>()
    for (const t of filtered) {
      const letter = /^[A-Za-z]/.test(t.term) ? t.term[0].toUpperCase() : '#'
      const list = map.get(letter) ?? []
      list.push(t)
      map.set(letter, list)
    }
    return [...map.entries()].sort(([a], [b]) => a.localeCompare(b))
  }, [filtered])

  const activeLetters = useMemo(() => new Set(groups.map(([l]) => l)), [groups])

  const flashTermCard = (term: string) => {
    if (flashTimer.current) clearTimeout(flashTimer.current)
    setFlashTerm(term)
    flashTimer.current = setTimeout(() => setFlashTerm(null), 2600)
  }

  // Deep link: /glossary#<term> → clear filters, scroll, flash.
  useEffect(() => {
    if (!hash) return
    const entry = getTerm(decodeURIComponent(hash.slice(1)))
    if (!entry) return
    setQuery('')
    setCategory('ALL')
    const t = setTimeout(
      () => {
        document
          .getElementById(termAnchor(entry.term))
          ?.scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth', block: 'center' })
        flashTermCard(entry.term)
      },
      reduceMotion ? 0 : 80,
    )
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hash])

  const jumpToLetter = (letter: string) => {
    document
      .getElementById(`letter-${letter}`)
      ?.scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth', block: 'start' })
    setFlashLetter(letter)
    setTimeout(() => setFlashLetter(null), 700)
  }

  const openTerm = (term: string) => {
    navigate(`/glossary#${encodeURIComponent(term)}`)
  }

  let wordIndex = 0

  return (
    <div className="space-y-6">
      {/* -------------------------------------------------------------- */}
      {/* Header + TermTip demo                                           */}
      {/* -------------------------------------------------------------- */}
      <motion.div
        initial={reduceMotion ? false : { opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
      >
        <div className="text-overline text-text-muted">Reference</div>
        <h1 className="mt-1 font-display text-[30px] font-semibold leading-[38px] tracking-[-0.02em] text-text-primary">
          Glossary
        </h1>
        <p className="mt-1 max-w-2xl text-[14px] leading-[22px] text-text-secondary">
          {terms.length} terms every auditor meets in the field. Hover any underlined term — here or anywhere in
          AuditOS — for an instant definition.
        </p>

        <motion.div
          initial={reduceMotion ? false : { opacity: 0 }}
          whileInView={{ opacity: 1 }}
          viewport={{ once: true }}
          transition={{ duration: 0.3 }}
          className="mt-4 rounded-lg border border-dashed border-border-strong bg-bg-surface p-5"
        >
          <div className="text-overline text-text-muted">Try it — hover the terms</div>
          <p className="mt-3 max-w-3xl text-[15px] leading-[26px] text-text-primary">
            {DEMO.map((seg, i) => {
              if ('text' in seg) {
                const words = seg.text.split(/(\s+)/).filter((w) => w.length > 0)
                return words.map((w, j) => {
                  const d = wordIndex++ * 0.008
                  return (
                    <motion.span
                      key={`${i}-${j}`}
                      initial={reduceMotion ? false : { opacity: 0 }}
                      whileInView={{ opacity: 1 }}
                      viewport={{ once: true }}
                      transition={{ duration: 0.16, delay: reduceMotion ? 0 : d }}
                    >
                      {w}
                    </motion.span>
                  )
                })
              }
              const d = wordIndex++ * 0.008
              return (
                <motion.span
                  key={`term-${i}`}
                  initial={reduceMotion ? false : { opacity: 0 }}
                  whileInView={{ opacity: 1 }}
                  viewport={{ once: true }}
                  transition={{ duration: 0.16, delay: reduceMotion ? 0 : d }}
                >
                  <Abbr term={seg.term} className="term-cue" />
                </motion.span>
              )
            })}
          </p>
        </motion.div>
      </motion.div>

      {/* -------------------------------------------------------------- */}
      {/* Sticky search + index bar                                       */}
      {/* -------------------------------------------------------------- */}
      <div className="sticky top-0 z-30 -mx-1 space-y-3 border-b border-border bg-bg-base/85 px-1 py-3 backdrop-blur">
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative w-full max-w-sm">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-text-muted" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder='Search terms — try "RTO" or "privacy"'
              className="w-full rounded-md border border-border bg-bg-surface py-2 pl-9 pr-3 text-[13px] text-text-primary placeholder:text-text-muted focus:border-[var(--accent)] focus:outline-none"
            />
          </div>
          <div className="flex flex-wrap items-center gap-1.5">
            {['ALL', ...categories].map((c) => {
              const on = category === c
              return (
                <button
                  key={c}
                  type="button"
                  onClick={() => setCategory(c)}
                  className={clsx(
                    'rounded-full border px-2.5 py-1 font-mono text-[10px] uppercase tracking-[0.08em] transition-colors duration-[140ms]',
                    on
                      ? 'border-[var(--accent)] bg-accent-dim text-[var(--accent)]'
                      : 'border-border text-text-muted hover:border-border-strong hover:text-text-secondary',
                  )}
                >
                  {c}
                </button>
              )
            })}
          </div>
        </div>
        <nav className="flex flex-wrap items-center gap-x-1.5 gap-y-1" aria-label="Alphabetical index">
          {ALPHABET.map((l) => {
            const active = activeLetters.has(l)
            return (
              <button
                key={l}
                type="button"
                disabled={!active}
                onClick={() => jumpToLetter(l)}
                className={clsx(
                  'rounded px-1.5 py-0.5 font-mono text-[13px] transition-colors duration-[120ms]',
                  active
                    ? 'text-text-secondary hover:bg-bg-raised hover:text-[var(--accent)]'
                    : 'cursor-default text-text-muted opacity-50',
                  flashLetter === l && 'text-[var(--accent)]',
                )}
              >
                {l}
              </button>
            )
          })}
        </nav>
      </div>

      {/* -------------------------------------------------------------- */}
      {/* Term grid                                                       */}
      {/* -------------------------------------------------------------- */}
      {groups.length === 0 ? (
        <div className="flex flex-col items-center rounded-lg border border-dashed border-border-strong bg-bg-surface px-6 py-16 text-center">
          <img src="/empty-search.svg" alt="" className="w-56 opacity-90" />
          <p className="mt-4 text-[14px] text-text-secondary">
            No term matches — request it and it will be added to the registry.
          </p>
        </div>
      ) : (
        <div className="space-y-8">
          {groups.map(([letter, letterTerms]) => (
            <section key={letter} id={`letter-${letter}`} className="scroll-mt-32">
              <div
                className={clsx(
                  'border-t border-border pt-2 transition-colors duration-300',
                  flashLetter === letter && 'border-[var(--accent)]',
                )}
              >
                <h2
                  className={clsx(
                    'font-display text-[32px] font-semibold leading-10 transition-colors duration-300',
                    flashLetter === letter ? 'text-[var(--accent)]' : 'text-text-primary',
                  )}
                >
                  {letter}
                </h2>
              </div>
              <motion.div layout="position" className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
                {letterTerms.map((t, i) => (
                  <motion.article
                    key={t.term}
                    id={termAnchor(t.term)}
                    initial={reduceMotion ? false : { opacity: 0, y: 10 }}
                    whileInView={{ opacity: 1, y: 0 }}
                    viewport={{ once: true, amount: 0.2 }}
                    transition={{ duration: 0.25, delay: reduceMotion ? 0 : (i % 9) * 0.03 }}
                    className={clsx(
                      'group flex flex-col rounded-lg border border-border bg-bg-surface p-4 transition-all duration-[160ms] hover:-translate-y-0.5 hover:border-border-strong',
                      flashTerm === t.term && 'termcard-flash border-[var(--accent)]',
                    )}
                  >
                    <span
                      className="inline-flex w-fit items-center rounded-full px-2 py-px font-mono text-[10px] font-medium uppercase leading-4 tracking-[0.08em]"
                      style={{ color: tintFor(t.category), backgroundColor: `${tintFor(t.category)}1f` }}
                    >
                      {t.category}
                    </span>
                    <h3 className="mt-2 font-display text-[16px] font-semibold leading-6 text-text-primary">
                      {t.term}
                    </h3>
                    <div className="text-[13px] font-medium leading-[18px] text-text-primary">{t.fullName}</div>
                    <p className="mt-2 flex-1 text-[13px] leading-5 text-text-secondary">{t.definition}</p>
                    {t.frameworks.length > 0 && (
                      <div className="mt-3 flex flex-wrap items-center gap-1.5">
                        <span className="font-mono text-[10px] uppercase tracking-[0.08em] text-text-muted">
                          Used in
                        </span>
                        {t.frameworks.map((f) => (
                          <span
                            key={f}
                            className="rounded-full bg-bg-raised px-1.5 py-px font-mono text-[10px] text-text-secondary"
                          >
                            {f}
                          </span>
                        ))}
                      </div>
                    )}
                    {(seeAlso.get(t.term) ?? []).length > 0 && (
                      <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 border-t border-border pt-2">
                        <span className="font-mono text-[10px] uppercase tracking-[0.08em] text-text-muted">
                          See also
                        </span>
                        {(seeAlso.get(t.term) ?? []).map((r) => (
                          <button
                            key={r.term}
                            type="button"
                            onClick={() => openTerm(r.term)}
                            className="relative text-[12px] font-medium text-[var(--accent)] transition-colors duration-[160ms] after:absolute after:bottom-0 after:left-0 after:h-px after:w-0 after:bg-[var(--accent)] after:transition-all after:duration-[160ms] hover:after:w-full"
                          >
                            {r.term}
                          </button>
                        ))}
                      </div>
                    )}
                  </motion.article>
                ))}
              </motion.div>
            </section>
          ))}
        </div>
      )}

      {/* -------------------------------------------------------------- */}
      {/* Related-frameworks footer strip                                 */}
      {/* -------------------------------------------------------------- */}
      <section className="rounded-lg border border-border bg-bg-surface p-4">
        <div className="flex items-center gap-2 text-overline text-text-muted">
          <BookOpen className="size-3.5" />
          These terms at work
        </div>
        <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {RELATED_CARDS.map((c, i) => (
            <motion.div
              key={c.label}
              initial={reduceMotion ? false : { opacity: 0, y: 10 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.25, delay: reduceMotion ? 0 : i * 0.05 }}
            >
              <Link
                to={c.to}
                className="group flex items-center gap-3 rounded-md border border-border bg-bg-base px-3.5 py-3 transition-all duration-[160ms] hover:-translate-y-0.5 hover:border-border-strong"
              >
                <span className="flex size-8 shrink-0 items-center justify-center rounded-md bg-accent-dim text-[var(--accent)]">
                  <c.icon className="size-4" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[13px] font-medium text-text-primary">{c.label}</span>
                  <span className="block font-mono text-[10px] uppercase tracking-[0.06em] text-text-muted">
                    {c.target}
                  </span>
                </span>
                <ArrowRight className="size-4 shrink-0 text-text-muted transition-all duration-[160ms] group-hover:translate-x-[3px] group-hover:text-[var(--accent)]" />
              </Link>
            </motion.div>
          ))}
        </div>
      </section>
    </div>
  )
}
