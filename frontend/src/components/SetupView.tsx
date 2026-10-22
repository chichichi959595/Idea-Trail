import { useState } from 'react'
import { api } from '../api'
import { ArrowRightIcon, GaugeIcon } from 'lucide-react'
import {
  PROVIDER_IDS,
  PROVIDER_LABELS,
  PROVIDER_TAGLINES,
  PROVIDER_UNAVAILABLE_HINTS,
  type PainCheck,
  type ProviderId,
  type ProvidersHealth,
} from '../types'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Selectable } from '@/components/design/selectable'
import { Screen, ScreenBody, ScreenHeader } from '@/components/design/section'
import { StepPanel } from '@/components/design/step-panel'
import { Eyebrow, Small, Subhead } from '@/components/design/typography'
import { AiWorking } from '@/components/design/ai'
import { ErrorState, Notice } from '@/components/design/states'
import { DirectionFields, StartingPointFields, TeamFields } from './SessionIntake'
import type { Intake } from '../intake'

interface Props {
  intake: Intake
  onIntakeChange: (patch: Partial<Intake>) => void
  providersHealth: ProvidersHealth | undefined
  provider: string
  /** The 引導步驟 model — what the pain point check runs on. */
  stepModel: string
  /** Picking a provider is free now — nothing runs until a later screen asks
   * for it — so a click commits straight away instead of drafting. */
  onProviderChange: (p: string, model: string, stepModel: string) => void
  /** Saves the intake and moves on. With no destination: to 專案發想 when the
   * team has a pain point, to 痛點發想 when it doesn't. `discover` sends a team
   * whose pain point is still vague to 痛點發想 anyway. */
  onContinue: (destination?: 'discover') => void
  continuing: boolean
  continueError: string | null
}

type Role = 'deep' | 'step'

const ROLE_LABELS: Record<Role, string> = {
  deep: '深度推理',
  step: '引導步驟',
}

