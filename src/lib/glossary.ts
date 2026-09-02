import glossaryData from '@/data/glossary.json'

// Shared glossary registry — single source of truth for TermTip and the Glossary page.

export interface GlossaryTerm {
  term: string
  fullName: string
  definition: string
  /** Mono uppercase chip label, e.g. FRAMEWORK, STANDARD, ROLE, TECHNOLOGY, METRIC, REGULATION. */
  category: string
  frameworks: string[]
}

export const GLOSSARY: GlossaryTerm[] = glossaryData as GlossaryTerm[]

const normalized = new Map<string, GlossaryTerm>()
for (const entry of GLOSSARY) {
  normalized.set(normalizeKey(entry.term), entry)
}

function normalizeKey(term: string): string {
  return term.trim().toLowerCase().replace(/\s+/g, ' ')
}

/** Case-insensitive lookup. Returns undefined for unknown terms. */
export function getTerm(term: string): GlossaryTerm | undefined {
  return normalized.get(normalizeKey(term))
}

export function hasTerm(term: string): boolean {
  return normalized.has(normalizeKey(term))
}

/** All terms sorted alphabetically (for the Glossary page). */
export function allTerms(): GlossaryTerm[] {
  return [...GLOSSARY].sort((a, b) => a.term.localeCompare(b.term))
}

/** Simple search across term, full name and definition. */
export function searchTerms(query: string): GlossaryTerm[] {
  const q = query.trim().toLowerCase()
  if (!q) return allTerms()
  return allTerms().filter(
    (t) =>
      t.term.toLowerCase().includes(q) ||
      t.fullName.toLowerCase().includes(q) ||
      t.definition.toLowerCase().includes(q),
  )
}
