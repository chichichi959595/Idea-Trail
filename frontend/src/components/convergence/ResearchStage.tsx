import { ExternalLinkIcon, GitBranchIcon, GlobeIcon, SearchIcon, StarIcon } from 'lucide-react'
import type { ConvergenceProject } from '../../types'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { AiMarkdown } from '@/components/design/ai'
import { EmptyState, Notice } from '@/components/design/states'
import { Eyebrow, Small, Subhead } from '@/components/design/typography'
import type { ConvergenceActions } from './model'
import { AgentProgress } from './shared'

const linkClass =
  'text-primary underline decoration-primary/35 underline-offset-2 hover:decoration-primary'

/**
 * 競品搜尋. Placed after the features are settled on purpose: "has someone
 * built this" is only answerable once "this" is a feature list. GitHub is
 * queried directly so any provider gets it; web search needs `anthropic`.
 * Every competitor link shown here came out of an actual search result.
 */
export function ResearchStage({
  project,
  actions,
  provider,
}: {
  project: ConvergenceProject
  actions: ConvergenceActions
  provider: string
}) {
  const research = project.research

  return (
    <div className="flex flex-col gap-5">
      {provider && provider !== 'anthropic' && (
        <Small className="text-xs">
          目前的 provider 不是 Anthropic API，只會搜尋 GitHub，網路搜尋會略過。
        </Small>
      )}

      <AgentProgress
        actions={actions}
        stage="research"
        label="AI 正在搜尋競品"
        detail="想關鍵字 → GitHub → 網路 → 跟功能清單比對"
        onRetry={() => void actions.run('research')}
      />

      {!research && actions.busy !== 'research' && (
        <EmptyState
          icon={SearchIcon}
          eyebrow="還沒搜尋"
          title="看看市場上已經有什麼"
          description="AI 會依你定好的功能想搜尋關鍵字，查 GitHub 跟網路上的類似產品，再比對哪些功能別人已經做了、哪些是你們的差異化。"
        />
      )}

      {research && (
        <>
          {research.summary && (
            <div className="flex flex-col gap-2 rounded-xl border border-ai-border bg-ai-muted/40 p-4">
              <Eyebrow className="text-ai">整理</Eyebrow>
              <AiMarkdown className="text-sm">{research.summary}</AiMarkdown>
              {research.differentiation && (
                <>
                  <Eyebrow className="mt-1 text-ai">差異化空間</Eyebrow>
                  <AiMarkdown className="text-sm">{research.differentiation}</AiMarkdown>
                </>
              )}
            </div>
          )}

          {research.competitors.length > 0 && (
            <div className="flex flex-col gap-2">
              <Eyebrow>相近的競品</Eyebrow>
              <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                {research.competitors.map((c) => (
                  <article
                    key={c.name}
                    className="flex flex-col gap-1.5 rounded-xl border border-border bg-surface p-3 shadow-xs"
                  >
                    <Subhead className="text-sm">
                      {c.url ? (
                        <a href={c.url} target="_blank" rel="noreferrer" className={linkClass}>
                          {c.name}
                          <ExternalLinkIcon className="ml-1 inline size-3" aria-hidden />
                        </a>
                      ) : (
                        c.name
                      )}
                    </Subhead>
                    {c.overlap && (
                      <Small className="text-xs">
                        <span className="font-medium text-foreground/80">已經做到：</span>
                        {c.overlap}
                      </Small>
                    )}
                    {c.gap && (
                      <Small className="text-xs">
                        <span className="font-medium text-success">沒做到：</span>
                        {c.gap}
                      </Small>
                    )}
                  </article>
                ))}
              </div>
            </div>
          )}

          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div className="flex flex-col gap-2">
              <Eyebrow className="flex items-center gap-1.5">
                <GitBranchIcon className="size-3.5" aria-hidden />
                GitHub
                {research.queries.length > 0 && (
                  <span className="font-normal normal-case">（{research.queries.join('、')}）</span>
                )}
              </Eyebrow>
              {research.github_error && (
                <Notice tone="warning" title="GitHub 搜尋失敗">
                  {research.github_error}
                </Notice>
              )}
              {research.github.length === 0 && !research.github_error && (
                <Small className="text-xs italic">沒有找到相關的開源專案。</Small>
              )}
              <ul className="flex flex-col gap-2">
                {research.github.map((h) => (
                  <li key={h.full_name} className="flex flex-col gap-0.5">
                    <div className="flex flex-wrap items-center gap-2 text-sm">
                      <a href={h.url} target="_blank" rel="noreferrer" className={linkClass}>
                        {h.full_name}
                      </a>
                      <span className="inline-flex items-center gap-0.5 text-xs text-muted-foreground tabular-nums">
                        <StarIcon className="size-3" aria-hidden />
                        {h.stars.toLocaleString()}
                      </span>
                      {h.language && <Badge variant="soft">{h.language}</Badge>}
                    </div>
                    {h.description && (
                      <Small className="line-clamp-2 text-xs">{h.description}</Small>
                    )}
                  </li>
                ))}
              </ul>
            </div>

            <div className="flex flex-col gap-2">
              <Eyebrow className="flex items-center gap-1.5">
                <GlobeIcon className="size-3.5" aria-hidden />
                網路搜尋
              </Eyebrow>
              {research.web_skipped && <Small className="text-xs italic">{research.web_skipped}</Small>}
              {research.web_error && (
                <Notice tone="warning" title="網路搜尋失敗">
                  {research.web_error}
                </Notice>
              )}
              {research.web_text && (
                <details>
                  <summary className="cursor-pointer text-xs font-medium text-muted-foreground select-none hover:text-foreground">
                    搜尋到的完整整理
                  </summary>
                  <AiMarkdown className="mt-2 text-sm">{research.web_text}</AiMarkdown>
                </details>
              )}
              {research.web_citations.length > 0 && (
                <ul className="flex flex-col gap-1">
                  {research.web_citations.map((c) => (
                    <li key={c.url} className="truncate text-xs">
                      <a href={c.url} target="_blank" rel="noreferrer" className={linkClass}>
                        {c.title}
                      </a>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>

          <Small className="text-2xs">
            搜尋時間：{new Date(research.searched_at).toLocaleString()}。功能清單改過之後可以重新搜尋。
          </Small>
        </>
      )}
    </div>
  )
}

export function ResearchButton({
  project,
  actions,
  hasProvider,
}: {
  project: ConvergenceProject
  actions: ConvergenceActions
  hasProvider: boolean
}) {
  return (
    <Button
      size="sm"
      variant="ai"
      disabled={!hasProvider || actions.busy !== null}
      onClick={() => void actions.run('research')}
    >
      <SearchIcon />
      {project.research ? '重新搜尋' : '開始搜尋'}
    </Button>
  )
}
