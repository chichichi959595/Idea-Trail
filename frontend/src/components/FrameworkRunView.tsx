import { useEffect, useState, type ReactNode } from 'react'
import {
  ArrowRightIcon,
  ArrowUpIcon,
  CircleCheckIcon,
  CircleHelpIcon,
  RotateCcwIcon,
  SendHorizonalIcon,
  SquareIcon,
  TimerIcon,
} from 'lucide-react'
import { useMethodCatalog } from '../useMethodCatalog'
import type { MethodRun, MethodStep } from '../types'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
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
import { Screen, ScreenHeader } from '@/components/design/section'
import { Eyebrow, Small } from '@/components/design/typography'
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
  /** Kills the provider call in flight. See `App.handleStopRun`. */
  onStop: () => void
  stopping: boolean
  onGoToIdeas: () => void
  /** Replaces the closing turn's body once the run is done. 痛點發想 uses it
   * to show the pain points it found instead of pointing at the idea wall. */
  finishedContent?: ReactNode
  /** Shown above the header — the pain point an ideation run is working on. */
  banner?: ReactNode
}

/**
 * The ideation run: a transcript of everything said so far, with the current
 * question and its input pinned at the bottom.
 *
 * The screen is a conversation, because that is what it always was — the model
 * asks, the user answers, the model reacts. prompt-kit's `Message` and
 * `PromptInput` carry that shape, and the per-step agent call renders as a
 * `Tool`, which is exactly what it is.
 *
 * Two things here are deliberately not chat-app defaults. The composer starts
 * in the middle of an empty pane and only drops to the bottom edge once the
 * first answer is sent, because on step one there is no transcript for it to be
 * the foot of — it *is* the screen. And the answer being worked on lives in
 * `pending` rather than in the box: it leaves the input the instant it is sent
 * (so the box is empty and ready), shows up in the transcript as the user's
 * turn, and comes back to the box intact if the call is stopped or the answer
 * is pushed back.
 */
