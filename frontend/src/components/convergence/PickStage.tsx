import { useState } from 'react'
import { LightbulbIcon, SearchIcon } from 'lucide-react'
import type { ConvergenceProject, Idea, PainPoint } from '../../types'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Selectable } from '@/components/design/selectable'
import { EmptyState } from '@/components/design/states'
import { Eyebrow, Small, Subhead } from '@/components/design/typography'
import { DECISION_LABELS } from './model'

/**
 * 選題: which idea this convergence is about. Usually already answered —
 * 想法庫's 「前往專案收斂」 lands here with one picked — so this page is
 * mostly for switching, and for seeing which ideas already have a record.
 */
export function PickStage({
  ideas,
  painPoints,
  projects,
  idea,
  onPick,
  opening,
  onGoToLibrary,
}: {
  ideas: Idea[]
  painPoints: PainPoint[]
  projects: ConvergenceProject[]
  idea: Idea | null
  onPick: (id: number) => void
  opening: boolean
  onGoToLibrary: () => void
}) {
  const [query, setQuery] = useState('')

  if (ideas.length === 0) {
    return (
      <EmptyState
        icon={LightbulbIcon}
        eyebrow="想法庫是空的"
        title="先去發想幾個想法"
        description="專案收斂一次處理一個想法。想法庫有東西之後，就可以在這裡挑一個來收斂。"
        action={
          <Button size="sm" onClick={onGoToLibrary}>
            前往想法庫
          </Button>
        }
      />
    )
  }

  const projectByIdea = new Map(projects.map((p) => [p.idea_id, p]))
  const needle = query.trim().toLowerCase()
  const shown = needle
    ? ideas.filter((i) => `${i.title} ${i.description}`.toLowerCase().includes(needle))
    : ideas
  const painPoint = idea?.pain_point_id
    ? painPoints.find((p) => p.id === idea.pain_point_id)
    : undefined

  return (
    <div className="flex flex-col gap-5">
      {idea && (
        <div className="flex flex-col gap-1.5 rounded-xl border border-brand-border bg-brand-muted/40 p-4">
          <Eyebrow className="text-primary">正在收斂</Eyebrow>
          <Subhead className="text-pretty">{idea.title}</Subhead>
          <Small className="leading-relaxed">{idea.description}</Small>
          {painPoint && <Small className="text-xs">痛點：{painPoint.statement}</Small>}
        </div>
      )}

      <div className="flex flex-col gap-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <Eyebrow>{idea ? '換一個想法' : '挑一個想法'}</Eyebrow>
          <div className="relative w-full sm:w-64">
            <SearchIcon className="pointer-events-none absolute top-1/2 left-3 size-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="搜尋想法"
              className="h-8 pl-8 text-xs"
            />
          </div>
        </div>
        {shown.map((i) => {
          const record = projectByIdea.get(i.id)
          return (
            <Selectable
              key={i.id}
              selected={i.id === idea?.id}
              disabled={opening}
              onSelect={() => onPick(i.id)}
              className="gap-1 pr-11"
            >
              <div className="flex flex-wrap items-center gap-2">
                <Subhead className="text-sm text-pretty">{i.title}</Subhead>
                {record &&
                  (record.decision ? (
                    <Badge variant={record.decision === 'go' ? 'success' : 'soft'}>
                      {DECISION_LABELS[record.decision]}
                    </Badge>
                  ) : (
                    <Badge variant="brand">收斂中</Badge>
                  ))}
              </div>
              <Small className="line-clamp-2 text-xs">{i.description}</Small>
            </Selectable>
          )
        })}
        {shown.length === 0 && <Small className="text-xs italic">沒有符合的想法。</Small>}
      </div>
    </div>
  )
}
