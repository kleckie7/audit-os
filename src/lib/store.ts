import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'
import type { Answer, AnswerStatus, Engagement } from '@/lib/types'
import { allQuestions } from '@/data/frameworks'
import { MOCK_ENGAGEMENT } from '@/lib/mock-engagement'

// Zustand store with localStorage persistence.
// Contract other agents build against — keep action names and shapes stable.

export interface StatusCounts {
  compliant: number
  partial: number
  noncompliant: number
  na: number
  unanswered: number
  total: number
}

interface AuditState {
  engagement: Engagement | null
  lastSavedAt: string | null

  /** Create (or replace) the current engagement. */
  createEngagement: (input: {
    id: string
    client: string
    name: string
    auditor: string
    frameworks: string[]
  }) => void
  /** Record or update an answer for a question id. */
  setAnswer: (questionId: string, answer: Partial<Answer> & { status: AnswerStatus }) => void
  toggleFlag: (questionId: string) => void
  clearEngagement: () => void
  /** Test hook: load the bundled mock engagement. */
  loadMockEngagement: () => void

  // Computed helpers
  /** Progress for one framework: answered/total + status breakdown. */
  frameworkProgress: (frameworkId: string) => StatusCounts
  /** Overall progress across all frameworks in the engagement. */
  overallProgress: () => StatusCounts
  /** Next unanswered question id in a framework (document order), or null. */
  nextUnanswered: (frameworkId: string) => string | null
}

function countStatuses(
  answers: Record<string, Answer>,
  questionIds: string[],
): StatusCounts {
  const counts: StatusCounts = {
    compliant: 0,
    partial: 0,
    noncompliant: 0,
    na: 0,
    unanswered: 0,
    total: questionIds.length,
  }
  for (const id of questionIds) {
    const a = answers[id]
    if (!a || a.status === null) counts.unanswered += 1
    else counts[a.status] += 1
  }
  return counts
}

export const useAuditStore = create<AuditState>()(
  persist(
    (set, get) => ({
      engagement: MOCK_ENGAGEMENT,
      lastSavedAt: null,

      createEngagement: (input) =>
        set({
          engagement: {
            ...input,
            backendId: null,
            startedAt: new Date().toISOString(),
            answers: {},
          },
        }),

      setAnswer: (questionId, answer) =>
        set((state) => {
          if (!state.engagement) return state
          const prev = state.engagement.answers[questionId]
          const next: Answer = {
            status: answer.status,
            notes: answer.notes ?? prev?.notes ?? '',
            evidenceChecked: answer.evidenceChecked ?? prev?.evidenceChecked ?? [],
            flagged: answer.flagged ?? prev?.flagged ?? false,
            updatedAt: new Date().toISOString(),
          }
          return {
            lastSavedAt: next.updatedAt,
            engagement: {
              ...state.engagement,
              answers: { ...state.engagement.answers, [questionId]: next },
            },
          }
        }),

      toggleFlag: (questionId) =>
        set((state) => {
          if (!state.engagement) return state
          const prev = state.engagement.answers[questionId]
          const next: Answer = {
            status: prev?.status ?? null,
            notes: prev?.notes ?? '',
            evidenceChecked: prev?.evidenceChecked ?? [],
            flagged: !(prev?.flagged ?? false),
            updatedAt: new Date().toISOString(),
          }
          return {
            lastSavedAt: next.updatedAt,
            engagement: {
              ...state.engagement,
              answers: { ...state.engagement.answers, [questionId]: next },
            },
          }
        }),

      clearEngagement: () => set({ engagement: null }),

      loadMockEngagement: () => set({ engagement: MOCK_ENGAGEMENT }),

      frameworkProgress: (frameworkId) => {
        const { engagement } = get()
        const ids = allQuestions(frameworkId).map((q) => q.id)
        return countStatuses(engagement?.answers ?? {}, ids)
      },

      overallProgress: () => {
        const { engagement } = get()
        if (!engagement)
          return { compliant: 0, partial: 0, noncompliant: 0, na: 0, unanswered: 0, total: 0 }
        const ids = engagement.frameworks.flatMap((f) => allQuestions(f).map((q) => q.id))
        return countStatuses(engagement.answers, ids)
      },

      nextUnanswered: (frameworkId) => {
        const { engagement } = get()
        const answers = engagement?.answers ?? {}
        for (const q of allQuestions(frameworkId)) {
          const a = answers[q.id]
          if (!a || a.status === null) return q.id
        }
        return null
      },
    }),
    {
      name: 'auditos-store',
      storage: createJSONStorage(() => localStorage),
      version: 1,
    },
  ),
)
