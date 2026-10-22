import { useState, type DragEvent, type FormEvent, type ReactNode } from 'react'
import {
  CircleHelpIcon,
  GripVerticalIcon,
  PlusIcon,
  SparklesIcon,
  Trash2Icon,
  XIcon,
} from 'lucide-react'
import type { ConvergenceFeature, ConvergenceProject, MoscowBucket } from '../../types'
import { cn } from '@/lib/utils'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Eyebrow, Small } from '@/components/design/typography'
import { FEATURE_DRAG_TYPE, MOSCOW, MOSCOW_ORDER, type ConvergenceActions } from './model'
import { AgentProgress, ScorePill } from './shared'

/** Where a card can be dropped on this page: a bucket, or back to the pool. */
type Zone = MoscowBucket | 'pool'

const BUCKET_STYLE: Record<MoscowBucket, string> = {
  must: 'border-primary/40 bg-brand-muted/50',
  should: 'border-ai-border bg-ai-muted/40',
  could: 'border-border bg-subtle',
  wont: 'border-dashed border-border bg-muted/40',
}

/**
 * MVP, the MoSCoW way. The agent drafts candidate features into an unsorted
 * pool; the user adds and removes cards and drags each into one of the four
 * buckets. The agent never sorts — which bucket a feature belongs in is the
 * scoping decision this page exists for.
 *
 * Order inside a bucket is the user's too: dropping a card on another card
 * puts it just before that one, in the same bucket or a different one.
 */
export function MoscowStage({
  project,
  actions,
  hasProvider,
}: {
  project: ConvergenceProject
  actions: ConvergenceActions
  hasProvider: boolean
}) {
  const features = project.features
  const [over, setOver] = useState<Zone | null>(null)
  // The card a drop would land in front of; null = the end of the zone.
  const [before, setBefore] = useState<string | null>(null)
  const [detail, setDetail] = useState<ConvergenceFeature | null>(null)
  const pool = features.filter((f) => f.moscow === null)

  const setFeatures = (next: ConvergenceFeature[]) => void actions.save({ features: next })
  const remove = (id: string) => setFeatures(features.filter((x) => x.id !== id))

  function move(id: string, zone: Zone, beforeId: string | null) {
    const bucket = zone === 'pool' ? null : zone
    const target = features.find((f) => f.id === id)
    if (!target || id === beforeId) return
    const rest = features.filter((f) => f.id !== id)
    const moved = { ...target, moscow: bucket }
    const at = beforeId ? rest.findIndex((f) => f.id === beforeId) : -1
    if (at >= 0) {
      rest.splice(at, 0, moved)
    } else {
      // Dropped on the zone's empty space: to the end of it. Already there
      // (or a stray drop back where it came from) is not worth a save.
      const sameZone = features.filter((f) => f.moscow === bucket)
      if (target.moscow === bucket && sameZone.at(-1)?.id === id) return
      rest.push(moved)
    }
    setFeatures(rest)
  }

  function endDrag() {
    setOver(null)
    setBefore(null)
  }

  function zoneProps(zone: Zone) {
    return {
      onDragOver: (e: DragEvent) => {
        if (!e.dataTransfer.types.includes(FEATURE_DRAG_TYPE)) return
        e.preventDefault()
        e.dataTransfer.dropEffect = 'move'
        if (over !== zone) setOver(zone)
        // Over the zone's own background rather than a card: drop at the end.
        if (!(e.target as Element).closest('[data-feature-card]') && before !== null) {
          setBefore(null)
        }
      },
      onDragLeave: (e: DragEvent) => {
        // Leaving for one of the zone's own children is not leaving the zone.
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) endDrag()
      },
      onDrop: (e: DragEvent) => {
        e.preventDefault()
        const id = e.dataTransfer.getData(FEATURE_DRAG_TYPE)
        if (id) move(id, zone, before)
        endDrag()
      },
    }
  }

  const card = (f: ConvergenceFeature, compact: boolean) => (
    <FeatureCard
      key={f.id}
      feature={f}
      compact={compact}
      insertBefore={before === f.id}
      onHover={() => before !== f.id && setBefore(f.id)}
      onDragEnd={endDrag}
      onShowDetail={() => setDetail(f)}
      onRemove={() => remove(f.id)}
    />
  )

  return (
    <div className="flex flex-1 flex-col gap-5">
      <AgentProgress
        actions={actions}
        stage="features/suggest"
        label="AI 正在列功能"
        detail="列完之後由你拖進四個分類"
        onRetry={() => void actions.run('features/suggest')}
      />

      {/* The pool sits beside the buckets on a wide screen and above them on
          a narrow one; either way its card list scrolls inside a capped
          height, so adding features never pushes the four buckets — the
          drop targets — further away from the cards being dragged into them.
          The buckets take whatever height the page has left, so the window
          isn't left with an empty band under them. */}
      <div className="grid flex-1 grid-cols-1 grid-rows-[auto_1fr] gap-3 xl:grid-cols-[15rem_minmax(0,1fr)] xl:grid-rows-1">
        <DropZone
          {...zoneProps('pool')}
          active={over === 'pool'}
          className="border-dashed border-border-strong bg-surface xl:sticky xl:top-0 xl:self-start"
          title={`還沒分類（${pool.length}）`}
          hint={pool.length ? '拖到分類格子裡' : '新增的功能會先放在這裡'}
        >
          <AddFeature onAdd={(f) => setFeatures([...features, f])} />
          {pool.length > 0 && (
            <div className="-mx-1 flex max-h-40 flex-col gap-2 overflow-y-auto px-1 py-0.5 xl:max-h-[26rem]">
              {pool.map((f) => card(f, false))}
            </div>
          )}
          {features.length === 0 && actions.busy !== 'features/suggest' && (
            <Small className="text-xs italic">
              {hasProvider ? '按右上角「AI 列出功能」，或自己新增。' : '自己新增功能。'}
            </Small>
          )}
        </DropZone>

        <div className="grid min-h-[28rem] grid-cols-1 gap-3 sm:grid-cols-2 sm:grid-rows-2">
          {MOSCOW_ORDER.map((bucket) => {
            const items = features.filter((f) => f.moscow === bucket)
            return (
              <DropZone
                key={bucket}
                {...zoneProps(bucket)}
                active={over === bucket}
                className={cn('min-h-40', BUCKET_STYLE[bucket])}
                title={`${MOSCOW[bucket].label}（${items.length}）`}
                hint={MOSCOW[bucket].hint}
              >
                {items.map((f) => card(f, true))}
              </DropZone>
            )
          })}
        </div>
      </div>

      <FeatureDetail
        feature={detail && (features.find((f) => f.id === detail.id) ?? null)}
        onClose={() => setDetail(null)}
        onRemove={(id) => {
          remove(id)
          setDetail(null)
        }}
      />
    </div>
  )
}

