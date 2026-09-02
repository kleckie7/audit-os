import { BookOpenText } from 'lucide-react'

export default function Glossary() {
  return (
    <div className="rounded-lg border border-border bg-bg-surface p-8">
      <div className="flex items-center gap-3">
        <span className="flex size-10 items-center justify-center rounded-md bg-accent-dim">
          <BookOpenText className="size-5 text-[var(--accent)]" />
        </span>
        <div>
          <h1 className="font-display text-[22px] font-semibold leading-[30px] tracking-[-0.01em] text-text-primary">
            Glossary
          </h1>
          <p className="text-[13px] text-text-muted font-mono uppercase tracking-[0.08em]">/glossary</p>
        </div>
      </div>
      <p className="mt-4 max-w-xl text-[14px] leading-[22px] text-text-secondary">
        Every abbreviation defined and searchable, with live TermTip demonstrations.
      </p>
    </div>
  )
}
