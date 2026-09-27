import { cn } from '@/lib/utils'
import { Mono } from './typography'

/**
 * The product's name and mark, in one place.
 *
 * The mark is a 2×2 of squares with one lit — the product's own "many
 * candidates, one chosen" shape, which is also the shape of every screen in the
 * app. It is drawn once here rather than at each size, because it was previously
 * hand-built in the rail and would have been hand-built again on the entry
 * screen at a different size, with a different gap, and drifted.
 */

export const PRODUCT_NAME = 'IdeaTrail'
export const PRODUCT_TAGLINE = '專案發想引導'

export function BrandMark({ className }: { className?: string }) {
  return (
    <span
      aria-hidden
      className={cn(
        'grid size-7 shrink-0 grid-cols-2 gap-[3px] rounded-lg border border-border bg-surface p-[5px] shadow-xs',
        className,
      )}
    >
      <span className="rounded-[1.5px] bg-muted-foreground/25" />
      <span className="rounded-[1.5px] bg-primary" />
      <span className="rounded-[1.5px] bg-muted-foreground/25" />
      <span className="rounded-[1.5px] bg-muted-foreground/25" />
    </span>
  )
}

/**
 * Name over role, for the rail — where it is the app's only permanent
 * identification and has a 17rem column to fit in.
 */
export function BrandLockup({ compact = false }: { compact?: boolean }) {
  return (
    <div className={cn('flex items-center gap-2.5', compact ? '' : 'px-2 pt-1')}>
      <BrandMark />
      <span className="flex min-w-0 flex-col leading-tight">
        <span className="truncate text-sm font-semibold tracking-tight">{PRODUCT_NAME}</span>
        <Mono className="truncate text-2xs text-muted-foreground">{PRODUCT_TAGLINE}</Mono>
      </span>
    </div>
  )
}
