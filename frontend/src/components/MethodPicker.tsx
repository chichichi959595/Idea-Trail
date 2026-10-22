import { ChevronDownIcon, WandSparklesIcon } from 'lucide-react'
import type { MethodCatalogEntry, MethodRecommendation } from '../types'
import { useMethodCatalog } from '../useMethodCatalog'
import { cn } from '@/lib/utils'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import { Selectable } from '@/components/design/selectable'
import { Small, Subhead } from '@/components/design/typography'
import { EmptyState, ErrorState, Notice, RowSkeleton } from '@/components/design/states'
import { AiMarkdown, AiReasoning, AiWorking } from '@/components/design/ai'

/** How many methods a recommendation names, at most. Mirrors the backend's
 * `RECOMMENDATION_COUNT`; a catalog smaller than this gets all of its own. */
const RECOMMENDATION_COUNT = 3

/** The line that introduces a picker: what the AI reads, how many it names. */
export function PickerDescription({
  readsFrom,
  methodCount,
}: {
  readsFrom: string
  methodCount: number
}) {
  return (
    <>
      讓 AI 依{readsFrom}排出最適合的 {Math.min(RECOMMENDATION_COUNT, methodCount)}{' '}
      個，或直接從完整清單自己挑。
    </>
  )
}

/** 讓 AI 推薦方法 / 重新推薦. Lives apart from the picker so it can sit on the
 * page's description line, where a page's own action goes. */
export function RecommendButton({
  hasProvider,
  recommending,
  hasResult,
  onRecommend,
}: {
  hasProvider: boolean
  recommending: boolean
  /** A recommendation (or a failed attempt) is already showing. */
  hasResult: boolean
  onRecommend: () => void
}) {
  if (!hasProvider || recommending) return null
  return (
    <Button size="sm" variant={hasResult ? 'outline' : 'default'} onClick={onRecommend}>
      <WandSparklesIcon />
      {hasResult ? '重新推薦' : '讓 AI 推薦方法'}
    </Button>
  )
}

/**
 * Choosing a method for a stage: an AI recommendation on top, the stage's full
 * catalog folded underneath. 專案發想 and 痛點發想 both pick their method this
 * way — only the catalog, and what the recommendation reads, differ. Rendered
 * as a page of the screen's step panel; the heading and the recommend button
 * are the page's.
 */
export function MethodPicker({
  readsFrom,
  methods,
  hasProvider,
  recommendations,
  ruleRanking,
  adjustmentNote,
  recommending,
  thinking,
  recommendError,
  selected,
  onSelect,
  starting,
  startError,
  onGoToSetup,
}: {
  /** What the recommendation reads, as a phrase: 「團隊條件跟這個痛點」. */
  readsFrom: string
  methods: MethodCatalogEntry[]
  hasProvider: boolean
  recommendations: MethodRecommendation[]
  ruleRanking: string[]
  adjustmentNote: string
  recommending: boolean
  thinking: string
  recommendError: string | null
  selected: string | null
  onSelect: (method: string) => void
  starting: boolean
  startError: string | null
  onGoToSetup: () => void
}) {
  const { get, labelOf } = useMethodCatalog()
  const count = Math.min(RECOMMENDATION_COUNT, methods.length)

  return (
    <div className="flex flex-col gap-5">
      {!hasProvider && (
        <Notice
          tone="brand"
          icon={WandSparklesIcon}
          title="還沒選額度來源"
          actions={
            <Button size="sm" variant="outline" onClick={onGoToSetup}>
              回開始設定
            </Button>
          }
        >
          推薦方法跟之後的每一步都要用到 AI，先回開始設定選一個額度來源。
        </Notice>
      )}

      {hasProvider && !recommending && recommendations.length === 0 && !recommendError && (
        <EmptyState
          description={
            <>
              按「讓 AI 推薦方法」，AI 會讀{readsFrom}，從 {methods.length} 種方法裡排出最適合的{' '}
              {count} 個並說明理由。也可以直接展開下面的完整清單自己挑。
            </>
          }
        />
      )}

      {recommending && (
        <div className="flex flex-col gap-4">
          <AiWorking
            label="AI 正在判斷該用哪些方法"
            detail={`讀取${readsFrom}，排序 ${methods.length} 種方法`}
          />
          <AiReasoning text={thinking} streaming />
          <div className="flex flex-col gap-2">
            {Array.from({ length: count }, (_, i) => (
              <RowSkeleton key={i} />
            ))}
          </div>
        </div>
      )}

      {recommendError && !recommending && (
        <ErrorState title="AI 推薦方法失敗" detail={recommendError} />
      )}

      {!recommending && adjustmentNote && (
        <AiReasoning
          label="AI 怎麼選的"
          text={
            ruleRanking.length > 0
              ? `${adjustmentNote}\n\n**規則的參考順序：** ${ruleRanking.map(labelOf).join(' → ')}`
              : adjustmentNote
          }
        />
      )}

      {!recommending && recommendations.length > 0 && (
        <ol className="flex flex-col gap-2.5">
          {recommendations.map((r) => (
            <li key={r.id}>
              <RecommendationRow
                rank={r.rank}
                label={labelOf(r.method)}
                description={get(r.method)?.description}
                rationale={r.rationale}
                swappedIn={ruleRanking.length > 0 && !ruleRanking.includes(r.method)}
                multiplayer={get(r.method)?.mode === 'relay'}
                selected={selected === r.method}
                onSelect={() => !starting && onSelect(r.method)}
              />
            </li>
          ))}
        </ol>
      )}

      {!recommending && (
        <Collapsible className="rounded-xl border border-border bg-surface">
          <CollapsibleTrigger className="group flex w-full items-center justify-between gap-2 px-4 py-3 text-left text-sm font-medium transition-colors hover:bg-accent focus-visible:ring-[3px] focus-visible:ring-ring focus-visible:outline-none">
            完整方法清單
            <ChevronDownIcon className="size-4 text-muted-foreground transition-transform duration-200 group-data-[state=open]:rotate-180" />
          </CollapsibleTrigger>
          <CollapsibleContent className="data-[state=closed]:animate-collapsible-up data-[state=open]:animate-collapsible-down overflow-hidden">
            <div className="grid grid-cols-1 gap-2.5 px-4 pt-1 pb-4 sm:grid-cols-2">
              {methods.map((m) => (
                <Selectable
                  key={m.name}
                  selected={selected === m.name}
                  disabled={starting}
                  onSelect={() => onSelect(m.name)}
                  className="gap-1.5 pr-11"
                >
                  <span className="flex flex-wrap items-center gap-1.5">
                    <Subhead>{m.label}</Subhead>
                    {m.mode === 'relay' && <Badge variant="soft">現場多人</Badge>}
                  </span>
                  <Small className="line-clamp-2 text-xs">{m.description}</Small>
                </Selectable>
              ))}
            </div>
          </CollapsibleContent>
        </Collapsible>
      )}

      {startError && <ErrorState title="開始不了" detail={startError} />}
    </div>
  )
}

