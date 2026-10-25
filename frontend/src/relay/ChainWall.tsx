import type { ReactNode } from 'react'
import { HelpCircleIcon } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Eyebrow } from '@/components/design/typography'
import type { RelayChain } from './types'

/**
 * The reveal: every chain side by side, read top to bottom.
 *
 * Same questions on every chain, so reading across a row compares how N people
 * answered the same rung starting from different papers — which is what the
 * discussion after the reveal is about. Gaps and 「看不懂」 flags stay visible
 * rather than being tidied away; why a sentence couldn't be carried on is
 * worth talking about too.
 */
export function ChainWall({
  chains,
  showAuthors = false,
  actions,
  className,
}: {
  chains: RelayChain[]
  showAuthors?: boolean
  /** Under each chain — the host's 「存進痛點庫」. */
  actions?: (chain: RelayChain) => ReactNode
  className?: string
}) {
  return (
    <div className={cn('grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3', className)}>
      {chains.map((chain) => (
        <article
          key={chain.chain_index}
          className="flex flex-col gap-0 rounded-xl border border-border bg-surface p-4 shadow-xs"
        >
          <Eyebrow className="pb-3">第 {chain.chain_index + 1} 條</Eyebrow>
          <ol className="flex flex-col">
            {chain.cells.map((cell, i) => (
              <li
                key={cell.round_index}
                className={cn(
                  'relative flex flex-col gap-1 border-l-2 pb-4 pl-4 last:pb-0',
                  i === chain.cells.length - 1 ? 'border-primary/50' : 'border-border',
                )}
              >
                <span className="text-2xs text-muted-foreground">{cell.question}</span>
                {cell.answer ? (
                  <p className="text-base leading-relaxed whitespace-pre-wrap text-foreground">
                    {cell.answer}
                  </p>
                ) : (
                  <p className="text-sm text-muted-foreground/70 italic">（時間到，沒有寫）</p>
                )}
                {(cell.flagged_unclear || (showAuthors && cell.author)) && (
                  <div className="flex flex-wrap items-center gap-2 pt-0.5">
                    {cell.flagged_unclear && (
                      <span className="inline-flex items-center gap-1 rounded-full bg-warning-muted px-2 py-0.5 text-2xs font-medium text-warning">
                        <HelpCircleIcon className="size-3" aria-hidden />
                        有人看不懂
                      </span>
                    )}
                    {showAuthors && cell.author && (
                      <span className="text-2xs text-muted-foreground">— {cell.author}</span>
                    )}
                  </div>
                )}
              </li>
            ))}
          </ol>
          {actions && <div className="mt-auto flex flex-wrap gap-2 pt-4">{actions(chain)}</div>}
        </article>
      ))}
    </div>
  )
}