function DropZone({
  title,
  hint,
  active,
  className,
  children,
  ...handlers
}: {
  title: string
  hint: string
  active: boolean
  className?: string
  children?: ReactNode
} & Pick<React.ComponentProps<'div'>, 'onDragOver' | 'onDragLeave' | 'onDrop'>) {
  return (
    <section
      {...handlers}
      className={cn(
        'flex flex-col gap-2 rounded-xl border p-3 transition-[box-shadow,background-color] duration-150',
        active && 'ring-[3px] ring-ring',
        className,
      )}
    >
      <div className="flex flex-wrap items-baseline justify-between gap-x-3">
        <Eyebrow>{title}</Eyebrow>
        <Small className="text-2xs">{hint}</Small>
      </div>
      {children}
    </section>
  )
}

/**
 * One feature card. In a bucket it is `compact`: the name and a ⓘ that opens
 * the details — a sorted bucket is read for what is in it, not re-read card
 * by card. In the pool it keeps its description, which is what the user is
 * deciding on.
 */
function FeatureCard({
  feature,
  compact,
  insertBefore,
  onHover,
  onDragEnd,
  onShowDetail,
  onRemove,
}: {
  feature: ConvergenceFeature
  compact: boolean
  /** Draw the "drops in front of this card" line. */
  insertBefore: boolean
  onHover: () => void
  onDragEnd: () => void
  onShowDetail: () => void
  onRemove: () => void
}) {
  const [dragging, setDragging] = useState(false)
  return (
    <div
      draggable
      data-feature-card
      onDragStart={(e) => {
        e.dataTransfer.setData(FEATURE_DRAG_TYPE, feature.id)
        e.dataTransfer.effectAllowed = 'move'
        setDragging(true)
      }}
      onDragOver={(e) => {
        if (e.dataTransfer.types.includes(FEATURE_DRAG_TYPE)) onHover()
      }}
      onDragEnd={() => {
        setDragging(false)
        onDragEnd()
      }}
      className={cn(
        'group/card relative flex cursor-grab items-start gap-1.5 rounded-lg border border-border bg-surface shadow-xs active:cursor-grabbing',
        compact ? 'items-center px-2 py-1.5' : 'p-2',
        dragging && 'opacity-40',
        insertBefore &&
          'before:absolute before:inset-x-1 before:-top-[5px] before:h-0.5 before:rounded-full before:bg-primary',
      )}
    >
      <GripVerticalIcon
        className={cn('size-3.5 shrink-0 text-muted-foreground', !compact && 'mt-0.5')}
        aria-hidden
      />
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <div className="flex items-center gap-1.5">
          <span className="min-w-0 truncate text-sm font-medium">{feature.title}</span>
          {!compact && feature.source === 'ai' && (
            <Badge variant="ai" className="px-1 py-0 text-2xs">
              AI
            </Badge>
          )}
        </div>
        {!compact && feature.description && (
          <Small className="text-xs leading-snug">{feature.description}</Small>
        )}
      </div>
      {compact && (
        <button
          type="button"
          onClick={onShowDetail}
          aria-label={`「${feature.title}」的細節`}
          className="rounded-full text-muted-foreground transition-colors hover:text-primary focus-visible:ring-[3px] focus-visible:ring-ring focus-visible:outline-none"
        >
          <CircleHelpIcon className="size-4" />
        </button>
      )}
      <button
        type="button"
        onClick={onRemove}
        aria-label={`刪除「${feature.title}」`}
        className="rounded p-0.5 text-muted-foreground opacity-60 transition-opacity group-hover/card:opacity-100 hover:text-destructive focus-visible:opacity-100"
      >
        <XIcon className="size-3.5" />
      </button>
    </div>
  )
}

