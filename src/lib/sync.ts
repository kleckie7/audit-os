import { useCallback, useEffect, useRef } from 'react'
import { useAuth } from '@/hooks/useAuth'
import { trpc } from '@/providers/trpc'
import { useAuditStore } from '@/lib/store'
import { useFindingsStore, type Remediation } from '@/lib/findings-store'
import { MOCK_ENGAGEMENT } from '@/lib/mock-engagement'
import type { Answer, AnswerStatus, Engagement } from '@/lib/types'

// Cloud sync layer for the audit + findings stores.
// - Guest mode (unauthenticated): stores stay localStorage-only, untouched.
// - Authenticated: hydrate the most recent engagement (or auto-create one),
//   then debounce-persist every answer/flag/remediation mutation to tRPC.
// Pages never talk to this module directly — TopBar mounts `useCloudSync()`.

const DEBOUNCE_MS = 800

type AnswerStatusNonNull = Exclude<AnswerStatus, null>

interface AnswerPayload {
  engagementId: number
  questionId: string
  status: AnswerStatusNonNull
  notes: string
  evidenceChecked: string[]
  flagged: boolean
}

interface FindingOverridePayload {
  engagementId: number
  findingKey: string
  owner: string | null
  dueDate: string | null
  status: string | null
  response: string | null
  inReport: boolean
}

function toIso(value: unknown): string {
  if (value instanceof Date) return value.toISOString()
  const d = new Date(value as string)
  return Number.isNaN(d.getTime()) ? new Date().toISOString() : d.toISOString()
}

function toDate(value: unknown): Date {
  return value instanceof Date ? value : new Date(value as string)
}

/** Display id derived from the backend row, e.g. ENG-2025-0147. */
export function displayId(backendId: number, startedAt: Date): string {
  const year = Number.isNaN(startedAt.getTime()) ? new Date().getFullYear() : startedAt.getFullYear()
  return `ENG-${year}-${String(backendId).padStart(4, '0')}`
}

const REMEDIATION_STATUSES = new Set(['open', 'in-remediation', 'accepted', 'closed'])

