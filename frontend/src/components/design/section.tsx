import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import { cn } from '@/lib/utils'
import { Small, Title } from './typography'

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
        // Fills the viewport (minus the phone header), so a screen whose
        // content is shorter than the window still fills it.
        'min-h-[calc(100svh-3.5rem)] lg:min-h-svh',
        className,
      )}
      {...props}
    >
      {children}
    </div>
  )
}

/**
 * A screen that owns the viewport: a header that stays put, a body that
 * scrolls, and a footer that doesn't move.
 *
 * This replaces `Page` + `StickyFooter` on the screens that have a primary
 * action. A `sticky bottom-0` footer inside a window-scrolled page is only
 * *nearly* pinned: it stops sticking once its own position reaches the bottom,
 * so the last stretch of scrolling slides it up over the page's bottom padding.
 * Here the footer is simply outside the scroll container and cannot move at all.
 */

/**
 * Every screen sits in the same frame, so a title lands in the same spot
 * whichever screen it heads — the flow's four steps and the two libraries
 * alike. Inside the frame, an ordinary screen keeps to a narrower reading
 * column, left-aligned so it starts under the title; a `wide` screen (a
 * graph, a table) fills the frame.
 */
const FRAME = 'mx-auto w-full max-w-6xl'
const COLUMN = 'w-full max-w-4xl'

const ScreenContext = createContext<{
  overflowing: boolean
  report: (v: boolean) => void
  wide: boolean
}>({
  overflowing: false,
  report: () => {},
  wide: false,
})

export function Screen({
  className,
  children,
  wide = false,
  ...props
}: React.ComponentProps<'div'> & {
  /** Use the whole frame rather than the reading column. */
  wide?: boolean
}) {
  // Whether the body actually scrolls. The footer's hairline exists to stop
  // content disappearing *under* it — so when nothing scrolls there is nothing
  // for it to separate, and drawing it anyway just cuts the screen in two.
  const [overflowing, setOverflowing] = useState(false)
  const value = useMemo(
    () => ({ overflowing, report: setOverflowing, wide }),
    [overflowing, wide],
  )

  return (
    <ScreenContext.Provider value={value}>
      <div
        className={cn('flex h-[calc(100svh-3.5rem)] flex-col lg:h-svh', className)}
        {...props}
      >
        {children}
      </div>
    </ScreenContext.Provider>
  )
}

/**
 * The one title treatment, shared by every screen.
 *
 * The screens used to disagree about what a title was: the run had a 3xl method
 * name, the idea board a section heading two sizes down, and the setup screen
 * none at all. `children` render under the title row — a disclosure panel the
 * user opens.
 */
export function ScreenHeader({
  title,
  description,
  meta,
  actions,
  children,
  className,
}: {
  title: ReactNode
  description?: ReactNode
  /** Right-hand side of the title row: a count, a step counter. */
  meta?: ReactNode
  /** Controls belonging to the screen as a whole. */
  actions?: ReactNode
  /** Anything that opens *under* the title row — a disclosure panel. Nothing
   * belongs here that should affect the resting height. */
  children?: ReactNode
  className?: string
}) {
  const { wide } = useContext(ScreenContext)
  return (
    <div
      className={cn(
        'shrink-0 border-b border-border bg-background/85 px-5 py-4 backdrop-blur-md sm:px-8',
        className,
      )}
    >
      {/* The title starts at the column's edge on every screen; the frame
          here is a plain block (not a flex container), so the inner column
          centers with ordinary `mx-auto` + `max-width` instead of flex's
          cross-axis auto-margin rule, which would shrink it to fit its
          content instead of stretching it to the column width. */}
      <div className={FRAME}>
        <div className={cn('flex flex-col gap-3', !wide && 'mx-auto max-w-4xl')}>
          <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-2">
            <div className="flex min-w-0 flex-col gap-1">
              <Title className="text-2xl sm:text-3xl">{title}</Title>
              {/* One line, always. The headers are only the same height across
                  screens if the description can't become two. */}
              {description && <Small className="line-clamp-1 text-xs">{description}</Small>}
            </div>
            {/* Counts first, the action last: the screen's action button ends on
                the column's right edge, which is where the footer's primary
                button ends too. With the count after it, the header button sat
                60px short of the one below it. */}
            <div className="flex shrink-0 items-center gap-3">
              {meta}
              {actions}
            </div>
          </div>
          {children}
        </div>
      </div>
    </div>
  )
}

