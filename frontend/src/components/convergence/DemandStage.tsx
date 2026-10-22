import { useEffect, useRef, useState } from 'react'
import {
  MessagesSquareIcon,
  RotateCcwIcon,
  SendIcon,
  ThumbsDownIcon,
  ThumbsUpIcon,
  UserIcon,
} from 'lucide-react'
import type { ConvergenceProject, DebateMode, DebateTurn, DemandVerdict } from '../../types'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { AiMarkdown } from '@/components/design/ai'
import { SegmentedControl } from '@/components/design/selectable'
import { EmptyState } from '@/components/design/states'
import { Eyebrow, Small } from '@/components/design/typography'
import { VERDICT_LABELS, type ConvergenceActions } from './model'
import { AgentProgress } from './shared'

const SIDES = {
  pro: {
    label: '正方',
    stance: '這個需求是真的',
    icon: ThumbsUpIcon,
    surface: 'border-success-border bg-success-muted/40',
    accent: 'text-success',
  },
  con: {
    label: '反方',
    stance: '這個需求可能沒那麼真',
    icon: ThumbsDownIcon,
    surface: 'border-warning-border bg-warning-muted/40',
    accent: 'text-warning',
  },
} as const

const MODES: { value: DebateMode; label: string }[] = [
  { value: 'dialogue', label: '對話' },
  { value: 'analysis', label: '分析' },
]

const modeOf = (t: DebateTurn): DebateMode => t.mode ?? 'analysis'

type Side = DebateTurn['side']

/** The debate as it is drawn: runs of dialogue lines become one chat thread,
 * each analysis round its own pair of cards. */
type Block =
  | { kind: 'chat'; turns: DebateTurn[] }
  | { kind: 'analysis'; round: number; turns: DebateTurn[] }

function toBlocks(debate: DebateTurn[]): Block[] {
  const blocks: Block[] = []
  for (const t of debate) {
    const last = blocks.at(-1)
    if (modeOf(t) === 'dialogue') {
      if (last?.kind === 'chat') last.turns.push(t)
      else blocks.push({ kind: 'chat', turns: [t] })
    } else if (last?.kind === 'analysis' && last.round === t.round) {
      last.turns.push(t)
    } else {
      blocks.push({ kind: 'analysis', round: t.round, turns: [t] })
    }
  }
  return blocks
}

/**
 * 需求分析: a 正方 and a 反方 agent argue whether the need is real. Each click
 * is one more exchange of both, in either of two modes — 對話, one short line
 * each like two people across a table, or 分析, a full written argument each.
 * The two can be mixed in one debate. Neither agent concludes; the verdict at
 * the bottom is the user's.
 *
 * The controls sit under the transcript, chat-style, so the newest line is
 * always right above where the next one is asked for.
 */
