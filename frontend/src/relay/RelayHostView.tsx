import { useEffect, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { QRCodeSVG } from 'qrcode.react'
import {
  CheckIcon,
  CopyIcon,
  PlayIcon,
  RotateCcwIcon,
  SkipForwardIcon,
  TimerIcon,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Checkbox } from '@/components/ui/checkbox'
import { Screen, ScreenBody, ScreenFooter, ScreenHeader, Section } from '@/components/design/section'
import { Eyebrow, Mono, Small } from '@/components/design/typography'
import { ErrorState, Notice } from '@/components/design/states'
import { relayApi } from './api'
import { ChainWall } from './ChainWall'
import { useDeadline } from './useDeadline'
import type { JoinOrigins, RelayHostState } from './types'

/**
 * The laptop side of 多人接龍: the QR code, the roster, the round clock, and
 * the reveal wall.
 *
 * This screen is also the activity's clock. Rounds close lazily, on the next
 * request after they're over (see backend/app/api/relay.py), and this poll is
 * the request that's always there — so it keeps polling the whole time a round
 * is open, not only to redraw.
 */

const POLL_MS = 1000

/**
 * The run tab when the chosen method is 多人接龍. The run already exists — it
 * was opened from the setup screen like any other method's — so this starts
 * at the lobby.
 */
export function RelayHostView({
  runId,
  onProgress,
  onRestart,
  restarting,
}: {
  runId: number
  /** Reports status and round back up, so the rail's progress stays in step
   * with a run that's advanced by the room rather than by this screen. */
  onProgress: (
    status: RelayHostState['status'],
    roundIndex: number,
    rounds: number | null,
  ) => void
  /** Opens a fresh run of the same method, for another round with the room. */
  onRestart: () => void
  restarting: boolean
}) {
  const queryClient = useQueryClient()
  const queryKey = ['relay-host', runId]
  const { data: run, error } = useQuery({
    queryKey,
    queryFn: () => relayApi.get(runId),
    refetchInterval: (q) => (q.state.data?.status === 'revealed' ? false : POLL_MS),
    // Keep ticking with the tab in the background — the host flipping to
    // their slides mustn't stop rounds from closing on time.
    refetchIntervalInBackground: true,
  })
  const [acting, setActing] = useState(false)
  const [actionError, setActionError] = useState<string | null>(null)

  const status = run?.status
  const roundIndex = run?.round_index
  const rounds = run?.rounds ?? null
  useEffect(() => {
    if (status !== undefined && roundIndex !== undefined) onProgress(status, roundIndex, rounds)
    // Only when the run actually moves, not on every parent render.
    // oxlint-disable-next-line react-hooks/exhaustive-deps
  }, [status, roundIndex, rounds])

  async function act(fn: () => Promise<RelayHostState>) {
    setActing(true)
    setActionError(null)
    try {
      queryClient.setQueryData(queryKey, await fn())
    } catch (e) {
      setActionError(e instanceof Error ? e.message : String(e))
    } finally {
      setActing(false)
    }
  }

  if (!run) {
    return (
      <Screen>
        <ScreenHeader title="多人接龍" />
        <ScreenBody>
          {error ? (
            <ErrorState title="讀不到這一場" detail={String(error)} />
          ) : (
            <Small>載入中…</Small>
          )}
        </ScreenBody>
      </Screen>
    )
  }

  if (run.status === 'lobby') {
    return (
      <Lobby
        run={run}
        acting={acting}
        error={actionError}
        onStart={() => act(() => relayApi.start(runId))}
      />
    )
  }
  if (run.status === 'writing') {
    return (
      <Writing
        run={run}
        acting={acting}
        error={actionError}
        onAdvance={() => act(() => relayApi.advance(runId))}
      />
    )
  }
  return <Reveal run={run} onRestart={onRestart} restarting={restarting} />
}

// --------------------------------------------------------------------------
// lobby
// --------------------------------------------------------------------------

type OriginChoice = 'ngrok' | 'lan'

function Lobby({
  run,
  acting,
  error,
  onStart,
}: {
  run: RelayHostState
  acting: boolean
  error: string | null
  onStart: () => void
}) {
  // Re-read now and then: an ngrok tunnel started after the lobby opened
  // should show up without a reload.
  const { data: origins } = useQuery({
    queryKey: ['relay-join-origins'],
    queryFn: relayApi.joinOrigins,
    refetchInterval: 5000,
  })
  const [choice, setChoice] = useState<OriginChoice | null>(null)
  const effective: OriginChoice | null =
    choice ?? (origins?.ngrok_url ? 'ngrok' : origins?.lan_ip ? 'lan' : null)
  const origin = originFor(effective, origins)
  const joinUrl = origin ? `${origin}/join/${run.join_code}` : null
  const reachable = useReachable(effective === 'lan' ? origin : null)

  const n = run.participants.length
  const enough = n >= run.min_participants

  return (
    <Screen>
      <ScreenHeader
        title="多人接龍"
        description="手機掃 QR code 加入，到齊了就按開始。"
        meta={
          <Small data-numeric className="text-xs">
            {n} 人
          </Small>
        }
      />
      <ScreenBody>
        <div className="grid gap-8 md:grid-cols-[auto_minmax(0,1fr)]">
          <div className="flex flex-col items-center gap-4">
            {/* Always dark-on-white, whatever the theme — see `--qr-surface`. */}
            <div className="rounded-2xl border border-qr-border bg-qr-surface p-4 text-qr-foreground shadow-sm">
              {joinUrl ? (
                <QRCodeSVG value={joinUrl} size={232} marginSize={0} />
              ) : (
                <div className="flex size-[232px] items-center justify-center text-center text-sm text-qr-muted-foreground">
                  找不到這台電腦的網路位址
                </div>
              )}
            </div>
            <div className="flex flex-col items-center gap-1">
              <Eyebrow>代碼</Eyebrow>
              <span className="font-mono text-4xl font-semibold tracking-[0.25em]">
                {run.join_code}
              </span>
            </div>
          </div>

          <div className="flex min-w-0 flex-col gap-6">
            <Section className="gap-3">
              <Eyebrow>手機從哪裡連進來</Eyebrow>
              <div className="flex flex-wrap gap-2">
                <OriginButton
                  active={effective === 'lan'}
                  disabled={!origins?.lan_ip}
                  onClick={() => setChoice('lan')}
                  label="同一個 Wi-Fi"
                />
                <OriginButton
                  active={effective === 'ngrok'}
                  disabled={!origins?.ngrok_url}
                  onClick={() => setChoice('ngrok')}
                  label="ngrok"
                />
              </div>
              {joinUrl && <JoinLink url={joinUrl} />}
              <OriginHint choice={effective} origins={origins} reachable={reachable} />
            </Section>

            <Section className="gap-3">
              <Eyebrow data-numeric>
                已加入 · {n} 人{!enough && `（至少 ${run.min_participants} 人）`}
              </Eyebrow>
              {n === 0 ? (
                <Small>還沒有人加入。</Small>
              ) : (
                <ul className="flex flex-wrap gap-2" aria-live="polite">
                  {run.participants.map((p) => (
                    <li
                      key={p.id}
                      className="animate-in fade-in zoom-in-95 rounded-full border border-border bg-surface px-3 py-1 text-sm shadow-xs duration-200"
                    >
                      {p.display_name}
                    </li>
                  ))}
                </ul>
              )}
            </Section>

            {error && <ErrorState title="開始不了" detail={error} />}
          </div>
        </div>
      </ScreenBody>
      <ScreenFooter>
        <Small className="text-xs">
          {enough
            ? `開始後座位就固定了，晚到的人只能用看的。共 ${run.rungs.length} 輪${
                run.rungs.length < 3 ? '（兩個人時縮成兩層，再多一人就是完整的三層）' : ''
              }。`
            : `再等 ${run.min_participants - n} 個人才能開始。`}
        </Small>
        <Button size="lg" disabled={!enough || acting} onClick={onStart}>
          <PlayIcon />
          開始
        </Button>
      </ScreenFooter>
    </Screen>
  )
}

function originFor(choice: OriginChoice | null, origins: JoinOrigins | undefined) {
  if (!origins || !choice) return null
  if (choice === 'ngrok') return origins.ngrok_url
  if (!origins.lan_ip) return null
  const port = window.location.port ? `:${window.location.port}` : ''
  return `${window.location.protocol}//${origins.lan_ip}${port}`
}

/**
 * Whether this laptop can load its own LAN address. If it can't, no phone
 * can either — almost always because the dev server was started without
 * `--host` and is only listening on localhost. A `no-cors` fetch can't read
 * the response, but it does fail outright when nothing is listening.
 */
function useReachable(origin: string | null): boolean | null {
  const [ok, setOk] = useState<boolean | null>(null)
  useEffect(() => {
    if (!origin) {
      setOk(null)
      return
    }
    let cancelled = false
    setOk(null)
    const abort = new AbortController()
    const timer = setTimeout(() => abort.abort(), 2000)
    fetch(origin, { mode: 'no-cors', signal: abort.signal })
      .then(() => !cancelled && setOk(true))
      .catch(() => !cancelled && setOk(false))
      .finally(() => clearTimeout(timer))
    return () => {
      cancelled = true
      abort.abort()
    }
  }, [origin])
  return ok
}

function OriginButton({
  active,
  disabled,
  onClick,
  label,
}: {
  active: boolean
  disabled: boolean
  onClick: () => void
  label: string
}) {
  return (
    <Button
      variant={active ? 'soft' : 'outline'}
      size="sm"
      disabled={disabled}
      onClick={onClick}
      aria-pressed={active}
    >
      {active && <CheckIcon />}
      {label}
    </Button>
  )
}

function JoinLink({ url }: { url: string }) {
  const [copied, setCopied] = useState(false)
  return (
    <div className="flex min-w-0 items-center gap-2 rounded-lg border border-border bg-muted px-3 py-2">
      <Mono className="min-w-0 flex-1 truncate">{url}</Mono>
      <Button
        variant="ghost"
        size="icon-xs"
        aria-label="複製連結"
        onClick={async () => {
          try {
            await navigator.clipboard.writeText(url)
            setCopied(true)
            setTimeout(() => setCopied(false), 1500)
          } catch {
            // Clipboard blocked; the URL is on screen to read off anyway.
          }
        }}
      >
        {copied ? <CheckIcon /> : <CopyIcon />}
      </Button>
    </div>
  )
}

function OriginHint({
  choice,
  origins,
  reachable,
}: {
  choice: OriginChoice | null
  origins: JoinOrigins | undefined
  reachable: boolean | null
}) {
  if (!origins) return null
  if (choice === 'lan' && reachable === false) {
    return (
      <Notice tone="warning" title="手機連不到這個位址">
        前端只聽在 localhost 上。改用 <Mono>pnpm dev:team</Mono> 重新啟動前端，讓同一個 Wi-Fi
        的手機連得進來。
      </Notice>
    )
  }
  if (choice === 'ngrok') {
    return (
      <Small className="text-xs">
        免費版 ngrok 第一次打開時會先跳一頁警告，按「Visit Site」就會進來，之後不會再出現。
      </Small>
    )
  }
  if (!origins.ngrok_url) {
    return (
      <Small className="text-xs">
        手機要在同一個 Wi-Fi。不在同一個網路的話，另開終端機跑 <Mono>ngrok http 5173</Mono>
        ，這裡會自動出現 ngrok 選項。
      </Small>
    )
  }
  return null
}

// --------------------------------------------------------------------------
// writing
// --------------------------------------------------------------------------

function Writing({
  run,
  acting,
  error,
  onAdvance,
}: {
  run: RelayHostState
  acting: boolean
  error: string | null
  onAdvance: () => void
}) {
  const remaining = useDeadline(run)
  const progress = run.progress ?? { submitted: 0, total: 0 }
  const rounds = run.rounds ?? run.rungs.length
  const isLast = run.round_index + 1 >= rounds
  const pct = progress.total ? (progress.submitted / progress.total) * 100 : 0

  return (
    <Screen>
      <ScreenHeader
        title="多人接龍"
        description={`代碼 ${run.join_code} · ${run.participants.length} 條鏈同時在長`}
        meta={
          <Small data-numeric className="text-xs">
            第 {run.round_index + 1} / {rounds} 輪
          </Small>
        }
      />
      <ScreenBody>
        <Section className="gap-8">
          {/* The ladder, with this round lit. Everyone in the room is on the
              same rung, so it's what the projector should be showing. */}
          <ol className={cn('grid gap-2', rounds === 2 ? 'sm:grid-cols-2' : 'sm:grid-cols-3')}>
            {run.rungs.slice(0, rounds).map((rung, i) => (
              <li
                key={i}
                className={cn(
                  'flex flex-col gap-1 rounded-xl border p-4 transition-colors duration-200',
                  i === run.round_index
                    ? 'border-primary/45 bg-brand-muted'
                    : i < run.round_index
                      ? 'border-border opacity-60'
                      : 'border-dashed border-border',
                )}
              >
                <Eyebrow data-numeric className={i === run.round_index ? 'text-primary' : ''}>
                  第 {i + 1} 輪{i < run.round_index && ' · 完成'}
                </Eyebrow>
                <span className="text-sm leading-snug text-pretty">{rung.question}</span>
              </li>
            ))}
          </ol>

          <div className="flex flex-col items-center gap-3 py-4 text-center">
            <span
              data-numeric
              className={cn(
                'inline-flex items-center gap-2 font-mono text-6xl font-semibold tabular-nums',
                remaining !== null && remaining <= 10 && 'text-warning',
              )}
            >
              <TimerIcon className="size-10 opacity-60" aria-hidden />
              {remaining ?? '—'}
            </span>
            <Small data-numeric aria-live="polite" className="text-base">
              已交 {progress.submitted} / {progress.total}
            </Small>
            <div className="h-2 w-full max-w-sm overflow-hidden rounded-full bg-muted">
              <div
                className="h-full rounded-full bg-primary transition-[width] duration-300"
                style={{ width: `${pct}%` }}
              />
            </div>
          </div>

          {error && <ErrorState title="換不了輪" detail={error} />}
        </Section>
      </ScreenBody>
      <ScreenFooter>
        <Small className="text-xs">全員交齊或時間到就自動換下一輪，沒交的格子會空著往下傳。</Small>
        <Button variant="outline" size="lg" disabled={acting} onClick={onAdvance}>
          <SkipForwardIcon />
          {isLast ? '提早結束並公布' : '提早進下一輪'}
        </Button>
      </ScreenFooter>
    </Screen>
  )
}

// --------------------------------------------------------------------------
// reveal
// --------------------------------------------------------------------------

function Reveal({
  run,
  onRestart,
  restarting,
}: {
  run: RelayHostState
  onRestart: () => void
  restarting: boolean
}) {
  // Off by default. Whether names belong on a projected wall is still an open
  // question (`發散/多人接龍.md`); naming people can make them hold back.
  const [showAuthors, setShowAuthors] = useState(false)
  const chains = run.chains ?? []
  const flagged = chains.flatMap((c) => c.cells).filter((c) => c.flagged_unclear).length

  return (
    <Screen>
      <ScreenHeader
        title="公布"
        description="同一份題目、不同的起點。看看哪幾條撞到同一個卡點，哪一條轉了最大的彎。"
        meta={
          <div className="flex items-center gap-2">
            {flagged > 0 && <Badge variant="warning">{flagged} 格有人看不懂</Badge>}
            <Small data-numeric className="text-xs">
              {chains.length} 條鏈
            </Small>
          </div>
        }
      />
      <ScreenBody>
        <Section>
          {chains.length === 0 ? (
            <Notice>這一場沒有任何一格被寫下來。</Notice>
          ) : (
            <ChainWall chains={chains} showAuthors={showAuthors} />
          )}
        </Section>
      </ScreenBody>
      <ScreenFooter>
        <label className="flex cursor-pointer items-center gap-2 text-sm text-muted-foreground">
          <Checkbox checked={showAuthors} onCheckedChange={(v) => setShowAuthors(v === true)} />
          顯示每一格是誰寫的
        </label>
        <Button variant="outline" size="lg" disabled={restarting} onClick={onRestart}>
          <RotateCcwIcon />
          再開一場
        </Button>
      </ScreenFooter>
    </Screen>
  )
}
