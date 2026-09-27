import { useEffect, useState } from 'react'
import {
  ArrowRightIcon,
  ArrowUpIcon,
  CircleHelpIcon,
  RotateCcwIcon,
  SendHorizonalIcon,
  TimerIcon,
} from 'lucide-react'
import { useMethodCatalog } from '../useMethodCatalog'
import type { MethodRun, MethodStep } from '../types'
import { cn } from '@/lib/utils'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible'
import {
  PromptInput,
  PromptInputAction,
  PromptInputActions,
  PromptInputTextarea,
} from '@/components/ui/prompt-input'
import { Tool } from '@/components/ui/tool'
import {
  ChatContainerContent,
  ChatContainerRoot,
  ChatContainerScrollAnchor,
} from '@/components/ui/chat-container'
import { ScrollButton } from '@/components/ui/scroll-button'
import { Section } from '@/components/design/section'
import { Eyebrow, Heading, Small } from '@/components/design/typography'
import { ErrorState, Notice } from '@/components/design/states'
import { AiReasoning, AiWorking, Turn } from '@/components/design/ai'

interface Props {
  run: MethodRun
  onAnswer: (stepIndex: number, answer: string, force?: boolean) => void
  submitting: boolean
  thinking: string
  error: string | null
  feedback: string | null
  onRetryFinalize: () => void
  onGoToIdeas: () => void
}

/**
 * The ideation run: a transcript of everything said so far, with the current
 * question and its input pinned at the bottom.
 *
 * This is the screen the redesign changes most. It used to be a bordered panel
 * of stacked `<li>`s with a bare textarea at the end; it is now a conversation,
 * because that is what it always was — the model asks, the user answers, the
 * model reacts. prompt-kit's `Message` and `PromptInput` carry that shape, and
 * the per-step agent call renders as a `Tool`, which is exactly what it is.
 */
