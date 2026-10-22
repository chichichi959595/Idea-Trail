import { useState, type ReactNode } from 'react'
import { ArrowDownIcon, ArrowUpIcon, ChevronsUpDownIcon } from 'lucide-react'
import { cn } from '@/lib/utils'

export interface Column<T> {
  id: string
  /** A label, or a control — the selection column's select-all box. */
  header: ReactNode
  cell: (row: T) => ReactNode
  /** Makes the column sortable by this value. */
  sortValue?: (row: T) => string | number
  className?: string
  /** Numbers and dates line up on the right. */
  align?: 'left' | 'right'
}

/**
 * A library as rows and columns, like a database view.
 *
 * Click a header to sort by it, again to flip the order. The table scrolls
 * sideways inside its own frame on a narrow screen rather than squeezing every
 * column to nothing, and the header stays put while the rows scroll.
 */
export function DataTable<T>({
  columns,
  rows,
  rowKey,
  onRowClick,
  isSelected,
  initialSort,
  empty,
  className,
}: {
  columns: Column<T>[]
  rows: T[]
  rowKey: (row: T) => string | number
  onRowClick?: (row: T) => void
  /** Rows the user has ticked, drawn tinted so a selection reads at a glance. */
  isSelected?: (row: T) => boolean
  initialSort?: { id: string; desc: boolean }
  empty?: ReactNode
  className?: string
}) {
  const [sort, setSort] = useState(initialSort ?? null)

  const sortColumn = sort ? columns.find((c) => c.id === sort.id) : undefined
  const sorted =
    sortColumn?.sortValue && sort
      ? [...rows].sort((a, b) => {
          const va = sortColumn.sortValue!(a)
          const vb = sortColumn.sortValue!(b)
          const cmp =
            typeof va === 'number' && typeof vb === 'number'
              ? va - vb
              : String(va).localeCompare(String(vb), 'zh-Hant')
          return sort.desc ? -cmp : cmp
        })
      : rows

  function toggle(id: string) {
    setSort((prev) => (prev?.id === id ? { id, desc: !prev.desc } : { id, desc: false }))
  }

  return (
    <div
      className={cn(
        // Content height until the screen runs out, then it shrinks and scrolls
        // inside itself — the libraries' pages don't scroll.
        'min-h-40 shrink overflow-auto rounded-xl border border-border bg-surface shadow-xs',
        className,
      )}
    >
      <table className="w-full min-w-[720px] border-collapse text-sm">
        <thead className="sticky top-0 z-10 bg-muted/95 backdrop-blur-sm">
          <tr>
            {columns.map((c) => {
              const active = sort?.id === c.id
              const Icon = !active ? ChevronsUpDownIcon : sort.desc ? ArrowDownIcon : ArrowUpIcon
              return (
                <th
                  key={c.id}
                  scope="col"
                  aria-sort={active ? (sort.desc ? 'descending' : 'ascending') : undefined}
                  className={cn(
                    'border-b border-border px-3 py-2 text-xs font-medium whitespace-nowrap text-muted-foreground',
                    c.align === 'right' ? 'text-right' : 'text-left',
                  )}
                >
                  {c.sortValue ? (
                    <button
                      type="button"
                      onClick={() => toggle(c.id)}
                      className={cn(
                        'inline-flex items-center gap-1 rounded-sm transition-colors hover:text-foreground focus-visible:ring-[3px] focus-visible:ring-ring focus-visible:outline-none',
                        active && 'text-foreground',
                        c.align === 'right' && 'flex-row-reverse',
                      )}
                    >
                      {c.header}
                      <Icon className={cn('size-3', !active && 'opacity-50')} aria-hidden />
                    </button>
                  ) : (
                    c.header
                  )}
                </th>
              )
            })}
          </tr>
        </thead>
        <tbody>
          {sorted.length === 0 ? (
            <tr>
              <td colSpan={columns.length} className="px-3 py-10 text-center text-muted-foreground">
                {empty ?? '沒有資料'}
              </td>
            </tr>
          ) : (
            sorted.map((row) => (
              <tr
                key={rowKey(row)}
                onClick={onRowClick ? () => onRowClick(row) : undefined}
                aria-selected={isSelected ? isSelected(row) : undefined}
                className={cn(
                  'border-b border-border last:border-b-0 transition-colors',
                  onRowClick && 'cursor-pointer hover:bg-accent',
                  isSelected?.(row) && 'bg-brand-muted/60 hover:bg-brand-muted',
                )}
              >
                {columns.map((c) => (
                  <td
                    key={c.id}
                    className={cn(
                      'px-3 py-2.5 align-top',
                      c.align === 'right' && 'text-right',
                      c.className,
                    )}
                  >
                    {c.cell(row)}
                  </td>
                ))}
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  )
}

/** Stops a click inside a cell (a button, a select) from also opening the row. */
export function CellAction({ children }: { children: ReactNode }) {
  return (
    // eslint-disable-next-line jsx-a11y/no-static-element-interactions, jsx-a11y/click-events-have-key-events
    <div className="inline-flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
      {children}
    </div>
  )
}

