import type { ReactNode } from 'react'
import { CheckIcon } from 'lucide-react'
import { cn } from '@/lib/utils'

/**
 * The one selection primitive.
 *
 * The old UI hand-rolled this shape three times — the provider card, the
 * recommendation row, and the manual-method grid — each with its own border
 * weight, its own hover fill and its own 16px square standing in for a radio.
 * They drifted. This is the single implementation all three now use.
 *
 * It renders a real `<button>` (or `<div role="button">` when it has to contain
 * its own controls, as the provider card does), so keyboard selection, focus
 * rings and `aria-pressed` come for free rather than being re-derived.
 */

export function Selectable({
  selected = false,
  disabled = false,
  /** Set when the card has its own interactive children (a `<select>`, say).
   * A `<button>` may not contain one, so the element degrades to a div that
   * still handles Enter/Space itself. */
  asDiv = false,
  indicator = 'check',
  onSelect,
  className,
  children,
  ...props
}: {
  selected?: boolean
  disabled?: boolean
  asDiv?: boolean
  /** `check` shows a tick box; `none` lets the content carry the state. */
  indicator?: 'check' | 'none'
  onSelect?: () => void
  className?: string
  children?: ReactNode
} & Omit<React.ComponentProps<'div'>, 'children' | 'onSelect'>) {
  const shared = cn(
    'group/selectable relative flex w-full flex-col gap-2 rounded-xl border p-4 text-left',
    'transition-[border-color,background-color,box-shadow,transform] duration-150 ease-[var(--ease-out-quint)]',
    'focus-visible:ring-[3px] focus-visible:ring-ring focus-visible:outline-none',
    disabled
      ? 'cursor-not-allowed border-border bg-muted/40 opacity-55'
      : selected
        // Selection reads as a tinted surface with a brand hairline and a soft
        // lift — not as a heavy frame, which is what made the old selected
        // state indistinguishable from an error box.
        ? 'cursor-pointer border-primary/45 bg-brand-muted shadow-sm'
        : 'cursor-pointer border-border bg-surface shadow-xs hover:border-border-strong hover:bg-accent',
    className,
  )

  const body = (
    <>
      {indicator === 'check' && (
        <span
          aria-hidden
          className={cn(
            'absolute top-3.5 right-3.5 flex size-[18px] items-center justify-center rounded-md border transition-colors duration-150',
            selected
              ? 'border-primary bg-primary text-primary-foreground'
              : 'border-border-strong bg-surface text-transparent group-hover/selectable:border-muted-foreground',
          )}
        >
          <CheckIcon className="size-3" strokeWidth={3} />
        </span>
      )}
      {children}
    </>
  )

  if (asDiv) {
    return (
      <div
        role="button"
        tabIndex={disabled ? -1 : 0}
        aria-pressed={selected}
        aria-disabled={disabled}
        onClick={() => !disabled && onSelect?.()}
        onKeyDown={(e) => {
          if (disabled) return
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault()
            onSelect?.()
          }
        }}
        className={shared}
        {...props}
      >
        {body}
      </div>
    )
  }

  return (
    <button
      type="button"
      aria-pressed={selected}
      disabled={disabled}
      onClick={() => onSelect?.()}
      className={shared}
      {...(props as React.ComponentProps<'button'>)}
    >
      {body}
    </button>
  )
}

/**
 * Pill-shaped multi-select option. One implementation for both the tech/domain
 * chips on the intake form and the manual method picker, which previously had
 * a square-cornered and a rounded version of the same control.
 */
export function Chip({
  selected = false,
  disabled = false,
  onSelect,
  className,
  children,
  ...props
}: {
  selected?: boolean
  disabled?: boolean
  onSelect?: () => void
  className?: string
  children?: ReactNode
} & Omit<React.ComponentProps<'button'>, 'children' | 'onSelect'>) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      disabled={disabled}
      onClick={onSelect}
      className={cn(
        'inline-flex h-8 items-center gap-1.5 rounded-full border px-3 text-sm font-medium',
        'transition-[color,background-color,border-color] duration-150',
        'focus-visible:ring-[3px] focus-visible:ring-ring focus-visible:outline-none',
        'disabled:cursor-not-allowed disabled:opacity-45',
        selected
          ? 'border-primary/40 bg-brand-muted text-primary'
          : 'border-border bg-surface text-foreground/75 hover:border-border-strong hover:bg-accent hover:text-foreground',
        className,
      )}
      {...props}
    >
      {selected && <CheckIcon className="-ml-0.5 size-3.5" strokeWidth={3} aria-hidden />}
      {children}
    </button>
  )
}

/**
 * Segmented control for a small closed set — the intake form's 是/否/不確定.
 * A single bordered track with the active segment lifted onto a surface, rather
 * than the old three abutting boxes with negative margins holding them together.
 */
export function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
  className,
  'aria-label': ariaLabel,
}: {
  options: readonly { value: T; label: ReactNode }[]
  value: T
  onChange: (value: T) => void
  className?: string
  'aria-label'?: string
}) {
  return (
    <div
      role="radiogroup"
      aria-label={ariaLabel}
      className={cn(
        'inline-flex items-center gap-0.5 rounded-lg border border-border bg-muted p-0.5',
        className,
      )}
    >
      {options.map((opt) => {
        const active = value === opt.value
        return (
          <button
            key={opt.value}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => onChange(opt.value)}
            className={cn(
              'h-7 rounded-md px-3 text-sm font-medium transition-[color,background-color,box-shadow] duration-150',
              'focus-visible:ring-[3px] focus-visible:ring-ring focus-visible:outline-none',
              active
                ? 'bg-surface text-foreground shadow-xs'
                : 'text-muted-foreground hover:text-foreground',
            )}
          >
            {opt.label}
          </button>
        )
      })}
    </div>
  )
}
