import { useMemo, useState } from 'react'
import { ArrowRightIcon, PencilIcon, PlusIcon, SearchIcon, Trash2Icon } from 'lucide-react'
import {
  PAIN_POINT_SOURCE_LABELS,
  type Idea,
  type LibraryLink,
  type PainPoint,
  type PainPointDraft,
} from '../types'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { SegmentedControl } from '@/components/design/selectable'
import { Screen, ScreenBody, ScreenFooter, ScreenHeader } from '@/components/design/section'
import { Eyebrow, Small } from '@/components/design/typography'
import { EmptyState, ErrorState } from '@/components/design/states'
import {
  PAIN_POINT_EDGE_STYLES,
  COLOR_ALL,
  painPointColorOptions,
  painPointColors,
  painPointNodes,
  painPointStructuralEdges,
  isStale,
  semanticEdges,
} from '@/lib/libraryGraph'
import { GraphPanel, type AnalyzeState } from './library/GraphPanel'
import { CellAction, DataTable, type Column } from './library/DataTable'
import { formatDate } from '@/lib/format'
import { PainPointFacts, PainPointForm } from './painpoints'

type ViewMode = 'graph' | 'table'

interface Props {
  painPoints: PainPoint[]
  /** The idea library — for "worked on together" links and each pain
   * point's list of ideas. */
  ideas: Idea[]
  links: LibraryLink[]
  analyze: Omit<AnalyzeState, 'stale'>
  currentSessionId: number | null
  onCreate: (draft: PainPointDraft) => Promise<void>
  onUpdate: (id: number, draft: PainPointDraft) => Promise<void>
  onDelete: (id: number) => Promise<void>
  onUse: (id: number) => void
}

/**
 * Every pain point any session has found or written — as a map of which
 * problems belong together, or as a table to scan, sort and edit.
 */
