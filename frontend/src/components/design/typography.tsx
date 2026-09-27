import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'

/**
 * The type scale, expressed as importance rather than as HTML element.
 *
 *   Display  — the product's own name. Once, on the entry screen.
 *   Title    — the one thing a screen is about.
 *   Heading  — a section inside a screen.
 *   Subhead  — a content title: an idea, a method, a provider.
 *   Body     — prose the user reads.
 *   Small    — secondary prose: a past answer, a rationale, a hint.
 *   Eyebrow  — the quietest label there is: a kicker, a field name, a count.
 *
 * Weight tops out at `font-medium`/`font-semibold`. The old scale ran to
 * `font-black` + `uppercase` + `tracking-tighter`, which made every heading
 * shout and left nothing in reserve to mark the one that actually mattered.
 * Here hierarchy is carried by size and colour, so emphasis stays available.
 *
 * Each component forwards `className`, and `cn()` puts the caller last, so a
 * one-off override never needs a new variant.
 */

type TextProps<T = HTMLElement> = React.HTMLAttributes<T> & { children: ReactNode }

export function Display({ className, children, ...props }: TextProps<HTMLHeadingElement>) {
  return (
    <h1
      className={cn(
        'text-4xl leading-[1.08] font-semibold tracking-[-0.028em] text-balance sm:text-5xl',
        className,
      )}
      {...props}
    >
      {children}
    </h1>
  )
}

export function Title({ className, children, ...props }: TextProps<HTMLHeadingElement>) {
  return (
    <h1 className={cn('text-2xl font-semibold text-balance sm:text-3xl', className)} {...props}>
      {children}
    </h1>
  )
}

export function Heading({ className, children, ...props }: TextProps<HTMLHeadingElement>) {
  return (
    <h2 className={cn('text-lg font-semibold text-balance sm:text-xl', className)} {...props}>
      {children}
    </h2>
  )
}

export function Subhead({ className, children, ...props }: TextProps<HTMLHeadingElement>) {
  return (
    <h3 className={cn('text-base leading-snug font-medium tracking-tight', className)} {...props}>
      {children}
    </h3>
  )
}

export function Body({ className, children, ...props }: TextProps<HTMLParagraphElement>) {
  return (
    <p className={cn('text-base text-pretty', className)} {...props}>
      {children}
    </p>
  )
}

export function Small({ className, children, ...props }: TextProps<HTMLParagraphElement>) {
  return (
    <p className={cn('text-sm text-muted-foreground text-pretty', className)} {...props}>
      {children}
    </p>
  )
}

/** Uppercase kicker / field label. The only place uppercase survives, because
 * at this size it is the letterforms that signal "this is a label, not prose". */
export function Eyebrow({ className, children, ...props }: TextProps<HTMLSpanElement>) {
  return (
    <span
      className={cn(
        'text-2xs font-semibold tracking-[0.07em] text-muted-foreground uppercase',
        className,
      )}
      {...props}
    >
      {children}
    </span>
  )
}

/** A key or a literal value the user is meant to read character by character —
 * a model id, a keyboard shortcut. */
export function Mono({ className, children, ...props }: TextProps<HTMLSpanElement>) {
  return (
    <span className={cn('font-mono text-xs tracking-normal', className)} {...props}>
      {children}
    </span>
  )
}
