import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'
import { Eyebrow, Heading, Small } from './typography'

/**
 * Page and section scaffolding. Every screen is built from these, which is what
 * keeps the gutters, the max width and the header rhythm identical across all
 * four of them instead of each one picking its own `mt-8` / `mb-10`.
 */

/** The scroll body of a screen. One max width, one gutter, everywhere. */
export function Page({ className, children, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      className={cn(
        'mx-auto flex w-full max-w-4xl flex-col px-5 py-8 sm:px-8 sm:py-12',
        // Fills the viewport (minus the phone header) so a screen whose content
        // is shorter than the window still puts its StickyFooter at the bottom.
        'min-h-[calc(100svh-3.5rem)] lg:min-h-svh',
        className,
      )}
      {...props}
    >
      {children}
    </div>
  )
}

/** A titled block within a screen. Sections stack with `space-y`, so they never
 * carry their own outer margins. */
export function Section({ className, children, ...props }: React.ComponentProps<'section'>) {
  return (
    <section className={cn('flex flex-col gap-5', className)} {...props}>
      {children}
    </section>
  )
}

export function SectionHeader({
  eyebrow,
  title,
  description,
  actions,
  className,
}: {
  eyebrow?: ReactNode
  title: ReactNode
  description?: ReactNode
  /** Controls that belong to this section, right-aligned on the title row. */
  actions?: ReactNode
  className?: string
}) {
  return (
    <div className={cn('flex flex-wrap items-end justify-between gap-x-6 gap-y-3', className)}>
      <div className="flex min-w-0 flex-col gap-1.5">
        {eyebrow && <Eyebrow>{eyebrow}</Eyebrow>}
        <Heading>{title}</Heading>
        {description && <Small className="max-w-prose">{description}</Small>}
      </div>
      {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
    </div>
  )
}

/**
 * The action row that closes a screen: status on the left, the primary action
 * on the right. Sticky, because on the method selector and the idea board the
 * list above it is long enough that a footer button would otherwise be
 * scrolled off the moment the user has something to confirm.
 */
export function StickyFooter({ className, children, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      className={cn(
        'sticky bottom-0 z-10 -mx-5 mt-auto flex flex-wrap items-center justify-between gap-x-6 gap-y-3',
        'border-t border-border bg-background/85 px-5 py-4 backdrop-blur-md sm:-mx-8 sm:px-8',
        className,
      )}
      {...props}
    >
      {children}
    </div>
  )
}

/** Hairline that fades at both ends — see the `divider-fade` utility. Used
 * inside panels, where a full-bleed rule would cut the panel in two. */
export function Divider({ className }: { className?: string }) {
  return <div aria-hidden className={cn('divider-fade my-1', className)} />
}
