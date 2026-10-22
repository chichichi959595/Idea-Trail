import { useMemo, useState } from 'react'
import { CombineIcon, LightbulbIcon, ScaleIcon, Trash2Icon } from 'lucide-react'
import { useMethodCatalog } from '../useMethodCatalog'
import {
  IDEA_SIZE_LABELS,
  type Idea,
  type IdeaSize,
  type LibraryLink,
  type PainPoint,
} from '../types'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { SegmentedControl } from '@/components/design/selectable'
import { Screen, ScreenBody, ScreenFooter, ScreenHeader } from '@/components/design/section'
import { Eyebrow, Small } from '@/components/design/typography'
import { EmptyState, ErrorState } from '@/components/design/states'
import { AiReasoning, AiWorking } from '@/components/design/ai'
import {
  IDEA_EDGE_STYLES,
  COLOR_ALL,
  ideaColorOptions,
  ideaColors,
  ideaNodes,
  ideaStructuralEdges,
  isStale,
  semanticEdges,
} from '@/lib/libraryGraph'
import { GraphPanel, type AnalyzeState } from './library/GraphPanel'
import { CellAction, DataTable, type Column } from './library/DataTable'
import { formatDate } from '@/lib/format'
import { ProposalDetail } from './ProposalDetail'

type ViewMode = 'graph' | 'table'
type SizeValue = IdeaSize | 'none'

const SIZE_OPTIONS: { value: SizeValue; label: string }[] = [
  { value: 'none', label: '未設' },
  { value: 's', label: IDEA_SIZE_LABELS.s },
  { value: 'm', label: IDEA_SIZE_LABELS.m },
  { value: 'l', label: IDEA_SIZE_LABELS.l },
]

const SIZE_ORDER: Record<SizeValue, number> = { none: 0, s: 1, m: 2, l: 3 }

interface Props {
  ideas: Idea[]
  painPoints: PainPoint[]
  links: LibraryLink[]
  analyze: Omit<AnalyzeState, 'stale'>
  onSetSize: (id: number, size: IdeaSize | null) => void
  hasProvider: boolean
  onDelete: (ids: number[]) => Promise<void>
  /** Resolves true when the merge landed, so the selection can be cleared. */
  onSynthesize: (ids: number[]) => Promise<boolean>
  synthesizing: boolean
  thinking: string
  synthError: string | null
  /** Takes one idea to 專案收斂. */
  onConverge: (id: number) => void
}

/**
 * Every idea from every session — as a map of what relates to what, or as a
 * table to scan, sort and act on.
 *
 * This is also where ideas are worked on now that there's no per-session idea
 * wall: tick rows in the table and the footer offers what fits the selection
 * — one idea goes on to 專案收斂, two or more can be merged, and any number
 * can be deleted.
 */