export function FrameworkRunView({
  run,
  onAnswer,
  submitting,
  thinking,
  error,
  feedback,
  onRetryFinalize,
  onGoToIdeas,
}: Props) {
  const { get, labelOf } = useMethodCatalog()
  // Every step already answered *or* deliberately skipped. Filtering on
  // `user_answer !== null` used to silently drop timed-out steps from the
  // history, so a Crazy 8s run could show fewer rounds than it actually ran.
  const pastSteps = run.steps.filter((s) => s.step_index < run.current_step_index)
  const currentStep = run.steps.find((s) => s.step_index === run.current_step_index)
  const method = get(run.method_name)
  const tutorial = method?.tutorial
  // From the catalog, not from `run.steps`: the backend writes one MethodStep
  // row at a time, so `run.steps.length` is always `current_step_index + 1`
  // while a run is in flight. Using it as the denominator made the counter
  // read "1 / 1", then "2 / 2" — every step claiming to be the last one, and
  // the progress bar permanently full. `step_count` is the real total.
  const totalSteps = method?.step_count ?? run.steps.length

  const running = run.status === 'running' && currentStep

  return (
    // A pane, not a page. The transcript scrolls; the method header stays at the
    // top and the input stays at the bottom, which is what keeps the question
    // being answered and the box answering it on screen together however long
    // the history gets.
    <div className="flex h-[calc(100svh-3.5rem)] flex-col lg:h-svh">
      <div className="shrink-0 border-b border-border bg-background/85 px-5 py-4 backdrop-blur-md sm:px-8">
        <Section className="mx-auto w-full max-w-4xl gap-3">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
            <Eyebrow>發想中</Eyebrow>
            <Badge variant="soft">
              {run.model ? `${run.provider} / ${run.model}` : run.provider}
            </Badge>
          </div>
          <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-2">
            <Heading className="text-2xl sm:text-3xl">{labelOf(run.method_name)}</Heading>
            {totalSteps > 1 && (
              <Small data-numeric className="text-xs">
                第 {Math.min(run.current_step_index + 1, totalSteps)} / {totalSteps} 步
              </Small>
            )}
          </div>

          {/* Progress as a segmented bar rather than a number: at a glance it
              answers "how much of this is left", which is the question a
              time-boxed method raises on every step. */}
          {totalSteps > 1 && (
            <div className="flex gap-1" aria-hidden>
              {/* Indexed off the catalog total, so the unreached steps are
                  drawn as empty track from the first step onward. */}
              {Array.from({ length: totalSteps }, (_, i) => (
                <span
                  key={i}
                  className={cn(
                    'h-1 flex-1 rounded-full transition-colors duration-300',
                    i < run.current_step_index
                      ? 'bg-primary'
                      : i === run.current_step_index
                        ? 'bg-primary/40'
                        : 'bg-border',
                  )}
                />
              ))}
            </div>
          )}

          {tutorial && (
            <Collapsible>
              <CollapsibleTrigger className="group flex items-center gap-1.5 rounded-md text-xs font-medium text-muted-foreground transition-colors hover:text-foreground focus-visible:ring-[3px] focus-visible:ring-ring focus-visible:outline-none">
                <CircleHelpIcon className="size-3.5" aria-hidden />
                這個方法是什麼？怎麼玩？
              </CollapsibleTrigger>
              <CollapsibleContent className="data-[state=closed]:animate-collapsible-up data-[state=open]:animate-collapsible-down overflow-hidden">
                <div className="mt-2.5 flex flex-col gap-2 rounded-xl border border-border bg-muted/60 p-3.5">
                  <Small className="text-foreground/80">{tutorial.intro}</Small>
                  <Small>
                    <span className="font-medium text-foreground">怎麼玩：</span>
                    {tutorial.how_to}
                  </Small>
                </div>
              </CollapsibleContent>
            </Collapsible>
          )}
        </Section>
      </div>

      <ChatContainerRoot className="relative min-h-0 flex-1">
        {/* `justify-end` with `min-h-full`: the conversation grows up from the
            input rather than hanging from the top of an otherwise empty pane,
            which is what the first step of a run would otherwise look like. */}
        <ChatContainerContent className="min-h-full justify-end px-5 py-8 sm:px-8">
        <div className="mx-auto flex w-full max-w-4xl flex-col gap-8">
        {pastSteps.length > 0 && (
          <ol className="flex flex-col gap-7">
            {pastSteps.map((s) => (
              <li key={s.id} className="flex flex-col gap-3">
                <Turn role="ai" label={s.step_name}>
                  {s.question_shown}
                </Turn>

                {s.user_answer ? (
                  <Turn role="user">{s.user_answer}</Turn>
                ) : (
                  <Turn role="user">
                    <span className="text-muted-foreground italic">（時間到，這題沒有作答）</span>
                  </Turn>
                )}

                {s.agent_output && <AgentStep step={s} />}
              </li>
            ))}
          </ol>
        )}

        {running && (
          <div className="flex flex-col gap-3">
            <Turn
              role="ai"
              label={currentStep.step_name}
              footer={
                currentStep.timer_seconds !== null && (
                  <LiveCountdown seconds={currentStep.timer_seconds} />
                )
              }
            >
              <span className="text-lg font-medium text-foreground sm:text-xl">
                {currentStep.question_shown}
              </span>
            </Turn>

            {submitting && (
              <div className="flex flex-col gap-3 pl-10">
                <AiWorking label="AI 正在讀你的回答" detail="檢查是否切題並記下想法碎片" />
                <AiReasoning text={thinking} streaming />
              </div>
            )}
          </div>
        )}

        {run.status === 'done' && (
          <Notice
            tone="success"
            title="這個方法跑完了"
            actions={
              <Button size="sm" onClick={onGoToIdeas}>
                前往想法牆
                <ArrowRightIcon />
              </Button>
            }
          >
            收斂出的候選想法已經加進想法牆。
          </Notice>
        )}

        {/* All the answers survived — only the final convergence call came back
            empty, so this replays just that one call. */}
        {run.status === 'failed' && (
          <div className="flex flex-col gap-4">
            <Notice
              tone="destructive"
              title="收斂失敗：AI 這次沒有產出任何候選想法"
              actions={
                <>
                  <Button size="sm" onClick={onRetryFinalize} disabled={submitting}>
                    <RotateCcwIcon />
                    重新收斂
                  </Button>
                  <Button size="sm" variant="outline" onClick={onGoToIdeas} disabled={submitting}>
                    先去想法牆
                  </Button>
                </>
              }
            >
              你上面的回答都還在，重新收斂只會再跑一次最後那一步，不用重新回答一遍。
            </Notice>
            {error && <ErrorState title="重新收斂時出錯" detail={error} />}
            {submitting && (
              <div className="flex flex-col gap-3">
                <AiWorking label="AI 正在重新收斂" detail="把整段對話整理成候選想法" />
                <AiReasoning text={thinking} streaming />
              </div>
            )}
          </div>
        )}

        </div>
          <ChatContainerScrollAnchor />
        </ChatContainerContent>

        {/* Appears only once the user has scrolled up off the latest turn —
            `ScrollButton` reads that from the container's own context. */}
        <div className="pointer-events-none absolute inset-x-0 bottom-4 flex justify-center">
          <div className="pointer-events-auto">
            <ScrollButton className="shadow-md" />
          </div>
        </div>
      </ChatContainerRoot>

      {running && (
        // Keying on the step id remounts the form (and resets its draft text)
        // whenever the step actually advances — a rejected answer keeps the
        // same step id, so the draft is preserved for the user to revise.
        <div className="shrink-0 border-t border-border bg-background/85 px-5 py-4 backdrop-blur-md sm:px-8">
          <div className="mx-auto w-full max-w-4xl">
            <AnswerForm
              key={currentStep.id}
              step={currentStep}
              onAnswer={onAnswer}
              submitting={submitting}
              error={error}
              feedback={feedback}
              timerSeconds={currentStep.timer_seconds}
            />
          </div>
        </div>
      )}
    </div>
  )
}

