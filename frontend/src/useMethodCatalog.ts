import { useQuery } from '@tanstack/react-query'
import { api } from './api'
import type { MethodCatalogEntry } from './types'

/** The method catalog, fetched once and cached for the session.
 *
 * It's static reference data served by the backend, so it never needs
 * refetching — but it does arrive asynchronously, hence the `labelOf`/
 * `shortLabelOf` helpers, which fall back to the raw method name so nothing
 * renders blank during the first paint.
 */
export function useMethodCatalog() {
  const { data: methods = [] } = useQuery({
    queryKey: ['methods'],
    queryFn: api.listMethods,
    staleTime: Infinity,
    gcTime: Infinity,
  })

  const byName = new Map(methods.map((m) => [m.name, m]))
  const get = (name: string | null | undefined): MethodCatalogEntry | undefined =>
    name ? byName.get(name) : undefined

  return {
    methods,
    get,
    labelOf: (name: string | null | undefined) => get(name)?.label ?? name ?? '',
    shortLabelOf: (name: string | null | undefined) => get(name)?.short_label ?? name ?? '',
  }
}
