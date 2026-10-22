import { useState, type DragEvent } from 'react'
import { AlertTriangleIcon, RotateCcwIcon, SparklesIcon } from 'lucide-react'
import type { ConvergenceFeature, ConvergenceProject } from '../../types'
import { cn } from '@/lib/utils'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Notice } from '@/components/design/states'
import { Eyebrow, Small } from '@/components/design/typography'
import {
  FEATURE_DRAG_TYPE,
  MOSCOW,
  isPlaced,
  onMatrix,
  type ConvergenceActions,
} from './model'
import { AgentProgress, ScorePill } from './shared'

const SCALE = [1, 2, 3, 4, 5]

type Quadrant = 'quick' | 'major' | 'fill' | 'thankless'

/** 3 is the middle line on both axes: a feature on it belongs to no quadrant. */
function quadrantOf(impact: number, effort: number): Quadrant | null {
  if (impact === 3 || effort === 3) return null
  if (impact > 3) return effort < 3 ? 'quick' : 'major'
  return effort < 3 ? 'fill' : 'thankless'
}

const QUADRANTS: Record<Quadrant, { label: string; hint: string; tint: string; text: string }> = {
  quick: { label: '優先做', hint: '高效益・低成本', tint: 'bg-success-muted/60', text: 'text-success' },
  major: { label: '重點投入', hint: '高效益・高成本', tint: 'bg-brand-muted/50', text: 'text-primary' },
  fill: { label: '有空再做', hint: '低效益・低成本', tint: 'bg-muted/50', text: 'text-muted-foreground' },
  thankless: { label: '盡量避免', hint: '低效益・高成本', tint: 'bg-destructive-muted/40', text: 'text-destructive' },
}

/** A Must is never cut for being expensive — but the user should see that it is. */
const expensiveMust = (f: ConvergenceFeature) => f.moscow === 'must' && (f.effort ?? 0) >= 4

/**
 * 效益 × 成本. The agent places every sorted feature (Won't excluded) on a 5×5
 * grid; the user drags them wherever they think they belong. The agent's
 * original estimate is kept next to the user's placement, never overwritten
 * by it, and re-asking the agent never moves a card the user already placed.
 *
 * Must features carry a mark of their own, and the priority list below keeps
 * them in their own group however costly they are: the matrix is for ordering
 * the work, not for cutting what the MoSCoW page already said is essential.
 */