export function useCloudSync() {
  const { user, isAuthenticated, isLoading } = useAuth()
  const utils = trpc.useUtils()
  const client = utils.client

  // Set while hydrating so store subscribers don't echo hydrated rows back.
  const hydratingRef = useRef(false)
  const hydratedUserRef = useRef<number | null>(null)

  const answerQueueRef = useRef(new Map<string, AnswerPayload>())
  const answerTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const findingQueueRef = useRef(new Map<string, FindingOverridePayload>())
  const findingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // ─── Write path ──────────────────────────────────────────────────────

  const flushAnswers = useCallback(async () => {
    const items = [...answerQueueRef.current.values()]
    answerQueueRef.current.clear()
    for (const payload of items) {
      try {
        await client.audit.saveAnswer.mutate(payload)
      } catch {
        // Queue failed writes — retried on the next mutation's flush.
        answerQueueRef.current.set(`${payload.engagementId}:${payload.questionId}`, payload)
      }
    }
  }, [client])

  const flushFindings = useCallback(async () => {
    const items = [...findingQueueRef.current.values()]
    findingQueueRef.current.clear()
    for (const payload of items) {
      try {
        await client.audit.saveFindingOverride.mutate(payload)
      } catch {
        findingQueueRef.current.set(`${payload.engagementId}:${payload.findingKey}`, payload)
      }
    }
  }, [client])

  const scheduleAnswerFlush = useCallback(() => {
    if (answerTimerRef.current) clearTimeout(answerTimerRef.current)
    answerTimerRef.current = setTimeout(() => void flushAnswers(), DEBOUNCE_MS)
  }, [flushAnswers])

  const scheduleFindingFlush = useCallback(() => {
    if (findingTimerRef.current) clearTimeout(findingTimerRef.current)
    findingTimerRef.current = setTimeout(() => void flushFindings(), DEBOUNCE_MS)
  }, [flushFindings])

  // Debounced persistence of answer/flag mutations (fires only when authed
  // and the active engagement has a backend id; never blocks the UI).
  useEffect(() => {
    if (!isAuthenticated) return
    let prevAnswers = useAuditStore.getState().engagement?.answers ?? {}
    const unsub = useAuditStore.subscribe((state) => {
      const next = state.engagement?.answers ?? {}
      if (hydratingRef.current) {
        prevAnswers = next
        return
      }
      if (next === prevAnswers) return
      const backendId = state.engagement?.backendId
      const changed: string[] = []
      for (const id of new Set([...Object.keys(prevAnswers), ...Object.keys(next)])) {
        if (prevAnswers[id] !== next[id]) changed.push(id)
      }
      prevAnswers = next
      if (!backendId || changed.length === 0) return
      let queued = false
      for (const id of changed) {
        const a = next[id]
        // Flag-only rows (no status yet) can't be persisted — the backend
        // schema requires a status enum. They stay local until answered.
        if (!a || a.status === null) continue
        answerQueueRef.current.set(`${backendId}:${id}`, {
          engagementId: backendId,
          questionId: id,
          status: a.status,
          notes: a.notes,
          evidenceChecked: a.evidenceChecked,
          flagged: a.flagged,
        })
        queued = true
      }
      // Any new mutation also retries previously failed writes.
      if (queued || answerQueueRef.current.size > 0) scheduleAnswerFlush()
    })
    return unsub
  }, [isAuthenticated, scheduleAnswerFlush])

  // Debounced persistence of finding-override mutations.
  useEffect(() => {
    if (!isAuthenticated) return
    let prev = useFindingsStore.getState().remediation
    const unsub = useFindingsStore.subscribe((state) => {
      const next = state.remediation
      if (hydratingRef.current) {
        prev = next
        return
      }
      if (next === prev) return
      const backendId = useAuditStore.getState().engagement?.backendId
      const changed: string[] = []
      for (const id of new Set([...Object.keys(prev), ...Object.keys(next)])) {
        if (prev[id] !== next[id]) changed.push(id)
      }
      prev = next
      if (!backendId || changed.length === 0) return
      for (const id of changed) {
        const r = next[id]
        if (!r) continue
        findingQueueRef.current.set(`${backendId}:${id}`, {
          engagementId: backendId,
          findingKey: id,
          owner: r.owner ?? null,
          dueDate: r.dueDate ?? null,
          status: r.status ?? null,
          response: r.response ?? null,
          inReport: r.inReport ?? true,
        })
      }
      if (findingQueueRef.current.size > 0) scheduleFindingFlush()
    })
    return unsub
  }, [isAuthenticated, scheduleFindingFlush])

  // ─── Hydration ─────────────────────────────────────────────────────────

  const hydrateEngagement = useCallback(
    async (backendId: number) => {
      const data = await client.audit.getEngagement.query({ id: backendId })
      if (!data) return
      const { engagement: eng, answers: rows, findingOverrides } = data

      const answers: Record<string, Answer> = {}
      for (const r of rows) {
        answers[r.questionId] = {
          status: (r.status as AnswerStatus) ?? null,
          notes: r.notes ?? '',
          evidenceChecked: r.evidenceChecked ?? [],
          flagged: r.flagged,
          updatedAt: toIso(r.updatedAt),
        }
      }

      const startedAt = toDate(eng.startedAt)
      const next: Engagement = {
        id: displayId(eng.id, startedAt),
        backendId: eng.id,
        client: eng.clientName,
        name: eng.name,
        auditor: eng.auditor ?? '',
        frameworks: eng.frameworks,
        startedAt: toIso(eng.startedAt),
        answers,
      }

      const remediation: Record<string, Partial<Remediation>> = {}
      for (const o of findingOverrides) {
        const patch: Partial<Remediation> = { inReport: o.inReport }
        if (o.owner != null) patch.owner = o.owner
        if (o.dueDate != null) patch.dueDate = o.dueDate
        if (o.status != null && REMEDIATION_STATUSES.has(o.status)) {
          patch.status = o.status as Remediation['status']
        }
        if (o.response != null) patch.response = o.response
        remediation[o.findingKey] = patch
      }

      hydratingRef.current = true
      try {
        useAuditStore.setState({ engagement: next })
        useFindingsStore.setState({ remediation })
      } finally {
        hydratingRef.current = false
      }
    },
    [client],
  )

  const createCloudEngagement = useCallback(
    async (input: { clientName: string; name: string }) => {
      const created = await client.audit.createEngagement.mutate({
        clientName: input.clientName,
        name: input.name,
        auditor: user?.name ?? undefined,
        frameworks: [...MOCK_ENGAGEMENT.frameworks],
      })
      if (created) await hydrateEngagement(created.id)
      return created ?? null
    },
    [client, user, hydrateEngagement],
  )

  // On sign-in: hydrate the most recent engagement, or auto-create one.
  useEffect(() => {
    if (isLoading) return
    if (!isAuthenticated || !user) {
      hydratedUserRef.current = null
      return
    }
    if (hydratedUserRef.current === user.id) return
    hydratedUserRef.current = user.id
    void (async () => {
      try {
        const list = await client.audit.listEngagements.query()
        if (list.length === 0) {
          await createCloudEngagement({
            clientName: 'Acme Corp',
            name: 'Acme Corp — FY25 Integrated Audit',
          })
        } else {
          await hydrateEngagement(list[0].id)
        }
      } catch {
        // Allow a retry on the next auth-state change.
        hydratedUserRef.current = null
      }
    })()
  }, [isLoading, isAuthenticated, user, client, hydrateEngagement, createCloudEngagement])

  return { hydrateEngagement, createCloudEngagement }
}