export function DemandStage({
  project,
  actions,
  hasProvider,
}: {
  project: ConvergenceProject
  actions: ConvergenceActions
  hasProvider: boolean
}) {
  const [focus, setFocus] = useState('')
  const [mode, setMode] = useState<DebateMode>(
    project.debate.length ? modeOf(project.debate[project.debate.length - 1]) : 'dialogue',
  )
  const controls = useRef<HTMLDivElement>(null)
  const blocks = toBlocks(project.debate)
  const started = project.debate.length > 0
  const lastRound = project.debate.at(-1)?.round ?? 0

  // Keep the newest exchange and the input in view as the transcript grows —
  // only when it grows, not on mount: every page of the panel is mounted at
  // once, and scrolling from a page that isn't open would move the open one.
  const count = project.debate.length
  const seen = useRef(count)
  useEffect(() => {
    if (count > seen.current) {
      controls.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
    }
    seen.current = count
  }, [count])

  async function next() {
    if (await actions.run('debate', { focus: focus.trim(), mode })) setFocus('')
  }

  // 對話: the user can join on either side. Their line shows straight away,
  // dimmed, while the other side's answer is on its way; it only becomes part
  // of the stored debate together with that answer.
  const [userSide, setUserSide] = useState<Side>('pro')
  const [line, setLine] = useState('')
  const [pending, setPending] = useState<DebateTurn | null>(null)

  async function send() {
    const text = line.trim()
    if (!text || actions.busy) return
    setPending({
      side: userSide,
      speaker: 'user',
      round: lastRound + 1,
      mode: 'dialogue',
      argument: text,
      key_points: [],
      focus: null,
    })
    setLine('')
    const ok = await actions.run('debate/reply', { side: userSide, text })
    setPending(null)
    // A failed send gives the line back instead of losing what was typed.
    if (!ok) setLine(text)
  }

  const other = SIDES[userSide === 'pro' ? 'con' : 'pro'].label
  const lastBlock = blocks.at(-1)

  return (
    <div className="flex flex-col gap-6">
      {!started && !pending && actions.busy !== 'debate' && (
        <EmptyState
          icon={MessagesSquareIcon}
          eyebrow="還沒開始"
          title="讓正反兩方吵一吵"
          description="正方說這個需求是真的，反方找它可能不成立的地方。對話模式一人一句，你也可以選一邊加入；分析模式每輪寫完整論述。兩種可以混著用。"
        />
      )}

      {blocks.map((b, i) =>
        b.kind === 'chat' ? (
          <ChatThread
            key={`chat-${b.turns[0].round}`}
            turns={b.turns}
            pending={i === blocks.length - 1 ? pending : null}
          />
        ) : (
          <div key={`analysis-${b.round}`} className="flex flex-col gap-2">
            <Eyebrow>
              第 {b.round} 輪・分析
              {b.turns[0]?.focus && (
                <span className="ml-2 normal-case">聚焦：{b.turns[0].focus}</span>
              )}
            </Eyebrow>
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              {b.turns.map((t) => (
                <DebateCard key={t.side} turn={t} defaultOpen={i === blocks.length - 1} />
              ))}
            </div>
          </div>
        ),
      )}
      {pending && lastBlock?.kind !== 'chat' && <ChatThread turns={[]} pending={pending} />}

      <AgentProgress
        actions={actions}
        stage="debate"
        label={mode === 'dialogue' ? '正反方正在回話' : '正反方正在寫分析'}
        detail={mode === 'dialogue' ? '正方、反方各講一句' : `第 ${lastRound + 1} 輪`}
        onRetry={() => void next()}
      />
      <AgentProgress
        actions={actions}
        stage="debate/reply"
        label={`${pending ? SIDES[pending.side === 'pro' ? 'con' : 'pro'].label : other}正在回你`}
      />

      <div ref={controls} className="flex flex-col gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <SegmentedControl<DebateMode>
            aria-label="辯論模式"
            options={MODES}
            value={mode}
            onChange={setMode}
          />
          <Small className="text-xs">
            {mode === 'dialogue' ? '一人一句，你也可以選一邊加入' : '每一方寫完整論述與重點'}
          </Small>
          {started && (
            <Button
              variant="ghost"
              size="xs"
              className="ml-auto"
              disabled={actions.busy !== null}
              onClick={() => void actions.save({ debate: [] })}
            >
              <RotateCcwIcon />
              清掉重來
            </Button>
          )}
        </div>

        {mode === 'dialogue' ? (
          <>
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
              <SegmentedControl<Side>
                aria-label="你站哪一方"
                className="shrink-0"
                options={[
                  { value: 'pro', label: '我是正方' },
                  { value: 'con', label: '我是反方' },
                ]}
                value={userSide}
                onChange={setUserSide}
              />
              <Input
                value={line}
                onChange={(e) => setLine(e.target.value)}
                maxLength={300}
                placeholder={`以${SIDES[userSide].label}身份說一句，${other}會回你`}
                disabled={actions.busy !== null}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.nativeEvent.isComposing && hasProvider) void send()
                }}
              />
              <Button
                className="shrink-0"
                disabled={!hasProvider || !line.trim() || actions.busy !== null}
                onClick={() => void send()}
              >
                <SendIcon />
                送出
              </Button>
            </div>
            <div className="flex items-center gap-2">
              <Small className="text-xs">或者不加入，</Small>
              <Button
                variant="ai"
                size="sm"
                disabled={!hasProvider || actions.busy !== null}
                onClick={() => void next()}
              >
                <MessagesSquareIcon />
                {started ? '讓 AI 正反方再各講一句' : '讓 AI 正反方先開始'}
              </Button>
            </div>
          </>
        ) : (
          <div className="flex flex-col gap-2 sm:flex-row">
            <Input
              value={focus}
              onChange={(e) => setFocus(e.target.value)}
              placeholder={
                started
                  ? '這一輪要聚焦在什麼？（選填，例如：大家真的願意換掉現在的做法嗎）'
                  : '要特別聚焦的方向（選填）'
              }
              disabled={actions.busy !== null}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.nativeEvent.isComposing && hasProvider) void next()
              }}
            />
            <Button
              variant="ai"
              className="shrink-0"
              disabled={!hasProvider || actions.busy !== null}
              onClick={() => void next()}
            >
              <MessagesSquareIcon />
              {started ? '寫一輪完整分析' : '開始分析'}
            </Button>
          </div>
        )}
        {!hasProvider && (
          <Small className="text-xs">先在開始設定選一個 provider，才能請 AI 辯論。</Small>
        )}
      </div>

      <VerdictPanel project={project} actions={actions} />
    </div>
  )
}

