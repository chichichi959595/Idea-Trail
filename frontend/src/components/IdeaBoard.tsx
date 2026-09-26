import { METHOD_LABELS, type Idea } from '../types'
import { Body, Button, Headline, Meta, Panel, SectionLabel, Subhead, Tag, ThinkingIndicator } from './ui'

interface Props {
  ideas: Idea[]
  selectedIds: number[]
  onToggleSelect: (id: number) => void
  onSynthesize: () => void
  synthesizing: boolean
  onOpenDetail: (idea: Idea) => void
  onBackToMethods: () => void
  error: string | null
}

export function IdeaBoard({
  ideas,
  selectedIds,
  onToggleSelect,
  onSynthesize,
  synthesizing,
  onOpenDetail,
  onBackToMethods,
  error,
}: Props) {
  return (
    <Panel className="mt-8">
      <SectionLabel number="04">Ideas</SectionLabel>
      <Headline className="mb-2">想法牆</Headline>
      <Body className="mb-8 text-foreground/70">
        勾選幾個候選想法，可以送給 Idea Synthesizer 組合延伸；點卡片可以看完整發想歷程。
      </Body>

      {ideas.length === 0 && <Body className="text-foreground/50">目前還沒有候選想法，先去跑一個發想方法。</Body>}

      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
        {ideas.map((idea) => {
          const selected = selectedIds.includes(idea.id)
          return (
            <div
              key={idea.id}
              role="button"
              tabIndex={0}
              onClick={() => onOpenDetail(idea)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault()
                  onOpenDetail(idea)
                }
              }}
              className={`flex cursor-pointer flex-col gap-3 border-2 p-5 text-left transition-all duration-150 ease-out hover:-translate-y-0.5 ${
                selected ? 'border-accent' : 'border-foreground hover:border-accent'
              }`}
            >
              <div className="flex items-center justify-between">
                <label
                  className="flex cursor-pointer items-center gap-2"
                  onClick={(e) => e.stopPropagation()}
                >
                  <input
                    type="checkbox"
                    checked={selected}
                    disabled={synthesizing}
                    onChange={() => onToggleSelect(idea.id)}
                    className="accent-accent h-4 w-4 disabled:cursor-not-allowed"
                  />
                  <Meta>選取</Meta>
                </label>
                <Tag active={idea.is_synthesized}>
                  {idea.is_synthesized ? '整合' : (METHOD_LABELS[idea.source_method ?? ''] ?? idea.source_method)}
                </Tag>
              </div>
              <Subhead>{idea.title}</Subhead>
              <Body className="text-foreground/75 line-clamp-5">{idea.description}</Body>
            </div>
          )
        })}
      </div>

      {error && (
        <p className="border-accent bg-accent/5 text-accent mt-8 border-2 px-4 py-3 text-sm font-bold">
          {error}
        </p>
      )}

      <div className="border-foreground mt-10 flex flex-wrap items-center justify-between gap-4 border-t-4 pt-6">
        <Button variant="secondary" onClick={onBackToMethods}>
          開始另一個發想方法
        </Button>
        <div className="flex items-center gap-4">
          {synthesizing && <ThinkingIndicator label="AI 正在整合想法…" />}
          <Button disabled={selectedIds.length < 2 || synthesizing} onClick={onSynthesize}>
            整合選中的 {selectedIds.length} 個想法
          </Button>
        </div>
      </div>
    </Panel>
  )
}
