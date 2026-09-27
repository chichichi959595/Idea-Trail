import {
  PROVIDER_LABELS,
  type ProviderId,
  type ProvidersHealth,
  type Session,
} from '@/types'
import { Eyebrow, Mono } from '@/components/design/typography'

/**
 * The rail's lower half: which model is about to spend the user's quota, and
 * what the session told the system about itself.
 *
 * Both used to be invisible once the user scrolled — the model was a line in a
 * footer, and the intake answers disappeared the moment the form was submitted,
 * even though every recommendation the model makes is derived from them. Here
 * they stay on screen for the whole session.
 */
export function SessionAside({
  session,
  provider,
  model,
  stepModel,
  providersHealth,
  ideaCount,
}: {
  session: Session
  provider: string
  model: string
  stepModel: string
  providersHealth: ProvidersHealth | undefined
  ideaCount: number
}) {
  const health = providersHealth?.[provider as ProviderId]
  const labelForModel = (id: string) =>
    health?.models?.find((m) => m.id === id)?.label ?? id

  const facts = [
    session.team_size !== null && { label: '人數', value: `${session.team_size} 人` },
    session.time_budget && { label: '時間', value: session.time_budget },
    session.tech_background && { label: '技術', value: session.tech_background },
    session.domain_pref && { label: '領域', value: session.domain_pref },
    ideaCount > 0 && { label: '候選', value: `${ideaCount} 個想法` },
  ].filter((f): f is { label: string; value: string } => Boolean(f))

  return (
    <>
      <div className="flex flex-col gap-2">
        <Eyebrow className="px-2">使用的模型</Eyebrow>
        {provider ? (
          <div className="flex flex-col gap-1.5 rounded-lg border border-sidebar-border bg-surface/60 px-2.5 py-2">
            <span className="truncate text-xs font-medium">
              {PROVIDER_LABELS[provider as ProviderId] ?? provider}
            </span>
            <div className="flex flex-col gap-0.5">
              <ModelLine role="收斂" value={model ? labelForModel(model) : '預設'} />
              {/* Only shown when the two roles actually differ — repeating the
                  same model name twice reads like a bug. */}
              {stepModel && stepModel !== model && (
                <ModelLine role="步驟" value={labelForModel(stepModel)} />
              )}
            </div>
          </div>
        ) : (
          <p className="px-2 text-xs text-muted-foreground">還沒選額度來源</p>
        )}
      </div>

      {facts.length > 0 && (
        <div className="flex flex-col gap-2">
          <Eyebrow className="px-2">這次的條件</Eyebrow>
          <dl className="flex flex-col gap-1.5 px-2">
            {facts.map((f) => (
              <div key={f.label} className="flex gap-2 text-xs leading-relaxed">
                <dt className="w-8 shrink-0 text-muted-foreground">{f.label}</dt>
                <dd className="min-w-0 flex-1 text-foreground/80">{f.value}</dd>
              </div>
            ))}
          </dl>
        </div>
      )}
    </>
  )
}

function ModelLine({ role, value }: { role: string; value: string }) {
  return (
    <div className="flex items-baseline gap-2 text-2xs">
      <span className="shrink-0 text-muted-foreground">{role}</span>
      <Mono className="min-w-0 flex-1 truncate text-2xs text-foreground/70">{value}</Mono>
    </div>
  )
}
