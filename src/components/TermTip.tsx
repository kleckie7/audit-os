import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { useNavigate } from 'react-router'
import { AnimatePresence, motion } from 'framer-motion'
import clsx from 'clsx'
import { getTerm } from '@/lib/glossary'

// TermTip — app-wide abbreviation tooltip system (design.md §8).
// <Abbr term="GRC"> renders a dotted-underline trigger + rich hover card:
// 150ms hover delay, instant on keyboard focus, 100ms leave grace, ESC to
// dismiss, touch first-tap-open / second-tap-navigate.

const HOVER_DELAY = 150
const LEAVE_GRACE = 100
const CARD_WIDTH = 320
const CARD_OFFSET = 8
const EST_HEIGHT = 240

interface CardPos {
  top: number
  left: number
  placement: 'above' | 'below'
  caretLeft: number
}

function computePosition(trigger: HTMLElement, cardHeight: number): CardPos {
  const rect = trigger.getBoundingClientRect()
  const fitsAbove = rect.top - CARD_OFFSET - cardHeight - 8 >= 0
  const placement: CardPos['placement'] = fitsAbove ? 'above' : 'below'
  const top = fitsAbove ? rect.top - CARD_OFFSET - cardHeight : rect.bottom + CARD_OFFSET
  let left = rect.left + rect.width / 2 - CARD_WIDTH / 2
  left = Math.max(8, Math.min(left, window.innerWidth - CARD_WIDTH - 8))
  const caretLeft = rect.left + rect.width / 2 - left
  return { top, left, placement, caretLeft: Math.max(12, Math.min(caretLeft, CARD_WIDTH - 12)) }
}

export function Abbr({
  term,
  children,
  className,
}: {
  term: string
  children?: ReactNode
  className?: string
}) {
  const entry = getTerm(term)
  const navigate = useNavigate()
  const id = useId()
  const triggerRef = useRef<HTMLSpanElement>(null)
  const cardRef = useRef<HTMLDivElement>(null)
  const hoverTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const leaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [open, setOpen] = useState(false)
  const [pos, setPos] = useState<CardPos | null>(null)

  const clearTimers = useCallback(() => {
    if (hoverTimer.current) clearTimeout(hoverTimer.current)
    if (leaveTimer.current) clearTimeout(leaveTimer.current)
    hoverTimer.current = null
    leaveTimer.current = null
  }, [])

  const show = useCallback(() => {
    clearTimers()
    const el = triggerRef.current
    if (!el) return
    setPos(computePosition(el, cardRef.current?.offsetHeight ?? EST_HEIGHT))
    setOpen(true)
  }, [clearTimers])

  // After first paint, re-measure the real card height and correct placement.
  useLayoutEffect(() => {
    if (!open) return
    const el = triggerRef.current
    const card = cardRef.current
    if (!el || !card) return
    setPos(computePosition(el, card.offsetHeight))
  }, [open])

  const scheduleShow = () => {
    clearTimers()
    hoverTimer.current = setTimeout(show, HOVER_DELAY)
  }

  const scheduleHide = useCallback(() => {
    clearTimers()
    leaveTimer.current = setTimeout(() => setOpen(false), LEAVE_GRACE)
  }, [clearTimers])

  useEffect(() => {
    if (!open) return
    const onEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setOpen(false)
        triggerRef.current?.focus()
      }
    }
    const onScroll = () => setOpen(false)
    window.addEventListener('keydown', onEsc)
    window.addEventListener('scroll', onScroll, true)
    window.addEventListener('resize', onScroll)
    return () => {
      window.removeEventListener('keydown', onEsc)
      window.removeEventListener('scroll', onScroll, true)
      window.removeEventListener('resize', onScroll)
    }
  }, [open])

  useEffect(() => clearTimers, [clearTimers])

  // Unknown term → render plain text, no tooltip.
  if (!entry) return <>{children ?? term}</>

  const glossaryPath = `/glossary#${encodeURIComponent(entry.term)}`

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      if (open) navigate(glossaryPath)
      else show()
    }
  }

  const onTouchStart = (e: React.TouchEvent) => {
    // Touch: first tap opens, second tap follows the link.
    if (!open) {
      e.preventDefault()
      show()
    }
  }

  return (
    <>
      <span
        ref={triggerRef}
        tabIndex={0}
        role="button"
        aria-describedby={open ? id : undefined}
        aria-expanded={open}
        onMouseEnter={scheduleShow}
        onMouseLeave={scheduleHide}
        onFocus={show}
        onBlur={() => setOpen(false)}
        onKeyDown={onKeyDown}
        onTouchStart={onTouchStart}
        className={clsx(
          'cursor-help underline decoration-[1px] decoration-dotted decoration-[var(--text-secondary)] underline-offset-[3px] transition-colors duration-[120ms] hover:text-[var(--accent)] hover:decoration-solid hover:decoration-[var(--accent)]',
          className,
        )}
      >
        {children ?? term}
      </span>
      {createPortal(
        <AnimatePresence>
          {open && pos && (
            <motion.div
              ref={cardRef}
              id={id}
              role="tooltip"
              initial={{ opacity: 0, scale: 0.96, y: pos.placement === 'above' ? 4 : -4 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.96, y: pos.placement === 'above' ? 4 : -4 }}
              transition={{ duration: 0.14, ease: 'easeOut' }}
              onMouseEnter={clearTimers}
              onMouseLeave={scheduleHide}
              className="fixed z-[90] rounded-[10px] border border-border-strong bg-bg-overlay p-4 shadow-popover"
              style={{ width: CARD_WIDTH, maxWidth: CARD_WIDTH, left: pos.left, top: pos.top }}
            >
              {/* caret */}
              <span
                className="absolute size-2 rotate-45 border border-border-strong bg-bg-overlay"
                style={{
                  left: pos.caretLeft - 4,
                  ...(pos.placement === 'above'
                    ? { bottom: -5, borderTop: 'none', borderLeft: 'none' }
                    : { top: -5, borderBottom: 'none', borderRight: 'none' }),
                }}
              />
              <span className="inline-block rounded-full border border-border-strong px-1.5 py-px font-mono text-[10px] font-medium uppercase leading-4 tracking-[0.08em] text-text-muted">
                {entry.category}
              </span>
              <div className="mt-2 font-display text-[16px] font-semibold leading-5 text-text-primary">
                {entry.term}
              </div>
              <div className="mt-0.5 text-[13px] font-medium leading-[18px] text-text-primary">
                {entry.fullName}
              </div>
              <p className="mt-2 text-[13px] leading-5 text-text-secondary">{entry.definition}</p>
              {entry.frameworks.length > 0 && (
                <div className="mt-3 flex flex-wrap items-center gap-1.5">
                  <span className="font-mono text-[10px] uppercase tracking-[0.08em] text-text-muted">
                    Used in
                  </span>
                  {entry.frameworks.map((f) => (
                    <span
                      key={f}
                      className="rounded-full bg-bg-raised px-1.5 py-px font-mono text-[10px] text-text-secondary"
                    >
                      {f}
                    </span>
                  ))}
                </div>
              )}
              <button
                type="button"
                onClick={() => navigate(glossaryPath)}
                className="mt-3 text-[12px] font-medium text-[var(--accent)] transition-colors duration-[120ms] hover:text-[var(--accent-strong)]"
              >
                Open in glossary →
              </button>
            </motion.div>
          )}
        </AnimatePresence>,
        document.body,
      )}
    </>
  )
}

export default Abbr
