import { useEffect, useRef, useState } from 'react'
import clsx from 'clsx'

// SVG progress ring — 3px stroke, track --border, fill --accent (or status color),
// animated stroke-dashoffset over 800ms, center mono percentage. Sizes 20 / 40 / 96.

export default function ProgressRing({
  value,
  size = 40,
  color = 'var(--accent)',
  showLabel = true,
  animate = true,
  className,
}: {
  /** 0–100 */
  value: number
  size?: 20 | 40 | 96 | number
  color?: string
  showLabel?: boolean
  animate?: boolean
  className?: string
}) {
  const stroke = size >= 96 ? 4 : 3
  const radius = (size - stroke) / 2
  const circumference = 2 * Math.PI * radius
  const clamped = Math.min(100, Math.max(0, value))

  const [display, setDisplay] = useState(animate ? 0 : clamped)
  const raf = useRef<number>(0)

  useEffect(() => {
    if (!animate) {
      setDisplay(clamped)
      return
    }
    const prefersReduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    if (prefersReduced) {
      setDisplay(clamped)
      return
    }
    const from = display
    const start = performance.now()
    const duration = 800
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / duration)
      const eased = 1 - Math.pow(1 - t, 3)
      setDisplay(from + (clamped - from) * eased)
      if (t < 1) raf.current = requestAnimationFrame(tick)
    }
    raf.current = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf.current)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clamped, animate])

  const offset = circumference * (1 - display / 100)
  const fontSize = size >= 96 ? 18 : size >= 40 ? 10 : 7

  return (
    <div
      className={clsx('relative inline-flex items-center justify-center', className)}
      style={{ width: size, height: size }}
      role="img"
      aria-label={`${Math.round(clamped)}% complete`}
    >
      <svg width={size} height={size} className="-rotate-90">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="var(--border)"
          strokeWidth={stroke}
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={color}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
        />
      </svg>
      {showLabel && size >= 40 && (
        <span
          className="absolute font-mono font-medium tabular text-text-primary"
          style={{ fontSize }}
        >
          {Math.round(display)}%
        </span>
      )}
    </div>
  )
}
