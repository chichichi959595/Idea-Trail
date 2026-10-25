import { useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { CheckIcon, HelpCircleIcon, SendIcon, TimerIcon } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Loader } from '@/components/ui/loader'
import { BrandLockup } from '@/components/design/brand'
import { Eyebrow, Heading, Small, Title } from '@/components/design/typography'
import { Notice } from '@/components/design/states'
import { relayApi, RelayError } from './api'
import { ChainWall } from './ChainWall'
import { useDeadline } from './useDeadline'
import type { RelayPhoneState, RelayRound } from './types'

/**
 * A participant's phone. Four states and nothing else: give your name, wait,
 * write, wait — then the reveal.
 *
 * Deliberately dumb. Everything that decides what this phone may see is on the
 * server; this only renders it and polls. There's no account: the token from
 * joining is kept in localStorage per join code, so a reload (or a phone that
 * locked itself) lands back in the same seat.
 */

const POLL_MS = 1500

const tokenKey = (code: string) => `relay:${code}`

function readToken(code: string): string | null {
  try {
    return localStorage.getItem(tokenKey(code))
  } catch {
    return null
  }
}

function writeToken(code: string, token: string | null) {
  try {
    if (token) localStorage.setItem(tokenKey(code), token)
    else localStorage.removeItem(tokenKey(code))
  } catch {
    // Private mode: the seat just won't survive a reload.
  }
}

const messageOf = (e: unknown) => (e instanceof Error ? e.message : String(e))

export function JoinApp({ code: initialCode }: { code?: string }) {
  const [code, setCode] = useState(initialCode ?? '')
  const [token, setToken] = useState<string | null>(() =>
    initialCode ? readToken(initialCode) : null,
  )

  if (!code) {
    return (
      <PhoneFrame>
        <CodeForm
          onSubmit={(c) => {
            window.history.replaceState(null, '', `/?join=${c}`)
            setCode(c)
            setToken(readToken(c))
          }}
        />
      </PhoneFrame>
    )
  }

  if (!token) {
    return (
      <PhoneFrame>
        <NameForm
          code={code}
          onJoined={(t) => {
            writeToken(code, t)
            setToken(t)
          }}
        />
      </PhoneFrame>
    )
  }

  return (
    <PhoneFrame>
      <Seat
        code={code}
        token={token}
        onLost={() => {
          writeToken(code, null)
          setToken(null)
        }}
      />
    </PhoneFrame>
  )
}

function PhoneFrame({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-svh flex-col bg-background">
      <header className="flex items-center border-b border-border px-4 py-3">
        <BrandLockup compact />
      </header>
      <main className="mx-auto flex w-full max-w-md flex-1 flex-col gap-6 px-4 py-6">
        {children}
      </main>
    </div>
  )
}

function CodeForm({ onSubmit }: { onSubmit: (code: string) => void }) {
  const [value, setValue] = useState('')
  const clean = value.trim().toUpperCase()
  return (
    <form
      className="flex flex-col gap-5"
      onSubmit={(e) => {
        e.preventDefault()
        if (clean) onSubmit(clean)
      }}
    >
      <div className="flex flex-col gap-1.5">
        <Title>多人接龍</Title>
        <Small>輸入大螢幕上的四碼代碼。</Small>
      </div>
      <Input
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder="例如 K7QX"
        autoCapitalize="characters"
        autoComplete="off"
        maxLength={10}
        className="h-12 text-center font-mono text-2xl tracking-[0.3em] uppercase"
        aria-label="代碼"
      />
      <Button type="submit" size="xl" disabled={!clean}>
        下一步
      </Button>
    </form>
  )
}

function NameForm({ code, onJoined }: { code: string; onJoined: (token: string) => void }) {
  const [name, setName] = useState('')
  const [joining, setJoining] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const { data: peek, error: peekError } = useQuery({
    queryKey: ['relay-peek', code],
    queryFn: () => relayApi.peek(code),
    retry: false,
  })

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    const clean = name.trim()
    if (!clean) return
    setJoining(true)
    setError(null)
    try {
      const res = await relayApi.join(code, clean)
      onJoined(res.token)
    } catch (err) {
      setError(messageOf(err))
    } finally {
      setJoining(false)
    }
  }

  if (peekError) {
    return <Notice tone="destructive" title="進不去這一場">{messageOf(peekError)}</Notice>
  }
  if (peek && peek.status !== 'lobby') {
    return (
      <Notice tone="warning" title="這一場已經開始了">
        接龍開始之後就不能再加入，下一場再一起來。
      </Notice>
    )
  }

  return (
    <form className="flex flex-col gap-5" onSubmit={handleSubmit}>
      <div className="flex flex-col gap-1.5">
        <Eyebrow>代碼 {code}</Eyebrow>
        <Title>你叫什麼名字？</Title>
        <Small>主持人的畫面上會出現這個名字。</Small>
      </div>
      <Input
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="暱稱就好"
        maxLength={50}
        autoFocus
        className="h-12 text-lg"
        aria-label="名字"
      />
      {error && <Notice tone="destructive">{error}</Notice>}
      <Button type="submit" size="xl" disabled={!name.trim() || joining}>
        {joining ? '加入中…' : '加入'}
      </Button>
    </form>
  )
}

