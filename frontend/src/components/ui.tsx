import type { ButtonHTMLAttributes, FormHTMLAttributes, HTMLAttributes, ReactNode } from 'react'

/**
 * Shared Swiss International primitives. Every screen composes these
 * instead of hand-rolling Tailwind strings, so the design tokens
 * (color, border, type scale) live in exactly one place.
 *
 * Type scale is tied to message importance, not element type:
 *   Display  — the app's own identity (once, top of page)
 *   Headline — the single most important actionable thing in a panel
 *              (a section title, or the question the user must answer now)
 *   Subhead  — valuable content titles (idea titles, method names)
 *   Body     — normal reading content (descriptions, rationale)
 *   Support  — secondary content (a past answer, an idea fragment)
 *   Meta     — labels/tags/timestamps — least important, always smallest
 */

type TextProps = HTMLAttributes<HTMLElement> & { children: ReactNode }

export function Display({ children, className = '', ...props }: TextProps) {
  return (
    <h1
      className={`text-5xl sm:text-7xl lg:text-8xl font-black uppercase tracking-tighter leading-[0.9] ${className}`}
      {...props}
    >
      {children}
    </h1>
  )
}

export function Headline({ children, className = '', ...props }: TextProps) {
  return (
    <h2
      className={`text-2xl sm:text-3xl font-black uppercase tracking-tight leading-tight ${className}`}
      {...props}
    >
      {children}
    </h2>
  )
}

export function Subhead({ children, className = '', ...props }: TextProps) {
  return (
    <h3 className={`text-lg sm:text-xl font-bold uppercase tracking-tight ${className}`} {...props}>
      {children}
    </h3>
  )
}

export function Body({ children, className = '', ...props }: TextProps) {
  return (
    <p className={`text-base font-medium leading-relaxed ${className}`} {...props}>
      {children}
    </p>
  )
}

export function Support({ children, className = '', ...props }: TextProps) {
  return (
    <p className={`text-sm font-medium leading-relaxed ${className}`} {...props}>
      {children}
    </p>
  )
}

/** Visible "the LLM is actually working" signal — every action here waits
 * on a real subprocess call (5–20s), so silence reads as broken. */
export function ThinkingIndicator({ label = 'AI 正在思考…' }: { label?: string }) {
  return (
    <span className="text-accent inline-flex items-center gap-3" role="status">
      <span className="bg-accent h-3 w-3 animate-pulse" aria-hidden />
      <span className="text-xs font-bold tracking-widest uppercase">{label}</span>
    </span>
  )
}

export function Meta({ children, className = '', ...props }: TextProps) {
  return (
    <span className={`text-xs font-bold uppercase tracking-widest text-foreground/60 ${className}`} {...props}>
      {children}
    </span>
  )
}

/** Numbered section label, e.g. "01. METHOD SELECTOR" — the Swiss signature. */
export function SectionLabel({ number, children }: { number: string; children: ReactNode }) {
  return (
    <div className="mb-4 flex items-baseline gap-3">
      <span className="text-accent text-sm font-black tracking-widest">{number}.</span>
      <Meta className="text-foreground">{children}</Meta>
    </div>
  )
}

type ButtonVariant = 'primary' | 'secondary' | 'ghost'

export function Button({
  variant = 'primary',
  className = '',
  children,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: ButtonVariant }) {
  const base =
    'inline-flex items-center justify-center gap-2 px-6 py-3 min-h-11 text-sm font-bold uppercase tracking-wide transition-colors duration-150 ease-out disabled:opacity-40 disabled:cursor-not-allowed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2'
  const variants: Record<ButtonVariant, string> = {
    primary:
      'bg-foreground text-background border-2 border-foreground hover:bg-accent hover:border-accent',
    secondary:
      'bg-background text-foreground border-2 border-foreground hover:bg-foreground hover:text-background',
    ghost: 'border-2 border-transparent text-foreground hover:border-foreground',
  }
  return (
    <button className={`${base} ${variants[variant]} ${className}`} {...props}>
      {children}
    </button>
  )
}

export function Panel({
  className = '',
  muted = false,
  children,
  ...props
}: HTMLAttributes<HTMLDivElement> & { muted?: boolean }) {
  return (
    <div className={`${panelClass} ${muted ? 'bg-muted' : 'bg-background'} ${className}`} {...props}>
      {children}
    </div>
  )
}

const panelClass = 'border-2 border-foreground sm:border-4 p-6 sm:p-10'

export function FormPanel({
  className = '',
  muted = false,
  children,
  ...props
}: FormHTMLAttributes<HTMLFormElement> & { muted?: boolean }) {
  return (
    <form className={`${panelClass} ${muted ? 'bg-muted' : 'bg-background'} ${className}`} {...props}>
      {children}
    </form>
  )
}

export function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="flex flex-col gap-2">
      <Meta>{label}</Meta>
      {children}
    </label>
  )
}

export const inputClass =
  'w-full bg-background border-b-2 border-foreground px-1 py-2 text-base font-medium focus:outline-none focus:border-accent placeholder:text-foreground/35 transition-colors duration-150'

/** Full bordered box, not just an underline — an underline reads as a stray
 * blank line once the field is tall enough to hold multiple rows. */
export const textareaClass =
  'w-full bg-background border-2 border-foreground px-3 py-2 text-base font-medium focus:outline-none focus:border-accent placeholder:text-foreground/35 transition-colors duration-150'

export const OTHER_OPTION = '其他'

/** Multi-select chip group with a built-in "其他" (other) free-text option. */
export function ChipSelect({
  options,
  selected,
  onToggle,
  otherValue,
  onOtherChange,
}: {
  options: string[]
  selected: string[]
  onToggle: (option: string) => void
  otherValue: string
  onOtherChange: (value: string) => void
}) {
  const otherActive = selected.includes(OTHER_OPTION)
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap gap-2">
        {[...options, OTHER_OPTION].map((opt) => {
          const active = selected.includes(opt)
          return (
            <button
              type="button"
              key={opt}
              onClick={() => onToggle(opt)}
              className={`min-h-9 border-2 px-3 py-1.5 text-sm font-bold transition-colors duration-150 ${
                active
                  ? 'bg-accent border-accent text-background'
                  : 'bg-background border-foreground text-foreground hover:bg-muted'
              }`}
            >
              {opt}
            </button>
          )
        })}
      </div>
      {otherActive && (
        <input
          className={inputClass}
          placeholder="請說明"
          value={otherValue}
          onChange={(e) => onOtherChange(e.target.value)}
        />
      )}
    </div>
  )
}

export function Tag({ children, active = false }: { children: ReactNode; active?: boolean }) {
  return (
    <span
      className={`inline-block border px-2 py-1 text-xs font-bold uppercase tracking-widest ${
        active ? 'bg-accent border-accent text-background' : 'border-foreground/30 text-foreground/70'
      }`}
    >
      {children}
    </span>
  )
}
