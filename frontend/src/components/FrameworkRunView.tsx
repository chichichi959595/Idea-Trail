import { useEffect, useState } from 'react'
import { getStepTimerSeconds, METHOD_LABELS, METHOD_TUTORIALS, type MethodRun, type MethodStep } from '../types'
import { Body, Button, Headline, Meta, Panel, SectionLabel, Support, Tag, textareaClass, ThinkingIndicator } from './ui'

interface Props {
  run: MethodRun
  onAnswer: (stepIndex: number, answer: string, force?: boolean) => void
  submitting: boolean
  error: string | null
  feedback: string | null
  onGoToIdeas: () => void
}

export function FrameworkRunView({ run, onAnswer, submitting, error, feedback, onGoToIdeas }: Props) {
  const pastSteps = run.steps.filter((s) => s.user_answer !== null)
  const currentStep = run.steps.find((s) => s.step_index === run.current_step_index)
  const tutorial = METHOD_TUTORIALS[run.method_name]

  return (
    <Panel className="mt-8">
      <SectionLabel number="03">Ideation</SectionLabel>
      <div className="mb-8">
        <div className="flex flex-wrap items-center gap-3">
          <Headline>{METHOD_LABELS[run.method_name] ?? run.method_name} 發想中</Headline>
          <Tag>{run.model ? `${run.provider} / ${run.model}` : run.provider}</Tag>
        </div>
        {tutorial && (
          <details className="mt-3">
            <summary className="inline-flex cursor-pointer items-center gap-1.5 text-xs font-bold uppercase tracking-widest text-foreground/50 hover:text-foreground/80">
              <span
                aria-hidden
                className="border-foreground/50 flex h-4 w-4 items-center justify-center rounded-full border text-[10px] leading-none"
              >
                ?
              </span>
              這個方法是什麼？怎麼玩？
            </summary>
            <div className="border-foreground/20 mt-3 border-l-2 pl-4">
              <Support className="text-foreground/80">{tutorial.intro}</Support>
              <Support className="mt-2 text-foreground/70">
                <span className="text-foreground font-bold">怎麼玩：</span>
                {tutorial.howTo}
              </Support>
            </div>
          </details>
        )}
      </div>

      {pastSteps.length > 0 && (
        <ol className="mb-10 flex flex-col gap-8">
          {pastSteps.map((s) => (
            <li key={s.id} className="border-foreground/20 border-l-2 pl-5">
              <Meta className="mb-1 block">{s.step_name}</Meta>
              <Support className="mb-2 text-foreground/70">{s.question_shown}</Support>
              <Body className="mb-3">你：{s.user_answer}</Body>
              {s.agent_output && (
                <div className="swiss-dots bg-muted border-foreground/10 border-l-2 p-4">
                  {s.agent_output.analysis && (
                    <Support className="mb-3 text-foreground/80">{s.agent_output.analysis}</Support>
                  )}
                  {!!s.agent_output.idea_fragments?.length && (
                    <ul className="flex flex-col gap-2">
                      {s.agent_output.idea_fragments.map((f, i) => (
                        <li key={i} className="text-accent flex gap-2 text-sm font-medium">
                          <span aria-hidden>—</span>
                          <span className="text-foreground">{f}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              )}
            </li>
          ))}
        </ol>
      )}

      {run.status === 'running' && currentStep && (
        // Keying on the step id remounts the form (and resets its draft text)
        // whenever the step actually advances — a rejected answer keeps the
        // same step id, so the draft is preserved for the user to revise.
        <AnswerForm
          key={currentStep.id}
          step={currentStep}
          onAnswer={onAnswer}
          submitting={submitting}
          error={error}
          feedback={feedback}
          timerSeconds={getStepTimerSeconds(run.method_name, currentStep.step_name)}
        />
      )}

      {run.status === 'done' && (
        <div className="border-foreground border-t-4 pt-8">
          <Body className="mb-5">這個方法已經跑完了，收斂出的候選想法已經加進想法牆。</Body>
          <Button onClick={onGoToIdeas}>前往想法牆</Button>
        </div>
      )}
    </Panel>
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

  return (
    <form
      className="border-foreground border-t-4 pt-8"
      onSubmit={(e) => {
        e.preventDefault()
        if (!answer.trim()) return
        onAnswer(step.step_index, answer.trim())
      }}
    >
      <Meta className="mb-2 block">{step.step_name}</Meta>
      <div className="mb-5">
        <Headline>{step.question_shown}</Headline>
        {timerSeconds !== null && (
          <span
            aria-live="polite"
            className={`mt-3 inline-flex shrink-0 items-center gap-1.5 border-2 px-3 py-1 text-sm font-bold tabular-nums ${
              timeUp ? 'border-accent text-accent' : 'border-foreground/30 text-foreground/70'
            }`}
          >
            <span aria-hidden>⏱</span>
            {timeUp ? '時間到！' : `${remaining} 秒`}
          </span>
        )}
      </div>

      {feedback && (
        <div className="border-accent bg-accent/5 text-foreground mb-4 border-2 px-4 py-3">
          <p className="text-sm font-medium">
            <span className="text-accent mr-1 font-bold">AI 覺得這個回答文不對題：</span>
            {feedback}
          </p>
          <p className="text-foreground/60 mt-2 text-xs">
            如果你覺得這個回答沒問題，可以按「強制送出」跳過 AI 審核直接往下走。
          </p>
        </div>
      )}

      <textarea
        className={`${textareaClass} min-h-28 resize-y text-lg ${
          shake ? 'animate-shake-red border-accent text-accent' : ''
        }`}
        value={answer}
        onChange={(e) => setAnswer(e.target.value)}
        placeholder="輸入你的回答…"
        autoFocus
        disabled={timeUp}
      />

      {awaitingConfirm && (
        <div className="border-accent bg-accent/5 mt-4 flex items-stretch gap-4 border-2 p-3">
          <div className="flex flex-1 flex-col justify-center gap-1.5">
            <p className="text-base font-bold">時間到，這題已被強制送出。</p>
            <label className="flex cursor-pointer items-center gap-2 text-xs font-medium text-foreground/70">
              <input
                type="checkbox"
                className="border-foreground h-3.5 w-3.5 shrink-0 accent-accent"
                checked={readyChecked}
                onChange={(e) => setReadyChecked(e.target.checked)}
              />
              你準備好下一題了嗎？
            </label>
          </div>
          <Button
            type="button"
            className="shrink-0"
            disabled={!readyChecked || submitting}
            onClick={() => onAnswer(step.step_index, answer.trim(), true)}
          >
            下一題
          </Button>
        </div>
      )}

      {error && (
        <p className="border-accent bg-accent/5 text-accent mt-4 border-2 px-4 py-3 text-sm font-bold">
          {error}
        </p>
      )}
      <div className="mt-5 flex flex-wrap items-center gap-4">
        <Button type="submit" disabled={timeUp || submitting || !answer.trim()} className="w-full sm:w-auto">
          送出
        </Button>
        {/* Only offered after the AI has actually pushed back — it's an escape
            hatch from a bad judgement call, not a general review bypass. */}
        {feedback && (
          <Button
            type="button"
            variant="secondary"
            disabled={timeUp || submitting || !answer.trim()}
            onClick={() => onAnswer(step.step_index, answer.trim(), true)}
            className="w-full sm:w-auto"
          >
            強制送出
          </Button>
        )}
        {submitting && <ThinkingIndicator />}
      </div>
    </form>
  )
}

// Resets to `seconds` whenever it changes, then ticks down to 0 and stops.
function useCountdown(seconds: number | null): number {
  const [remaining, setRemaining] = useState(seconds ?? 0)

  useEffect(() => {
    if (seconds === null) return
    setRemaining(seconds)
    const id = setInterval(() => {
      setRemaining((r) => (r > 0 ? r - 1 : 0))
    }, 1000)
    return () => clearInterval(id)
  }, [seconds])

  return remaining
}