/**
 * What the per-step agent did with an answer, as a collapsed tool call.
 *
 * The mapping is literal rather than decorative: the agent takes the user's
 * answer as input and returns `{analysis, idea_fragments}` as output, which is
 * the shape prompt-kit's `Tool` already renders — so the app's own agent state
 * looks like agent state, not like another quote block.
 */
function AgentStep({ step }: { step: MethodStep }) {
  const output = step.agent_output
  if (!output) return null

  const fragments = output.idea_fragments ?? []

  return (
    <div className="flex flex-col gap-2 pl-10">
      {output.analysis && (
        <Turn role="ai" markdown>
          {output.analysis}
        </Turn>
      )}

      {fragments.length > 0 && (
        <div className="flex flex-col gap-2 rounded-xl border border-ai-border bg-ai-muted/40 p-3.5">
          <Eyebrow className="text-ai">從這一步撈到的想法碎片</Eyebrow>
          <ul className="flex flex-col gap-1.5">
            {fragments.map((f, i) => (
              <li key={i} className="flex gap-2 text-sm leading-relaxed">
                <span aria-hidden className="mt-2 size-1 shrink-0 rounded-full bg-ai" />
                <span className="text-foreground/85">{f}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* The raw agent payload, for when the summary above isn't enough. */}
      <Tool
        className="text-xs"
        toolPart={{
          type: `step-agent · ${step.step_name}`,
          state: 'output-available',
          input: { answer: step.user_answer ?? '(未作答)' },
          output: output as Record<string, unknown>,
        }}
      />
    </div>
  )
}

function AnswerForm({
  step,
  onAnswer,
  submitting,
  error,
  feedback,
  timerSeconds,
}: {
  step: MethodStep
  onAnswer: (stepIndex: number, answer: string, force?: boolean) => void
  submitting: boolean
  error: string | null
  feedback: string | null
  timerSeconds: number | null
}) {
  const [answer, setAnswer] = useState('')
  const [shake, setShake] = useState(false)
  const [awaitingConfirm, setAwaitingConfirm] = useState(false)
  const [readyChecked, setReadyChecked] = useState(false)
  const remaining = useCountdown(timerSeconds)
  const timeUp = timerSeconds !== null && remaining === 0

  // The instant the countdown hits 0, lock the input — but don't advance yet.
  // Flash the box red first, then hold on a "ready for the next question?"
  // confirmation so the forced cutoff doesn't yank the user into the next
  // step mid-thought. The actual (forced) answer is sent once they confirm.
  useEffect(() => {
    if (!timeUp) return
    setShake(true)
    const timeout = setTimeout(() => {
      setShake(false)
      setAwaitingConfirm(true)
    }, 500)
    return () => clearTimeout(timeout)
  }, [timeUp])

  const submit = () => {
    if (!answer.trim() || timeUp || submitting) return
    onAnswer(step.step_index, answer.trim())
  }

  return (
    <div className="flex flex-col gap-3">
      {feedback && (
        <Notice tone="warning" title="AI 覺得這個回答文不對題">
          <p>{feedback}</p>
          <p className="text-xs text-muted-foreground">
            如果你覺得這個回答沒問題，可以按「強制送出」跳過 AI 審核直接往下走。
          </p>
        </Notice>
      )}

      {/* prompt-kit's PromptInput: autosizing textarea, Enter to submit,
          Shift+Enter for a newline, and its actions row inside the same
          rounded well as the text — so the primary action lives where the
          user's hands already are. */}
      <PromptInput
        value={answer}
        onValueChange={setAnswer}
        onSubmit={submit}
        isLoading={submitting}
        disabled={timeUp}
        maxHeight={320}
        className={cn(
          'rounded-2xl border-input bg-surface p-2 shadow-sm transition-[border-color,box-shadow] duration-150',
          'focus-within:border-primary/45 focus-within:ring-[3px] focus-within:ring-ring',
          shake && 'animate-shake border-destructive ring-[3px] ring-destructive/25',
        )}
      >
        <PromptInputTextarea
          placeholder="輸入你的回答…"
          autoFocus
          className="bg-transparent px-2 py-1.5 text-base text-foreground shadow-none placeholder:text-muted-foreground dark:bg-transparent"
        />
        <PromptInputActions className="justify-between pt-1 pl-2">
          <span className="text-2xs text-muted-foreground">
            Enter 送出 · Shift + Enter 換行
          </span>
          <div className="flex items-center gap-1.5">
            {/* Only offered after the AI has actually pushed back — it's an
                escape hatch from a bad judgement call, not a general review
                bypass. */}
            {feedback && (
              <PromptInputAction tooltip="跳過 AI 審核直接往下走">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={timeUp || submitting || !answer.trim()}
                  onClick={() => onAnswer(step.step_index, answer.trim(), true)}
                >
                  <SendHorizonalIcon />
                  強制送出
                </Button>
              </PromptInputAction>
            )}
            <PromptInputAction tooltip="送出這一題的回答">
              <Button
                type="button"
                size="icon"
                className="rounded-xl"
                aria-label="送出"
                disabled={timeUp || submitting || !answer.trim()}
                onClick={submit}
              >
                <ArrowUpIcon />
              </Button>
            </PromptInputAction>
          </div>
        </PromptInputActions>
      </PromptInput>

      {awaitingConfirm && (
        <Notice
          tone="warning"
          icon={TimerIcon}
          title="時間到，這題已被強制送出"
          actions={
            <>
              <label className="flex cursor-pointer items-center gap-2 text-sm text-foreground/75">
                <Checkbox
                  checked={readyChecked}
                  onCheckedChange={(v) => setReadyChecked(v === true)}
                />
                你準備好下一題了嗎？
              </label>
              <Button
                size="sm"
                disabled={!readyChecked || submitting}
                onClick={() => onAnswer(step.step_index, answer.trim(), true)}
              >
                下一題
                <ArrowRightIcon />
              </Button>
            </>
          }
        />
      )}

      {error && <ErrorState title="送出回答時出錯" detail={error} />}
    </div>
  )
}

/**
 * The step timer, attached to the question it belongs to.
 *
 * Runs its own countdown rather than taking one as a prop: `AnswerForm` needs
 * the same clock to drive the forced cutoff, and two independent `setInterval`s
 * started in the same render stay within a frame of each other — close enough
 * that they never disagree on screen, and far simpler than threading the value
 * back up through the transcript.
 */
function LiveCountdown({ seconds }: { seconds: number }) {
  const remaining = useCountdown(seconds)
  return <Countdown remaining={remaining} timeUp={remaining === 0} />
}

/** The pill itself. Colour escalates as the clock runs down, because the
 * methods this belongs to (Crazy 8s, the 20 squares) are time-boxed on purpose
 * — the pressure is the point, so it should register peripherally. */
function Countdown({ remaining, timeUp }: { remaining: number; timeUp: boolean }) {
  return (
    <span
      aria-live="polite"
      data-numeric
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium',
        timeUp
          ? 'border-destructive-border bg-destructive-muted text-destructive'
          : remaining <= 10
            ? 'border-warning-border bg-warning-muted text-warning'
            : 'border-border bg-muted text-muted-foreground',
      )}
    >
      <TimerIcon className="size-3.5" aria-hidden />
      {timeUp ? '時間到' : `${remaining} 秒`}
    </span>
  )
}

// Resets to `seconds` whenever it changes, then ticks down to 0 and stops.
function useCountdown(seconds: number | null): number {
  const [remaining, setRemaining] = useState(seconds ?? 0)

  useEffect(() => {
    if (seconds === null) return
    setRemaining(seconds)
    const id = setInterval(() => {
      setRemaining((r) => {
        // Stop the timer at 0 instead of letting it tick forever against a
        // value React would just bail out of re-rendering anyway.
        if (r <= 1) clearInterval(id)
        return r > 0 ? r - 1 : 0
      })
    }, 1000)
    return () => clearInterval(id)
  }, [seconds])

  return remaining
}
