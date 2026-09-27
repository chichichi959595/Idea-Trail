import { useRef, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { api, isStopped } from './api'
import type { Idea, MethodRecommendation, MethodRun, Session } from './types'
import { NewSessionForm } from './components/NewSessionForm'
import { MethodSelectorView } from './components/MethodSelectorView'
import { FrameworkRunView } from './components/FrameworkRunView'
import { IdeaBoard } from './components/IdeaBoard'
import { ProposalDetail } from './components/ProposalDetail'
import { useMethodCatalog } from './useMethodCatalog'
import { AppShell, type NavStep } from '@/components/layout/AppShell'
import { SessionAside } from '@/components/layout/SessionAside'

type Tab = 'select' | 'run' | 'ideas'

function App() {
  const queryClient = useQueryClient()
  const { get: getMethod } = useMethodCatalog()

  const [session, setSession] = useState<Session | null>(null)
  const [recommendations, setRecommendations] = useState<MethodRecommendation[]>([])
  const [ruleRanking, setRuleRanking] = useState<string[]>([])
  const [adjustmentNote, setAdjustmentNote] = useState('')
  const [activeRun, setActiveRun] = useState<MethodRun | null>(null)
  const [tab, setTab] = useState<Tab>('select')
  // '' = no provider chosen yet — neither block should look selected until
  // the user actually picks one (that pick is what kicks off the AI call).
  const [provider, setProvider] = useState('')
  // Models that go with the chosen provider; '' = let the backend fall back to
  // that provider's default. Two of them, because the per-step agents do a
  // relevance check and jot a fragment or two — the convergence call is the one
  // whose reasoning the team keeps.
  const [model, setModel] = useState('')
  const [stepModel, setStepModel] = useState('')
  const [selectedIdeaIds, setSelectedIdeaIds] = useState<number[]>([])
  const [detailIdea, setDetailIdea] = useState<Idea | null>(null)

  const [creatingSession, setCreatingSession] = useState(false)
  const [sessionError, setSessionError] = useState<string | null>(null)
  const [recommending, setRecommending] = useState(false)
  const [recommendError, setRecommendError] = useState<string | null>(null)
  const [starting, setStarting] = useState(false)
  const [answering, setAnswering] = useState(false)
  const [runError, setRunError] = useState<string | null>(null)
  const [runFeedback, setRunFeedback] = useState<string | null>(null)
  const [synthesizing, setSynthesizing] = useState(false)
  const [synthError, setSynthError] = useState<string | null>(null)
  // True from the moment the stop button is pressed until the call is gone.
  // The stop is a round-trip of its own (it's what kills the CLI), so it needs
  // its own state rather than borrowing `answering`.
  const [stopping, setStopping] = useState(false)
  // Reasoning from whichever call is currently in flight. One field, because
  // only ever one call is running at a time, and it's cleared when the next
  // one starts so stale text never sits under a fresh spinner.
  const [thinking, setThinking] = useState('')

  // Appends rather than replaces: the deltas arrive as fragments.
  const collect = (chunk: string) => setThinking((prev) => prev + chunk)

  // Aborts whichever run call is in flight. Held in a ref rather than state
  // because nothing renders from it — the stop button renders from `answering`.
  const runAbort = useRef<AbortController | null>(null)

  const { data: providersHealth } = useQuery({
    queryKey: ['providers-health'],
    queryFn: api.providersHealth,
  })

  const { data: ideas = [] } = useQuery({
    queryKey: ['ideas', session?.id],
    queryFn: () => api.listIdeas(session!.id),
    enabled: !!session,
  })

  async function handleCreateSession(payload: Partial<Session>) {
    setCreatingSession(true)
    setSessionError(null)
    try {
      const s = await api.createSession(payload)
      setSession(s)
      setTab('select')
    } catch (e) {
      setSessionError(e instanceof Error ? e.message : String(e))
    } finally {
      setCreatingSession(false)
    }
  }

  // Fires when the user picks (or switches) the LLM provider on the Method
  // Selector screen — that pick is the actual trigger for the AI call that
  // writes the recommendation rationale, so it's what should show "thinking".
  async function handleSelectProvider(p: string, m: string, stepM: string) {
    if (!session) return
    setProvider(p)
    setModel(m)
    setStepModel(stepM)
    setRecommending(true)
    setRecommendError(null)
    setRecommendations([])
    setRuleRanking([])
    setAdjustmentNote('')
    setThinking('')
    try {
      const res = await api.recommendMethods(session.id, p, m, collect)
      setRecommendations(res.recommendations)
      setRuleRanking(res.rule_ranking)
      setAdjustmentNote(res.adjustment_note)
    } catch (e) {
      setRecommendError(e instanceof Error ? e.message : String(e))
    } finally {
      setRecommending(false)
    }
  }

  // The settings come from the method screen rather than from this state,
  // because picking a method by hand doesn't require having run the AI
  // recommendation — so `provider` here may still be empty when a run starts.
  async function handleStartMethod(method: string, p: string, m: string, stepM: string) {
    if (!session) return
    setProvider(p)
    setModel(m)
    setStepModel(stepM)
    setStarting(true)
    setRunError(null)
    setRunFeedback(null)
    try {
      const run = await api.createMethodRun(session.id, method, p, m, stepM)
      setActiveRun(run)
      setTab('run')
    } catch (e) {
      setRunError(e instanceof Error ? e.message : String(e))
    } finally {
      setStarting(false)
    }
  }

  async function handleAnswer(stepIndex: number, answer: string, force = false) {
    if (!activeRun) return
    const abort = new AbortController()
    runAbort.current = abort
    setAnswering(true)
    setRunError(null)
    setThinking('')
    try {
      const result = await api.answerStep(
        activeRun.id,
        stepIndex,
        answer,
        force,
        collect,
        abort.signal,
      )
      setActiveRun(result.method_run)
      setRunFeedback(result.accepted ? null : result.feedback)
      if (result.ideas) {
        queryClient.invalidateQueries({ queryKey: ['ideas', session?.id] })
        announceIdeas(result.ideas.length)
      }
    } catch (e) {
      // A stop isn't a failure: the run is exactly where it was, and the
      // answer has already gone back to the input box.
      if (!isStopped(e)) setRunError(e instanceof Error ? e.message : String(e))
    } finally {
      runAbort.current = null
      setAnswering(false)
      setStopping(false)
    }
  }

  async function handleRetryFinalize() {
    if (!activeRun) return
    const abort = new AbortController()
    runAbort.current = abort
    setAnswering(true)
    setRunError(null)
    setThinking('')
    try {
      const result = await api.retryFinalize(activeRun.id, collect, abort.signal)
      setActiveRun(result.method_run)
      if (result.ideas) {
        queryClient.invalidateQueries({ queryKey: ['ideas', session?.id] })
        announceIdeas(result.ideas.length)
      }
    } catch (e) {
      if (!isStopped(e)) setRunError(e instanceof Error ? e.message : String(e))
    } finally {
      runAbort.current = null
      setAnswering(false)
      setStopping(false)
    }
  }

  /**
   * Stop the provider call this run has in flight.
   *
   * Both halves matter and in this order: the backend request is the only
   * thing that can kill the CLI subprocess (a dropped connection goes
   * unnoticed for the whole length of a call that streams nothing), and the
   * local abort is what frees the UI without waiting to find out.
   */
  async function handleStopRun() {
    if (!activeRun || !answering) return
    setStopping(true)
    try {
      await api.cancelMethodRun(activeRun.id)
    } catch {
      // Nothing to tell the user: the abort below stops the waiting either
      // way, and a run that's already finished has nothing left to stop.
    }
    runAbort.current?.abort()
  }

  async function handleSynthesize() {
    if (!session) return
    setSynthesizing(true)
    setSynthError(null)
    setThinking('')
    try {
      const combined = await api.synthesize(session.id, selectedIdeaIds, provider, model, collect)
      setSelectedIdeaIds([])
      queryClient.invalidateQueries({ queryKey: ['ideas', session.id] })
      toast.success(`整合出 ${combined.length} 個新想法`, {
        description: '已加進想法牆。',
      })
    } catch (e) {
      setSynthError(e instanceof Error ? e.message : String(e))
    } finally {
      setSynthesizing(false)
    }
  }

  /** Announces a convergence result, with the jump to where it landed —
   * the ideas are on another screen, so the toast is also the way there. */
  function announceIdeas(count: number) {
    if (count === 0) return
    toast.success(`收斂出 ${count} 個候選想法`, {
      description: '已加進想法牆。',
      action: { label: '去看看', onClick: () => setTab('ideas') },
    })
  }

  function toggleSelectIdea(id: number) {
    setSelectedIdeaIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]))
  }

  // The rail's three phases. `state` is derived from what the session has
  // actually produced, not from which tab is showing, so the rail reads as
  // progress rather than as a set of links.
  // The catalog's own total, not `activeRun.steps.length` — the backend adds
  // one step row at a time, so the run's own array would make the rail read
  // "1/1" on the first step and "2/2" on the second. See FrameworkRunView.
  const runTotalSteps = activeRun
    ? (getMethod(activeRun.method_name)?.step_count ?? activeRun.steps.length)
    : 0

  const navSteps: NavStep[] = [
    {
      id: 'select',
      label: '方法選擇',
      state: activeRun ? 'done' : 'current',
    },
    {
      id: 'run',
      label: '發想中',
      hint: activeRun ? `${Math.min(activeRun.current_step_index + 1, runTotalSteps)}/${runTotalSteps}` : undefined,
      state: activeRun?.status === 'done' ? 'done' : activeRun ? 'current' : 'upcoming',
      disabled: !activeRun,
    },
    {
      id: 'ideas',
      label: '想法牆',
      hint: ideas.length ? String(ideas.length) : undefined,
      state: ideas.length > 0 ? 'done' : 'upcoming',
    },
  ]

  // Before a session exists there is no shell — the intake form is the whole
  // screen, because there is nothing yet for a rail to be about.
  if (!session) {
    return (
      <NewSessionForm
        onSubmit={handleCreateSession}
        submitting={creatingSession}
        error={sessionError}
      />
    )
  }

  return (
    <>
      <AppShell
        steps={navSteps}
        activeId={tab}
        onNavigate={(id) => setTab(id as Tab)}
        aside={
          <SessionAside
            session={session}
            provider={provider}
            model={model}
            stepModel={stepModel}
            providersHealth={providersHealth}
            ideaCount={ideas.length}
          />
        }
      >
        {tab === 'select' && (
          <MethodSelectorView
            recommendations={recommendations}
            ruleRanking={ruleRanking}
            adjustmentNote={adjustmentNote}
            providersHealth={providersHealth}
            provider={provider}
            model={model}
            stepModel={stepModel}
            onProviderChange={handleSelectProvider}
            recommending={recommending}
            thinking={thinking}
            recommendError={recommendError}
            onStart={handleStartMethod}
            starting={starting}
          />
        )}

        {tab === 'run' && activeRun && (
          <FrameworkRunView
            run={activeRun}
            onAnswer={handleAnswer}
            submitting={answering}
            thinking={thinking}
            error={runError}
            feedback={runFeedback}
            onRetryFinalize={handleRetryFinalize}
            onStop={handleStopRun}
            stopping={stopping}
            onGoToIdeas={() => setTab('ideas')}
          />
        )}

        {tab === 'ideas' && (
          <IdeaBoard
            ideas={ideas}
            selectedIds={selectedIdeaIds}
            onToggleSelect={toggleSelectIdea}
            onSynthesize={handleSynthesize}
            synthesizing={synthesizing}
            thinking={thinking}
            onOpenDetail={setDetailIdea}
            onBackToMethods={() => setTab('select')}
            error={synthError}
          />
        )}
      </AppShell>

      {detailIdea && (
        <ProposalDetail idea={detailIdea} allIdeas={ideas} onClose={() => setDetailIdea(null)} />
      )}
    </>
  )
}

export default App