export function MatrixStage({
  project,
  actions,
}: {
  project: ConvergenceProject
  actions: ConvergenceActions
}) {
  const [over, setOver] = useState<string | null>(null)
  const features = project.features
  const candidates = features.filter(onMatrix)
  const unplaced = candidates.filter((f) => !isPlaced(f))
  const wont = features.filter((f) => f.moscow === 'wont')
  const unsorted = features.filter((f) => f.moscow === null)

  function place(id: string, impact: number | null, effort: number | null) {
    void actions.save({
      features: features.map((f) => (f.id === id ? { ...f, impact, effort } : f)),
    })
  }

  function dropProps(key: string, impact: number | null, effort: number | null) {
    return {
      onDragOver: (e: DragEvent) => {
        if (!e.dataTransfer.types.includes(FEATURE_DRAG_TYPE)) return
        e.preventDefault()
        e.dataTransfer.dropEffect = 'move'
        if (over !== key) setOver(key)
      },
      onDragLeave: (e: DragEvent) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setOver(null)
      },
      onDrop: (e: DragEvent) => {
        e.preventDefault()
        setOver(null)
        const id = e.dataTransfer.getData(FEATURE_DRAG_TYPE)
        if (id && candidates.some((f) => f.id === id)) place(id, impact, effort)
      },
    }
  }

  if (candidates.length === 0) {
    return (
      <Notice tone="warning" title="還沒有可以放進矩陣的功能">
        先在上一頁把功能拖進 Must、Should 或 Could。Won&apos;t 的功能這一版不做，不會放進矩陣。
      </Notice>
    )
  }

  return (
    <div className="flex flex-col gap-5">
      <AgentProgress
        actions={actions}
        stage="impact-effort"
        label="AI 正在估效益與成本"
        detail={`${candidates.length} 個功能`}
        onRetry={() => void actions.run('impact-effort')}
      />

      {unsorted.length > 0 && (
        <Small className="text-xs">
          還有 {unsorted.length} 個功能沒有分類，要先在上一頁分好才會出現在這裡。
        </Small>
      )}

      <section
        {...dropProps('tray', null, null)}
        className={cn(
          'flex flex-col gap-2 rounded-xl border border-dashed border-border-strong p-3 transition-shadow',
          over === 'tray' && 'ring-[3px] ring-ring',
        )}
      >
        <div className="flex flex-wrap items-baseline justify-between gap-x-3">
          <Eyebrow>還沒放進矩陣（{unplaced.length}）</Eyebrow>
          <Small className="text-2xs">拖到下面的格子；拖回這裡就是取消擺放</Small>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {unplaced.map((f) => (
            <Chip key={f.id} feature={f} />
          ))}
          {unplaced.length === 0 && <Small className="text-xs italic">全部都放好了。</Small>}
        </div>
      </section>

      <div className="flex gap-2">
        {/* The impact axis, read bottom to top. */}
        <div className="flex w-5 shrink-0 flex-col items-center justify-between py-1 text-2xs text-muted-foreground">
          <span>高</span>
          <span className="[writing-mode:vertical-rl] tracking-widest">效益</span>
          <span>低</span>
        </div>
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <div className="relative grid grid-cols-5 overflow-hidden rounded-xl border border-border">
            {[...SCALE].reverse().map((impact) =>
              SCALE.map((effort) => {
                const key = `${impact}-${effort}`
                const quadrant = quadrantOf(impact, effort)
                const here = candidates.filter((f) => f.impact === impact && f.effort === effort)
                return (
                  <div
                    key={key}
                    {...dropProps(key, impact, effort)}
                    className={cn(
                      'flex min-h-16 min-w-0 flex-col gap-1 border-border p-1 transition-shadow sm:min-h-20',
                      effort < 5 && 'border-r',
                      impact > 1 && 'border-b',
                      // Room for the quadrant labels in the corners.
                      impact === 5 && 'pt-5',
                      impact === 1 && 'pb-5',
                      quadrant ? QUADRANTS[quadrant].tint : 'bg-surface',
                      over === key && 'ring-[3px] ring-ring ring-inset',
                    )}
                  >
                    {here.map((f) => (
                      <Chip key={f.id} feature={f} />
                    ))}
                  </div>
                )
              }),
            )}
            <QuadrantLabel quadrant="quick" className="top-1 left-1.5" />
            <QuadrantLabel quadrant="major" className="top-1 right-1.5" />
            <QuadrantLabel quadrant="fill" className="bottom-1 left-1.5" />
            <QuadrantLabel quadrant="thankless" className="right-1.5 bottom-1" />
          </div>
          <div className="flex justify-between px-1 text-2xs text-muted-foreground">
            <span>低</span>
            <span className="tracking-widest">成本</span>
            <span>高</span>
          </div>
        </div>
      </div>

      <div className="flex items-center gap-3 text-2xs text-muted-foreground">
        <span className="inline-flex items-center gap-1">
          <span className="size-2.5 rounded-sm border-2 border-primary" /> Must
        </span>
        <span>滑過卡片可以看 AI 的估計與理由</span>
        {candidates.some((f) => f.ai_impact !== null) && (
          <Button
            variant="ghost"
            size="xs"
            className="ml-auto"
            onClick={() =>
              void actions.save({
                features: features.map((f) =>
                  f.ai_impact !== null && f.ai_effort !== null && onMatrix(f)
                    ? { ...f, impact: f.ai_impact, effort: f.ai_effort }
                    : f,
                ),
              })
            }
          >
            <RotateCcwIcon />
            全部回到 AI 的估計
          </Button>
        )}
      </div>

      <PriorityList features={candidates.filter(isPlaced)} />

      {wont.length > 0 && (
        <Small className="text-xs">
          Won&apos;t（這一版不做，不放進矩陣）：{wont.map((f) => f.title).join('、')}
        </Small>
      )}
    </div>
  )
}

function QuadrantLabel({ quadrant, className }: { quadrant: Quadrant; className: string }) {
  const q = QUADRANTS[quadrant]
  return (
    <span
      className={cn(
        'pointer-events-none absolute rounded bg-surface/80 px-1 text-2xs font-semibold',
        q.text,
        className,
      )}
    >
      {q.label}
    </span>
  )
}

