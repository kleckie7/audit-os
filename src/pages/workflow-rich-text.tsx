import { useMemo } from 'react'
import type { ReactNode } from 'react'
import { GLOSSARY } from '@/lib/glossary'
import { Abbr } from '@/components/TermTip'

// RichText — page-local helper for the Guided Audit Workflow.
// Scans a plain-text string for known glossary terms (longest-first, whole-term
// boundaries, case-sensitive so lowercase prose is untouched) and wraps every
// match in the app-wide <Abbr> TermTip trigger.

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

// Longest-first so multi-word terms ("MITRE ATT&CK", "SOC 2") win over
// shorter ones at the same start position.
const TERMS = [...GLOSSARY].map((t) => t.term).sort((a, b) => b.length - a.length)
const PATTERN = new RegExp(
  `(?<![A-Za-z0-9])(${TERMS.map(escapeRegExp).join('|')})(?![A-Za-z0-9])`,
  'g',
)

/** Terms from the glossary registry that appear in the given texts. */
// eslint-disable-next-line react-refresh/only-export-components
export function termsIn(...texts: string[]): string[] {
  const found = new Set<string>()
  const re = new RegExp(PATTERN.source, 'g')
  for (const text of texts) {
    re.lastIndex = 0
    let m: RegExpExecArray | null
    while ((m = re.exec(text))) found.add(m[1])
  }
  return [...found]
}

export default function RichText({
  text,
  className,
}: {
  text: string
  className?: string
}) {
  const parts = useMemo<ReactNode[]>(() => {
    const out: ReactNode[] = []
    const re = new RegExp(PATTERN.source, 'g')
    let last = 0
    let m: RegExpExecArray | null
    let key = 0
    while ((m = re.exec(text))) {
      if (m.index > last) out.push(text.slice(last, m.index))
      const term = m[1]
      out.push(
        <Abbr key={`${term}-${key++}`} term={term}>
          {term}
        </Abbr>,
      )
      last = m.index + term.length
    }
    if (last < text.length) out.push(text.slice(last))
    return out
  }, [text])

  return <span className={className}>{parts}</span>
}
