import { useState } from 'react'
import { CpuIcon, GaugeIcon, SparklesIcon, TrendingUpIcon } from 'lucide-react'
import type { ConvergenceDecision, ConvergenceProject } from '../../types'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { AiMarkdown } from '@/components/design/ai'
import { SegmentedControl } from '@/components/design/selectable'
import { EmptyState, Notice } from '@/components/design/states'
import { Eyebrow, Small } from '@/components/design/typography'
import { DECISION_LABELS, type ConvergenceActions } from './model'
import { AgentProgress } from './shared'

/**
 * 技術可行性與投入效益: the agent reads every page before this one and says
 * whether this team can build it and whether it is worth building — then the
 * user makes the go / pivot / drop call, which is what closes the whole flow.
 */
export function FeasibilityStage({
  project,
  actions,
}: {
  project: ConvergenceProject
  actions: ConvergenceActions
}) {
  const f = project.feasibility
  const missing = [
    !project.demand_verdict && '需求分析的判定',
    !project.features.some((x) => x.moscow === 'must') && 'Must 功能',
    !project.research && '競品搜尋',
  ].filter(Boolean) as string[]

  return (
    <div className="flex flex-col gap-5">
      {missing.length > 0 && !f && (
        <Notice tone="info" title="前面還有沒做完的">
          還沒有{missing.join('、')}。也可以直接評估，只是 AI 能參考的依據會比較少。
        </Notice>
      )}

      <AgentProgress
        actions={actions}
        stage="feasibility"
        label="AI 正在評估可行性與投入效益"
        detail="讀取前面每一頁的結果"
        onRetry={() => void actions.run('feasibility')}
      />

      {!f && actions.busy !== 'feasibility' && (
        <EmptyState
          icon={GaugeIcon}
          eyebrow="還沒評估"
          title="做得出來嗎？值得做嗎？"
          description="AI 會綜合需求分析、MVP 功能、效益成本與競品搜尋，評估技術可行性與投入效益。最後要不要做由你決定。"
        />
      )}

      {f && (
        <>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            <article className="flex flex-col gap-2 rounded-xl border border-border bg-surface p-4 shadow-xs">
              <div className="flex items-center justify-between gap-2">
                <Eyebrow className="flex items-center gap-1.5">
                  <CpuIcon className="size-3.5" aria-hidden />
                  技術可行性
                </Eyebrow>
                <ScoreBadge score={f.technical.score} />
              </div>
              <AiMarkdown className="text-sm">{f.technical.rationale}</AiMarkdown>
              {f.technical.risks.length > 0 && (
                <>
                  <Small className="text-xs font-medium text-foreground/80">主要風險</Small>
                  <ul className="flex list-disc flex-col gap-0.5 pl-5 text-sm text-foreground/85">
                    {f.technical.risks.map((r) => (
                      <li key={r}>{r}</li>
                    ))}
                  </ul>
                </>
              )}
              {f.technical.suggested_stack.length > 0 && (
                <div className="flex flex-wrap gap-1.5 pt-1">
                  {f.technical.suggested_stack.map((s) => (
                    <Badge key={s} variant="soft">
                      {s}
                    </Badge>
                  ))}
                </div>
              )}
            </article>

            <article className="flex flex-col gap-2 rounded-xl border border-border bg-surface p-4 shadow-xs">
              <div className="flex items-center justify-between gap-2">
                <Eyebrow className="flex items-center gap-1.5">
                  <TrendingUpIcon className="size-3.5" aria-hidden />
                  投入效益
                </Eyebrow>
                <ScoreBadge score={f.investment.score} />
              </div>
              <AiMarkdown className="text-sm">{f.investment.rationale}</AiMarkdown>
              <Small className="text-xs">
                <span className="font-medium text-foreground/80">預估投入：</span>
                {f.investment.effort_estimate}
              </Small>
              <Small className="text-xs">
                <span className="font-medium text-foreground/80">實際收穫：</span>
                {f.investment.benefit}
              </Small>
            </article>
          </div>

          {f.must_fit && (
            <Notice tone="info" title="Must 功能放得進時程嗎">
              {f.must_fit}
            </Notice>
          )}

          {f.open_questions.length > 0 && (
            <div className="flex flex-col gap-1.5">
              <Eyebrow>開工前還要回答的問題</Eyebrow>
              <ul className="flex list-decimal flex-col gap-1 pl-5 text-sm text-foreground/85">
                {f.open_questions.map((q) => (
                  <li key={q}>{q}</li>
                ))}
              </ul>
            </div>
          )}
        </>
      )}

      <DecisionPanel project={project} actions={actions} />
    </div>
  )
}

function ScoreBadge({ score }: { score: number | null }) {
  if (score === null) return null
  return (
    <Badge variant={score >= 4 ? 'success' : score <= 2 ? 'warning' : 'soft'} className="tabular-nums">
      {score} / 5
    </Badge>
  )
}

function DecisionPanel({
  project,
  actions,
}: {
  project: ConvergenceProject
  actions: ConvergenceActions
}) {
  const [notes, setNotes] = useState(project.decision_notes ?? '')
  return (
    <div className="flex flex-col gap-3 rounded-xl border border-brand-border bg-brand-muted/40 p-4">
      <div className="flex flex-col gap-1">
        <Eyebrow className="text-primary">你的決定</Eyebrow>
        <Small className="text-xs">AI 只提供依據。這個專案要不要往下做，由你們決定。</Small>
      </div>
      <SegmentedControl<ConvergenceDecision | ''>
        aria-label="最後決定"
        className="w-full sm:w-auto sm:self-start"
        options={(Object.keys(DECISION_LABELS) as ConvergenceDecision[]).map((d) => ({
          value: d,
          label: DECISION_LABELS[d],
        }))}
        value={project.decision ?? ''}
        onChange={(d) => d && void actions.save({ decision: d })}
      />
      <Textarea
        value={notes}
        onChange={(e) => setNotes(e.target.value)}
        onBlur={() => {
          if (notes.trim() !== (project.decision_notes ?? '')) void actions.save({ decision_notes: notes })
        }}
        placeholder="下一步要做什麼？要調整的話往哪個方向？（選填，離開欄位就會儲存）"
        className="min-h-16 text-sm"
      />
    </div>
  )
}

export function FeasibilityButton({
  project,
  actions,
  hasProvider,
}: {
  project: ConvergenceProject
  actions: ConvergenceActions
  hasProvider: boolean
}) {
  return (
    <Button
      size="sm"
      variant="ai"
      disabled={!hasProvider || actions.busy !== null}
      onClick={() => void actions.run('feasibility')}
    >
      <SparklesIcon />
      {project.feasibility ? '重新評估' : 'AI 評估'}
    </Button>
  )
}