/** The scrolling part of a `Screen`. Carries the gutters and the column width.
 *
 * `fill` is for a screen whose content is one big surface (a graph, a table):
 * the body is sized to the viewport instead of to its content, so the page
 * itself stops scrolling and a `flex-1 min-h-0` child takes whatever height is
 * left and scrolls inside itself. The body still scrolls as a fallback when
 * the window is shorter than that child's minimum height. */
export function ScreenBody({
  className,
  children,
  fill = false,
  ...props
}: React.ComponentProps<'div'> & { fill?: boolean }) {
  const { report, wide } = useContext(ScreenContext)
  const scroller = useRef<HTMLDivElement>(null)
  const content = useRef<HTMLDivElement>(null)
  // Width of one of the two gutters the scroller reserves — 0 with overlay
  // scrollbars, half a classic scrollbar otherwise.
  const [gutter, setGutter] = useState(0)

  useEffect(() => {
    const el = scroller.current
    const inner = content.current
    if (!el || !inner) return
    const measure = () => {
      report(el.scrollHeight - el.clientHeight > 1)
      setGutter((el.offsetWidth - el.clientWidth) / 2)
    }
    measure()
    // Both: the viewport resizing, and the content growing inside it (a new
    // idea, an expanded rationale).
    const observer = new ResizeObserver(measure)
    observer.observe(el)
    observer.observe(inner)
    return () => observer.disconnect()
  }, [report])

  return (
    // `both-edges`, not plain `stable`. The header and footer live outside
    // this scroller and never lose width to a scrollbar; a gutter reserved on
    // the right only narrows this box on one side, so the centred column
    // below sat half a scrollbar (5–8px) left of the title above it whenever
    // the platform draws classic scrollbars. Reserving the same width on both
    // edges keeps the centre — and so the column's left edge — where the
    // header's is.
    <div
      ref={scroller}
      className="min-h-0 flex-1 overflow-y-auto [scrollbar-gutter:stable_both-edges]"
    >
      {/* The same box as the header's and the footer's: gutter padding
          outside, `FRAME` inside. With the padding inside the frame instead,
          the body's max width took the padding out of it and a wide window
          drew the table 32px in from the title on each side. The padding also
          gives back what the scroller's gutters took, so the edges line up
          with classic scrollbars too. */}
      <div
        ref={content}
        style={{ '--gutter': `${gutter}px` } as React.CSSProperties}
        className={cn(
          'px-[calc(1.25rem-var(--gutter))] py-8 sm:px-[calc(2rem-var(--gutter))] sm:py-10',
          fill && 'flex h-full flex-col',
        )}
      >
        <div className={cn(FRAME, fill && 'flex min-h-0 flex-1 flex-col')}>
          <div
            className={cn(
              'flex flex-col',
              !wide && cn(COLUMN, 'mx-auto'),
              fill && 'min-h-0 flex-1',
              className,
            )}
            {...props}
          >
            {children}
          </div>
        </div>
      </div>
    </div>
  )
}

/** Status on the left, the primary action on the right. Never scrolls; grows a
 * hairline only once there is scrolled content to separate itself from. */
export function ScreenFooter({ className, children, ...props }: React.ComponentProps<'div'>) {
  const { overflowing, wide } = useContext(ScreenContext)
  return (
    <div
      className={cn(
        'shrink-0 bg-background/85 px-5 py-4 backdrop-blur-md transition-colors duration-200 sm:px-8',
        overflowing ? 'border-t border-border' : 'border-t border-transparent',
        className,
      )}
      {...props}
    >
      <div className={FRAME}>
        <div
          className={cn(
            'flex flex-wrap items-center justify-between gap-x-6 gap-y-3',
            !wide && cn(COLUMN, 'mx-auto'),
          )}
        >
          {children}
        </div>
      </div>
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

/** Hairline that fades at both ends — see the `divider-fade` utility. Used
 * inside panels, where a full-bleed rule would cut the panel in two. */
export function Divider({ className }: { className?: string }) {
  return <div aria-hidden className={cn('divider-fade my-1', className)} />
}