export function IdeaLibrary({
  ideas,
  painPoints,
  links,
  analyze,
  onSetSize,
  hasProvider,
  onDelete,
  onSynthesize,
  synthesizing,
  thinking,
  synthError,
  onConverge,
}: Props) {
  const { shortLabelOf } = useMethodCatalog()
  const [viewMode, setViewMode] = useState<ViewMode>('graph')
  const [detailId, setDetailId] = useState<number | null>(null)
  const [ticked, setTicked] = useState<number[]>([])
  const [confirmingDelete, setConfirmingDelete] = useState(false)
  const [deleting, setDeleting] = useState(false)
  // Only ids still in the library count: a deleted or merged-away idea drops
  // out of the selection without anyone having to clear it.
  const selected = ticked.filter((id) => ideas.some((i) => i.id === id))
  const isTicked = (id: number) => selected.includes(id)
  const toggle = (id: number) =>
    setTicked(isTicked(id) ? selected.filter((x) => x !== id) : [...selected, id])
  const allTicked = ideas.length > 0 && selected.length === ideas.length

  async function confirmDelete() {
    setDeleting(true)
    try {
      await onDelete(selected)
      setTicked([])
      setConfirmingDelete(false)
    } finally {
      setDeleting(false)
    }
  }

  async function merge() {
    if (await onSynthesize(selected)) setTicked([])
  }

  const painPointById = useMemo(() => new Map(painPoints.map((p) => [p.id, p])), [painPoints])
  const painPointLabel = (id: number | null) =>
    id === null ? null : (painPointById.get(id)?.statement ?? null)

  const [pickedColor, setColorFocus] = useState(COLOR_ALL)
  const colorOptions = useMemo(() => ideaColorOptions(painPoints), [painPoints])
  // A pain point deleted while it was picked drops back to 全部.
  const colorFocus = colorOptions.some((o) => o.value === pickedColor) ? pickedColor : COLOR_ALL
  const colors = useMemo(
    () => ideaColors(ideas, painPoints, colorFocus),
    [ideas, painPoints, colorFocus],
  )
  const nodes = useMemo(
    () =>
      ideaNodes(ideas, colors.colorOf, (id) =>
        id === null ? null : (painPointById.get(id)?.statement ?? null),
      ),
    [ideas, colors, painPointById],
  )
  const structural = useMemo(() => ideaStructuralEdges(ideas), [ideas])
  const semantic = useMemo(() => semanticEdges(links), [links])

  const detail = detailId !== null ? ideas.find((i) => i.id === detailId) : undefined
  const sourceLabel = (i: Idea) => (i.is_synthesized ? '整合' : shortLabelOf(i.source_method))

  const columns: Column<Idea>[] = [
    {
      // Where 場次 used to be: the session number told nobody anything once
      // the library spans sessions, and ticking rows is what this table is
      // for now. First, where a row's checkbox is expected.
      id: 'select',
      header: (
        <Checkbox
          aria-label={allTicked ? '取消全選' : '全選'}
          checked={allTicked ? true : selected.length > 0 ? 'indeterminate' : false}
          disabled={synthesizing}
          onCheckedChange={() => setTicked(allTicked ? [] : ideas.map((i) => i.id))}
        />
      ),
      className: 'w-10',
      cell: (i) => (
        <CellAction>
          <Checkbox
            aria-label={`選取「${i.title}」`}
            checked={isTicked(i.id)}
            disabled={synthesizing}
            onCheckedChange={() => toggle(i.id)}
          />
        </CellAction>
      ),
    },
    {
      id: 'title',
      header: '想法',
      sortValue: (i) => i.title,
      className: 'min-w-64 max-w-md',
      cell: (i) => (
        <div className="flex flex-col gap-0.5">
          <span className="font-medium text-pretty">{i.title}</span>
          <span className="line-clamp-2 text-xs text-muted-foreground">{i.description}</span>
        </div>
      ),
    },
    {
      id: 'pain',
      header: '來源痛點',
      sortValue: (i) => painPointLabel(i.pain_point_id) ?? '￿',
      className: 'min-w-48 max-w-xs',
      cell: (i) => {
        const label = painPointLabel(i.pain_point_id)
        if (label) return <span className="text-foreground/85">{label}</span>
        return (
          <span className="text-muted-foreground">
            {i.pain_point_id === null ? '沒有指定' : '（已刪除）'}
          </span>
        )
      },
    },
    {
      id: 'method',
      header: '方法',
      sortValue: sourceLabel,
      className: 'whitespace-nowrap',
      cell: (i) => <Badge variant={i.is_synthesized ? 'ai' : 'soft'}>{sourceLabel(i)}</Badge>,
    },
    {
      id: 'size',
      header: '規模',
      sortValue: (i) => SIZE_ORDER[i.size ?? 'none'],
      cell: (i) => (
        <CellAction>
          <Select
            value={i.size ?? 'none'}
            onValueChange={(v) => onSetSize(i.id, v === 'none' ? null : (v as IdeaSize))}
          >
            <SelectTrigger size="sm" className="w-20 text-xs" aria-label={`${i.title} 的規模`}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {SIZE_OPTIONS.map((o) => (
                <SelectItem key={o.value} value={o.value}>
                  {o.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </CellAction>
      ),
    },
    {
      id: 'created',
      header: '建立',
      align: 'right',
      sortValue: (i) => i.created_at,
      className: 'whitespace-nowrap',
      cell: (i) => (
        <span data-numeric className="text-muted-foreground">
          {formatDate(i.created_at)}
        </span>
      ),
    },
  ]

  return (
    <Screen wide>
      <ScreenHeader
        title="想法庫"
        description="所有場次的想法。關聯圖看誰跟誰相關；表格可以勾選想法來刪除、整合或送去專案收斂。"
        meta={
          ideas.length > 0 && (
            <Small data-numeric className="text-xs">
              {ideas.length} 個想法
            </Small>
          )
        }
        actions={
          ideas.length > 0 && (
            <SegmentedControl
              aria-label="檢視方式"
              options={[
                { value: 'graph', label: '關聯圖' },
                { value: 'table', label: '表格' },
              ]}
              value={viewMode}
              onChange={setViewMode}
            />
          )
        }
      />

      <ScreenBody fill className="gap-5">
        {ideas.length === 0 ? (
          <EmptyState
            icon={LightbulbIcon}
            eyebrow="還沒有想法"
            title="想法庫是空的"
            description="跑完一輪專案發想，彙整出的想法就會出現在這裡，每一場的都會留著。"
          />
        ) : viewMode === 'graph' ? (
          <GraphPanel
            noun="想法"
            nodes={nodes}
            structuralEdges={structural}
            semanticEdges={semantic}
            edgeStyles={IDEA_EDGE_STYLES}
            colorTitle="顏色：痛點"
            colorOptions={colorOptions}
            colorFocus={colorFocus}
            onColorFocus={setColorFocus}
            legend={colors.legend}
            sizeNote="專案規模（點開想法設定）"
            selectedId={detailId}
            onSelect={setDetailId}
            analyze={{ ...analyze, stale: isStale(ideas, links) }}
          />
        ) : (
          <DataTable
            columns={columns}
            rows={ideas}
            rowKey={(i) => i.id}
            onRowClick={(i) => setDetailId(i.id)}
            isSelected={(i) => isTicked(i.id)}
            initialSort={{ id: 'created', desc: true }}
          />
        )}

        {synthesizing && <AiReasoning text={thinking} streaming />}
      </ScreenBody>

      {selected.length > 0 && (
        <ScreenFooter>
          {/* Here rather than in the body: the body is filled by the graph or
              the table, so a notice below them landed at the scroll's far end,
              half under this footer. The selection survives a failed merge,
              so the footer is always up to show it. */}
          {synthError && !synthesizing && (
            <ErrorState className="w-full" title="整合想法失敗" detail={synthError} />
          )}
          <div className="flex min-w-0 items-center gap-3">
            <Small data-numeric className="text-xs">
              已選 <span className="font-medium text-foreground">{selected.length}</span> 個想法
            </Small>
            {!synthesizing && (
              <Button variant="ghost" size="xs" onClick={() => setTicked([])}>
                取消選取
              </Button>
            )}
          </div>
          {synthesizing ? (
            <AiWorking label="AI 正在整合想法" detail={`合併 ${selected.length} 個想法`} />
          ) : (
            <div className="flex flex-wrap items-center gap-2">
              <Button variant="outline" onClick={() => setConfirmingDelete(true)}>
                <Trash2Icon />
                刪除
              </Button>
              {selected.length === 1 ? (
                <Button onClick={() => onConverge(selected[0])}>
                  <ScaleIcon />
                  前往專案收斂
                </Button>
              ) : (
                <Button disabled={!hasProvider} onClick={merge}>
                  <CombineIcon />
                  整合這 {selected.length} 個想法
                </Button>
              )}
            </div>
          )}
        </ScreenFooter>
      )}

      <Dialog
        open={confirmingDelete}
        onOpenChange={(open) => !deleting && setConfirmingDelete(open)}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader className="text-left">
            <DialogTitle>刪除 {selected.length} 個想法？</DialogTitle>
            <DialogDescription>
              會從想法庫移除，連同 AI 找出的關聯和評估結果。刪了就救不回來。
            </DialogDescription>
          </DialogHeader>
          <ul className="flex max-h-48 flex-col gap-1 overflow-y-auto text-sm">
            {ideas
              .filter((i) => isTicked(i.id))
              .map((i) => (
                <li key={i.id} className="truncate">
                  · {i.title}
                </li>
              ))}
          </ul>
          <DialogFooter>
            <Button
              variant="outline"
              disabled={deleting}
              onClick={() => setConfirmingDelete(false)}
            >
              取消
            </Button>
            <Button variant="destructive" disabled={deleting} onClick={confirmDelete}>
              <Trash2Icon />
              {deleting ? '刪除中…' : '刪除'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {detail && (
        <ProposalDetail
          idea={detail}
          allIdeas={ideas}
          painPoint={detail.pain_point_id !== null ? painPointById.get(detail.pain_point_id) : null}
          onClose={() => setDetailId(null)}
          headerExtra={
            <div className="flex flex-wrap items-center gap-3">
              <Eyebrow>專案規模</Eyebrow>
              <SegmentedControl
                aria-label="專案規模"
                options={SIZE_OPTIONS}
                value={detail.size ?? 'none'}
                onChange={(v) => onSetSize(detail.id, v === 'none' ? null : v)}
              />
            </div>
          }
        />
      )}
    </Screen>
  )
}