export function SetupView({
  intake,
  onIntakeChange,
  providersHealth,
  provider,
  stepModel,
  onProviderChange,
  onContinue,
  continuing,
  continueError,
}: Props) {
  // Each provider remembers its own model picks, so switching back and forth
  // doesn't silently reset the other one to its defaults. Two roles per
  // provider: 'deep' drives method selection and convergence, 'step' drives
  // the per-step agents.
  const [picks, setPicks] = useState<Record<string, Partial<Record<Role, string>>>>({})
  // The provider comes first now: the pain point check on page 4 runs on it,
  // so it has to be chosen before the team gets there.
  const [tab, setTab] = useState('provider')
  // The last check and the exact text it read. Only a verdict on the text as
  // it stands now counts — editing the pain point makes it stale, and the next
  // trip to 開始之前 checks again.
  const [check, setCheck] = useState<{
    text: string
    result: PainCheck | null
  } | null>(null)
  const [checking, setChecking] = useState(false)
  const [checkBlocked, setCheckBlocked] = useState<string | null>(null)

  function modelFor(p: ProviderId, role: Role) {
    const health = providersHealth?.[p]
    const fallback =
      role === 'deep'
        ? (health?.default_model ?? health?.models?.[0]?.id)
        : (health?.default_step_model ?? health?.default_model ?? health?.models?.[0]?.id)
    return picks[p]?.[role] ?? fallback ?? ''
  }

  function selectProvider(p: ProviderId) {
    if (providersHealth?.[p]?.ok === false) return
    onProviderChange(p, modelFor(p, 'deep'), modelFor(p, 'step'))
  }

  function changeModel(p: ProviderId, role: Role, nextModel: string) {
    setPicks((prev) => ({ ...prev, [p]: { ...prev[p], [role]: nextModel } }))
    // Changing a model on a card is choosing that card with that model.
    onProviderChange(
      p,
      role === 'deep' ? nextModel : modelFor(p, 'deep'),
      role === 'step' ? nextModel : modelFor(p, 'step'),
    )
  }

  const painText = intake.clearProblemText.trim()
  const hasPainPoint = intake.hasClearProblem === 'yes' && painText !== ''
  const current = provider as ProviderId | ''
  const verdict = hasPainPoint && check?.text === painText ? check : null

  /**
   * Every way onto 開始之前 — 下一步 from 起點 or a click on its tab — goes
   * through here, because that page is built from the check's verdict. A
   * pain point that hasn't been checked in its current wording is checked
   * first; `not_pain_point` keeps the team on 起點 with the reason under the
   * text box, anything else lets them through.
   */
  async function navigate(next: string) {
    if (checking) return
    setCheckBlocked(null)
    if (next !== 'ready' || !hasPainPoint || verdict) {
      setTab(next)
      return
    }
    if (!current) {
      setTab('start')
      setCheckBlocked('先到第 1 頁選額度來源，才能幫你們看這個痛點。')
      return
    }
    setTab('start')
    setChecking(true)
    try {
      const result = await api.checkPainPoint(painText, current, stepModel)
      setCheck({ text: painText, result })
      if (result.verdict !== 'not_pain_point') setTab('ready')
    } catch {
      // A check that couldn't run must not be what stops the team. They go
      // on as if it had passed, and 開始之前 says it wasn't checked.
      setCheck({ text: painText, result: null })
      setTab('ready')
    } finally {
      setChecking(false)
    }
  }

  const rejected = verdict?.result?.verdict === 'not_pain_point' ? verdict.result : null
  const problemNotice = checkBlocked ? (
    <Notice tone="info">{checkBlocked}</Notice>
  ) : rejected ? (
    <Notice tone="warning" title="這看起來還不是一個痛點">
      {rejected.feedback || '試著寫下「誰」在「什麼情況」遇到「什麼麻煩」。'}
    </Notice>
  ) : null

  const providerPicker = (
    <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
      {PROVIDER_IDS.map((p) => {
        const health = providersHealth?.[p]
        const unavailable = health?.ok === false
        const models = health?.models ?? []
        const selected = provider === p
        const deepModel = modelFor(p, 'deep')
        const stepModelFor = modelFor(p, 'step')
        const currentDescription = models.find((m) => m.id === deepModel)?.description
        // The CLI routes borrow a subscription but pay for it in latency —
        // say so on the card rather than letting the user discover it by
        // waiting through a run.
        const slow = health?.speed_tier === 'slow'

        return (
          <Selectable
            key={p}
            // The card contains its own `<select>` controls, which a
            // `<button>` may not — so it renders as a div that handles
            // keyboard selection itself.
            asDiv
            selected={selected}
            disabled={unavailable}
            onSelect={() => selectProvider(p)}
            className="gap-3 pr-11"
          >
            <div className="flex min-w-0 flex-col gap-1">
              <div className="flex flex-wrap items-center gap-1.5">
                <Subhead className="truncate">{PROVIDER_LABELS[p]}</Subhead>
                {unavailable && <Badge variant="soft">無法使用</Badge>}
                {!unavailable && slow && (
                  <Badge variant="warning">
                    <GaugeIcon aria-hidden />
                    較慢
                  </Badge>
                )}
              </div>
              {/* Clamped to a fixed two lines. These three cards are read
                  as a row, and an unavailable provider's longer hint used
                  to push its model pickers a line lower than the other
                  two, so the grid stopped scanning as a comparison. */}
              <Small className="line-clamp-2 min-h-9 text-xs">
                {unavailable ? PROVIDER_UNAVAILABLE_HINTS[p] : PROVIDER_TAGLINES[p]}
              </Small>
            </div>

            {/* Two model picks, not one. The step agents only judge whether
                an answer is on topic and jot a fragment or two, and they
                run once per step; convergence is what the team walks away
                with. Clicks stay off the card so opening a dropdown
                doesn't double as picking the card. */}
            <div
              className="flex flex-col gap-1.5"
              onClick={(e) => e.stopPropagation()}
              onKeyDown={(e) => e.stopPropagation()}
            >
              {(
                [
                  ['deep', deepModel],
                  ['step', stepModelFor],
                ] as const
              ).map(([role, value]) => (
                <div key={role} className="flex items-center gap-2">
                  <Eyebrow className="w-16 shrink-0">{ROLE_LABELS[role]}</Eyebrow>
                  <Select
                    value={value || undefined}
                    disabled={unavailable || models.length === 0}
                    onValueChange={(next) => changeModel(p, role, next)}
                  >
                    <SelectTrigger size="sm" className="min-w-0 flex-1 text-xs">
                      <SelectValue placeholder="（讀不到清單）" />
                    </SelectTrigger>
                    <SelectContent>
                      {models.map((m) => (
                        <SelectItem key={m.id} value={m.id}>
                          {m.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              ))}
            </div>

            {(currentDescription || (!unavailable && slow && health?.speed_note)) && (
              <div className="flex flex-col gap-1 border-t border-border pt-2.5">
                {currentDescription && (
                  <Small className="line-clamp-2 text-xs">{currentDescription}</Small>
                )}
                {!unavailable && slow && health?.speed_note && (
                  <Small className="flex gap-1.5 text-xs">
                    <GaugeIcon className="mt-0.5 size-3 shrink-0 text-warning" aria-hidden />
                    <span className="line-clamp-3">{health.speed_note}</span>
                  </Small>
                )}
              </div>
            )}
          </Selectable>
        )
      })}
    </div>
  )

  return (
    <Screen>
      <ScreenHeader
        title="開始設定"
        description="團隊條件跟要用誰的額度 — 接下來的痛點發想和專案發想都會讀這一頁。"
      />

      <ScreenBody className="gap-6">
        <StepPanel
          value={tab}
          onValueChange={navigate}
          pending={checking ? <AiWorking label="正在看這個痛點" /> : undefined}
          finish={
            continuing ? (
              <AiWorking label="正在存團隊條件" />
            ) : verdict?.result?.verdict === 'vague' ? (
              <>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={!current}
                  onClick={() => onContinue()}
                >
                  直接前往專案發想
                </Button>
                <Button size="sm" disabled={!current} onClick={() => onContinue('discover')}>
                  先用痛點發想釐清
                  <ArrowRightIcon />
                </Button>
              </>
            ) : (
              <Button size="sm" disabled={!current} onClick={() => onContinue()}>
                {hasPainPoint ? '前往專案發想' : '前往痛點發想'}
                <ArrowRightIcon />
              </Button>
            )
          }
          steps={[
            {
              id: 'provider',
              label: '額度來源',
              description:
                '選一張卡片跟要用的模型。這一步不會呼叫 AI，之後每一次呼叫都會用這裡選的。',
              done: current !== '',
              content: providerPicker,
            },
            {
              id: 'team',
              label: '團隊組成',
              description: '這些資訊只用來挑方法，填得粗略也沒關係，之後想改隨時可以回來改。',
              done: intake.teamSize.trim() !== '' && intake.techSelected.length > 0,
              content: <TeamFields value={intake} onChange={onIntakeChange} />,
            },
            {
              id: 'direction',
              label: '方向與限制',
              description: '想往哪些領域走、有哪些做不到或不想做的。都可以留空。',
              done: intake.domainSelected.length > 0 || intake.constraints.trim() !== '',
              content: <DirectionFields value={intake} onChange={onIntakeChange} />,
            },
            {
              id: 'start',
              label: '起點',
              description:
                '已經有痛點的話寫下來，按下一步時 AI 會很快看一眼；還沒有也沒關係，下一步會先陪你們找。',
              done: intake.hasClearProblem !== 'unknown' || intake.hasExistingProduct !== 'unknown',
              content: (
                <StartingPointFields
                  value={intake}
                  onChange={onIntakeChange}
                  problemNotice={problemNotice}
                />
              ),
            },
            {
              id: 'ready',
              label: '開始之前',
              description:
                '設定到這裡就完成了。接下來的每一步都會讀這幾頁填的內容，之後想改隨時可以回來。',
              content: (
                <ReadyPage hasPainPoint={hasPainPoint} painText={painText} verdict={verdict} />
              ),
            },
          ]}
        />

        {continueError && <ErrorState title="存不了團隊條件" detail={continueError} />}
      </ScreenBody>
    </Screen>
  )
}

/**
 * 開始之前: where the team stands, then a few words on how to approach what
 * comes next. The standing is the pain point check's verdict when there is a
 * pain point, and simply "you'll find one next" when there isn't.
 */
function ReadyPage({
  hasPainPoint,
  painText,
  verdict,
}: {
  hasPainPoint: boolean
  painText: string
  verdict: { text: string; result: PainCheck | null } | null
}) {
  const result = verdict?.result ?? null
  const quoted = <span className="font-medium text-foreground">「{painText}」</span>

  let standing: React.ReactNode
  if (!hasPainPoint) {
    standing = (
      <Notice tone="brand" title="下一步：痛點發想">
        還沒有明確的痛點很正常。接下來 AI
        會陪你們從日常的不方便裡找出值得解決的問題，找到之後再進專案發想。
      </Notice>
    )
  } else if (result?.verdict === 'vague') {
    standing = (
      <Notice tone="warning" title="這個痛點還有點模糊">
        <p>{quoted}</p>
        {result.feedback && <p className="mt-1">{result.feedback}</p>}
        <p className="mt-1">
          建議先用痛點發想把它想清楚——誰會遇到、什麼時候、為什麼困擾。你們也可以照現在的寫法直接開始。
        </p>
      </Notice>
    )
  } else if (result?.verdict === 'clear') {
    standing = (
      <Notice tone="success" title="痛點夠清楚，可以直接開始專案發想">
        <p>{quoted}</p>
        {result.feedback && <p className="mt-1">{result.feedback}</p>}
      </Notice>
    )
  } else {
    // No verdict: the check failed to run, or hasn't run yet because this page
    // is only mounted, not open.
    standing = (
      <Notice tone="info" title="下一步：專案發想">
        <p>{quoted}</p>
        {verdict && <p className="mt-1">這次沒能讓 AI 先看過這個痛點，會照你們寫的直接開始。</p>}
      </Notice>
    )
  }

  return (
    <div className="flex flex-col gap-6">
      {standing}
      <div className="flex flex-col gap-3">
        <Eyebrow>發想的時候記得</Eyebrow>
        <ul className="flex flex-col gap-2.5 text-sm">
          {READY_TIPS.map(([title, body]) => (
            <li key={title} className="flex gap-2.5">
              <span aria-hidden className="mt-2 size-1.5 shrink-0 rounded-full bg-primary" />
              <span>
                <span className="font-medium">{title}</span>
                <span className="text-muted-foreground">：{body}</span>
              </span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  )
}

const READY_TIPS: [string, string][] = [
  ['先求多，再求好', '前面的點子不用完美，量夠多，好的才會冒出來。'],
  ['AI 是陪練，不是裁判', '它會幫你們整理、延伸，但要做什麼由你們決定。'],
  ['卡住就換個方法', '同一個問題換一種想法，常常就通了。'],
]
