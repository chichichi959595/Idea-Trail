import { useQuery } from '@tanstack/react-query'
import { GitMergeIcon, SparklesIcon } from 'lucide-react'
import { api } from '../api'
import { useMethodCatalog } from '../useMethodCatalog'
import type { Idea } from '../types'
import { Badge } from '@/components/ui/badge'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Steps, StepsContent, StepsTrigger } from '@/components/ui/steps'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Eyebrow, Small } from '@/components/design/typography'
import { TextSkeleton } from '@/components/design/states'
import { AiMarkdown, Turn } from '@/components/design/ai'

interface Props {
  idea: Idea
  allIdeas: Idea[]
  onClose: () => void
}

/**
 * One proposal in full, plus the run that produced it.
 *
 * On a real `Dialog` now rather than a hand-rolled backdrop: Escape, focus trap,
 * scroll lock, click-outside and `aria-modal` all come from the primitive
 * instead of being partially reimplemented here.
 */
export function ProposalDetail({ idea, allIdeas, onClose }: Props) {
  const { labelOf } = useMethodCatalog()
  const { data: run, isPending } = useQuery({
    queryKey: ['method-run', idea.method_run_id],
    queryFn: () => api.getMethodRun(idea.method_run_id as number),
    enabled: idea.method_run_id !== null,
  })

  const parents = (idea.parent_idea_ids ?? [])
    .map((pid) => allIdeas.find((i) => i.id === pid))
    .filter((i): i is Idea => !!i)

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent
        showCloseButton
        className="max-h-[88svh] gap-0 overflow-y-auto p-0 sm:max-w-2xl"
      >
        <DialogHeader className="gap-3 border-b border-border px-6 pt-6 pb-5 text-left">
          <div className="flex flex-wrap items-center gap-2">
            <Eyebrow>提案</Eyebrow>
            {idea.is_synthesized ? (
              <Badge variant="ai">
                <SparklesIcon aria-hidden />
                整合而成
              </Badge>
            ) : (
              idea.source_method && <Badge variant="soft">{labelOf(idea.source_method)}</Badge>
            )}
          </div>
          <DialogTitle className="pr-8 text-xl leading-snug sm:text-2xl">{idea.title}</DialogTitle>
          <DialogDescription className="sr-only">
            {idea.title} 的完整說明與發想歷程
          </DialogDescription>
        </DialogHeader>

        <Tabs defaultValue="proposal" className="gap-0">
          {idea.method_run_id !== null && (
            <TabsList variant="line" className="w-full justify-start gap-4 border-b border-border px-6">
              <TabsTrigger value="proposal" className="flex-none px-0">
                提案內容
              </TabsTrigger>
              <TabsTrigger value="history" className="flex-none px-0">
                發想歷程
              </TabsTrigger>
            </TabsList>
          )}

          <TabsContent value="proposal" className="flex flex-col gap-7 px-6 py-6">
          <AiMarkdown>{idea.description}</AiMarkdown>

          {parents.length > 0 && (
            <section className="flex flex-col gap-2.5 rounded-xl border border-ai-border bg-ai-muted/40 p-4">
              <Eyebrow className="flex items-center gap-1.5 text-ai">
                <GitMergeIcon className="size-3.5" aria-hidden />
                這個想法整合自
              </Eyebrow>
              {/* Provenance, as a list of the ideas this one descends from. The
                  app has no external sources to cite, so this is its citation:
                  which of the team's own earlier ideas fed into this one. */}
              <ul className="flex flex-col gap-1.5">
                {parents.map((p) => (
                  <li key={p.id} className="flex gap-2 text-sm leading-relaxed">
                    <span aria-hidden className="mt-2 size-1 shrink-0 rounded-full bg-ai" />
                    <span className="text-foreground/85">{p.title}</span>
                  </li>
                ))}
              </ul>
            </section>
          )}
          </TabsContent>

          {idea.method_run_id !== null && (
            <TabsContent value="history" className="flex flex-col gap-3 px-6 py-6">
              <Eyebrow>{run ? labelOf(run.method_name) : '載入中'}</Eyebrow>

              {isPending && <TextSkeleton lines={5} />}

              {/* prompt-kit's `Steps`: each round folds into one line, with the
                  connector bar that makes a multi-step run read as a sequence.
                  Collapsed by default here — the reader came for the proposal,
                  and the history is what they open if they want to audit it. */}
              {run?.steps.map((s) => (
                <Steps key={s.id} defaultOpen={false}>
                  <StepsTrigger className="font-medium">{s.step_name}</StepsTrigger>
                  <StepsContent>
                    <Small className="text-xs">{s.question_shown}</Small>
                    {s.user_answer ? (
                      <Turn role="user">{s.user_answer}</Turn>
                    ) : (
                      <Small className="italic">（時間到，這題沒有作答）</Small>
                    )}
                    {s.agent_output?.analysis && (
                      <Turn role="ai" markdown>
                        {s.agent_output.analysis}
                      </Turn>
                    )}
                  </StepsContent>
                </Steps>
              ))}
            </TabsContent>
          )}
        </Tabs>
      </DialogContent>
    </Dialog>
  )
}
