import { useState } from 'react'
import { ArrowRightIcon, ChevronDownIcon, GaugeIcon, WandSparklesIcon } from 'lucide-react'
import {
  PROVIDER_IDS,
  PROVIDER_LABELS,
  PROVIDER_TAGLINES,
  PROVIDER_UNAVAILABLE_HINTS,
  type MethodRecommendation,
  type ProviderId,
  type ProvidersHealth,
} from '../types'
import { useMethodCatalog } from '../useMethodCatalog'
import { cn } from '@/lib/utils'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible'
import { Selectable } from '@/components/design/selectable'
import { Page, Section, SectionHeader, StickyFooter } from '@/components/design/section'
import { Eyebrow, Small, Subhead } from '@/components/design/typography'
import { EmptyState, ErrorState, Notice, RowSkeleton } from '@/components/design/states'
import { AiMarkdown, AiReasoning, AiWorking } from '@/components/design/ai'

interface Props {
  recommendations: MethodRecommendation[]
  ruleRanking: string[]
  adjustmentNote: string
  providersHealth: ProvidersHealth | undefined
  provider: string
  model: string
  stepModel: string
  onProviderChange: (p: string, model: string, stepModel: string) => void
  recommending: boolean
  thinking: string
  recommendError: string | null
  /** Starts the run with the settings showing on this screen, rather than with
   * whatever the last AI recommendation happened to use — picking a method by
   * hand must not require having paid for a recommendation first. */
  onStart: (method: string, provider: string, model: string, stepModel: string) => void
  starting: boolean
}

type Role = 'deep' | 'step'

const ROLE_LABELS: Record<Role, string> = {
  deep: '收斂／推薦',
  step: '引導步驟',
}

