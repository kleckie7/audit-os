import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'
import type { FindingSeverity } from '@/lib/types'

// Findings page remediation slice (page-local to /findings) — persisted to
// localStorage. Findings themselves are derived from engagement answers; this
// slice stores everything the auditor edits on top of them, plus manually
// created findings.

export type RemediationStatus = 'open' | 'in-remediation' | 'accepted' | 'closed'

export interface Remediation {
  owner: string
  /** ISO date string (yyyy-mm-dd). */
  dueDate: string
  status: RemediationStatus
  /** Management response text (for the report). */
  response: string
  /** Include in the next report build. */
  inReport: boolean
}

export interface CustomFinding {
  id: string
  title: string
  description: string
  frameworkId: string
  frameworkShort: string
  controlRef: string
  severity: FindingSeverity
  createdAt: string
}

interface FindingsState {
  /** Keyed by finding id. Only stores fields the auditor overrode. */
  remediation: Record<string, Partial<Remediation>>
  custom: CustomFinding[]
  updateRemediation: (id: string, patch: Partial<Remediation>) => void
  bulkUpdateRemediation: (ids: string[], patch: Partial<Remediation>) => void
  addCustomFinding: (finding: CustomFinding) => void
}

export const useFindingsStore = create<FindingsState>()(
  persist(
    (set) => ({
      remediation: {},
      custom: [],

      updateRemediation: (id, patch) =>
        set((state) => ({
          remediation: {
            ...state.remediation,
            [id]: { ...state.remediation[id], ...patch },
          },
        })),

      bulkUpdateRemediation: (ids, patch) =>
        set((state) => {
          const next = { ...state.remediation }
          for (const id of ids) next[id] = { ...next[id], ...patch }
          return { remediation: next }
        }),

      addCustomFinding: (finding) => set((state) => ({ custom: [...state.custom, finding] })),
    }),
    {
      name: 'auditos-findings',
      storage: createJSONStorage(() => localStorage),
      version: 1,
    },
  ),
)