function Chip({ feature }: { feature: ConvergenceFeature }) {
  const must = feature.moscow === 'must'
  const moved =
    feature.ai_impact !== null &&
    (feature.impact !== feature.ai_impact || feature.effort !== feature.ai_effort)
  const tip = [
    `${feature.title}（${MOSCOW[feature.moscow ?? 'could'].label}）`,
    feature.ai_impact !== null && `AI 估計：效益 ${feature.ai_impact}、成本 ${feature.ai_effort}`,
    feature.ai_rationale,
    moved && '你調整過這張卡的位置',
    expensiveMust(feature) && 'Must：成本高也要做，請排進時程，不要因為成本高就拿掉',
  ]
    .filter(Boolean)
    .join('\n')

  return (
    <div
      draggable
      title={tip}
      onDragStart={(e) => {
        e.dataTransfer.setData(FEATURE_DRAG_TYPE, feature.id)
        e.dataTransfer.effectAllowed = 'move'
      }}
      className={cn(
        'flex max-w-full min-w-0 cursor-grab items-center gap-1 rounded-md border bg-surface px-1.5 py-0.5 text-2xs font-medium shadow-xs active:cursor-grabbing sm:text-xs',
        must ? 'border-2 border-primary text-primary' : 'border-border text-foreground/85',
      )}
    >
      {expensiveMust(feature) && (
        <AlertTriangleIcon className="size-3 shrink-0 text-warning" aria-label="成本高的 Must" />
      )}
      <span className="min-w-0 truncate">{feature.title}</span>
      {moved && <span className="size-1.5 shrink-0 rounded-full bg-ai" aria-label="調整過" />}
    </div>
  )
}

/**
 * The order to build in. Must comes first as its own group regardless of cost
 * — cheapest first within it, so the team knows where the effort will go.
 * Everything else is ordered by return: high impact, low effort first.
 */
function PriorityList({ features }: { features: ConvergenceFeature[] }) {
  if (features.length === 0) return null
  const must = features
    .filter((f) => f.moscow === 'must')
    .sort((a, b) => a.effort! - b.effort! || b.impact! - a.impact!)
  const rest = features
    .filter((f) => f.moscow !== 'must')
    .sort(
      (a, b) =>
        b.impact! - b.effort! - (a.impact! - a.effort!) || b.impact! - a.impact!,
    )

  const row = (f: ConvergenceFeature, i: number) => {
    const quadrant = quadrantOf(f.impact!, f.effort!)
    return (
      <li key={f.id} className="flex flex-wrap items-center gap-2 py-1.5">
        <span className="w-5 text-right text-xs text-muted-foreground tabular-nums">{i + 1}.</span>
        <span className="min-w-0 flex-1 truncate text-sm">{f.title}</span>
        <Badge variant="soft">{MOSCOW[f.moscow!].label}</Badge>
        {quadrant && (
          <span className={cn('text-2xs font-semibold', QUADRANTS[quadrant].text)}>
            {QUADRANTS[quadrant].label}
          </span>
        )}
        <ScorePill label="效益" value={f.impact} />
        <ScorePill label="成本" value={f.effort} />
      </li>
    )
  }

  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
      {must.length > 0 && (
        <div className="flex flex-col gap-1 rounded-xl border-2 border-primary/40 p-3">
          <Eyebrow className="text-primary">Must：不論成本都要做</Eyebrow>
          {must.some(expensiveMust) && (
            <Small className="text-xs text-warning">
              有 {must.filter(expensiveMust).length} 個 Must 成本偏高——不要因此拿掉，而是提早排進時程、預留時間。
            </Small>
          )}
          <ul className="divide-y divide-border">{must.map(row)}</ul>
        </div>
      )}
      {rest.length > 0 && (
        <div className="flex flex-col gap-1 rounded-xl border border-border p-3">
          <Eyebrow>其他功能：高效益、低成本的先做</Eyebrow>
          <ul className="divide-y divide-border">{rest.map(row)}</ul>
        </div>
      )}
    </div>
  )
}

export function EstimateButton({
  project,
  actions,
  hasProvider,
}: {
  project: ConvergenceProject
  actions: ConvergenceActions
  hasProvider: boolean
}) {
  const ready = project.features.some(onMatrix)
  const estimated = project.features.some((f) => f.ai_impact !== null)
  return (
    <Button
      size="sm"
      variant="ai"
      disabled={!hasProvider || !ready || actions.busy !== null}
      onClick={() => void actions.run('impact-effort')}
    >
      <SparklesIcon />
      {estimated ? 'AI 重新估計' : 'AI 估效益與成本'}
    </Button>
  )
}