export function MethodSelectorView({
  recommendations,
  ruleRanking,
  adjustmentNote,
  providersHealth,
  provider,
  model,
  stepModel,
  onProviderChange,
  recommending,
  thinking,
  recommendError,
  onStart,
  starting,
}: Props) {
  const { methods: allMethods, get, labelOf } = useMethodCatalog()
  const [selectedMethod, setSelectedMethod] = useState<string | null>(null)
  // Each provider remembers its own model picks, so switching back and forth
  // doesn't silently reset the other one to its defaults. Two roles per
  // provider: 'deep' drives method selection and convergence, 'step' drives
  // the per-step agents.
  const [picks, setPicks] = useState<Record<string, Partial<Record<Role, string>>>>({})
  // What the user has clicked, as opposed to what is actually running.
  //
  // Clicking a card used to be the trigger for the AI call. That made an
  // exploratory click — or a second thought about which model — cost a real
  // call, and on the CLI routes that is a minute of waiting the user never
  // asked for. So the click only drafts; the button below commits.
  const [draft, setDraft] = useState<ProviderId | ''>((provider as ProviderId) || '')

  function modelFor(p: ProviderId, role: Role) {
    const health = providersHealth?.[p]
    const fallback =
      role === 'deep'
        ? (health?.default_model ?? health?.models?.[0]?.id)
        : (health?.default_step_model ?? health?.default_model ?? health?.models?.[0]?.id)
    return picks[p]?.[role] ?? fallback ?? ''
  }

  function selectProvider(p: ProviderId) {
    if (providersHealth?.[p]?.ok === false || recommending) return
    setDraft(p)
  }

  function changeModel(p: ProviderId, role: Role, nextModel: string) {
    setPicks((prev) => ({ ...prev, [p]: { ...prev[p], [role]: nextModel } }))
    // Changing a model is a change to the draft, nothing more. It used to
    // re-run the whole recommendation the moment the dropdown closed.
    if (!recommending) setDraft(p)
  }

  const draftDeep = draft ? modelFor(draft, 'deep') : ''
  const draftStep = draft ? modelFor(draft, 'step') : ''
  // Whether the draft differs from the settings the current recommendation was
  // actually produced with. That, not "has a card been clicked", is what the
  // confirm button is for.
  const dirty = !!draft && (draft !== provider || draftDeep !== model || draftStep !== stepModel)
  const canConfirm = !!draft && !recommending && (dirty || recommendError !== null)

  const confirmLabel = !provider
    ? '讓 AI 開始推薦方法'
    : recommendError
      ? '再試一次'
      : '用這個設定重新推薦'

  function confirmProvider() {
    if (!canConfirm || !draft) return
    onProviderChange(draft, draftDeep, draftStep)
  }

  function select(method: string) {
    if (!draft || starting) return
    setSelectedMethod(method)
  }

  // Keyed by provider, because the draft row names models for a card that may
  // not be the one currently running.
  function labelForModelOf(p: ProviderId, id: string) {
    return providersHealth?.[p]?.models?.find((m) => m.id === id)?.label ?? id
  }
  // Both picks in the footer summary, and collapsed to one when they're the
  // same model — repeating an identical name twice reads like a bug.
  const draftModelLabel = !draft
    ? ''
    : draftStep && draftStep !== draftDeep
      ? `${labelForModelOf(draft, draftDeep)} / 步驟 ${labelForModelOf(draft, draftStep)}`
      : labelForModelOf(draft, draftDeep)

  return (
    <Page>
      <div className="flex flex-col gap-10">
        <Section>
          <SectionHeader
            eyebrow="01"
            title="選一個額度來源"
            description="選一張卡片跟要用的模型，再按下面的按鈕確認。確認之後 AI 才會讀你們填的內容、開始排方法。"
          />

          <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
            {PROVIDER_IDS.map((p) => {
              const health = providersHealth?.[p]
              const unavailable = health?.ok === false
              const models = health?.models ?? []
              const selected = draft === p
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
                  disabled={unavailable || recommending}
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
                      with. Clicks must not bubble up to the card, or opening a
                      dropdown on an idle provider would switch provider and fire
                      an LLM call. */}
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
                          disabled={unavailable || models.length === 0 || recommending}
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

          {/* The commit. Selection and "spend a call on it" are two separate
              acts now, so the second one gets its own button — and the row
              states which settings that button is about to use. */}
          <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-3">
            <Small className="min-w-0 text-xs">
              {draft ? (
                <>
                  已選 <span className="font-medium text-foreground">{PROVIDER_LABELS[draft]}</span>
                  {draftDeep && ` · 收斂 ${labelForModelOf(draft, draftDeep)}`}
                  {draftStep && draftStep !== draftDeep &&
                    ` · 步驟 ${labelForModelOf(draft, draftStep)}`}
                  {provider && !dirty && !recommendError && ' · 已在使用'}
                </>
              ) : (
                '點一張卡片選額度來源，還不會花到額度'
              )}
            </Small>
            <Button size="lg" disabled={!canConfirm} onClick={confirmProvider}>
              {confirmLabel}
              <ArrowRightIcon />
            </Button>
          </div>
        </Section>

        <Section>
          <SectionHeader
            eyebrow="02"
            title="選一個發想方法"
            description="系統先用規則排了一份參考順序，最終的排名與理由由 AI 決定。"
          />

          {/* Two distinct "nothing here yet" states, because they want
              different things from the user. Before a card is drafted, the next
              move is upstairs. Once one is drafted, the screen's job is to say
              what pressing that button will actually get them — this used to go
              straight from the click into a spinner, so nobody ever found out
              the AI was about to do the choosing. */}
          {!draft && !recommending && (
            <Notice tone="brand" icon={WandSparklesIcon} title="還沒選額度來源">
              先挑上面一張卡片（順便選要用哪個模型），AI 才會開始判斷該推薦哪些發想方法。
            </Notice>
          )}

          {draft && !recommending && recommendations.length === 0 && !recommendError && (
            /* No button of its own: the one that starts this sits just above,
               and two identical primary buttons in one eyeful read as a mistake
               rather than as a choice. */
            <EmptyState
              icon={WandSparklesIcon}
              eyebrow="等你按上面的按鈕"
              title="AI 會幫你們挑方法"
              description={
                <>
                  按下「{confirmLabel}」之後，它會讀你們剛剛填的團隊條件，
                  從 10 種發想方法裡排出最適合的 3 個，並且逐一說明為什麼是這幾個。
                  你也可以不理它，直接從下面的完整清單自己挑。
                </>
              }
            />
          )}

          {recommending && (
            <div className="flex flex-col gap-4">
              <AiWorking label="AI 正在判斷該用哪些方法" detail="讀取團隊條件並排序 10 種方法" />
              {/* The reasoning is the wait made legible — prompt-kit's Reasoning
                  block, auto-open while the tokens are still arriving. */}
              <AiReasoning text={thinking} streaming />
              <div className="flex flex-col gap-2">
                {[0, 1, 2].map((i) => (
                  <RowSkeleton key={i} />
                ))}
              </div>
            </div>
          )}

          {recommendError && !recommending && (
            <ErrorState title="AI 推薦方法失敗" detail={recommendError} />
          )}

          {provider && !recommending && adjustmentNote && (
            <AiReasoning
              label="AI 怎麼選的"
              text={
                ruleRanking.length > 0
                  ? `${adjustmentNote}\n\n**規則的參考順序：** ${ruleRanking.map(labelOf).join(' → ')}`
                  : adjustmentNote
              }
            />
          )}

          {provider && !recommending && recommendations.length > 0 && (
            <ol className="flex flex-col gap-2.5">
              {recommendations.map((r) => (
                <li key={r.id}>
                  <RecommendationRow
                    rank={r.rank}
                    label={labelOf(r.method)}
                    description={get(r.method)?.description}
                    rationale={r.rationale}
                    swappedIn={ruleRanking.length > 0 && !ruleRanking.includes(r.method)}
                    selected={selectedMethod === r.method}
                    onSelect={() => select(r.method)}
                  />
                </li>
              ))}
            </ol>
          )}

          {draft && !recommending && (
            <Collapsible className="rounded-xl border border-border bg-surface">
              <CollapsibleTrigger className="group flex w-full items-center justify-between gap-2 px-4 py-3 text-left text-sm font-medium transition-colors hover:bg-accent focus-visible:ring-[3px] focus-visible:ring-ring focus-visible:outline-none">
                手動選擇其他方法
                <ChevronDownIcon className="size-4 text-muted-foreground transition-transform duration-200 group-data-[state=open]:rotate-180" />
              </CollapsibleTrigger>
              <CollapsibleContent className="data-[state=closed]:animate-collapsible-up data-[state=open]:animate-collapsible-down overflow-hidden">
                {/* No rule between the trigger and the grid: the panel is
                    already a bordered box, and cutting it in two made the
                    header read as a second, emptier section. */}
                <div className="grid grid-cols-1 gap-2.5 px-4 pt-1 pb-4 sm:grid-cols-2">
                  {allMethods.map((m) => (
                    <Selectable
                      key={m.name}
                      selected={selectedMethod === m.name}
                      disabled={starting}
                      onSelect={() => select(m.name)}
                      className="gap-1.5 pr-11"
                    >
                      <Subhead>{m.label}</Subhead>
                      <Small className="line-clamp-2 text-xs">{m.description}</Small>
                    </Selectable>
                  ))}
                </div>
              </CollapsibleContent>
            </Collapsible>
          )}
        </Section>
      </div>

      <StickyFooter>
        {/* Names the draft, not the settings the last recommendation ran on:
            the draft is what the run will actually be started with. */}
        <Small className="min-w-0 text-xs">
          {selectedMethod ? (
            <>
              已選擇 <span className="font-medium text-foreground">{labelOf(selectedMethod)}</span>
            </>
          ) : (
            '尚未選擇方法'
          )}
          {draft && (
            <>
              {' · '}
              {PROVIDER_LABELS[draft]}
              {draftModelLabel && ` / ${draftModelLabel}`}
            </>
          )}
        </Small>
        {starting ? (
          <AiWorking label="正在開場" detail="準備第一個引導問題" />
        ) : (
          <Button
            size="lg"
            disabled={!selectedMethod || !draft}
            onClick={() => selectedMethod && draft && onStart(selectedMethod, draft, draftDeep, draftStep)}
          >
            開始發想
            <ArrowRightIcon />
          </Button>
        )}
      </StickyFooter>
    </Page>
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
  selected,
  onSelect,
}: {
  rank: number
  label: string
  description?: string
  rationale: string
  swappedIn: boolean
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
