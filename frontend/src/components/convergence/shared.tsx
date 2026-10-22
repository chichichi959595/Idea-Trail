import { SquareIcon } from 'lucide-react'
import type { ConvergenceAgentStage } from '../../types'
import { Button } from '@/components/ui/button'
import { AiReasoning, AiWorking } from '@/components/design/ai'
import { ErrorState } from '@/components/design/states'
import type { ConvergenceActions } from './model'

/** The "agent is working on this page" block: what it is doing, a stop
 * button, and the reasoning as it streams. Renders nothing for other pages. */
export function AgentProgress({
  actions,
  stage,
  label,
  detail,
  onRetry,
}: {
  actions: ConvergenceActions
  stage: ConvergenceAgentStage
  label: string
  detail?: string
  onRetry?: () => void
}) {
  const error = actions.errors[stage]
  if (actions.busy === stage) {
    return (
      <div className="flex flex-col gap-3">
        <div className="flex items-center justify-between gap-3">
          <AiWorking label={label} detail={detail} />
          <Button
            variant="outline"
            size="xs"
            disabled={actions.stopping}
            onClick={() => void actions.stop()}
          >
            <SquareIcon />
            {actions.stopping ? '停止中' : '停止'}
          </Button>
        </div>
        <AiReasoning text={actions.thinking} streaming />
      </div>
    )
  }
  if (error) return <ErrorState detail={error} onRetry={onRetry} />
  return null
}

/** A 1~5 score as a compact pill. */
export function ScorePill({ label, value }: { label: string; value: number | null }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-md border border-border bg-surface px-1.5 py-0.5 text-2xs text-muted-foreground tabular-nums">
      {label}
      <span className="font-semibold text-foreground">{value ?? '—'}</span>
    </span>
  )
}
