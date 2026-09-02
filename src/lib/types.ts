// Shared TypeScript types for the whole AuditOS app.
// Other agents build against this contract — keep field names stable.

export interface AuditQuestion {
  id: string
  controlRef: string
  question: string
  whyItMatters: string
  /** Stakeholder roles to interview for this control (e.g. "CISO", "IT Ops Lead"). */
  interviewees: string[]
  /** Evidence codes/names expected (e.g. "EV-104 Access review log"). */
  evidence: string[]
  /** Expert auditor guidance for this question. */
  guidance: string
  /** Follow-up probe questions. */
  probes: string[]
  /** Scoring weight. */
  weight: 1 | 2 | 3
}

export interface Phase {
  id: string
  name: string
  questions: AuditQuestion[]
}

export interface Framework {
  id: string
  name: string
  shortName: string
  version: string
  /** Library grouping: security | governance | privacy | threat */
  category: 'security' | 'governance' | 'privacy' | 'threat'
  description: string
  phases: Phase[]
}

export type AnswerStatus = 'compliant' | 'partial' | 'noncompliant' | 'na' | null

export interface Answer {
  status: AnswerStatus
  notes: string
  /** Evidence items checked off for this question. */
  evidenceChecked: string[]
  flagged: boolean
  updatedAt: string
}

export interface Engagement {
  id: string
  client: string
  name: string
  startedAt: string
  auditor: string
  frameworks: string[]
  /** Keyed by question id. */
  answers: Record<string, Answer>
}

export type FindingSeverity = 'critical' | 'high' | 'medium' | 'low'