/**
 * One recommended method. The rank is the visual anchor — a large tabular
 * numeral in its own well — because "which of these three" is the only decision
 * this row supports. The rationale stays folded, since it is the model's
 * argument for a choice the user has usually already made on the name alone.
 */
function RecommendationRow({
  rank,
  label,
  description,
  rationale,
  swappedIn,
  multiplayer,
  selected,
  onSelect,
}: {
  rank: number
  label: string
  description?: string
  rationale: string
  swappedIn: boolean
  /** 多人接龍: worth flagging up front, since it needs the room's phones. */
  multiplayer: boolean
  selected: boolean
  onSelect: () => void
}) {
  return (
    <div
      className={cn(
        'rounded-xl border transition-[border-color,background-color,box-shadow] duration-150',
        selected
          ? 'border-primary/45 bg-brand-muted shadow-sm'
          : 'border-border bg-surface shadow-xs',
      )}
    >
      <button
        type="button"
        aria-pressed={selected}
        onClick={onSelect}
        className="flex w-full items-start gap-4 rounded-xl p-4 text-left focus-visible:ring-[3px] focus-visible:ring-ring focus-visible:outline-none"
      >
        <span
          data-numeric
          aria-hidden
          className={cn(
            'flex size-9 shrink-0 items-center justify-center rounded-lg border text-base font-semibold',
            selected
              ? 'border-primary bg-primary text-primary-foreground'
              : 'border-border bg-muted text-muted-foreground',
          )}
        >
          {rank}
        </span>
        <span className="flex min-w-0 flex-1 flex-col gap-1">
          <span className="flex flex-wrap items-center gap-1.5">
            <Subhead>{label}</Subhead>
            {multiplayer && <Badge variant="soft">現場多人</Badge>}
            {swappedIn && <Badge variant="ai">AI 換上</Badge>}
          </span>
          {description && <Small className="text-pretty">{description}</Small>}
        </span>
      </button>

      {rationale && (
        <div className="px-4 pb-3.5 pl-[4.25rem]">
          <Collapsible>
            <CollapsibleTrigger className="group flex items-center gap-1 rounded-md text-xs font-medium text-muted-foreground transition-colors hover:text-foreground focus-visible:ring-[3px] focus-visible:ring-ring focus-visible:outline-none">
              為什麼推薦這個
              <ChevronDownIcon className="size-3.5 transition-transform duration-200 group-data-[state=open]:rotate-180" />
            </CollapsibleTrigger>
            <CollapsibleContent className="data-[state=closed]:animate-collapsible-up data-[state=open]:animate-collapsible-down overflow-hidden">
              <AiMarkdown className="mt-2 text-sm text-muted-foreground">{rationale}</AiMarkdown>
            </CollapsibleContent>
          </Collapsible>
        </div>
      )}
    </div>
  )
}

/**
 * The chosen method, as 開始之前 shows it: name, length, and how it's played —
 * the 怎麼玩 the run screen keeps behind a button, laid out here once before
 * the first question.
 */
export function MethodBrief({ method }: { method: string }) {
  const { get, labelOf } = useMethodCatalog()
  const entry = get(method)
  return (
    <div className="flex flex-col gap-3 rounded-xl border border-border bg-subtle p-4">
      <div className="flex flex-wrap items-center gap-2">
        <Subhead>{labelOf(method)}</Subhead>
        {entry && (
          <Badge variant="soft" data-numeric>
            {entry.step_count} 步
          </Badge>
        )}
        {entry?.mode === 'relay' && <Badge variant="soft">現場多人</Badge>}
      </div>
      {entry && (
        <>
          <Small className="text-pretty text-foreground/80">{entry.tutorial.intro}</Small>
          <Small className="text-pretty">
            <span className="font-medium text-foreground">怎麼玩：</span>
            {entry.tutorial.how_to}
          </Small>
        </>
      )}
    </div>
  )
}