export function FrameworkRunView({
  run,
  onAnswer,
  submitting,
  thinking,
  error,
  feedback,
  onRetryFinalize,
  onStop,
  stopping,
  onGoToIdeas,
  finishedContent,
  banner,
}: Props) {
  const { get, labelOf } = useMethodCatalog()
  // 痛點發想 runs on this same screen, but what it collects is pain points,
  // not idea fragments, and it ends in the pain point library.
  const discovery = get(run.method_name)?.stage === 'discovery'
  const yieldLabel = discovery ? '候選痛點' : '想法碎片'
  const outcomeLabel = discovery ? '痛點' : '候選想法'
  const currentStep = run.steps.find((s) => s.step_index === run.current_step_index)
  // Where the transcript ends.
  //
  // A finished run leaves `current_step_index` *on* its last step rather than
  // advancing past it — there is no next step to point at. So on anything but a
  // running run the final step is history too, and slicing at
  // `current_step_index` silently dropped the last question and its answer from
  // the screen the moment the run completed. (They were never lost: the idea
  // wall's history read them straight from the run, which is how this showed up
  // as "the transcript is missing one exchange the history still has".)
  const historyEnd = run.status === 'running' ? run.current_step_index : run.steps.length
  // Every step already answered *or* deliberately skipped. Filtering on
  // `user_answer !== null` used to silently drop timed-out steps from the
  // history, so a Crazy 8s run could show fewer rounds than it actually ran.
  const pastSteps = run.steps.filter((s) => s.step_index < historyEnd)
  const method = get(run.method_name)
  const tutorial = method?.tutorial
  // From the catalog, not from `run.steps`: the backend writes one MethodStep
  // row at a time, so `run.steps.length` is always `current_step_index + 1`
  // while a run is in flight. Using it as the denominator made the counter
  // read "1 / 1", then "2 / 2" — every step claiming to be the last one.
  // `step_count` is the real total.
  const totalSteps = method?.step_count ?? run.steps.length

  const running = run.status === 'running' && currentStep
  const finished = run.status === 'done'

  const [draft, setDraft] = useState('')
  const [pending, setPending] = useState<string | null>(null)
  // Sticky for the rest of the run: the composer moves down on the first send
  // and stays there. A rejected answer must not float it back to the middle.
  const [hasSent, setHasSent] = useState(false)

  const stepId = currentStep?.id
  // A genuinely new question starts with an empty box. (A *rejected* answer
  // keeps the same step id, so this doesn't fire on one.)
  useEffect(() => {
    setDraft('')
    setPending(null)
  }, [stepId])

  // A pushed-back or failed answer goes back into the box. The user is being
  // asked to revise it, not to type it out again from memory.
  useEffect(() => {
    if ((feedback || error) && pending !== null) {
      setDraft(pending)
      setPending(null)
    }
  }, [feedback, error, pending])

  function send(force = false) {
    if (!currentStep || submitting) return
    const value = draft.trim()
    // Empty is allowed only on the forced path, which is the timer running out
    // with nothing typed — the backend records that as an unanswered step
    // rather than putting an empty answer through the relevance check.
    if (!value && !force) return
    setPending(value || null)
    setDraft('')
    setHasSent(true)
    onAnswer(currentStep.step_index, value, force)
  }

  function stop() {
    // Hand the answer back before the stop even lands: the user pressed stop,
    // so what they want next is their own text, editable.
    if (pending !== null) {
      setDraft(pending)
      setPending(null)
    }
    onStop()
  }

  // Step one, nothing sent yet: the question and the box own the whole pane.
  const centered = Boolean(running) && !hasSent && pastSteps.length === 0

  const composer = running ? (
    // Keying on the step id resets the timer and the forced-cutoff
    // confirmation whenever the step actually advances.
    <AnswerForm
      key={currentStep.id}
      value={draft}
      onChange={setDraft}
      onSubmit={() => send()}
      onForceSubmit={() => send(true)}
      onStop={stop}
      submitting={submitting}
      stopping={stopping}
      error={error}
      feedback={feedback}
      timerSeconds={currentStep.timer_seconds}
    />
  ) : null

  const currentQuestion = running ? (
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

      {/* The answer that has left the input box. Without this the text would
          simply vanish for the ten to sixty seconds the model takes. */}
      {pending !== null && <Turn role="user">{pending}</Turn>}

      {submitting && (
        <div className="flex flex-col gap-3">
          <AiWorking
            label={stopping ? '正在停止這次呼叫' : 'AI 正在讀你的回答'}
            detail={stopping ? '收掉 CLI 那邊還在跑的呼叫' : `檢查是否切題並記下${yieldLabel}`}
          />
          <AiReasoning text={thinking} streaming />
        </div>
      )}
    </div>
  ) : null

  return (
    // A pane, not a page. The transcript scrolls; the method header stays at the
    // top and the input stays at the bottom, which is what keeps the question
    // being answered and the box answering it on screen together however long
    // the history gets.
    <Screen>
      {/* No provider/model badge and no "發想中" kicker here: the rail already
          carries both, permanently, and repeating them put two labels above the
          one thing this header is for — which method is being run, and how far
          through it we are. */}
      <ScreenHeader
        title={labelOf(run.method_name)}
        description={method?.description}
        actions={
          tutorial && (
            // A dialog, not a panel under the title: the header used to grow by
            // however long this method's explanation was, pushing the question
            // down mid-run. Radix closes it on a click anywhere outside.
            <Dialog>
              <DialogTrigger asChild>
                <Button variant="outline" size="sm" className="text-muted-foreground">
                  怎麼玩
                  <CircleHelpIcon aria-hidden />
                </Button>
              </DialogTrigger>
              {/* One fixed size for every method — the box shouldn't change
                  shape depending on which method's text is longer. Height is
                  capped by the viewport on a short screen, and the text
                  scrolls inside it rather than the box growing. */}
              <DialogContent className="flex h-[min(26rem,calc(100svh-4rem))] flex-col gap-0 p-0 sm:max-w-md">
                <DialogHeader className="shrink-0 border-b border-border px-6 pt-6 pb-4 text-left">
                  <Eyebrow>怎麼玩</Eyebrow>
                  <DialogTitle className="text-xl">{labelOf(run.method_name)}</DialogTitle>
                  <DialogDescription className="sr-only">
                    {labelOf(run.method_name)} 的玩法說明
                  </DialogDescription>
                </DialogHeader>
                <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-6 py-5 text-sm">
                  <p className="text-pretty">{tutorial.intro}</p>
                  <div className="flex flex-col gap-1.5">
                    <Eyebrow>步驟</Eyebrow>
                    <p className="text-pretty text-muted-foreground">{tutorial.how_to}</p>
                  </div>
                  {totalSteps > 1 && (
                    <Small data-numeric className="mt-auto text-xs">
                      共 {totalSteps} 步
                    </Small>
                  )}
                </div>
              </DialogContent>
            </Dialog>
          )
        }
        meta={
          totalSteps > 1 &&
          (finished ? (
            <Small data-numeric className="flex items-center gap-1.5 text-xs text-success">
              <CircleCheckIcon className="size-3.5" aria-hidden />
              {totalSteps} 步全部跑完
            </Small>
          ) : (
            <Small data-numeric className="text-xs">
              第 {Math.min(run.current_step_index + 1, totalSteps)} / {totalSteps} 步
            </Small>
          ))
        }
      >
        {banner}
      </ScreenHeader>

      {centered ? (
        // Nothing has been said yet, so there is no transcript for the box to
        // be the foot of. Question and box, centred vertically and starting
        // under the title, and that's the screen.
        <div className="flex min-h-0 flex-1 items-center overflow-y-auto px-5 py-8 sm:px-8">
          <div className="animate-in fade-in slide-in-from-bottom-2 mx-auto w-full max-w-6xl duration-300">
            <div className="mx-auto flex w-full max-w-4xl flex-col gap-6">
              {currentQuestion}
              {composer}
            </div>
          </div>
        </div>
      ) : (
        <>
          <ChatContainerRoot className="relative min-h-0 flex-1">
            {/* `justify-end` with `min-h-full`: the conversation grows up from
                the input rather than hanging from the top of a half-empty pane. */}
            <ChatContainerContent className="min-h-full justify-end px-5 py-8 sm:px-8">
              {/* The frame every screen shares, then the reading column inside
                  it — so the transcript starts under the title. */}
              <div className="mx-auto w-full max-w-6xl">
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
                              <span className="text-muted-foreground italic">
                                （時間到，這題沒有作答）
                              </span>
                            </Turn>
                          )}

                          {s.agent_output && <AgentStep step={s} yieldLabel={yieldLabel} />}
                        </li>
                      ))}
                    </ol>
                  )}

                  {currentQuestion}

                  {/* The run's own closing turn, not a banner bolted under the
                      conversation — with the way onward in the corner of the
                      message, where a reply's action belongs. */}
                  {finished && (
                    <Turn role="ai" label="彙整完成">
                      {finishedContent ?? (
                        <div className="flex flex-col gap-3">
                          <p>這個方法跑完了，彙整出的候選想法已經加進想法庫。</p>
                          <div className="flex justify-end">
                            <Button size="sm" onClick={onGoToIdeas}>
                              前往想法庫
                              <ArrowRightIcon />
                            </Button>
                          </div>
                        </div>
                      )}
                    </Turn>
                  )}

                  {/* All the answers survived — only the final convergence call
                      came back empty, so this replays just that one call. */}
                  {run.status === 'failed' && (
                    <div className="flex flex-col gap-4">
                      <Notice
                        tone="destructive"
                        title={`彙整失敗：AI 這次沒有整理出任何${outcomeLabel}`}
                        actions={
                          <>
                            <Button size="sm" onClick={onRetryFinalize} disabled={submitting}>
                              <RotateCcwIcon />
                              重新彙整
                            </Button>
                            {!discovery && (
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={onGoToIdeas}
                                disabled={submitting}
                              >
                                先去想法庫
                              </Button>
                            )}
                          </>
                        }
                      >
                        你上面的回答都還在，重新彙整只會再跑一次最後那一步，不用重新回答一遍。
                      </Notice>
                      {error && <ErrorState title="重新彙整時出錯" detail={error} />}
                      {submitting && (
                        <div className="flex flex-col gap-3">
                          <AiWorking
                            label={stopping ? '正在停止這次呼叫' : 'AI 正在重新彙整'}
                            detail={
                              stopping ? '收掉 CLI 那邊還在跑的呼叫' : `把整段對話整理成${outcomeLabel}`
                            }
                          />
                          <AiReasoning text={thinking} streaming />
                          <div className="flex justify-end">
                            <Button size="sm" variant="outline" onClick={onStop} disabled={stopping}>
                              <SquareIcon />
                              停止
                            </Button>
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
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

          {/* No rule above the composer. The line made the box read as a
              separate module bolted under the conversation, when answering *is*
              the conversation — the blur and the background are enough to keep
              scrolled text from running into it.
              The bottom padding matches `ScreenBody`'s (py-8 / sm:py-10) rather
              than a footer's py-4: once the conversation starts, the box is
              where the eye works, and parked flush against the window's bottom
              edge it read as dropped there — every other screen's content stops
              this far above the edge. */}
          {composer && (
            <div className="animate-in fade-in slide-in-from-bottom-2 shrink-0 bg-background/85 px-5 pt-4 pb-8 backdrop-blur-md duration-300 sm:px-8 sm:pb-10">
              <div className="mx-auto w-full max-w-6xl">
                <div className="mx-auto w-full max-w-4xl">{composer}</div>
              </div>
            </div>
          )}
        </>
      )}
    </Screen>
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
function AgentStep({ step, yieldLabel }: { step: MethodStep; yieldLabel: string }) {
  const output = step.agent_output
  if (!output) return null

  const fragments = output.idea_fragments ?? []

  return (
    <div className="flex flex-col gap-2">
      {output.analysis && (
        <Turn role="ai" markdown>
          {output.analysis}
        </Turn>
      )}

      {fragments.length > 0 && (
        <div className="flex flex-col gap-2 rounded-xl border border-ai-border bg-ai-muted/40 p-3.5">
          <Eyebrow className="text-ai">從這一步撈到的{yieldLabel}</Eyebrow>
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

/**
 * The composer.
 *
 * Controlled from above, because the text has a life outside this box: it
 * leaves on send, reappears in the transcript, and comes back here if the call
 * is stopped or the answer rejected.
 */
function AnswerForm({
  value,
  onChange,
  onSubmit,
  onForceSubmit,
  onStop,
  submitting,
  stopping,
  error,
  feedback,
  timerSeconds,
}: {
  value: string
  onChange: (value: string) => void
  onSubmit: () => void
  onForceSubmit: () => void
  onStop: () => void
  submitting: boolean
  stopping: boolean
  error: string | null
  feedback: string | null
  timerSeconds: number | null
}) {
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

  const canSend = Boolean(value.trim()) && !timeUp && !submitting

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

      {/* prompt-kit's PromptInput: autosizing textarea with its actions row
          inside the same rounded well as the text, so the primary action lives
          where the user's hands already are.
          `submitOn="shift-enter"` because these answers are lists and
          paragraphs, not chat lines — Enter is worth more as a newline here
          than as a send. */}
      <PromptInput
        value={value}
        onValueChange={onChange}
        onSubmit={onSubmit}
        submitOn="shift-enter"
        isLoading={submitting}
        // Only the timer greys the whole well out. While a call is in flight
        // the box dims but the stop button inside it must not — a stop that
        // looks disabled is a stop nobody presses.
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
          disabled={timeUp || submitting}
          className="bg-transparent px-2 py-1.5 text-base text-foreground shadow-none placeholder:text-muted-foreground dark:bg-transparent"
        />
        <PromptInputActions className="justify-between pt-1 pl-2">
          <span className="text-2xs text-muted-foreground">
            Shift + Enter 送出 · Enter 換行
          </span>
          <div className="flex items-center gap-1.5">
            {/* Only offered after the AI has actually pushed back — it's an
                escape hatch from a bad judgement call, not a general review
                bypass. */}
            {feedback && !submitting && (
              <PromptInputAction tooltip="跳過 AI 審核直接往下走">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={!canSend}
                  onClick={onForceSubmit}
                >
                  <SendHorizonalIcon />
                  強制送出
                </Button>
              </PromptInputAction>
            )}

            {submitting ? (
              // Send becomes stop while the call is in flight. It is a real
              // stop, not a hidden one: it kills the CLI the backend is waiting
              // on, and hands the answer back to this box.
              <PromptInputAction tooltip="停止這次呼叫，回答會還給你">
                <Button
                  type="button"
                  size="icon"
                  variant="outline"
                  className="rounded-full"
                  aria-label="停止"
                  disabled={stopping}
                  onClick={onStop}
                >
                  <SquareIcon className="fill-current" />
                </Button>
              </PromptInputAction>
            ) : (
              <PromptInputAction tooltip="送出這一題的回答（Shift + Enter）">
                <Button
                  type="button"
                  size="icon"
                  className="rounded-full"
                  aria-label="送出"
                  disabled={!canSend}
                  onClick={onSubmit}
                >
                  <ArrowUpIcon />
                </Button>
              </PromptInputAction>
            )}
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
              <Button size="sm" disabled={!readyChecked || submitting} onClick={onForceSubmit}>
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
