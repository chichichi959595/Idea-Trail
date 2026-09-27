import { CombineIcon, LightbulbIcon, PlusIcon } from 'lucide-react'
import { useMethodCatalog } from '../useMethodCatalog'
import type { Idea } from '../types'
import { cn } from '@/lib/utils'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Page, Section, SectionHeader, StickyFooter } from '@/components/design/section'
import { Small, Subhead } from '@/components/design/typography'
import { EmptyState, ErrorState } from '@/components/design/states'
import { AiReasoning, AiWorking } from '@/components/design/ai'

interface Props {
  ideas: Idea[]
  selectedIds: number[]
  onToggleSelect: (id: number) => void
  onSynthesize: () => void
  synthesizing: boolean
  thinking: string
  onOpenDetail: (idea: Idea) => void
  onBackToMethods: () => void
  error: string | null
}

/**
 * The idea wall. Every candidate the session has produced, selectable in twos
 * or more for the synthesizer to combine.
 *
 * Synthesized ideas are marked rather than separated: their value is that they
 * came out of ideas already on this wall, so keeping them in the same grid is
 * what makes that lineage visible.
 */
export function IdeaBoard({
  ideas,
  selectedIds,
  onToggleSelect,
  onSynthesize,
  synthesizing,
  thinking,
  onOpenDetail,
  onBackToMethods,
  error,
}: Props) {
  const { shortLabelOf } = useMethodCatalog()
  const enoughSelected = selectedIds.length >= 2

  return (
    <Page>
      <Section>
        <SectionHeader
          eyebrow={`${ideas.length} 個候選`}
          title="想法牆"
          description="勾選兩個以上送給 Idea Synthesizer 組合延伸；點標題可以看完整發想歷程。"
          actions={
            <Button variant="outline" size="sm" onClick={onBackToMethods}>
              <PlusIcon />
              另一個方法
            </Button>
          }
        />

        {ideas.length === 0 ? (
          <EmptyState
            icon={LightbulbIcon}
            eyebrow="還沒有想法"
            title="這面牆還是空的"
            description="跑完一個發想方法之後，收斂出的候選想法就會出現在這裡。"
            action={
              <Button onClick={onBackToMethods}>
                挑一個發想方法
              </Button>
            }
          />
        ) : (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {ideas.map((idea) => (
              <IdeaCard
                key={idea.id}
                idea={idea}
                selected={selectedIds.includes(idea.id)}
                disabled={synthesizing}
                sourceLabel={shortLabelOf(idea.source_method)}
                onToggleSelect={() => onToggleSelect(idea.id)}
                onOpenDetail={() => onOpenDetail(idea)}
              />
            ))}
          </div>
        )}

        {error && <ErrorState title="整合想法失敗" detail={error} />}

        {synthesizing && (
          <div className="flex flex-col gap-3">
            <AiWorking label="AI 正在整合想法" detail={`合併 ${selectedIds.length} 個候選想法`} />
            <AiReasoning text={thinking} streaming />
          </div>
        )}
      </Section>

      {ideas.length > 0 && (
        <StickyFooter>
          <Small className="text-xs">
            {enoughSelected
              ? `已選 ${selectedIds.length} 個，可以整合`
              : `已選 ${selectedIds.length} 個 · 至少要 2 個才能整合`}
          </Small>
          <Button
            disabled={!enoughSelected || synthesizing}
            onClick={onSynthesize}
            size="lg"
          >
            <CombineIcon />
            {enoughSelected ? `整合這 ${selectedIds.length} 個想法` : '整合選取的想法'}
          </Button>
        </StickyFooter>
      )}
    </Page>
  )
}

function IdeaCard({
  idea,
  selected,
  disabled,
  sourceLabel,
  onToggleSelect,
  onOpenDetail,
}: {
  idea: Idea
  selected: boolean
  disabled: boolean
  sourceLabel: string
  onToggleSelect: () => void
  onOpenDetail: () => void
}) {
  return (
    <article
      className={cn(
        'group flex flex-col gap-2.5 rounded-xl border p-4',
        'transition-[border-color,background-color,box-shadow,transform] duration-150 ease-[var(--ease-out-quint)]',
        'hover:-translate-y-px hover:shadow-md',
        selected
          ? 'border-primary/45 bg-brand-muted shadow-sm'
          : 'border-border bg-surface shadow-xs hover:border-border-strong',
      )}
    >
      <div className="flex items-center justify-between gap-2">
        {/* A real label wrapping a real checkbox: the whole "選取" target is
            clickable, and it stays outside the title button so no interactive
            element ends up nested inside another. */}
        <label
          className={cn(
            'flex items-center gap-2 text-xs',
            disabled ? 'cursor-not-allowed opacity-50' : 'cursor-pointer',
          )}
        >
          <Checkbox checked={selected} disabled={disabled} onCheckedChange={onToggleSelect} />
          <span className={selected ? 'font-medium text-primary' : 'text-muted-foreground'}>
            {selected ? '已選取' : '選取'}
          </span>
        </label>
        <Badge variant={idea.is_synthesized ? 'ai' : 'soft'}>
          {idea.is_synthesized ? '整合' : sourceLabel}
        </Badge>
      </div>

      <button
        type="button"
        onClick={onOpenDetail}
        className="rounded-md text-left focus-visible:ring-[3px] focus-visible:ring-ring focus-visible:outline-none"
      >
        <Subhead className="decoration-primary/40 underline-offset-4 group-hover:underline">
          {idea.title}
        </Subhead>
      </button>

      <Small className="line-clamp-5 leading-relaxed">{idea.description}</Small>
    </article>
  )
}
