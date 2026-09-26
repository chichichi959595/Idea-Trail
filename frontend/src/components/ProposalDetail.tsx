import { useQuery } from '@tanstack/react-query'
import { X } from 'lucide-react'
import { api } from '../api'
import { METHOD_LABELS, type Idea } from '../types'
import { Body, Headline, Meta, SectionLabel, Support } from './ui'

interface Props {
  idea: Idea
  allIdeas: Idea[]
  onClose: () => void
}

export function ProposalDetail({ idea, allIdeas, onClose }: Props) {
  const { data: run } = useQuery({
    queryKey: ['method-run', idea.method_run_id],
    queryFn: () => api.getMethodRun(idea.method_run_id as number),
    enabled: idea.method_run_id !== null,
  })

  const parents = (idea.parent_idea_ids ?? [])
    .map((pid) => allIdeas.find((i) => i.id === pid))
    .filter((i): i is Idea => !!i)

  return (
    <div
      className="fixed inset-0 z-20 flex items-start justify-center overflow-y-auto bg-black/70 p-4 sm:p-10"
      onClick={onClose}
    >
      <div
        className="bg-background border-foreground swiss-grid-pattern relative w-full max-w-2xl border-2 p-6 sm:border-4 sm:p-10"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          className="border-foreground hover:bg-foreground hover:text-background absolute top-4 right-4 flex h-9 w-9 items-center justify-center border-2 transition-colors duration-150"
          onClick={onClose}
          aria-label="關閉"
        >
          <X size={16} strokeWidth={2.5} />
        </button>

        <SectionLabel number="05">Proposal</SectionLabel>
        <Headline className="mb-4 pr-12">{idea.title}</Headline>
        <Body className="text-foreground/80">{idea.description}</Body>

        {parents.length > 0 && (
          <div className="border-foreground/15 mt-8 border-t-2 pt-6">
            <Meta className="mb-3 block">這個想法整合自</Meta>
            <ul className="flex flex-col gap-2">
              {parents.map((p) => (
                <li key={p.id}>
                  <Support className="text-foreground/80">{p.title}</Support>
                </li>
              ))}
            </ul>
          </div>
        )}

        {run && (
          <div className="border-foreground mt-8 border-t-4 pt-6">
            <Meta className="mb-5 block">發想歷程時間軸 · {METHOD_LABELS[run.method_name] ?? run.method_name}</Meta>
            <ol className="flex flex-col gap-6">
              {run.steps.map((s) => (
                <li key={s.id} className="border-foreground/20 border-l-2 pl-4">
                  <Meta className="mb-1 block">{s.step_name}</Meta>
                  <Support className="mb-1 text-foreground/70">{s.question_shown}</Support>
                  {s.user_answer && <Body className="mb-1">你：{s.user_answer}</Body>}
                  {s.agent_output?.analysis && (
                    <Support className="text-foreground/60">{s.agent_output.analysis}</Support>
                  )}
                </li>
              ))}
            </ol>
          </div>
        )}
      </div>
    </div>
  )
}
