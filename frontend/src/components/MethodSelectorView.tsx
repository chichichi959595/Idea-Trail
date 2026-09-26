import { useState } from 'react'
import {
  IMPLEMENTED_METHODS,
  METHOD_DESCRIPTIONS,
  METHOD_LABELS,
  PROVIDER_IDS,
  PROVIDER_LABELS,
  PROVIDER_TAGLINES,
  type MethodRecommendation,
  type ProviderId,
  type ProvidersHealth,
} from '../types'
import { Body, Button, Headline, Meta, Panel, SectionLabel, Subhead, Support, Tag, ThinkingIndicator } from './ui'

interface Props {
  recommendations: MethodRecommendation[]
  ruleRanking: string[]
  adjustmentNote: string
  providersHealth: ProvidersHealth | undefined
  provider: string
  model: string
  onProviderChange: (p: string, model: string) => void
  recommending: boolean
  recommendError: string | null
  onStart: (method: string) => void
  starting: boolean
}

export function MethodSelectorView({
  recommendations,
  ruleRanking,
  adjustmentNote,
  providersHealth,
  provider,
  model,
  onProviderChange,
  recommending,
  recommendError,
  onStart,
  starting,
}: Props) {
  const allMethods = Object.keys(METHOD_LABELS)
  const [selectedMethod, setSelectedMethod] = useState<string | null>(null)
  // Each provider remembers its own model pick, so switching back and forth
  // doesn't silently reset the other one to its default.
  const [modelByProvider, setModelByProvider] = useState<Record<string, string>>({})

  function modelFor(p: ProviderId) {
    const health = providersHealth?.[p]
    return modelByProvider[p] ?? health?.default_model ?? health?.models?.[0]?.id ?? ''
  }

  function selectProvider(p: ProviderId) {
    if (providersHealth?.[p]?.ok === false || recommending) return
    onProviderChange(p, modelFor(p))
  }

  function changeModel(p: ProviderId, nextModel: string) {
    setModelByProvider((prev) => ({ ...prev, [p]: nextModel }))
    // Picking a model on the active provider re-runs the recommendation with
    // it; on the other card it's just a stored preference until that card is
    // chosen, so an idle dropdown never burns an LLM call.
    if (p === provider && !recommending) onProviderChange(p, nextModel)
  }

  function select(method: string) {
    if (!provider || !IMPLEMENTED_METHODS.has(method) || starting) return
    setSelectedMethod(method)
  }

  const activeModelLabel =
    providersHealth?.[provider as ProviderId]?.models?.find((m) => m.id === model)?.label ?? model

  return (
    <Panel className="mt-8">
      <SectionLabel number="02">Method</SectionLabel>
      <Headline className="mb-2">Method Selector 推薦</Headline>
      <Body className="mb-8 text-foreground/70">
        系統先用規則排出基準清單，再由 AI 讀完你們填的內容決定要不要調整順序或替換方法。選一個方法，按下方「確定」開始發想。
      </Body>

      <div className="mb-10 border-y-2 border-foreground/15 py-6">
        <Meta className="text-foreground mb-4 block">LLM 額度來源</Meta>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {PROVIDER_IDS.map((p) => {
            const health = providersHealth?.[p]
            const unavailable = health?.ok === false
            const models = health?.models ?? []
            const selected = provider === p
            const currentModel = modelFor(p)
            const currentDescription = models.find((m) => m.id === currentModel)?.description
            return (
              <div
                key={p}
                role="button"
                tabIndex={unavailable ? -1 : 0}
                aria-pressed={selected}
                aria-disabled={unavailable || recommending}
                onClick={() => selectProvider(p)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault()
                    selectProvider(p)
                  }
                }}
                className={`flex min-h-28 flex-col gap-3 border-2 p-4 text-left transition-colors duration-150 ${
                  unavailable
                    ? 'border-foreground/30 cursor-not-allowed opacity-40'
                    : selected
                      ? 'border-accent bg-accent/5 cursor-pointer'
                      : 'border-foreground hover:bg-muted cursor-pointer'
                }`}
              >
                {/* One header row across both cards: name on the left, model
                    picker on the right, sharing a single baseline. The select
                    sets the row's height, so every card lines up with the
                    other no matter how long its description runs. */}
                <div className="flex items-center justify-between gap-3">
                  <div className="flex min-w-0 items-center gap-3">
                    <span
                      className={`h-4 w-4 shrink-0 border-2 ${
                        selected ? 'bg-accent border-accent' : 'border-foreground/40'
                      }`}
                      aria-hidden
                    />
                    <Subhead className="truncate">{PROVIDER_LABELS[p]}</Subhead>
                    {unavailable && <Tag>無法使用</Tag>}
                  </div>

                  {/* Clicks here must not bubble up to the card, or opening
                      the dropdown on the inactive provider would switch
                      provider and fire an LLM call. */}
                  <label
                    className="flex shrink-0 items-center gap-2"
                    onClick={(e) => e.stopPropagation()}
                    onKeyDown={(e) => e.stopPropagation()}
                  >
                    <Meta>模型</Meta>
                    <select
                      value={currentModel}
                      disabled={unavailable || models.length === 0 || recommending}
                      onChange={(e) => changeModel(p, e.target.value)}
                      className="border-foreground bg-background focus:border-accent h-11 max-w-36 border-2 px-2 text-xs font-bold disabled:cursor-not-allowed disabled:opacity-40 focus:outline-none"
                    >
                      {models.length === 0 && <option value="">（讀不到清單）</option>}
                      {models.map((m) => (
                        <option key={m.id} value={m.id}>
                          {m.label}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>

                {/* Indented past the checkbox so the body text starts on the
                    same left edge as the provider name. */}
                <div className="ml-7 flex flex-col gap-1">
                  <Support className="text-foreground/70">
                    {unavailable ? '這台機器沒有登入，先在終端機登入後重新整理。' : PROVIDER_TAGLINES[p]}
                  </Support>
                  {currentDescription && (
                    <Support className="text-foreground/50 line-clamp-2">{currentDescription}</Support>
                  )}
                </div>
              </div>
            )
          })}
        </div>
        {recommending && (
          <div className="mt-4">
            <ThinkingIndicator label="AI 正在判斷該用哪些方法…" />
          </div>
        )}
      </div>

      {!provider && (
        <Body className="mb-10 text-foreground/60">
          先選一個上面的方塊（順便挑要用哪個模型），AI 才會開始判斷該推薦哪些發想方法。
        </Body>
      )}

      {recommendError && (
        <p className="mb-10 border-2 border-accent bg-accent/5 px-4 py-3 text-sm font-bold text-accent">
          {recommendError}
        </p>
      )}

      {provider && !recommending && adjustmentNote && (
        <div className="bg-muted border-foreground/10 mb-10 border-l-2 p-4">
          <Meta className="text-foreground mb-2 block">AI 的調整</Meta>
          <Support className="text-foreground/80">{adjustmentNote}</Support>
          {ruleRanking.length > 0 && (
            <Support className="text-foreground/50 mt-3 block">
              規則原本的順序：{ruleRanking.map((m) => METHOD_LABELS[m] ?? m).join(' → ')}
            </Support>
          )}
        </div>
      )}

      {provider && !recommending && (
        <ol className="flex flex-col">
          {recommendations.map((r) => {
            const implemented = IMPLEMENTED_METHODS.has(r.method)
            const selected = selectedMethod === r.method
            return (
              <li key={r.id} className="border-t-2 border-foreground/15 py-6 first:border-t-0">
                <div
                  role={implemented ? 'button' : undefined}
                  tabIndex={implemented ? 0 : undefined}
                  onClick={() => select(r.method)}
                  onKeyDown={(e) => {
                    if (implemented && (e.key === 'Enter' || e.key === ' ')) {
                      e.preventDefault()
                      select(r.method)
                    }
                  }}
                  className={`-mx-4 flex items-center gap-4 px-4 py-2 ${implemented ? 'cursor-pointer' : ''}`}
                >
                  <span
                    className={`h-4 w-4 shrink-0 border-2 ${selected ? 'bg-accent border-accent' : 'border-foreground/40'}`}
                    aria-hidden
                  />
                  <span className="text-accent w-10 shrink-0 text-3xl font-black leading-none">
                    {String(r.rank).padStart(2, '0')}
                  </span>
                  <Subhead className="flex-1">{METHOD_LABELS[r.method] ?? r.method}</Subhead>
                  {ruleRanking.length > 0 && !ruleRanking.includes(r.method) && (
                    <Tag>AI 換上</Tag>
                  )}
                  {!implemented && <Tag>尚未實作</Tag>}
                </div>
  
                <div className="ml-[4.5rem]">
                  <Body className="mt-3 text-foreground/80">{METHOD_DESCRIPTIONS[r.method]}</Body>
                  <details className="mt-2" onClick={(e) => e.stopPropagation()}>
                    <summary className="cursor-pointer text-xs font-bold uppercase tracking-widest text-foreground/50">
                      更多…
                    </summary>
                    <Support className="mt-2 text-foreground/70">{r.rationale}</Support>
                  </details>
                </div>
              </li>
            )
          })}
  
          <li className="border-t-2 border-foreground/15 py-6">
            <details>
              <summary className="cursor-pointer text-xs font-bold uppercase tracking-widest text-foreground/60">
                手動選擇其他方法
              </summary>
              <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
                {allMethods.map((m) => {
                  const implemented = IMPLEMENTED_METHODS.has(m)
                  const selected = selectedMethod === m
                  return (
                    <button
                      key={m}
                      type="button"
                      disabled={!implemented || starting}
                      onClick={() => select(m)}
                      className={`flex min-h-28 flex-col gap-2 border-2 p-4 text-left transition-colors duration-150 disabled:cursor-not-allowed disabled:opacity-40 ${
                        selected ? 'border-accent bg-accent/5' : 'border-foreground hover:bg-muted'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <Subhead>{METHOD_LABELS[m]}</Subhead>
                        {!implemented && <Tag>尚未實作</Tag>}
                      </div>
                      <Support className="text-foreground/70 line-clamp-2">{METHOD_DESCRIPTIONS[m]}</Support>
                    </button>
                  )
                })}
              </div>
            </details>
          </li>
        </ol>
      )}

      <div className="border-foreground mt-4 flex flex-wrap items-center justify-between gap-4 border-t-4 pt-6">
        <Meta className="text-foreground">
          {selectedMethod ? `已選擇：${METHOD_LABELS[selectedMethod]}` : '尚未選擇方法'}
          {provider &&
            ` · ${PROVIDER_LABELS[provider as ProviderId] ?? provider}${
              activeModelLabel ? ` / ${activeModelLabel}` : ''
            }`}
        </Meta>
        {starting ? (
          <ThinkingIndicator />
        ) : (
          <Button disabled={!selectedMethod} onClick={() => selectedMethod && onStart(selectedMethod)}>
            確定，開始發想
          </Button>
        )}
      </div>
    </Panel>
  )
}
