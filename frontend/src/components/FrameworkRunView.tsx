import { useState } from 'react'
import { METHOD_LABELS, type MethodRun, type MethodStep } from '../types'
import { Body, Button, Headline, Meta, Panel, SectionLabel, Support, Tag, textareaClass, ThinkingIndicator } from './ui'

interface Props {
  run: MethodRun
  onAnswer: (stepIndex: number, answer: string) => void
  submitting: boolean
  error: string | null
  feedback: string | null
  onGoToIdeas: () => void
}

export function FrameworkRunView({ run, onAnswer, submitting, error, feedback, onGoToIdeas }: Props) {
  const pastSteps = run.steps.filter((s) => s.user_answer !== null)
  const currentStep = run.steps.find((s) => s.step_index === run.current_step_index)

  return (
    <Panel className="mt-8">
      <SectionLabel number="03">Ideation</SectionLabel>
      <div className="mb-8 flex flex-wrap items-center gap-3">
        <Headline>{METHOD_LABELS[run.method_name] ?? run.method_name} 發想中</Headline>
        <Tag>{run.provider}</Tag>
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
}: {
  step: MethodStep
  onAnswer: (stepIndex: number, answer: string) => void
  submitting: boolean
  error: string | null
  feedback: string | null
}) {
  const [answer, setAnswer] = useState('')

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
      <Headline className="mb-5">{step.question_shown}</Headline>

      {feedback && (
        <p className="border-accent bg-accent/5 text-foreground mb-4 border-2 px-4 py-3 text-sm font-medium">
          <span className="text-accent mr-1 font-bold">AI 覺得這個回答文不對題：</span>
          {feedback}
        </p>
      )}

      <textarea
        className={`${textareaClass} min-h-28 resize-y text-lg`}
        value={answer}
        onChange={(e) => setAnswer(e.target.value)}
        placeholder="輸入你的回答…"
        autoFocus
      />
      {error && (
        <p className="border-accent bg-accent/5 text-accent mt-4 border-2 px-4 py-3 text-sm font-bold">
          {error}
        </p>
      )}
      <div className="mt-5 flex flex-wrap items-center gap-4">
        <Button type="submit" disabled={submitting || !answer.trim()} className="w-full sm:w-auto">
          送出
        </Button>
        {submitting && <ThinkingIndicator />}
      </div>
    </form>
  )
}
