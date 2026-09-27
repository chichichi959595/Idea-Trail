import { useEffect, useState, type ReactNode } from 'react'
import { CheckIcon, MenuIcon, XIcon } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Eyebrow, Mono } from '@/components/design/typography'
import { ThemeControl } from '@/components/design/theme'

/**
 * The app shell: a fixed rail of context on the left, one working surface on the
 * right.
 *
 * The old layout was a centred column with a row of tabs on top, which meant the
 * two things the user needed to keep an eye on — where they are in the flow, and
 * which model is about to spend their subscription quota — were either scrolled
 * away or buried in a footer line. Both now live permanently in the rail, and
 * the main pane is left to hold exactly one thing at a time.
 */

export interface NavStep {
  id: string
  label: string
  /** Shown right-aligned — a count, a short status. */
  hint?: string
  state: 'done' | 'current' | 'upcoming'
  disabled?: boolean
}

export function AppShell({
  steps,
  activeId,
  onNavigate,
  /** Rail footer: the model picker summary, the session's own facts. */
  aside,
  children,
}: {
  steps: NavStep[]
  activeId: string
  onNavigate: (id: string) => void
  aside?: ReactNode
  children: ReactNode
}) {
  // The rail is permanent from `lg` up and a slide-over below it. Kept in state
  // rather than CSS-only so selecting a step can close it on a phone.
  const [mobileOpen, setMobileOpen] = useState(false)

  useEffect(() => {
    if (!mobileOpen) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setMobileOpen(false)
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [mobileOpen])

  const rail = (
    <div className="flex h-full flex-col gap-6 overflow-y-auto px-4 py-5">
      <Brand />

      <nav aria-label="工作階段" className="flex flex-col gap-0.5">
        <Eyebrow className="px-2 pb-2">工作階段</Eyebrow>
        {steps.map((step) => (
          <NavItem
            key={step.id}
            step={step}
            active={step.id === activeId}
            onSelect={() => {
              onNavigate(step.id)
              setMobileOpen(false)
            }}
          />
        ))}
      </nav>

      {aside && <div className="flex flex-col gap-3">{aside}</div>}

      <div className="mt-auto flex flex-col gap-2 pt-4">
        <Eyebrow className="px-2">外觀</Eyebrow>
        <ThemeControl className="w-full justify-between" />
      </div>
    </div>
  )

  return (
    <div className="min-h-svh lg:grid lg:grid-cols-[17rem_minmax(0,1fr)]">
      {/* Phone/tablet: a bar that opens the rail as a slide-over. */}
      <header className="sticky top-0 z-30 flex items-center gap-3 border-b border-border bg-background/85 px-4 py-2.5 backdrop-blur-md lg:hidden">
        <Button
          variant="ghost"
          size="icon-sm"
          onClick={() => setMobileOpen(true)}
          aria-label="開啟工作階段選單"
        >
          <MenuIcon />
        </Button>
        <Brand compact />
      </header>

      <aside className="hidden border-r border-sidebar-border bg-sidebar lg:sticky lg:top-0 lg:block lg:h-svh">
        {rail}
      </aside>

      {mobileOpen && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <button
            type="button"
            aria-label="關閉選單"
            onClick={() => setMobileOpen(false)}
            className="absolute inset-0 bg-foreground/25 backdrop-blur-sm"
          />
          <div className="animate-in slide-in-from-left-4 fade-in absolute inset-y-0 left-0 flex w-[17rem] flex-col border-r border-sidebar-border bg-sidebar shadow-xl duration-200">
            <Button
              variant="ghost"
              size="icon-sm"
              onClick={() => setMobileOpen(false)}
              aria-label="關閉選單"
              className="absolute top-4 right-3"
            >
              <XIcon />
            </Button>
            {rail}
          </div>
        </div>
      )}

      <main className="min-w-0">{children}</main>
    </div>
  )
}

function Brand({ compact = false }: { compact?: boolean }) {
  return (
    <div className={cn('flex items-center gap-2.5', compact ? '' : 'px-2 pt-1')}>
      {/* A mark, not a logo: a 2×2 of squares where one is lit — the product's
          own "many candidates, one chosen" shape, at 28px. */}
      <span
        aria-hidden
        className="grid size-7 shrink-0 grid-cols-2 gap-[3px] rounded-lg border border-border bg-surface p-[5px] shadow-xs"
      >
        <span className="rounded-[1.5px] bg-muted-foreground/25" />
        <span className="rounded-[1.5px] bg-primary" />
        <span className="rounded-[1.5px] bg-muted-foreground/25" />
        <span className="rounded-[1.5px] bg-muted-foreground/25" />
      </span>
      <span className="flex min-w-0 flex-col leading-tight">
        <span className="truncate text-sm font-semibold tracking-tight">專案發想引導</span>
        <Mono className="truncate text-2xs text-muted-foreground">Ideation Workbench</Mono>
      </span>
    </div>
  )
}

function NavItem({
  step,
  active,
  onSelect,
}: {
  step: NavStep
  active: boolean
  onSelect: () => void
}) {
  return (
    <button
      type="button"
      disabled={step.disabled}
      onClick={onSelect}
      aria-current={active ? 'step' : undefined}
      className={cn(
        'group flex items-center gap-2.5 rounded-lg px-2 py-1.5 text-left text-sm transition-colors duration-150',
        'focus-visible:ring-[3px] focus-visible:ring-sidebar-ring focus-visible:outline-none',
        'disabled:cursor-not-allowed disabled:opacity-40',
        active
          ? 'bg-sidebar-accent font-medium text-foreground'
          : 'text-muted-foreground hover:bg-sidebar-accent/60 hover:text-foreground',
      )}
    >
      <StepMarker state={step.state} active={active} />
      <span className="min-w-0 flex-1 truncate">{step.label}</span>
      {step.hint && (
        <span
          data-numeric
          className={cn(
            'shrink-0 text-2xs',
            active ? 'text-muted-foreground' : 'text-muted-foreground/70',
          )}
        >
          {step.hint}
        </span>
      )}
    </button>
  )
}

/** Progress dot. Filled once a phase is behind the user, ringed while they are
 * in it, hollow before they get there — so the rail doubles as a progress
 * indicator without a separate bar. */
function StepMarker({ state, active }: { state: NavStep['state']; active: boolean }) {
  if (state === 'done') {
    return (
      <span
        aria-hidden
        className="flex size-[15px] shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground"
      >
        <CheckIcon className="size-2.5" strokeWidth={3.5} />
      </span>
    )
  }
  return (
    <span
      aria-hidden
      className={cn(
        'flex size-[15px] shrink-0 items-center justify-center rounded-full border-[1.5px]',
        state === 'current'
          ? 'border-primary'
          : active
            ? 'border-muted-foreground'
            : 'border-border-strong group-hover:border-muted-foreground',
      )}
    >
      {state === 'current' && <span className="size-[5px] rounded-full bg-primary" />}
    </span>
  )
}
