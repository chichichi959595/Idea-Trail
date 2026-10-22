import { useState } from 'react'
import { NetworkIcon, SparklesIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { SegmentedControl } from '@/components/design/selectable'
import { Eyebrow, Small } from '@/components/design/typography'
import { ErrorState, Notice } from '@/components/design/states'
import { AiReasoning, AiWorking } from '@/components/design/ai'
import {
  COLOR_ALL,
  type ColorOption,
  type EdgeStyle,
  type GraphEdge,
  type GraphNode,
  type LegendItem,
} from '@/lib/libraryGraph'
import { ForceGraph } from './ForceGraph'

type LinkMode = 'structural' | 'semantic'

export interface AnalyzeState {
  hasProvider: boolean
  onAnalyze: () => void
  analyzing: boolean
  thinking: string
  error: string | null
  /** Newer items exist than the last analysis knew about. */
  stale: boolean
}

/**
 * One library's graph with everything around it: which links to draw, the
 * AI analysis that produces the semantic ones, and the legend.
 *
 * Two link modes, never mixed. Structural links are what the items already
 * know about themselves, so they cost nothing and can always be explained.
 * AI links are the model's judgement of what's about the same thing even when
 * it came from different places; they cost a call, so they are made on
 * request and kept.
 */
export function GraphPanel({
  noun,
  nodes,
  structuralEdges,
  semanticEdges,
  edgeStyles,
  colorTitle,
  colorOptions,
  colorFocus,
  onColorFocus,
  legend,
  sizeNote,
  selectedId,
  onSelect,
  analyze,
}: {
  /** 想法 / 痛點 — for the copy. */
  noun: string
  nodes: GraphNode[]
  structuralEdges: GraphEdge[]
  semanticEdges: GraphEdge[]
  edgeStyles: Record<string, EdgeStyle>
  colorTitle: string
  /** What the dropdown beside the legend can single out; its first choice,
   * 全部, is always there. */
  colorOptions: ColorOption[]
  colorFocus: string
  onColorFocus: (value: string) => void
  legend: LegendItem[]
  sizeNote: string
  selectedId: number | null
  onSelect: (id: number) => void
  analyze: AnalyzeState
}) {
  const [mode, setMode] = useState<LinkMode>('structural')
  const edges = mode === 'structural' ? structuralEdges : semanticEdges
  const edgeKinds = Object.keys(edgeStyles).filter((k) =>
    mode === 'semantic' ? k === 'semantic' : k !== 'semantic',
  )

  return (
    // Takes the height its screen leaves over; the graph is the part that gives.
    <div className="flex min-h-0 flex-1 flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-3">
          <Eyebrow>關聯依據</Eyebrow>
          <SegmentedControl
            aria-label="關聯依據"
            options={[
              { value: 'structural', label: '來源結構' },
              { value: 'semantic', label: 'AI 語意' },
            ]}
            value={mode}
            onChange={setMode}
          />
        </div>
        {mode === 'semantic' &&
          semanticEdges.length > 0 &&
          analyze.hasProvider &&
          !analyze.analyzing && (
            <Button size="sm" variant="outline" onClick={analyze.onAnalyze}>
              <SparklesIcon />
              重新分析
            </Button>
          )}
      </div>

      {mode === 'semantic' && (
        <SemanticStatus
          noun={noun}
          count={nodes.length}
          hasLinks={semanticEdges.length > 0}
          {...analyze}
        />
      )}

      <ForceGraph
        nodes={nodes}
        edges={edges}
        edgeStyles={edgeStyles}
        selectedId={selectedId}
        onSelect={onSelect}
        ariaLabel={`${noun}關聯圖，共 ${nodes.length} 個${noun}、${edges.length} 條關聯`}
        className="min-h-72 flex-1"
      />

      <div className="flex flex-col gap-2.5 text-xs">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5">
          <Eyebrow>{colorTitle}</Eyebrow>
          <Select value={colorFocus} onValueChange={onColorFocus}>
            <SelectTrigger size="sm" className="h-7 max-w-64 text-xs" aria-label={colorTitle}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="max-w-sm">
              <SelectItem value={COLOR_ALL}>全部</SelectItem>
              {colorOptions.map((o) => (
                <SelectItem key={o.value} value={o.value}>
                  {o.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {legend.map((item) => (
            <span key={item.label} className="flex min-w-0 items-center gap-1.5 text-foreground/80">
              <span
                aria-hidden
                className="size-2.5 shrink-0 rounded-full border-2"
                style={{
                  background: item.hollow ? 'transparent' : item.color,
                  borderColor: item.color,
                }}
              />
              <span className="max-w-56 truncate">{item.label}</span>
            </span>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5">
          <Eyebrow>連線</Eyebrow>
          {edgeKinds.map((kind) => {
            const st = edgeStyles[kind]
            return (
              <span key={kind} className="flex items-center gap-1.5 text-foreground/80">
                <svg width="22" height="6" aria-hidden>
                  <line
                    x1="1"
                    y1="3"
                    x2="21"
                    y2="3"
                    className={st.ai ? 'stroke-ai' : 'stroke-muted-foreground'}
                    strokeWidth={st.width + 0.2}
                    strokeDasharray={st.dash}
                    strokeLinecap="round"
                  />
                </svg>
                {st.label}
              </span>
            )
          })}
          <span className="text-muted-foreground">點大小：{sizeNote}</span>
        </div>
      </div>
    </div>
  )
}

function SemanticStatus({
  noun,
  count,
  hasLinks,
  hasProvider,
  onAnalyze,
  analyzing,
  thinking,
  error,
  stale,
}: AnalyzeState & { noun: string; count: number; hasLinks: boolean }) {
  if (analyzing) {
    return (
      <div className="flex flex-col gap-3">
        <AiWorking label={`AI 正在判斷哪些${noun}相關`} detail={`讀過全部 ${count} 個${noun}`} />
        <AiReasoning text={thinking} streaming />
      </div>
    )
  }
  return (
    <>
      {error && <ErrorState title="分析關聯失敗" detail={error} />}
      {!hasLinks && (
        <Notice
          tone="ai"
          icon={NetworkIcon}
          title="還沒分析過語意關聯"
          actions={
            hasProvider ? (
              <Button size="sm" variant="ai" onClick={onAnalyze} disabled={count < 2}>
                <SparklesIcon />
                用 AI 分析關聯
              </Button>
            ) : undefined
          }
        >
          {hasProvider
            ? `AI 會讀過全部 ${count} 個${noun}，把內容相關的連起來，就算它們來自不同場次。結果會存起來，不用每次重跑。`
            : '分析要用到 AI，先到開始設定選一個額度來源。'}
        </Notice>
      )}
      {hasLinks && stale && (
        <Small className="text-xs">
          上次分析之後又多了新的{noun}，它們還沒有語意關聯，可以重新分析。
        </Small>
      )}
    </>
  )
}

