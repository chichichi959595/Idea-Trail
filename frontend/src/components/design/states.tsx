import type { ReactNode } from 'react'
import {
  AlertTriangleIcon,
  CircleAlertIcon,
  CircleCheckIcon,
  InfoIcon,
  SparklesIcon,
  type LucideIcon,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { Skeleton } from '@/components/ui/skeleton'
import { Eyebrow, Heading, Small } from './typography'

/**
 * Empty, error and inline-notice states.
 *
 * These are the states the old UI had no vocabulary for: an empty idea board
 * was one grey sentence, and every error — a failed provider call, a rejected
 * answer, a validation hint — rendered as the same orange-bordered box as a
 * *selected* item. Tone is now a token, and each tone means one thing.
 */

const TONES = {
  info: {
    icon: InfoIcon,
    surface: 'border-border bg-muted',
    accent: 'text-muted-foreground',
  },
  brand: {
    icon: SparklesIcon,
    surface: 'border-brand-border bg-brand-muted',
    accent: 'text-primary',
  },
  ai: {
    icon: SparklesIcon,
    surface: 'border-ai-border bg-ai-muted',
    accent: 'text-ai',
  },
  warning: {
    icon: AlertTriangleIcon,
    surface: 'border-warning-border bg-warning-muted',
    accent: 'text-warning',
  },
  destructive: {
    icon: CircleAlertIcon,
    surface: 'border-destructive-border bg-destructive-muted',
    accent: 'text-destructive',
  },
  success: {
    icon: CircleCheckIcon,
    surface: 'border-success-border bg-success-muted',
    accent: 'text-success',
  },
} as const

export type Tone = keyof typeof TONES

/**
 * A notice attached to the thing it is about — a rejected answer, a provider
 * that needs logging in, a forced submit. Tinted fill plus a matching hairline;
 * never a solid block, which at this size reads as an ad.
 */
export function Notice({
  tone = 'info',
  icon,
  title,
  children,
  actions,
  className,
  ...props
}: {
  tone?: Tone
  /** Overrides the tone's default glyph. */
  icon?: LucideIcon
  title?: ReactNode
  children?: ReactNode
  actions?: ReactNode
  className?: string
} & Omit<React.ComponentProps<'div'>, 'title'>) {
  const t = TONES[tone]
  const Icon = icon ?? t.icon
  return (
    <div
      role={tone === 'destructive' ? 'alert' : undefined}
      className={cn('flex gap-3 rounded-xl border px-3.5 py-3', t.surface, className)}
      {...props}
    >
      <Icon className={cn('mt-0.5 size-4 shrink-0', t.accent)} aria-hidden />
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        {title && <p className={cn('text-sm font-medium', t.accent)}>{title}</p>}
        {children && (
          <div className="text-sm text-foreground/80 [&_p]:text-sm [&_p+p]:mt-1.5">{children}</div>
        )}
        {actions && <div className="mt-1.5 flex flex-wrap items-center gap-2">{actions}</div>}
      </div>
    </div>
  )
}

/**
 * "There is nothing here yet, and here is the one thing to do about it."
 * Centred in a bordered canvas with a faint grid, so an empty board reads as
 * space waiting to be filled rather than as a failure to load.
 */
export function EmptyState({
  icon: Icon = SparklesIcon,
  eyebrow,
  title,
  description,
  action,
  className,
}: {
  icon?: LucideIcon
  eyebrow?: ReactNode
  title: ReactNode
  description?: ReactNode
  action?: ReactNode
  className?: string
}) {
  return (
    <div
      className={cn(
        'bg-grid relative flex flex-col items-center gap-3 rounded-2xl border border-dashed border-border px-6 py-14 text-center',
        className,
      )}
    >
      <div className="flex size-11 items-center justify-center rounded-xl border border-border bg-surface text-muted-foreground shadow-xs">
        <Icon className="size-5" aria-hidden />
      </div>
      {eyebrow && <Eyebrow>{eyebrow}</Eyebrow>}
      <Heading className="text-base sm:text-lg">{title}</Heading>
      {description && <Small className="max-w-sm">{description}</Small>}
      {action && <div className="mt-2 flex items-center gap-2">{action}</div>}
    </div>
  )
}

/**
 * A whole surface failed, as opposed to one field being wrong. Carries the
 * retry, because an error the user can only read is a dead end — every call in
 * this app is a subprocess that can simply come back empty.
 */
export function ErrorState({
  title = '這一步沒有成功',
  detail,
  onRetry,
  retryLabel = '再試一次',
  className,
}: {
  title?: ReactNode
  detail?: ReactNode
  onRetry?: () => void
  retryLabel?: string
  className?: string
}) {
  return (
    <Notice
      tone="destructive"
      title={title}
      className={className}
      actions={
        onRetry && (
          <button
            type="button"
            onClick={onRetry}
            className="rounded-md text-sm font-medium text-destructive underline decoration-destructive/40 underline-offset-4 transition-colors hover:decoration-destructive focus-visible:ring-[3px] focus-visible:ring-destructive/30 focus-visible:outline-none"
          >
            {retryLabel}
          </button>
        )
      }
    >
      {detail && (
        // Provider errors arrive as raw subprocess output. Monospaced and
        // scroll-capped so a stack trace informs without taking the screen.
        <pre className="max-h-32 overflow-auto font-mono text-xs leading-relaxed whitespace-pre-wrap text-foreground/70">
          {detail}
        </pre>
      )}
    </Notice>
  )
}

/** Card-shaped placeholder for the idea board's first paint. */
export function CardSkeleton({ className }: { className?: string }) {
  return (
    <div className={cn('flex flex-col gap-3 rounded-xl border border-border bg-surface p-4', className)}>
      <div className="flex items-center justify-between">
        <Skeleton className="h-4 w-14" />
        <Skeleton className="h-4 w-16 rounded-full" />
      </div>
      <Skeleton className="h-5 w-3/4" />
      <div className="flex flex-col gap-1.5">
        <Skeleton className="h-3 w-full" />
        <Skeleton className="h-3 w-full" />
        <Skeleton className="h-3 w-2/3" />
      </div>
    </div>
  )
}

/** Row-shaped placeholder for the method recommendation list. */
export function RowSkeleton({ className }: { className?: string }) {
  return (
    <div className={cn('flex items-start gap-4 rounded-xl border border-border bg-surface p-4', className)}>
      <Skeleton className="size-9 shrink-0 rounded-lg" />
      <div className="flex min-w-0 flex-1 flex-col gap-2">
        <Skeleton className="h-4 w-40" />
        <Skeleton className="h-3 w-full" />
        <Skeleton className="h-3 w-4/5" />
      </div>
    </div>
  )
}

/** Generic "reading content" placeholder. `lines` shrinks the last row so the
 * block reads as a paragraph rather than as a table. */
export function TextSkeleton({ lines = 3, className }: { lines?: number; className?: string }) {
  return (
    <div className={cn('flex flex-col gap-2', className)}>
      {Array.from({ length: lines }).map((_, i) => (
        <Skeleton key={i} className={cn('h-3', i === lines - 1 ? 'w-2/5' : 'w-full')} />
      ))}
    </div>
  )
}