/** 對話 lines as a chat: 反方 on the left, 正方 on the right. The user's own
 * lines sit on whichever side they spoke for, labelled 你. */
function ChatThread({ turns, pending }: { turns: DebateTurn[]; pending?: DebateTurn | null }) {
  const shown = pending ? [...turns, pending] : turns
  return (
    <div className="flex flex-col gap-2.5">
      {shown.map((t, i) => {
        const side = SIDES[t.side]
        const user = t.speaker === 'user'
        const Icon = user ? UserIcon : side.icon
        const right = t.side === 'pro'
        // A focus is set once per exchange; show it where that exchange starts.
        const focusStarts = t.focus && shown[i - 1]?.focus !== t.focus
        return (
          <div
            key={i}
            className={cn('flex flex-col gap-2.5', t === pending && 'opacity-60')}
          >
            {focusStarts && (
              <div className="flex items-center gap-2 text-2xs text-muted-foreground">
                <span className="h-px flex-1 bg-border" />
                聚焦：{t.focus}
                <span className="h-px flex-1 bg-border" />
              </div>
            )}
            <div className={cn('flex flex-col gap-1', right ? 'items-end' : 'items-start')}>
              <span
                className={cn('flex items-center gap-1 text-2xs font-semibold', side.accent)}
              >
                <Icon className="size-3" aria-hidden />
                {user ? `你・${side.label}` : side.label}
              </span>
              <p
                className={cn(
                  'max-w-[85%] rounded-2xl border px-3.5 py-2 text-sm leading-relaxed text-foreground/90 sm:max-w-[70%]',
                  side.surface,
                  // The user's lines get a heavier outline, so the human
                  // voice stands out from the two agents at a glance.
                  user && 'border-2 font-medium',
                  right ? 'rounded-tr-sm' : 'rounded-tl-sm',
                )}
              >
                {t.argument}
              </p>
            </div>
          </div>
        )
      })}
    </div>
  )
}

function DebateCard({ turn, defaultOpen }: { turn: DebateTurn; defaultOpen: boolean }) {
  const side = SIDES[turn.side]
  const Icon = side.icon
  return (
    <article className={cn('flex flex-col gap-2.5 rounded-xl border p-4', side.surface)}>
      <div className={cn('flex items-center gap-1.5 text-sm font-semibold', side.accent)}>
        <Icon className="size-4" aria-hidden />
        {side.label}
        <span className="font-normal text-muted-foreground">・{side.stance}</span>
      </div>
      {turn.key_points.length > 0 && (
        <ul className="flex list-disc flex-col gap-1 pl-5 text-sm font-medium text-foreground/90">
          {turn.key_points.map((p) => (
            <li key={p}>{p}</li>
          ))}
        </ul>
      )}
      <details open={defaultOpen} className="group/details">
        <summary className="cursor-pointer text-xs font-medium text-muted-foreground select-none hover:text-foreground">
          完整論述
        </summary>
        <AiMarkdown className="mt-2 text-sm">{turn.argument}</AiMarkdown>
      </details>
    </article>
  )
}

function VerdictPanel({
  project,
  actions,
}: {
  project: ConvergenceProject
  actions: ConvergenceActions
}) {
  const [notes, setNotes] = useState(project.demand_notes ?? '')
  return (
    <div className="flex flex-col gap-3 rounded-xl border border-brand-border bg-brand-muted/40 p-4">
      <div className="flex flex-col gap-1">
        <Eyebrow className="text-primary">你的判定</Eyebrow>
        <Small className="text-xs">
          AI 只負責把兩邊的論點攤開，需求成不成立由你決定。這個判定會帶進後面每一個 agent 的判斷。
        </Small>
      </div>
      <SegmentedControl<DemandVerdict | ''>
        aria-label="需求判定"
        className="w-full sm:w-auto sm:self-start"
        options={(Object.keys(VERDICT_LABELS) as DemandVerdict[]).map((v) => ({
          value: v,
          label: VERDICT_LABELS[v],
        }))}
        value={project.demand_verdict ?? ''}
        onChange={(v) => v && void actions.save({ demand_verdict: v })}
      />
      <Textarea
        value={notes}
        onChange={(e) => setNotes(e.target.value)}
        onBlur={() => {
          if (notes.trim() !== (project.demand_notes ?? '')) void actions.save({ demand_notes: notes })
        }}
        placeholder="為什麼這樣判定？還有什麼要去驗證的？（選填，離開欄位就會儲存）"
        className="min-h-16 text-sm"
      />
    </div>
  )
}
