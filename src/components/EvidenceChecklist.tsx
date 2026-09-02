import { useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { Check, FileText, Image as ImageIcon, Paperclip, Table2, Upload, X } from 'lucide-react'
import clsx from 'clsx'
import RichText from '@/pages/workflow-rich-text'

// EvidenceChecklist — checkbox rows with mono evidence codes (EV-104), a
// file-type icon, per-row attach button and a dashed attach/upload dropzone
// (hover/drag → accent border, 120ms). Checked items draw an emerald
// strike-through (160ms). Known abbreviations in item names render as
// TermTips via RichText (design.md §9).

function fileTypeIcon(name: string) {
  const n = name.toLowerCase()
  if (/screenshot|png|jpe?g|image|photo|diagram|chart/.test(n)) return ImageIcon
  if (/export|csv|xls|log|matrix|table|register|inventory|list/.test(n)) return Table2
  return FileText
}

/** Stable mono evidence code for an item index: EV-101, EV-102, … */
function evidenceCode(index: number): string {
  return `EV-${String(101 + index)}`
}

export default function EvidenceChecklist({
  items,
  checked,
  onToggle,
  attachments = [],
  onAttach,
  onRemoveAttachment,
  renderLabel,
  className,
}: {
  items: string[]
  checked: string[]
  onToggle: (item: string) => void
  /** Filenames attached this session (lift state to the page to persist across items). */
  attachments?: string[]
  onAttach?: (files: FileList) => void
  onRemoveAttachment?: (name: string) => void
  /** Override row label rendering (defaults to RichText with TermTips). */
  renderLabel?: (item: string) => ReactNode
  className?: string
}) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [dragOver, setDragOver] = useState(false)

  const pick = () => inputRef.current?.click()
  const handleFiles = (files: FileList | null) => {
    if (files && files.length > 0) onAttach?.(files)
  }

  return (
    <div className={clsx('space-y-1.5', className)}>
      <input
        ref={inputRef}
        type="file"
        multiple
        className="hidden"
        onChange={(e) => {
          handleFiles(e.target.files)
          e.target.value = ''
        }}
      />

      {items.map((item, i) => {
        const isChecked = checked.includes(item)
        const Icon = fileTypeIcon(item)
        return (
          <div
            key={item}
            className={clsx(
              'group flex items-center gap-2.5 rounded-md border border-transparent px-2 py-1.5 transition-colors duration-[120ms]',
              isChecked ? 'bg-accent-dim' : 'hover:border-border hover:bg-bg-raised',
            )}
          >
            {/* Checkbox */}
            <button
              type="button"
              role="checkbox"
              aria-checked={isChecked}
              aria-label={item}
              onClick={() => onToggle(item)}
              className={clsx(
                'flex size-4 shrink-0 items-center justify-center rounded border transition-colors duration-[160ms]',
                isChecked
                  ? 'border-[var(--accent)] bg-[var(--accent)]'
                  : 'border-border-strong bg-bg-base group-hover:border-text-muted',
              )}
            >
              <AnimatePresence>
                {isChecked && (
                  <motion.span
                    initial={{ scale: 0.4, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    exit={{ scale: 0.4, opacity: 0 }}
                    transition={{ duration: 0.16, ease: 'easeOut' }}
                  >
                    <Check className="size-3 text-[#06251B]" strokeWidth={3} />
                  </motion.span>
                )}
              </AnimatePresence>
            </button>

            {/* Mono evidence code */}
            <span className="shrink-0 font-mono text-[11px] leading-4 tracking-[0.02em] text-text-muted tabular">
              {evidenceCode(i)}
            </span>

            <Icon className="size-3.5 shrink-0 text-text-muted" />

            {/* Item name with strike-through draw */}
            <span className="relative min-w-0 flex-1 truncate text-[13px] leading-[18px]">
              <span
                className={clsx(
                  'transition-colors duration-[160ms]',
                  isChecked ? 'text-text-muted' : 'text-text-secondary',
                )}
              >
                {renderLabel ? renderLabel(item) : <RichText text={item} />}
              </span>
              <motion.span
                aria-hidden
                className="absolute left-0 top-1/2 h-px w-full origin-left bg-[var(--accent)]"
                initial={false}
                animate={{ scaleX: isChecked ? 1 : 0, opacity: isChecked ? 0.7 : 0 }}
                transition={{ duration: 0.16, ease: 'easeOut' }}
              />
            </span>

            {/* Per-row attach */}
            <button
              type="button"
              onClick={pick}
              aria-label={`Attach file for ${evidenceCode(i)}`}
              className="shrink-0 rounded p-1 text-text-muted opacity-0 transition-all duration-[120ms] hover:bg-bg-overlay hover:text-[var(--accent)] focus-visible:opacity-100 group-hover:opacity-100"
            >
              <Paperclip className="size-3.5" />
            </button>
          </div>
        )
      })}

      {/* Attached files (session) */}
      {attachments.length > 0 && (
        <div className="flex flex-wrap gap-1.5 px-2 pt-1">
          {attachments.map((name) => {
            const Icon = fileTypeIcon(name)
            return (
              <span
                key={name}
                className="inline-flex items-center gap-1.5 rounded-full border border-border-strong bg-bg-raised py-0.5 pl-2 pr-1 font-mono text-[11px] leading-4 text-text-secondary"
              >
                <Icon className="size-3 text-[var(--accent)]" />
                <span className="max-w-48 truncate">{name}</span>
                {onRemoveAttachment && (
                  <button
                    type="button"
                    aria-label={`Remove ${name}`}
                    onClick={() => onRemoveAttachment(name)}
                    className="rounded-full p-0.5 text-text-muted transition-colors hover:text-[var(--status-noncompliant)]"
                  >
                    <X className="size-3" />
                  </button>
                )}
              </span>
            )
          })}
        </div>
      )}

      {/* Dropzone */}
      <button
        type="button"
        onClick={pick}
        onDragOver={(e) => {
          e.preventDefault()
          setDragOver(true)
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          e.preventDefault()
          setDragOver(false)
          handleFiles(e.dataTransfer.files)
        }}
        className={clsx(
          'flex w-full flex-col items-center justify-center gap-1.5 rounded-md border border-dashed px-4 py-4 transition-colors duration-[120ms]',
          dragOver
            ? 'border-[var(--accent)] bg-accent-dim'
            : 'border-border-strong hover:border-[var(--accent)] hover:bg-accent-dim',
        )}
      >
        <Upload className={clsx('size-4', dragOver ? 'text-[var(--accent)]' : 'text-text-muted')} />
        <span className="text-[12px] font-medium text-text-secondary">
          Drop files or click to attach
        </span>
        <span className="flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-[0.08em] text-text-muted">
          <FileText className="size-3" /> PDF
          <span className="text-border-strong">·</span>
          <ImageIcon className="size-3" /> PNG
          <span className="text-border-strong">·</span>
          <Table2 className="size-3" /> CSV
        </span>
      </button>
    </div>
  )
}