function Seat({ code, token, onLost }: { code: string; token: string; onLost: () => void }) {
  const queryClient = useQueryClient()
  const queryKey = ['relay-me', code, token]
  const { data: state, error } = useQuery({
    queryKey,
    queryFn: () => relayApi.me(code, token),
    // The reveal is the end state; nothing changes after it.
    refetchInterval: (q) => (q.state.data?.status === 'revealed' ? false : POLL_MS),
    // A phone that wandered to another tab should still see its round open,
    // and still hand in on time.
    refetchIntervalInBackground: true,
    retry: (count, err) => !(err instanceof RelayError && err.status === 401) && count < 3,
  })

  useEffect(() => {
    // The seat is gone (a different run took this code, or the DB was reset).
    if (error instanceof RelayError && (error.status === 401 || error.status === 404)) onLost()
  }, [error, onLost])

  const update = (next: RelayPhoneState) => queryClient.setQueryData(queryKey, next)

  if (!state) {
    if (error) {
      return <Notice tone="destructive" title="連不上主持人的電腦">{messageOf(error)}</Notice>
    }
    return <Waiting title="連線中…" />
  }

  if (state.status === 'lobby') {
    return (
      <Waiting
        eyebrow={`嗨，${state.me.display_name}`}
        title="等主持人開始"
        detail={`已經有 ${state.participant_count} 個人`}
      />
    )
  }

  if (state.status === 'revealed') {
    return (
      <div className="flex flex-col gap-5">
        <div className="flex flex-col gap-1.5">
          <Eyebrow>公布</Eyebrow>
          <Heading>所有的鏈</Heading>
          <Small>這些是大家同時寫出來的。接下來看大螢幕一起討論。</Small>
        </div>
        <ChainWall chains={state.chains ?? []} className="sm:grid-cols-1 xl:grid-cols-1" />
      </div>
    )
  }

  const round = state.round!
  if (round.submitted) {
    return (
      <Waiting
        eyebrow={`第 ${round.round_index + 1} / ${round.rounds} 輪`}
        title="交出去了"
        detail={`已交 ${round.progress.submitted} / ${round.progress.total}，等其他人`}
        done
      />
    )
  }

  return (
    // Keyed by cell so the draft, the auto-submit latch and the countdown all
    // start over when the next paper arrives.
    <WriteRound key={round.cell_id} code={code} token={token} round={round} onUpdate={update} />
  )
}

function Waiting({
  eyebrow,
  title,
  detail,
  done = false,
}: {
  eyebrow?: string
  title: string
  detail?: string
  done?: boolean
}) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-3 text-center">
      {done ? (
        <span className="flex size-11 items-center justify-center rounded-full bg-success-muted text-success">
          <CheckIcon className="size-5" aria-hidden />
        </span>
      ) : (
        <Loader variant="pulse-dot" size="md" className="text-primary" />
      )}
      {eyebrow && <Eyebrow>{eyebrow}</Eyebrow>}
      <Heading>{title}</Heading>
      {detail && (
        <Small data-numeric aria-live="polite">
          {detail}
        </Small>
      )}
    </div>
  )
}

const draftKey = (cellId: number) => `relay-draft:${cellId}`

