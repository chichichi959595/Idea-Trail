import { useRef, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { api, isStopped } from '../../api'
import type {
  ConvergenceAgentStage,
  ConvergenceDecision,
  ConvergenceFeature,
  ConvergencePatch,
  ConvergenceProject,
  DebateMode,
  DemandVerdict,
  MoscowBucket,
} from '../../types'

export const PROJECTS_KEY = ['convergence-projects']

export const MOSCOW: Record<MoscowBucket, { label: string; hint: string }> = {
  must: { label: 'Must', hint: '一定要有，少了它產品就不成立' },
  should: { label: 'Should', hint: '應該要有，但第一版沒有也能用' },
  could: { label: 'Could', hint: '有更好，時間夠才做' },
  wont: { label: "Won't", hint: '這一版明確不做' },
}
export const MOSCOW_ORDER: MoscowBucket[] = ['must', 'should', 'could', 'wont']

/** Features that go on the impact × effort matrix: sorted, and not Won't. */
export const onMatrix = (f: ConvergenceFeature) => f.moscow !== null && f.moscow !== 'wont'

export const isPlaced = (f: ConvergenceFeature) => f.impact !== null && f.effort !== null

/**
 * The convergence screen's one source of writes: the user's edits (`save`)
 * and the agent stages (`run`). Both answer with the whole record, which goes
 * straight into the shared query cache, so every page reads the same row.
 */
export function useConvergenceActions(
  project: ConvergenceProject | null,
  provider: string,
  model: string,
) {
  const queryClient = useQueryClient()
  const [busy, setBusy] = useState<ConvergenceAgentStage | null>(null)
  const [stopping, setStopping] = useState(false)
  const [thinking, setThinking] = useState('')
  const [errors, setErrors] = useState<Partial<Record<ConvergenceAgentStage, string>>>({})
  const abort = useRef<AbortController | null>(null)
  // Saves can overlap — three quick drags send three PATCHes — and come back
  // out of order. Only the newest one's answer is allowed into the cache, or
  // a slow early response would snap a card back to where it was two drags ago.
  const saveSeq = useRef(0)

  const put = (row: ConvergenceProject) =>
    queryClient.setQueryData<ConvergenceProject[]>(PROJECTS_KEY, (prev = []) =>
      prev.some((p) => p.id === row.id)
        ? prev.map((p) => (p.id === row.id ? row : p))
        : [row, ...prev],
    )

  async function save(patch: ConvergencePatch) {
    if (!project) return
    const seq = ++saveSeq.current
    put({ ...project, ...patch })
    try {
      const row = await api.updateConvergence(project.id, patch)
      if (seq === saveSeq.current) put(row)
    } catch (e) {
      toast.error('沒有存成功', { description: e instanceof Error ? e.message : String(e) })
      queryClient.invalidateQueries({ queryKey: PROJECTS_KEY })
    }
  }

  async function run(
    stage: ConvergenceAgentStage,
    extra?: { focus?: string; mode?: DebateMode; side?: 'pro' | 'con'; text?: string },
  ) {
    if (!project || busy) return false
    const controller = new AbortController()
    abort.current = controller
    setBusy(stage)
    setThinking('')
    setErrors((prev) => ({ ...prev, [stage]: undefined }))
    try {
      const row = await api.runConvergenceAgent(
        project.id,
        stage,
        { provider, model, ...extra, focus: extra?.focus || null },
        (chunk) => setThinking((prev) => prev + chunk),
        controller.signal,
      )
      put(row)
      return true
    } catch (e) {
      if (!isStopped(e)) {
        setErrors((prev) => ({ ...prev, [stage]: e instanceof Error ? e.message : String(e) }))
      }
      return false
    } finally {
      abort.current = null
      setBusy(null)
      setStopping(false)
    }
  }

  async function stop() {
    if (!project || !abort.current) return
    setStopping(true)
    try {
      await api.cancelConvergence(project.id)
    } finally {
      abort.current?.abort()
    }
  }

  return { save, run, stop, busy, stopping, thinking, errors }
}

export type ConvergenceActions = ReturnType<typeof useConvergenceActions>

export const VERDICT_LABELS: Record<DemandVerdict, string> = {
  real: '需求成立',
  unsure: '還需要驗證',
  not_real: '需求不成立',
}

export const DECISION_LABELS: Record<ConvergenceDecision, string> = {
  go: '開始做',
  pivot: '調整方向',
  drop: '先放下',
}

/** The dataTransfer type a feature card carries. Its own MIME type rather
 * than text/plain, so dropping some selected text on a column does nothing. */
export const FEATURE_DRAG_TYPE = 'application/x-convergence-feature'
