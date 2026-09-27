import type { ReactNode } from 'react'
import { CheckIcon, PlusIcon, XIcon } from 'lucide-react'
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
 * Pill-shaped multi-select option. One implementation for the tech/domain chips
 * on the intake form and the manual method picker, which previously had a
 * square-cornered and a rounded version of the same control.
 *
 * `indicator` says what clicking it will do rather than only what state it is
 * in: a chip sitting in the chosen row carries the `×` that removes it, and one
 * still in the pool carries the `+` that picks it up. That is what lets a
 * two-part picker (chosen above, pool below) read without instructions.
 */
export function Chip({
  selected = false,
  disabled = false,
  indicator = 'check',
  onSelect,
  className,
  children,
  ...props
}: {
  selected?: boolean
  disabled?: boolean
  /** `check` ticks a selected chip in place; `remove` / `add` say which way
   * clicking will move it; `none` leaves it bare. */
  indicator?: 'check' | 'remove' | 'add' | 'none'
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
        'group/chip inline-flex h-8 items-center gap-1.5 rounded-full border px-3 text-sm font-medium',
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
      {indicator === 'check' && selected && (
        <CheckIcon className="-ml-0.5 size-3.5" strokeWidth={3} aria-hidden />
      )}
      {indicator === 'add' && (
        <PlusIcon
          className="-ml-0.5 size-3.5 text-muted-foreground transition-colors group-hover/chip:text-primary"
          strokeWidth={2.5}
          aria-hidden
        />
      )}
      <span className="min-w-0 truncate">{children}</span>
      {indicator === 'remove' && (
        <XIcon
          className="-mr-0.5 size-3.5 text-primary/60 transition-colors group-hover/chip:text-primary"
          strokeWidth={2.5}
          aria-hidden
        />
      )}
    </button>
  )
}

/**
 * Segmented control for a small closed set — 是/否/不確定, light/dark/system.
 *
 * The active segment is a thumb that *slides* between positions rather than a
 * background that blinks from one option to the next. That motion is the whole
 * point of the control: it says these options are one value being moved, not
 * three buttons that happen to sit together. Equal-width columns are what make
 * the slide honest — the thumb travels exactly one column per step, so it can
 * be positioned with a transform instead of measuring every label.
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
  const activeIndex = options.findIndex((opt) => opt.value === value)

  return (
    <div
      role="radiogroup"
      aria-label={ariaLabel}
      className={cn(
        'relative inline-grid rounded-lg border border-border bg-muted p-0.5',
        className,
      )}
      style={{ gridTemplateColumns: `repeat(${options.length}, minmax(0, 1fr))` }}
    >
      {activeIndex >= 0 && (
        <span
          aria-hidden
          className="absolute inset-y-0.5 left-0.5 rounded-md bg-surface shadow-xs transition-transform duration-200 ease-[var(--ease-out-quint)]"
          style={{
            // The track inside the 2px padding, divided by the column count.
            width: `calc((100% - 0.25rem) / ${options.length})`,
            transform: `translateX(${activeIndex * 100}%)`,
          }}
        />
      )}
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
              'relative z-10 flex h-7 items-center justify-center rounded-md px-3 text-sm font-medium',
              'transition-colors duration-150',
              'focus-visible:ring-[3px] focus-visible:ring-ring focus-visible:outline-none',
              active ? 'text-foreground' : 'text-muted-foreground hover:text-foreground',
            )}
          >
            {opt.label}
          </button>
        )
      })}
    </div>
  )
}
