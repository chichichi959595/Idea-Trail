import { useRef, type ReactNode } from 'react'
import { Tabs as TabsPrimitive } from 'radix-ui'
import { ArrowLeftIcon, ArrowRightIcon, CheckIcon } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Small } from './typography'

export interface StepPanelStep {
  id: string
  label: string
  /** One line under the tab bar, saying what this page is for. */
  description?: ReactNode
  /** Controls for this page, on the right of its description line — the
   * page's own action, like 讓 AI 推薦方法. */
  actions?: ReactNode
  /** The tab's number turns into a tick. Purely a reading aid — every tab
   * stays reachable whatever its state, because none of these pages depends
   * on another having been filled in. */
  done?: boolean
  content: ReactNode
}

/**
 * A form split into pages, held in one bordered window inside the screen body.
 *
 * Tabs rather than a strict wizard: the pages are categories, not a sequence
 * that has to be walked in order, so any tab can be opened directly. 上一步／
 * 下一步 at the bottom are there for the first pass through, where the user
 * reads the pages in order and shouldn't have to travel back up to the tab bar
 * after every one.
 *
 * Built on Radix Tabs for the roles and the arrow-key movement between tabs;
 * the look is ours.
 */
export function StepPanel({
  steps,
  value,
  onValueChange,
  finish,
  pending,
  className,
}: {
  steps: StepPanelStep[]
  value: string
  onValueChange: (id: string) => void
  /** Takes 下一步's place on the last page: the action the whole form leads
   * to, in the spot the user's pointer has been returning to page after page. */
  finish?: ReactNode
  /** Shown in 下一步's place while the screen is working out whether the user
   * may move on (a check the next page depends on). */
  pending?: ReactNode
  className?: string
}) {
  const panel = useRef<HTMLDivElement>(null)
  const index = Math.max(
    0,
    steps.findIndex((s) => s.id === value),
  )
  const current = steps[index]

  function go(id: string) {
    onValueChange(id)
    // 下一步 sits at the bottom of a page that may have been scrolled well
    // past the tab bar. The next page should start from its top, not from
    // wherever the previous page's bottom left the viewport — but only when
    // the window's top is actually out of view, so a click on a tab that is
    // already on screen doesn't make the page jump.
    const el = panel.current
    const scroller = el?.closest<HTMLElement>('.overflow-y-auto')
    if (!el || !scroller) return
    const offset = el.getBoundingClientRect().top - scroller.getBoundingClientRect().top
    if (offset < 0) scroller.scrollBy({ top: offset - 16, behavior: 'smooth' })
  }

  return (
    <TabsPrimitive.Root
      ref={panel}
      value={current.id}
      onValueChange={go}
      className={cn(
        'flex flex-col overflow-hidden rounded-xl border border-border bg-surface shadow-sm',
        className,
      )}
    >
      <TabsPrimitive.List
        aria-label="設定分類"
        className="flex items-stretch gap-1 border-b border-border bg-subtle px-2 sm:px-3"
      >
        {steps.map((step, i) => {
          const active = i === index
          return (
            <TabsPrimitive.Trigger
              key={step.id}
              value={step.id}
              className={cn(
                'group/tab relative flex min-w-0 items-center gap-2 px-2.5 py-3 text-sm font-medium',
                'text-muted-foreground transition-colors duration-150 hover:text-foreground',
                'rounded-md outline-none focus-visible:ring-[3px] focus-visible:ring-ring',
                'data-[state=active]:text-foreground',
                // The underline sits on the bar's bottom border, so the active
                // tab reads as opening into the page below it.
                'after:absolute after:inset-x-2 after:-bottom-px after:h-0.5 after:rounded-full',
                'after:bg-primary after:opacity-0 after:transition-opacity data-[state=active]:after:opacity-100',
              )}
            >
              <span
                aria-hidden
                className={cn(
                  'flex size-5 shrink-0 items-center justify-center rounded-full border text-2xs tabular-nums transition-colors duration-150',
                  active
                    ? 'border-primary bg-primary text-primary-foreground'
                    : step.done
                      ? 'border-success-border bg-success-muted text-success'
                      : 'border-border-strong bg-surface',
                )}
              >
                {step.done && !active ? <CheckIcon className="size-3" strokeWidth={3} /> : i + 1}
              </span>
              {/* On a phone only the open tab carries its name; four labels
                  don't fit across 390px, and numbers alone still say where
                  you are. */}
              <span className={cn('truncate', !active && 'sr-only sm:not-sr-only')}>
                {step.label}
              </span>
            </TabsPrimitive.Trigger>
          )
        })}
      </TabsPrimitive.List>

      {/* Every page stays mounted and they all share one grid cell, so the
          window is always as tall as its tallest page. With only the open page
          rendered, the window resized on each tab and the 上一步／下一步 row
          jumped up and down under the pointer. Closed pages are `invisible`,
          which also takes them out of the tab order and the accessibility tree.
          The window is also capped at what fits on screen, measured as the
          viewport less the screen header, the tab bar, the 上一步／下一步 row
          and the body's padding. A page taller than that — 專案發想's full
          method list, opened — scrolls inside the window, so the row holding
          the screen's start button never drops below the fold. */}
      <div className="grid max-h-[max(20rem,calc(100svh-21rem))] grid-rows-[minmax(0,1fr)] lg:max-h-[max(20rem,calc(100svh-17.5rem))]">
        {steps.map((step) => (
          <TabsPrimitive.Content
            key={step.id}
            value={step.id}
            forceMount
            className={cn(
              'col-start-1 row-start-1 flex min-h-0 flex-col gap-6 overflow-y-auto px-5 py-6 outline-none sm:px-6',
              'data-[state=inactive]:invisible',
              'data-[state=active]:animate-in data-[state=active]:duration-200 data-[state=active]:fade-in',
            )}
          >
            {(step.description || step.actions) && (
              <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-3">
                {/* The basis is what lets the action drop under the line on a
                    phone, instead of squeezing the sentence into a narrow column. */}
                {step.description && (
                  <Small className="min-w-0 flex-1 basis-72">{step.description}</Small>
                )}
                {step.actions && (
                  <div className="flex shrink-0 items-center gap-2">{step.actions}</div>
                )}
              </div>
            )}
            {step.content}
          </TabsPrimitive.Content>
        ))}
      </div>

      {/* Three columns rather than space-between, so the counter stays dead
          centre whichever button is on the right — 前往痛點發想 is twice as
          wide as 下一步. */}
      <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-3 border-t border-border px-5 py-3 sm:px-6">
        <Button
          variant="ghost"
          size="sm"
          className="justify-self-start"
          disabled={index === 0}
          onClick={() => go(steps[index - 1].id)}
        >
          <ArrowLeftIcon />
          上一步
        </Button>
        <Small className="text-xs tabular-nums">
          {index + 1} / {steps.length}
        </Small>
        {pending ? (
          <div className="justify-self-end">{pending}</div>
        ) : index === steps.length - 1 && finish ? (
          <div className="flex flex-wrap justify-end gap-2 justify-self-end">{finish}</div>
        ) : (
          // Kept in place but hidden on a last page with nothing to finish,
          // so the counter doesn't slide right when the button disappears.
          <Button
            variant="outline"
            size="sm"
            className={cn('justify-self-end', index === steps.length - 1 && 'invisible')}
            onClick={() => go(steps[index + 1].id)}
          >
            下一步
            <ArrowRightIcon />
          </Button>
        )}
      </div>
    </TabsPrimitive.Root>
  )
}
