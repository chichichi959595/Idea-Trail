import type { ReactNode } from 'react'
import { BrainIcon, SparklesIcon, UserIcon } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Markdown } from '@/components/ui/markdown'
import { Loader } from '@/components/ui/loader'
import { TextShimmer } from '@/components/ui/text-shimmer'
import { Reasoning, ReasoningContent, ReasoningTrigger } from '@/components/ui/reasoning'
import { Message } from '@/components/ui/message'
import { Eyebrow } from './typography'

/**
 * The AI layer of the design system, composed from prompt-kit.
 *
 * Every action in this app is a local subprocess call that takes 5–20 seconds,
 * and the backend has always been able to stream its reasoning
 * (`backend/app/api/sse.py`). So "the model is working" is not an edge case
 * here — it is the app's most-seen state, and it gets real components rather
 * than one pulsing square.
 *
 * The `ai` token family (distinct from `brand`) is what marks these surfaces,
 * so model output is never confused with the user's own input or with a
 * primary action.
 */

/** Type styles for LLM-authored markdown. Set explicitly rather than via
 * @tailwindcss/typography, whose scale would override this system's own. */
export const proseClass = cn(
  'text-base text-foreground/85',
  '[&>*+*]:mt-3 [&>*:first-child]:mt-0 [&>*:last-child]:mb-0',
  '[&_p]:leading-relaxed [&_p]:text-pretty',
  '[&_strong]:font-semibold [&_strong]:text-foreground',
  '[&_em]:italic',
  '[&_a]:font-medium [&_a]:text-primary [&_a]:underline [&_a]:decoration-primary/35 [&_a]:underline-offset-2 [&_a:hover]:decoration-primary',
  '[&_ul]:flex [&_ul]:list-disc [&_ul]:flex-col [&_ul]:gap-1.5 [&_ul]:pl-5',
  '[&_ol]:flex [&_ol]:list-decimal [&_ol]:flex-col [&_ol]:gap-1.5 [&_ol]:pl-5',
  '[&_li]:leading-relaxed [&_li]:marker:text-muted-foreground',
  '[&_h1]:text-lg [&_h1]:font-semibold [&_h2]:text-base [&_h2]:font-semibold [&_h3]:text-sm [&_h3]:font-semibold',
  '[&_blockquote]:border-l-2 [&_blockquote]:border-border-strong [&_blockquote]:pl-3 [&_blockquote]:text-muted-foreground',
  '[&_hr]:my-4 [&_hr]:border-border',
  // Tables come back from the model often enough (comparison grids) to be
  // worth styling, and they need their own scroll container at phone width.
  '[&_table]:block [&_table]:w-full [&_table]:overflow-x-auto [&_table]:text-sm',
  '[&_th]:border-b [&_th]:border-border [&_th]:px-2 [&_th]:py-1.5 [&_th]:text-left [&_th]:font-medium',
  '[&_td]:border-b [&_td]:border-border [&_td]:px-2 [&_td]:py-1.5',
)

/** LLM-authored text. Everything the model writes goes through here, so
 * markdown the model emits renders as markdown instead of as literal `**`. */
export function AiMarkdown({ children, className }: { children: string; className?: string }) {
  return <Markdown className={cn(proseClass, className)}>{children}</Markdown>
}

/**
 * The "model is working" line. Shimmering label plus a dot loader, on the `ai`
 * colour. `detail` carries the one-line "what is it doing", since these waits
 * are long enough that the user deserves to know which call they are waiting on.
 */
export function AiWorking({
  label = 'AI 正在思考',
  detail,
  className,
}: {
  label?: string
  detail?: ReactNode
  className?: string
}) {
  return (
    <div role="status" aria-live="polite" className={cn('flex items-center gap-2.5', className)}>
      <Loader variant="pulse-dot" size="sm" className="text-ai" />
      <div className="flex min-w-0 flex-col">
        <TextShimmer className="text-sm font-medium" duration={2.4}>
          {label}
        </TextShimmer>
        {detail && <span className="truncate text-xs text-muted-foreground">{detail}</span>}
      </div>
    </div>
  )
}

/**
 * Live reasoning, streamed. Auto-opens while the tokens arrive and collapses
 * once they stop — which is prompt-kit's `isStreaming` behaviour, and the right
 * default: the reasoning is worth watching as it lands and worth tucking away
 * once the answer is there.
 */
export function AiReasoning({
  text,
  streaming = false,
  label,
  className,
}: {
  text: string
  streaming?: boolean
  label?: string
  className?: string
}) {
  if (!text.trim()) return null
  const heading = label ?? (streaming ? 'AI 正在推理…' : 'AI 的推理過程')
  return (
    <Reasoning
      isStreaming={streaming}
      className={cn('rounded-xl border border-ai-border bg-ai-muted/50 px-3.5 py-2.5', className)}
    >
      <ReasoningTrigger className="w-full text-sm font-medium text-ai">
        <span className="flex items-center gap-2">
          <BrainIcon className="size-3.5" aria-hidden />
          {streaming ? <TextShimmer duration={2.4}>{heading}</TextShimmer> : heading}
        </span>
      </ReasoningTrigger>
      <ReasoningContent
        markdown
        className="mt-2"
        contentClassName={cn(proseClass, 'text-sm text-muted-foreground')}
      >
        {text}
      </ReasoningContent>
    </Reasoning>
  )
}

/** Small round avatar for a conversation turn. Two roles only: the user, and
 * the model — the app has no third speaker. */
function TurnAvatar({ role }: { role: 'user' | 'ai' }) {
  const isAi = role === 'ai'
  return (
    <span
      aria-hidden
      className={cn(
        'mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-full border',
        isAi
          ? 'border-ai-border bg-ai-muted text-ai'
          : 'border-border bg-muted text-muted-foreground',
      )}
    >
      {isAi ? <SparklesIcon className="size-3.5" /> : <UserIcon className="size-3.5" />}
    </span>
  )
}

/**
 * One turn in the ideation transcript, on prompt-kit's `Message`.
 *
 * The user's answers get a filled bubble; the model's replies sit on the page
 * with no bubble at all. That asymmetry is the convention every current AI
 * product uses, and it earns its keep here: it makes a long run scannable as
 * "what I said" versus "what came back" without a single label.
 */
export function Turn({
  role,
  label,
  markdown = false,
  children,
  footer,
  className,
}: {
  role: 'user' | 'ai'
  /** Quiet caption above the bubble — a step name, a timestamp. */
  label?: ReactNode
  /** Render the body as markdown. On for model output, off for the user's. */
  markdown?: boolean
  children: ReactNode
  footer?: ReactNode
  className?: string
}) {
  const isAi = role === 'ai'
  return (
    <Message className={cn('items-start gap-3', className)}>
      <TurnAvatar role={role} />
      <div className="flex min-w-0 flex-1 flex-col gap-1.5">
        {label && <Eyebrow>{label}</Eyebrow>}
        {markdown ? (
          <AiMarkdown>{children as string}</AiMarkdown>
        ) : (
          // prompt-kit's `MessageContent` types its children as
          // `ReactNode & string` whether or not `markdown` is set, which no
          // single child satisfies — so the bubble is a plain div here. `Message`
          // still supplies the turn layout.
          <div
            className={cn(
              'text-base leading-relaxed whitespace-pre-wrap',
              isAi ? '' : 'rounded-xl bg-muted px-3.5 py-2.5 text-foreground',
            )}
          >
            {children}
          </div>
        )}
        {footer && <div className="flex flex-wrap items-center gap-2 pt-0.5">{footer}</div>}
      </div>
    </Message>
  )
}
