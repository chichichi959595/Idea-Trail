import { useState } from 'react'
import {
  IMPLEMENTED_METHODS,
  METHOD_DESCRIPTIONS,
  METHOD_LABELS,
  type MethodRecommendation,
  type ProvidersHealth,
} from '../types'
import { Body, Button, Headline, Meta, Panel, SectionLabel, Subhead, Support, Tag, ThinkingIndicator } from './ui'

interface Props {
  recommendations: MethodRecommendation[]
  providersHealth: ProvidersHealth | undefined
  provider: string
  onProviderChange: (p: string) => void
  onStart: (method: string) => void
  starting: boolean
}

export function MethodSelectorView({
  recommendations,
  providersHealth,
  provider,
  onProviderChange,
  onStart,
  starting,
}: Props) {
  const allMethods = Object.keys(METHOD_LABELS)
  const [selectedMethod, setSelectedMethod] = useState<string | null>(null)

  function select(method: string) {
    if (!IMPLEMENTED_METHODS.has(method) || starting) return
    setSelectedMethod(method)
  }

  return (
    <Panel className="mt-8">
      <SectionLabel number="02">Method</SectionLabel>
      <Headline className="mb-2">Method Selector 推薦</Headline>
      <Body className="mb-8 text-foreground/70">
        系統先用規則判斷你們的狀況，再請 AI 說明推薦理由。選一個方法，按下方「確定」開始發想。
      </Body>

      <div className="mb-10 flex flex-wrap items-center gap-3 border-y-2 border-foreground/15 py-4">
        <Meta className="text-foreground">LLM 額度來源</Meta>
        {(['claude', 'codex'] as const).map((p) => {
          const health = providersHealth?.[p]
          const disabled = health?.ok === false
          return (
            <button
              key={p}
              type="button"
              disabled={disabled}
              onClick={() => onProviderChange(p)}
              className={`min-h-11 border-2 px-4 text-xs font-bold uppercase tracking-widest transition-colors duration-150 disabled:cursor-not-allowed disabled:opacity-40 ${
                provider === p
                  ? 'border-accent bg-accent text-background'
                  : 'border-foreground bg-background text-foreground hover:bg-muted'
              }`}
            >
              {p === 'claude' ? 'Claude Code' : 'Codex'}
              {disabled && ' · 無法使用'}
            </button>
          )
        })}
      </div>

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

      <div className="border-foreground mt-4 flex flex-wrap items-center justify-between gap-4 border-t-4 pt-6">
        <Meta className="text-foreground">
          {selectedMethod ? `已選擇：${METHOD_LABELS[selectedMethod]}` : '尚未選擇方法'}
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