export function PainPointLibrary({
  painPoints,
  ideas,
  links,
  analyze,
  currentSessionId,
  onCreate,
  onUpdate,
  onDelete,
  onUse,
}: Props) {
  const [viewMode, setViewMode] = useState<ViewMode>('graph')
  const [query, setQuery] = useState('')
  const [detailId, setDetailId] = useState<number | null>(null)
  // null = closed, 'new' = adding, a number = editing that one.
  const [editing, setEditing] = useState<number | 'new' | null>(null)
  const [confirmingId, setConfirmingId] = useState<number | null>(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [ticked, setTicked] = useState<number[]>([])
  const [confirmingDelete, setConfirmingDelete] = useState(false)

  const [pickedColor, setColorFocus] = useState(COLOR_ALL)
  const colorOptions = useMemo(() => painPointColorOptions(painPoints), [painPoints])
  // A source no pain point has any more drops back to 全部.
  const colorFocus = colorOptions.some((o) => o.value === pickedColor) ? pickedColor : COLOR_ALL
  const colors = useMemo(() => painPointColors(painPoints, colorFocus), [painPoints, colorFocus])
  const nodes = useMemo(() => painPointNodes(painPoints, colors.colorOf), [painPoints, colors])
  const structural = useMemo(() => painPointStructuralEdges(painPoints, ideas), [painPoints, ideas])
  const semantic = useMemo(() => semanticEdges(links), [links])

  const needle = query.trim().toLowerCase()
  const shown = needle
    ? painPoints.filter((p) =>
        [p.statement, p.who, p.context, p.current_workaround].some((f) =>
          f?.toLowerCase().includes(needle),
        ),
      )
    : painPoints

  // Only ids still in the library count, as in 想法庫: a deleted pain point
  // drops out of the selection without anyone having to clear it.
  const selected = ticked.filter((id) => painPoints.some((p) => p.id === id))
  const isTicked = (id: number) => selected.includes(id)
  const toggle = (id: number) =>
    setTicked(isTicked(id) ? selected.filter((x) => x !== id) : [...selected, id])
  const allTicked = shown.length > 0 && shown.every((p) => isTicked(p.id))
  const tickedPainPoints = painPoints.filter((p) => isTicked(p.id))
  const losingLinks = tickedPainPoints.reduce((n, p) => n + (p.idea_count ?? 0), 0)

  function use(id: number) {
    // This screen stays as it was left for the next visit; an open detail
    // or a ticked row shouldn't be the first thing waiting there.
    setDetailId(null)
    setTicked([])
    onUse(id)
  }

  function confirmDelete() {
    const ids = selected
    run(
      async () => {
        await Promise.all(ids.map((id) => onDelete(id)))
      },
      () => {
        setTicked([])
        setConfirmingDelete(false)
        if (detailId !== null && ids.includes(detailId)) setDetailId(null)
      },
    )
  }

  const detail = detailId !== null ? painPoints.find((p) => p.id === detailId) : undefined
  const editingPainPoint =
    typeof editing === 'number' ? painPoints.find((p) => p.id === editing) : undefined

  async function run(action: () => Promise<void>, after: () => void) {
    setSaving(true)
    setError(null)
    try {
      await action()
      after()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setSaving(false)
    }
  }

  /** Delete asks twice, inline: a browser `confirm()` would block the page. */
  function detailActions(p: PainPoint) {
    if (confirmingId === p.id) {
      return (
        <>
          <Small className="text-xs whitespace-nowrap">
            {p.idea_count ? `${p.idea_count} 個想法會失去連結` : '確定刪除？'}
          </Small>
          <Button size="xs" variant="ghost" onClick={() => setConfirmingId(null)}>
            取消
          </Button>
          <Button
            size="xs"
            variant="destructive"
            disabled={saving}
            onClick={() =>
              run(() => onDelete(p.id), () => {
                setConfirmingId(null)
                if (detailId === p.id) setDetailId(null)
              })
            }
          >
            刪除
          </Button>
        </>
      )
    }
    return (
      <>
        <Button
          size="icon-xs"
          variant="ghost"
          aria-label="刪除這個痛點"
          onClick={() => setConfirmingId(p.id)}
        >
          <Trash2Icon />
        </Button>
        <Button
          size="icon-xs"
          variant="ghost"
          aria-label="編輯這個痛點"
          onClick={() => setEditing(p.id)}
        >
          <PencilIcon />
        </Button>
        <Button size="sm" onClick={() => use(p.id)}>
          用這個去發想
          <ArrowRightIcon />
        </Button>
      </>
    )
  }

  const columns: Column<PainPoint>[] = [
    {
      id: 'select',
      header: (
        <Checkbox
          aria-label={allTicked ? '取消全選' : '全選'}
          checked={allTicked ? true : selected.length > 0 ? 'indeterminate' : false}
          onCheckedChange={() =>
            setTicked(
              allTicked
                ? selected.filter((id) => !shown.some((p) => p.id === id))
                : [...new Set([...selected, ...shown.map((p) => p.id)])],
            )
          }
        />
      ),
      className: 'w-10',
      cell: (p) => (
        <CellAction>
          <Checkbox
            aria-label={`選取「${p.statement}」`}
            checked={isTicked(p.id)}
            onCheckedChange={() => toggle(p.id)}
          />
        </CellAction>
      ),
    },
    {
      id: 'statement',
      header: '痛點',
      sortValue: (p) => p.statement,
      className: 'min-w-48 max-w-sm font-medium text-pretty',
      cell: (p) => p.statement,
    },
    ...(
      [
        ['who', '誰會遇到'],
        ['context', '發生情境'],
        ['current_workaround', '現在怎麼應付'],
      ] as const
    ).map(
      ([key, header]): Column<PainPoint> => ({
        id: key,
        header,
        sortValue: (p) => p[key] ?? '￿',
        className: 'min-w-28 max-w-56 text-foreground/80',
        cell: (p) => p[key] ?? <span className="text-muted-foreground">—</span>,
      }),
    ),
    {
      id: 'source',
      header: '來源',
      sortValue: (p) => p.source,
      className: 'whitespace-nowrap',
      cell: (p) => (
        <span className="flex items-center gap-1.5">
          <Badge variant="soft">{PAIN_POINT_SOURCE_LABELS[p.source]}</Badge>
          {p.session_id !== null && p.session_id === currentSessionId && (
            <Badge variant="brand">這一場</Badge>
          )}
        </span>
      ),
    },
    {
      id: 'ideas',
      header: '想法數',
      align: 'right',
      sortValue: (p) => p.idea_count ?? 0,
      cell: (p) => <span data-numeric>{p.idea_count ?? 0}</span>,
    },
    {
      id: 'created',
      header: '建立',
      align: 'right',
      sortValue: (p) => p.created_at,
      className: 'whitespace-nowrap',
      cell: (p) => (
        <span data-numeric className="text-muted-foreground">
          {formatDate(p.created_at)}
        </span>
      ),
    },
  ]

  return (
    <Screen>
      <ScreenHeader
        title="痛點庫"
        description="所有場次找到或寫下的痛點。挑一個就能帶去專案發想。"
        meta={
          painPoints.length > 0 && (
            <Small data-numeric className="text-xs">
              {painPoints.length} 個痛點
            </Small>
          )
        }
        actions={
          <>
            <Button size="sm" variant="outline" onClick={() => setEditing('new')}>
              <PlusIcon />
              新增痛點
            </Button>
            {painPoints.length > 0 && (
              <SegmentedControl
                aria-label="檢視方式"
                options={[
                  { value: 'graph', label: '關聯圖' },
                  { value: 'table', label: '表格' },
                ]}
                value={viewMode}
                onChange={setViewMode}
              />
            )}
          </>
        }
      />

      <ScreenBody fill className="gap-5">
        {error && <ErrorState title="沒有存成功" detail={error} />}

        {painPoints.length === 0 ? (
          <EmptyState
            icon={SearchIcon}
            eyebrow="還沒有痛點"
            title="痛點庫是空的"
            description="走一輪痛點發想，或在開始設定寫下你們已經有的痛點，它們都會存到這裡。"
          />
        ) : viewMode === 'graph' ? (
          <GraphPanel
            noun="痛點"
            nodes={nodes}
            structuralEdges={structural}
            semanticEdges={semantic}
            edgeStyles={PAIN_POINT_EDGE_STYLES}
            colorTitle="顏色：來源"
            colorOptions={colorOptions}
            colorFocus={colorFocus}
            onColorFocus={setColorFocus}
            legend={colors.legend}
            sizeNote="用它發想出的想法數"
            selectedId={detailId}
            onSelect={setDetailId}
            analyze={{ ...analyze, stale: isStale(painPoints, links) }}
          />
        ) : (
          <>
            <div className="relative">
              <SearchIcon
                className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
                aria-hidden
              />
              <Input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="搜尋痛點、對象或情境"
                aria-label="搜尋痛點"
                className="pl-9"
              />
            </div>
            <DataTable
              columns={columns}
              rows={shown}
              rowKey={(p) => p.id}
              onRowClick={(p) => setDetailId(p.id)}
              isSelected={(p) => isTicked(p.id)}
              initialSort={{ id: 'created', desc: true }}
              empty={`沒有符合「${query}」的痛點。`}
            />
          </>
        )}
      </ScreenBody>

      {selected.length > 0 && (
        <ScreenFooter>
          <div className="flex min-w-0 items-center gap-3">
            <Small data-numeric className="text-xs">
              已選 <span className="font-medium text-foreground">{selected.length}</span> 個痛點
            </Small>
            <Button variant="ghost" size="xs" onClick={() => setTicked([])}>
              取消選取
            </Button>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="outline" onClick={() => setConfirmingDelete(true)}>
              <Trash2Icon />
              刪除
            </Button>
            {selected.length === 1 && (
              <Button onClick={() => use(selected[0])}>
                用這個痛點發想
                <ArrowRightIcon />
              </Button>
            )}
          </div>
        </ScreenFooter>
      )}

      <Dialog
        open={confirmingDelete}
        onOpenChange={(open) => !saving && setConfirmingDelete(open)}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader className="text-left">
            <DialogTitle>刪除 {selected.length} 個痛點？</DialogTitle>
            <DialogDescription>
              {losingLinks > 0
                ? `用它們發想出的 ${losingLinks} 個想法會留著，只是不再連到痛點。刪了就救不回來。`
                : '會從痛點庫移除，連同 AI 找出的關聯。刪了就救不回來。'}
            </DialogDescription>
          </DialogHeader>
          <ul className="flex max-h-48 flex-col gap-1 overflow-y-auto text-sm">
            {tickedPainPoints.map((p) => (
              <li key={p.id} className="truncate">
                · {p.statement}
              </li>
            ))}
          </ul>
          <DialogFooter>
            <Button
              variant="outline"
              disabled={saving}
              onClick={() => setConfirmingDelete(false)}
            >
              取消
            </Button>
            <Button variant="destructive" disabled={saving} onClick={confirmDelete}>
              <Trash2Icon />
              {saving ? '刪除中…' : '刪除'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {detail && (
        <Dialog open onOpenChange={(open) => !open && setDetailId(null)}>
          <DialogContent className="max-h-[85svh] gap-5 overflow-y-auto sm:max-w-xl">
            <DialogHeader className="gap-2 text-left">
              <div className="flex flex-wrap items-center gap-2">
                <Eyebrow>痛點</Eyebrow>
                <Badge variant="soft">{PAIN_POINT_SOURCE_LABELS[detail.source]}</Badge>
              </div>
              <DialogTitle className="pr-8 text-xl leading-snug">{detail.statement}</DialogTitle>
              <DialogDescription className="sr-only">
                {detail.statement} 的細節與用它發想出的想法
              </DialogDescription>
            </DialogHeader>
            <PainPointFacts painPoint={detail} />
            <IdeasOf ideas={ideas.filter((i) => i.pain_point_id === detail.id)} />
            <div className="flex flex-wrap items-center justify-end gap-2">
              {detailActions(detail)}
            </div>
          </DialogContent>
        </Dialog>
      )}

      {editing !== null && (
        <Dialog open onOpenChange={(open) => !open && setEditing(null)}>
          <DialogContent className="gap-4 sm:max-w-2xl">
            <DialogHeader className="text-left">
              <DialogTitle>{editing === 'new' ? '新增痛點' : '編輯痛點'}</DialogTitle>
              <DialogDescription>只有「痛點」一欄必填，其他知道多少寫多少。</DialogDescription>
            </DialogHeader>
            <PainPointForm
              initial={editingPainPoint}
              submitLabel={editing === 'new' ? '存進痛點庫' : '儲存'}
              saving={saving}
              onCancel={() => setEditing(null)}
              onSubmit={(draft) =>
                run(
                  () => (editing === 'new' ? onCreate(draft) : onUpdate(editing, draft)),
                  () => setEditing(null),
                )
              }
            />
          </DialogContent>
        </Dialog>
      )}
    </Screen>
  )
}

function IdeasOf({ ideas }: { ideas: Idea[] }) {
  return (
    <section className="flex flex-col gap-2">
      <Eyebrow>用它發想出的想法（{ideas.length}）</Eyebrow>
      {ideas.length === 0 ? (
        <Small className="text-xs">還沒有。按「用這個去發想」開始第一輪。</Small>
      ) : (
        <ul className="flex flex-col gap-1.5">
          {ideas.map((i) => (
            <li key={i.id} className="flex gap-2 text-sm leading-relaxed">
              <span aria-hidden className="mt-2 size-1 shrink-0 rounded-full bg-muted-foreground" />
              <span className="text-foreground/85">{i.title}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
