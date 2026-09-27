import React from "react"
import { cn } from "@/lib/utils"

/**
 * prompt-kit's CodeBlock, with the shiki highlighter removed.
 *
 * The registry version calls `codeToHtml` from `shiki`, which ships every
 * grammar and theme it knows: it added ~425kB to the entry chunk and 300-odd
 * lazy chunks. In this app a fenced code block is an occasional aside inside
 * model output — it is never the content — so the trade wasn't worth it. The
 * exported API is unchanged, including `language` and `theme`, so swapping the
 * highlighter back in later is a change to this file alone.
 */

export type CodeBlockProps = {
  children?: React.ReactNode
  className?: string
} & React.HTMLProps<HTMLDivElement>

function CodeBlock({ children, className, ...props }: CodeBlockProps) {
  return (
    <div
      className={cn(
        "not-prose flex w-full flex-col overflow-clip border",
        "rounded-xl border-border bg-subtle text-card-foreground",
        className
      )}
      {...props}
    >
      {children}
    </div>
  )
}

export type CodeBlockCodeProps = {
  code: string
  /** Kept for API parity with the registry component; shown as a corner label. */
  language?: string
  /** Accepted and ignored — see the note above. */
  theme?: string
  className?: string
} & React.HTMLProps<HTMLDivElement>

function CodeBlockCode({
  code,
  language = "tsx",
  theme: _theme,
  className,
  ...props
}: CodeBlockCodeProps) {
  return (
    <div className={cn("relative w-full", className)} {...props}>
      {language && language !== "plaintext" && (
        <span className="absolute top-2 right-3 font-mono text-2xs text-muted-foreground/70 select-none">
          {language}
        </span>
      )}
      <pre className="w-full overflow-x-auto px-4 py-3.5">
        <code className="font-mono text-xs leading-relaxed text-foreground/85">{code}</code>
      </pre>
    </div>
  )
}

export type CodeBlockGroupProps = React.HTMLAttributes<HTMLDivElement>

function CodeBlockGroup({
  children,
  className,
  ...props
}: CodeBlockGroupProps) {
  return (
    <div
      className={cn("flex items-center justify-between", className)}
      {...props}
    >
      {children}
    </div>
  )
}

export { CodeBlockGroup, CodeBlockCode, CodeBlock }