function FeatureDetail({
  feature,
  onClose,
  onRemove,
}: {
  feature: ConvergenceFeature | null
  onClose: () => void
  onRemove: (id: string) => void
}) {
  return (
    <Dialog open={feature !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="gap-4 sm:max-w-md">
        {feature && (
          <>
            <DialogHeader className="text-left">
              <DialogTitle>{feature.title}</DialogTitle>
              <DialogDescription>
                {feature.description || '沒有說明。'}
              </DialogDescription>
            </DialogHeader>
            <div className="flex flex-wrap items-center gap-1.5">
              {feature.moscow && <Badge variant="brand">{MOSCOW[feature.moscow].label}</Badge>}
              <Badge variant={feature.source === 'ai' ? 'ai' : 'soft'}>
                {feature.source === 'ai' ? 'AI 列的' : '自己新增的'}
              </Badge>
              {feature.impact !== null && <ScorePill label="效益" value={feature.impact} />}
              {feature.effort !== null && <ScorePill label="成本" value={feature.effort} />}
            </div>
            {feature.ai_rationale && (
              <div className="flex flex-col gap-1 rounded-lg border border-ai-border bg-ai-muted/40 p-3">
                <Eyebrow className="text-ai">
                  AI 的估計：效益 {feature.ai_impact}、成本 {feature.ai_effort}
                </Eyebrow>
                <Small className="text-xs leading-relaxed">{feature.ai_rationale}</Small>
              </div>
            )}
            <div className="flex justify-end">
              <Button variant="ghost" size="sm" onClick={() => onRemove(feature.id)}>
                <Trash2Icon />
                刪除這個功能
              </Button>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}

function AddFeature({ onAdd }: { onAdd: (f: ConvergenceFeature) => void }) {
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')

  function submit(e: FormEvent) {
    e.preventDefault()
    if (!title.trim()) return
    onAdd({
      id: crypto.randomUUID().slice(0, 8),
      title: title.trim(),
      description: description.trim(),
      source: 'user',
      moscow: null,
      impact: null,
      effort: null,
      ai_impact: null,
      ai_effort: null,
      ai_rationale: null,
    })
    setTitle('')
    setDescription('')
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-1.5 sm:flex-row xl:flex-col">
      <Input
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder="功能名稱"
        maxLength={60}
        className="h-8 text-xs sm:w-44 xl:w-full"
      />
      <Input
        value={description}
        onChange={(e) => setDescription(e.target.value)}
        placeholder="一句話說明（選填）"
        className="h-8 text-xs"
      />
      <Button
        type="submit"
        size="sm"
        variant="outline"
        disabled={!title.trim()}
        className="shrink-0"
      >
        <PlusIcon />
        新增
      </Button>
    </form>
  )
}

/** The page's header action: ask the agent for (more) candidate features. */
export function SuggestFeaturesButton({
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
      onClick={() => void actions.run('features/suggest')}
    >
      <SparklesIcon />
      {project.features.length ? 'AI 再補一些功能' : 'AI 列出功能'}
    </Button>
  )
}
