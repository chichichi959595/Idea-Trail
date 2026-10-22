import { useState, type ReactNode } from 'react'
import { PAIN_POINT_SOURCE_LABELS, type PainPoint, type PainPointDraft } from '../types'
import { cn } from '@/lib/utils'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Eyebrow, Small, Subhead } from '@/components/design/typography'

/**
 * Pain point pieces shared by 痛點發想, 專案發想 and the pain point library —
 * a problem looks the same wherever it is picked up.
 */

const DETAIL_FIELDS = [
  ['who', '誰會遇到'],
  ['context', '發生情境'],
  ['current_workaround', '現在怎麼應付'],
] as const

/** The facts under the statement, only the ones that are known. */
export function PainPointFacts({ painPoint, className }: { painPoint: PainPoint; className?: string }) {
  const facts = DETAIL_FIELDS.filter(([key]) => painPoint[key])
  if (facts.length === 0) return null
  return (
    <dl className={cn('flex flex-col gap-1', className)}>
      {facts.map(([key, label]) => (
        <div key={key} className="flex gap-2 text-xs leading-relaxed">
          <dt className="w-20 shrink-0 text-muted-foreground">{label}</dt>
          <dd className="min-w-0 flex-1 text-foreground/80">{painPoint[key]}</dd>
        </div>
      ))}
    </dl>
  )
}

export function PainPointCard({
  painPoint,
  selected = false,
  actions,
  showSource = true,
  className,
}: {
  painPoint: PainPoint
  selected?: boolean
  /** Right-aligned under the facts: pick it, edit it, delete it. */
  actions?: ReactNode
  showSource?: boolean
  className?: string
}) {
  return (
    <article
      className={cn(
        'flex flex-col gap-2.5 rounded-xl border p-4 transition-[border-color,background-color] duration-150',
        selected ? 'border-primary/45 bg-brand-muted shadow-sm' : 'border-border bg-surface shadow-xs',
        className,
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <Subhead className="min-w-0 flex-1 text-pretty">{painPoint.statement}</Subhead>
        {showSource && (
          <div className="flex shrink-0 items-center gap-1.5">
            {!!painPoint.idea_count && (
              <Badge variant="outline" data-numeric>
                {painPoint.idea_count} 個想法
              </Badge>
            )}
            <Badge variant="soft">{PAIN_POINT_SOURCE_LABELS[painPoint.source]}</Badge>
          </div>
        )}
      </div>
      <PainPointFacts painPoint={painPoint} />
      {actions && <div className="flex flex-wrap items-center justify-end gap-2 pt-1">{actions}</div>}
    </article>
  )
}

const EMPTY_DRAFT: PainPointDraft = {
  statement: '',
  who: '',
  context: '',
  current_workaround: '',
}

/** Write a pain point by hand, or correct one the AI wrote down. */
export function PainPointForm({
  initial,
  submitLabel,
  onSubmit,
  onCancel,
  saving,
}: {
  initial?: PainPointDraft
  submitLabel: string
  onSubmit: (draft: PainPointDraft) => void
  onCancel?: () => void
  saving: boolean
}) {
  const [draft, setDraft] = useState<PainPointDraft>({ ...EMPTY_DRAFT, ...initial })
  const set = (key: keyof PainPointDraft) => (value: string) =>
    setDraft((prev) => ({ ...prev, [key]: value }))
  const canSave = draft.statement.trim().length > 0 && !saving

  return (
    <form
      className="flex flex-col gap-3 rounded-xl border border-border bg-surface p-4 shadow-xs"
      onSubmit={(e) => {
        e.preventDefault()
        if (canSave) onSubmit(draft)
      }}
    >
      <label className="flex flex-col gap-1.5">
        <Eyebrow>痛點（一句話）</Eyebrow>
        <Textarea
          autoFocus
          rows={2}
          value={draft.statement}
          onChange={(e) => set('statement')(e.target.value)}
          placeholder="例如：住宿生每天中午排隊買午餐要等十五分鐘"
        />
      </label>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        {DETAIL_FIELDS.map(([key, label]) => (
          <label key={key} className="flex flex-col gap-1.5">
            <Eyebrow>{label}</Eyebrow>
            <Input
              value={draft[key] ?? ''}
              onChange={(e) => set(key)(e.target.value)}
              placeholder="可以留空"
            />
          </label>
        ))}
      </div>
      <div className="flex items-center justify-end gap-2">
        {onCancel && (
          <Button type="button" variant="ghost" size="sm" onClick={onCancel} disabled={saving}>
            取消
          </Button>
        )}
        <Button type="submit" size="sm" disabled={!canSave}>
          {submitLabel}
        </Button>
      </div>
    </form>
  )
}

/** A one-line reminder of which problem a screen is working on. */
export function PainPointBanner({
  painPoint,
  action,
}: {
  painPoint: PainPoint | null
  action?: ReactNode
}) {
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 rounded-lg border border-border bg-muted/50 px-3 py-2">
      <Eyebrow className="shrink-0">要解決的痛點</Eyebrow>
      <Small className="min-w-0 flex-1 truncate text-sm text-foreground">
        {painPoint ? painPoint.statement : '還沒選，想法會只依團隊條件發散'}
      </Small>
      {action}
    </div>
  )
}