function WriteRound({
  code,
  token,
  round,
  onUpdate,
}: {
  code: string
  token: string
  round: RelayRound
  onUpdate: (state: RelayPhoneState) => void
}) {
  // Kept in sessionStorage too, so a reload mid-round doesn't lose the draft.
  const [draft, setDraft] = useState(() => {
    try {
      return sessionStorage.getItem(draftKey(round.cell_id)) ?? ''
    } catch {
      return ''
    }
  })
  const [sending, setSending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const sent = useRef(false)
  const remaining = useDeadline(round)

  useEffect(() => {
    try {
      sessionStorage.setItem(draftKey(round.cell_id), draft)
    } catch {
      // Not worth telling anyone about.
    }
  }, [draft, round.cell_id])

  async function send(text: string) {
    if (sent.current) return
    sent.current = true
    setSending(true)
    setError(null)
    try {
      onUpdate(await relayApi.submit(code, token, round.cell_id, text))
    } catch (err) {
      // 409 = the round closed under us; the next poll moves the screen on.
      if (!(err instanceof RelayError && err.status === 409)) {
        sent.current = false
        setError(messageOf(err))
      }
    } finally {
      setSending(false)
    }
  }

  // Time's up: hand in whatever is in the box, even nothing. The next person
  // gets a paper with a gap and carries on; nobody waits on this phone.
  useEffect(() => {
    if (remaining === 0) void send(draft)
    // Keyed on the clock alone: re-running on every keystroke would submit
    // the moment anything was typed after zero. `send` latches itself.
    // oxlint-disable-next-line react-hooks/exhaustive-deps
  }, [remaining])

  async function toggleFlag(cellId: number, flagged: boolean) {
    try {
      onUpdate(await relayApi.flag(code, token, cellId, flagged))
    } catch (err) {
      setError(messageOf(err))
    }
  }

  const timeUp = remaining === 0
  const isFirst = round.paper.length === 0

  return (
    <form
      className="flex flex-col gap-5"
      onSubmit={(e) => {
        e.preventDefault()
        if (draft.trim()) void send(draft)
      }}
    >
      <div className="flex items-center justify-between gap-3">
        <Eyebrow data-numeric>
          第 {round.round_index + 1} / {round.rounds} 輪
        </Eyebrow>
        {remaining !== null && <PhoneCountdown remaining={remaining} />}
      </div>

      {isFirst ? (
        <Small>你手上是一張白紙，由你寫下第一層。</Small>
      ) : (
        <section aria-label="手上這張紙" className="flex flex-col gap-2">
          <Eyebrow>手上這張紙</Eyebrow>
          <ol className="flex flex-col gap-2">
            {round.paper.map((layer) => (
              <li
                key={layer.cell_id}
                className="flex flex-col gap-1.5 rounded-xl border border-border bg-muted/60 px-3.5 py-3"
              >
                <span className="text-2xs text-muted-foreground">{layer.question}</span>
                {layer.answer ? (
                  <p className="text-base leading-relaxed whitespace-pre-wrap">{layer.answer}</p>
                ) : (
                  <p className="text-sm text-muted-foreground/70 italic">
                    （這一層空著，自由發揮）
                  </p>
                )}
                {layer.answer && (
                  <button
                    type="button"
                    onClick={() => toggleFlag(layer.cell_id, !layer.flagged_unclear)}
                    aria-pressed={layer.flagged_unclear}
                    className={cn(
                      'inline-flex w-fit items-center gap-1 rounded-full px-2 py-0.5 text-2xs font-medium transition-colors',
                      'focus-visible:ring-[3px] focus-visible:ring-ring focus-visible:outline-none',
                      layer.flagged_unclear
                        ? 'bg-warning-muted text-warning'
                        : 'text-muted-foreground hover:bg-accent',
                    )}
                  >
                    <HelpCircleIcon className="size-3" aria-hidden />
                    {layer.flagged_unclear ? '已標「看不懂」' : '這個我看不懂'}
                  </button>
                )}
              </li>
            ))}
          </ol>
        </section>
      )}

      {/* The newest layer is the one being written, so it carries the most
          weight on screen — below the paper, not above it. */}
      <div className="flex flex-col gap-2.5 rounded-xl border-2 border-primary/40 bg-surface p-3.5">
        <p className="text-lg leading-snug font-medium text-pretty">{round.question}</p>
        {!isFirst && (
          <Small className="text-xs">往下接一層就好，不用修改上面已經寫的。</Small>
        )}
        <Textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          disabled={timeUp || sending}
          maxLength={500}
          rows={3}
          placeholder="一兩句話就夠"
          className="min-h-24 text-base"
          aria-label={round.question}
        />
      </div>

      {error && <Notice tone="destructive">{error}</Notice>}

      <Button type="submit" size="xl" disabled={!draft.trim() || timeUp || sending}>
        <SendIcon />
        {sending ? '交出中…' : timeUp ? '時間到，交出中…' : '交出去'}
      </Button>
    </form>
  )
}

function PhoneCountdown({ remaining }: { remaining: number }) {
  return (
    <span
      data-numeric
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-sm font-medium tabular-nums',
        remaining === 0
          ? 'border-destructive-border bg-destructive-muted text-destructive'
          : remaining <= 10
            ? 'border-warning-border bg-warning-muted text-warning'
            : 'border-border bg-muted text-muted-foreground',
      )}
    >
      <TimerIcon className="size-4" aria-hidden />
      {remaining === 0 ? '時間到' : `${remaining} 秒`}
    </span>
  )
}
