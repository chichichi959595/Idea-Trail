import { Activity, useCallback, useRef, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { LightbulbIcon, ListChecksIcon } from 'lucide-react'
import { api, isStopped, type LibraryKind } from './api'
import type {
  AnswerStepResponse,
  Idea,
  IdeaSize,
  MethodRecommendation,
  MethodStage,
  MethodRun,
  PainPointDraft,
  Session,
} from './types'
import { EMPTY_INTAKE, toSessionPayload, type Intake } from './intake'
import { LandingScreen } from './components/LandingScreen'
import { SetupView } from './components/SetupView'
import { DiscoverView, DiscoveryResult } from './components/DiscoverView'
import { IdeateView } from './components/IdeateView'
import { FrameworkRunView } from './components/FrameworkRunView'
import { ConvergenceView } from './components/convergence/ConvergenceView'
import { PainPointLibrary } from './components/PainPointLibrary'
import { IdeaLibrary } from './components/IdeaLibrary'
import { PainPointBanner } from './components/painpoints'
import { useMethodCatalog } from './useMethodCatalog'
import { AppShell, type NavPlace, type NavStep } from '@/components/layout/AppShell'
import { SessionAside } from '@/components/layout/SessionAside'
import { Button } from '@/components/ui/button'
import { RelayHostView } from './relay/RelayHostView'

/** The four steps of a session, then the two libraries that outlive it. */
type Tab = 'setup' | 'discover' | 'ideate' | 'converge' | 'pain-library' | 'idea-library'

/** Which of the two runs a step answer belongs to: 痛點發想's or 專案發想's. */
type RunSlot = 'discover' | 'ideate'

function App() {
  const queryClient = useQueryClient()
  const { get: getMethod } = useMethodCatalog()

  // The session row, once there is one. It is created lazily — see
  // `ensureSession` — so this stays null while the user is still filling in the
  // setup screen.
  const [session, setSession] = useState<Session | null>(null)
  // Whether the user has left the landing screen. Separate from `session`,
  // because entering the workbench no longer writes anything.
  const [started, setStarted] = useState(false)
  // The team's answers, live. They live here rather than in the form because
  // every call that reads them has to be able to save them first.
  const [intake, setIntake] = useState<Intake>(EMPTY_INTAKE)
  const [tab, setTab] = useState<Tab>('setup')
  // The two libraries stay mounted once opened, hidden rather than torn down,
  // so coming back finds them as they were left: graph or table, the colour
  // picked, the ticked ideas, the zoom.
  const [openedLibraries, setOpenedLibraries] = useState<Set<Tab>>(() => new Set())
  if ((tab === 'pain-library' || tab === 'idea-library') && !openedLibraries.has(tab)) {
    setOpenedLibraries(new Set(openedLibraries).add(tab))
  }
  const libraryMode = (t: Tab) => (tab === t ? 'visible' : 'hidden')
  // '' = no provider chosen yet.
  const [provider, setProvider] = useState('')
  // Models that go with the chosen provider; '' = let the backend fall back to
  // that provider's default. Two of them, because the per-step agents do a
  // relevance check and jot a fragment or two — the convergence call is the one
  // whose reasoning the team keeps.
  const [model, setModel] = useState('')
  const [stepModel, setStepModel] = useState('')

  // The problem 專案發想 is working on. Recommendations are argued for one
  // particular problem, so they're cleared whenever this changes.
  const [painPointId, setPainPointId] = useState<number | null>(null)
  // One recommendation per stage: 痛點發想 and 專案發想 each pick from their
  // own catalog, and asking for one must not clear what the other is showing.
  const [recs, setRecs] = useState<Record<MethodStage, Recommendations>>({
    ideation: NO_RECOMMENDATIONS,
    discovery: NO_RECOMMENDATIONS,
  })
  const [recommendingStage, setRecommendingStage] = useState<MethodStage | null>(null)

  const [discoveryRun, setDiscoveryRun] = useState<MethodRun | null>(null)
  const [ideationRun, setIdeationRun] = useState<MethodRun | null>(null)

  // The one idea 專案收斂 is working on, picked there or sent from 想法庫.
  const [convergeIdeaId, setConvergeIdeaId] = useState<number | null>(null)
  const [openingConvergence, setOpeningConvergence] = useState(false)

  const [continuing, setContinuing] = useState(false)
  const [continueError, setContinueError] = useState<string | null>(null)
  const [starting, setStarting] = useState(false)
  const [startError, setStartError] = useState<string | null>(null)
  const [answering, setAnswering] = useState(false)
  const [runError, setRunError] = useState<string | null>(null)
  const [runFeedback, setRunFeedback] = useState<string | null>(null)
  const [synthesizing, setSynthesizing] = useState(false)
  const [synthError, setSynthError] = useState<string | null>(null)
  // Which library's AI link analysis is running, and each one's last error.
  const [analyzing, setAnalyzing] = useState<LibraryKind | null>(null)
  const [analyzeErrors, setAnalyzeErrors] = useState<Partial<Record<LibraryKind, string>>>({})
  // True from the moment the stop button is pressed until the call is gone.
  const [stopping, setStopping] = useState(false)
  // Reasoning from whichever call is currently in flight. One field, because
  // only ever one call is running at a time, and it's cleared when the next
  // one starts so stale text never sits under a fresh spinner.
  const [thinking, setThinking] = useState('')

  // Appends rather than replaces: the deltas arrive as fragments.
  const collect = (chunk: string) => setThinking((prev) => prev + chunk)

  // Aborts whichever run call is in flight.
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

  // Every idea's convergence record, whichever session started it: the topic
  // is picked from 想法庫, which spans sessions.
  const { data: convergenceProjects = [] } = useQuery({
    queryKey: ['convergence-projects'],
    queryFn: api.listConvergenceProjects,
    enabled: started,
  })

  const { data: painPoints = [] } = useQuery({
    queryKey: ['pain-points'],
    queryFn: api.listPainPoints,
    enabled: started,
  })

  const { data: libraryIdeas = [] } = useQuery({
    queryKey: ['library-ideas'],
    queryFn: api.listAllIdeas,
    enabled: started,
  })

  const { data: ideaLinks = [] } = useQuery({
    queryKey: ['links', 'ideas'],
    queryFn: () => api.listLinks('ideas'),
    enabled: tab === 'idea-library',
  })

  const { data: painPointLinks = [] } = useQuery({
    queryKey: ['links', 'pain-points'],
    queryFn: () => api.listLinks('pain-points'),
    enabled: tab === 'pain-library',
  })

  const painPoint = painPoints.find((p) => p.id === painPointId) ?? null
  const sessionPainPoints = session ? painPoints.filter((p) => p.session_id === session.id) : []

  const updateIntake = useCallback(
    (patch: Partial<Intake>) => setIntake((prev) => ({ ...prev, ...patch })),
    [],
  )

  // What was last written to the session row, so an unchanged intake doesn't
  // cost a request on every call.
  const savedIntake = useRef('')

  /**
   * The session row, created or brought up to date on demand.
   *
   * Nothing is written when the user enters the workbench, only when they first
   * ask for something that reads their answers. Saving also files the setup
   * screen's pain point in the library, so the list is refreshed after.
   */
  async function ensureSession(): Promise<Session> {
    const payload = toSessionPayload(intake)
    const key = JSON.stringify(payload)
    if (session && key === savedIntake.current) return session
    const saved = session
      ? await api.updateSession(session.id, payload)
      : await api.createSession(payload)
    setSession(saved)
    savedIntake.current = key
    queryClient.invalidateQueries({ queryKey: ['pain-points'] })
    return saved
  }

  function refreshAfterIdeas() {
    queryClient.invalidateQueries({ queryKey: ['ideas', session?.id] })
    queryClient.invalidateQueries({ queryKey: ['library-ideas'] })
    queryClient.invalidateQueries({ queryKey: ['pain-points'] })
  }

  function pickPainPoint(id: number | null) {
    if (id === painPointId) return
    setPainPointId(id)
    setRecs((prev) => ({ ...prev, ideation: NO_RECOMMENDATIONS }))
  }

  /** Take a pain point into 專案發想 — from 痛點發想, a finished discovery run
   * or the library. Leaves whatever ideation run was on screen: a new problem
   * starts from choosing a method. */
  function takePainPoint(id: number) {
    pickPainPoint(id)
    if (ideationRun?.status !== 'running') setIdeationRun(null)
    setTab('ideate')
  }

  function handleProviderChange(p: string, m: string, stepM: string) {
    setProvider(p)
    setModel(m)
    setStepModel(stepM)
  }

  /** `discover` is the setup screen's 先用痛點發想釐清: the team has a pain
   * point, but the check found it vague, and they chose to sharpen it first.
   * It is still filed in the library by the save, so it can be picked back up. */
  async function handleContinue(destination?: 'discover') {
    setContinuing(true)
    setContinueError(null)
    try {
      const saved = await ensureSession()
      if (destination !== 'discover' && saved.setup_pain_point_id != null) {
        takePainPoint(saved.setup_pain_point_id)
      } else {
        setTab('discover')
      }
    } catch (e) {
      setContinueError(e instanceof Error ? e.message : String(e))
    } finally {
      setContinuing(false)
    }
  }

  async function handleRecommend(stage: MethodStage) {
    if (!provider) return
    setRecommendingStage(stage)
    setRecs((prev) => ({ ...prev, [stage]: NO_RECOMMENDATIONS }))
    setThinking('')
    try {
      const target = await ensureSession()
      const res = await api.recommendMethods(
        target.id,
        provider,
        model,
        stage === 'ideation' ? painPointId : null,
        collect,
        undefined,
        stage,
      )
      setRecs((prev) => ({
        ...prev,
        [stage]: {
          items: res.recommendations,
          ruleRanking: res.rule_ranking,
          adjustmentNote: res.adjustment_note,
          error: null,
        },
      }))
    } catch (e) {
      setRecs((prev) => ({
        ...prev,
        [stage]: {
          ...NO_RECOMMENDATIONS,
          error: e instanceof Error ? e.message : String(e),
        },
      }))
    } finally {
      setRecommendingStage(null)
    }
  }

  async function startRun(slot: RunSlot, method: string) {
    if (!provider) return
    setStarting(true)
    setStartError(null)
    setRunError(null)
    setRunFeedback(null)
    try {
      const target = await ensureSession()
      const run = await api.createMethodRun(
        target.id,
        method,
        provider,
        model,
        stepModel,
        slot === 'ideate' ? painPointId : null,
      )
      if (slot === 'discover') setDiscoveryRun(run)
      else setIdeationRun(run)
    } catch (e) {
      setStartError(e instanceof Error ? e.message : String(e))
    } finally {
      setStarting(false)
    }
  }

  const runOf = (slot: RunSlot) => (slot === 'discover' ? discoveryRun : ideationRun)
  const setRunOf = (slot: RunSlot) => (slot === 'discover' ? setDiscoveryRun : setIdeationRun)

  /** What every answer and retry does with its outcome. */
  function settle(slot: RunSlot, result: AnswerStepResponse) {
    setRunOf(slot)(result.method_run)
    if (result.ideas) {
      refreshAfterIdeas()
      announceIdeas(result.ideas.length)
    }
    if (result.pain_points) {
      queryClient.invalidateQueries({ queryKey: ['pain-points'] })
      if (result.pain_points.length > 0) {
        toast.success(`整理出 ${result.pain_points.length} 個痛點`, {
          description: '已存進痛點庫。',
        })
      }
    }
  }

  async function handleAnswer(slot: RunSlot, stepIndex: number, answer: string, force = false) {
    const run = runOf(slot)
    if (!run) return
    const abort = new AbortController()
    runAbort.current = abort
    setAnswering(true)
    setRunError(null)
    setThinking('')
    try {
      const result = await api.answerStep(run.id, stepIndex, answer, force, collect, abort.signal)
      setRunFeedback(result.accepted ? null : result.feedback)
      settle(slot, result)
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

  async function handleRetryFinalize(slot: RunSlot) {
    const run = runOf(slot)
    if (!run) return
    const abort = new AbortController()
    runAbort.current = abort
    setAnswering(true)
    setRunError(null)
    setThinking('')
    try {
      settle(slot, await api.retryFinalize(run.id, collect, abort.signal))
    } catch (e) {
      if (!isStopped(e)) setRunError(e instanceof Error ? e.message : String(e))
    } finally {
      runAbort.current = null
      setAnswering(false)
      setStopping(false)
    }
  }

  /**
   * Stop the provider call a run has in flight.
   *
   * Both halves matter and in this order: the backend request is the only
   * thing that can kill the CLI subprocess, and the local abort is what frees
   * the UI without waiting to find out.
   */
  async function handleStopRun(slot: RunSlot) {
    const run = runOf(slot)
    if (!run || !answering) return
    setStopping(true)
    try {
      await api.cancelMethodRun(run.id)
    } catch {
      // Nothing to tell the user: the abort below stops the waiting either way.
    }
    runAbort.current?.abort()
  }

  /** 想法庫's 整合想法. Resolves whether it worked, so the library can clear
   * its selection only when the merged idea is actually there. */
  async function handleSynthesize(ideaIds: number[]): Promise<boolean> {
    setSynthesizing(true)
    setSynthError(null)
    setThinking('')
    try {
      const target = await ensureSession()
      const combined = await api.synthesize(target.id, ideaIds, provider, model, collect)
      refreshAfterIdeas()
      toast.success(`整合出 ${combined.length} 個新想法`, {
        description: '已加進想法庫。',
      })
      return true
    } catch (e) {
      setSynthError(e instanceof Error ? e.message : String(e))
      return false
    } finally {
      setSynthesizing(false)
    }
  }

  async function handleDeleteIdeas(ideaIds: number[]) {
    try {
      await Promise.all(ideaIds.map((id) => api.deleteIdea(id)))
      if (convergeIdeaId !== null && ideaIds.includes(convergeIdeaId)) setConvergeIdeaId(null)
      toast.success(`刪除了 ${ideaIds.length} 個想法`)
    } catch (e) {
      toast.error('有想法沒有刪成功', {
        description: e instanceof Error ? e.message : String(e),
      })
    } finally {
      refreshAfterIdeas()
      // The backend drops a deleted idea's AI links and convergence record with it.
      queryClient.invalidateQueries({ queryKey: ['links', 'ideas'] })
      queryClient.invalidateQueries({ queryKey: ['convergence-projects'] })
    }
  }

  /** Picks the idea 專案收斂 works on, opening (or reopening) its record. */
  async function handleConverge(ideaId: number) {
    setConvergeIdeaId(ideaId)
    setTab('converge')
    setOpeningConvergence(true)
    try {
      // The current session's team is who the agents argue for — not
      // necessarily the session that produced the idea. No session yet means
      // the backend falls back to the idea's own.
      const row = await api.openConvergence(ideaId, session?.id ?? null)
      queryClient.setQueryData<typeof convergenceProjects>(['convergence-projects'], (prev = []) =>
        prev.some((p) => p.id === row.id)
          ? prev.map((p) => (p.id === row.id ? row : p))
          : [row, ...prev],
      )
    } catch (e) {
      toast.error('沒有打開收斂紀錄', {
        description: e instanceof Error ? e.message : String(e),
      })
    } finally {
      setOpeningConvergence(false)
    }
  }

  async function handleAnalyzeLinks(library: LibraryKind) {
    if (!provider || analyzing) return
    setAnalyzing(library)
    setAnalyzeErrors((prev) => ({ ...prev, [library]: undefined }))
    setThinking('')
    try {
      const links = await api.analyzeLinks(library, provider, model, collect)
      queryClient.setQueryData(['links', library], links)
      toast.success(`AI 找出 ${links.length} 條關聯`)
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e)
      setAnalyzeErrors((prev) => ({ ...prev, [library]: message }))
    } finally {
      setAnalyzing(null)
    }
  }

  const analyzeStateFor = (library: LibraryKind) => ({
    hasProvider: !!provider,
    onAnalyze: () => handleAnalyzeLinks(library),
    analyzing: analyzing === library,
    thinking,
    error: analyzeErrors[library] ?? null,
  })

  async function handleSetSize(id: number, size: IdeaSize | null) {
    // Optimistic: the dot should change size under the user's click, not a
    // round-trip later.
    const patch = (list: Idea[] | undefined) => list?.map((i) => (i.id === id ? { ...i, size } : i))
    queryClient.setQueryData<Idea[]>(['library-ideas'], patch)
    queryClient.setQueryData<Idea[]>(['ideas', session?.id], patch)
    try {
      await api.setIdeaSize(id, size)
    } catch (e) {
      toast.error('規模沒有存成功', {
        description: e instanceof Error ? e.message : String(e),
      })
      queryClient.invalidateQueries({ queryKey: ['library-ideas'] })
      queryClient.invalidateQueries({ queryKey: ['ideas', session?.id] })
    }
  }

  async function createPainPoint(draft: PainPointDraft) {
    await api.createPainPoint(draft, session?.id)
    await queryClient.invalidateQueries({ queryKey: ['pain-points'] })
  }

  async function updatePainPoint(id: number, draft: PainPointDraft) {
    await api.updatePainPoint(id, draft)
    await queryClient.invalidateQueries({ queryKey: ['pain-points'] })
  }

  async function deletePainPoint(id: number) {
    await api.deletePainPoint(id)
    if (id === painPointId) pickPainPoint(null)
    await queryClient.invalidateQueries({ queryKey: ['pain-points'] })
    queryClient.invalidateQueries({ queryKey: ['library-ideas'] })
    queryClient.invalidateQueries({ queryKey: ['ideas', session?.id] })
    // The backend drops the deleted pain point's AI links along with it.
    queryClient.invalidateQueries({ queryKey: ['links', 'pain-points'] })
  }

  /** Announces a convergence result, with the jump to where it landed. */
  function announceIdeas(count: number) {
    if (count === 0) return
    toast.success(`彙整出 ${count} 個候選想法`, {
      description: '已加進想法庫。',
      action: { label: '去看看', onClick: () => setTab('idea-library') },
    })
  }

  // The catalog's own total, not `run.steps.length` — the backend adds one
  // step row at a time. A relay's length is set by the room at start.
  const progressOf = (run: MethodRun | null) => {
    if (!run || run.status !== 'running') return undefined
    const total = run.relay_rounds ?? getMethod(run.method_name)?.step_count ?? run.steps.length
    return `${Math.min(run.current_step_index + 1, total)}/${total}`
  }
  const isFinished = (run: MethodRun | null) => run?.status === 'done' || run?.status === 'revealed'

  const convergeIdea = libraryIdeas.find((i) => i.id === convergeIdeaId) ?? null
  const convergeProject = convergenceProjects.find((p) => p.idea_id === convergeIdeaId) ?? null

  // The rail's phases. `state` is derived from what the session has actually
  // produced, not from which tab is showing, so the rail reads as progress.
  const navSteps: NavStep[] = [
    {
      id: 'setup',
      label: '開始設定',
      state: session ? 'done' : 'current',
    },
    {
      id: 'discover',
      label: '痛點發想',
      hint:
        progressOf(discoveryRun) ??
        (sessionPainPoints.length ? String(sessionPainPoints.length) : undefined),
      state:
        discoveryRun?.status === 'running'
          ? 'current'
          : sessionPainPoints.length > 0 || painPoint
            ? 'done'
            : 'upcoming',
    },
    {
      id: 'ideate',
      label: '專案發想',
      hint: progressOf(ideationRun),
      state: isFinished(ideationRun) ? 'done' : ideationRun || painPoint ? 'current' : 'upcoming',
    },
    {
      id: 'converge',
      label: '專案收斂',
      state: convergeProject?.decision ? 'done' : convergeIdea ? 'current' : 'upcoming',
    },
  ]

  const places: NavPlace[] = [
    {
      id: 'pain-library',
      label: '痛點庫',
      icon: ListChecksIcon,
      hint: painPoints.length ? String(painPoints.length) : undefined,
    },
    {
      id: 'idea-library',
      label: '想法庫',
      icon: LightbulbIcon,
      hint: libraryIdeas.length ? String(libraryIdeas.length) : undefined,
    },
  ]

  // Before the user starts there is no shell — the landing screen is the whole
  // screen, because there is nothing yet for a rail to be about.
  if (!started) {
    return <LandingScreen onStart={() => setStarted(true)} />
  }

  const runProps = (slot: RunSlot) => ({
    onAnswer: (stepIndex: number, answer: string, force?: boolean) =>
      handleAnswer(slot, stepIndex, answer, force),
    submitting: answering,
    thinking,
    error: runError,
    feedback: runFeedback,
    onRetryFinalize: () => handleRetryFinalize(slot),
    onStop: () => handleStopRun(slot),
    stopping,
    onGoToIdeas: () => setTab('idea-library'),
  })

  return (
    <>
      <AppShell
        steps={navSteps}
        places={places}
        activeId={tab}
        onNavigate={(id) => setTab(id as Tab)}
        aside={
          <SessionAside
            intake={intake}
            provider={provider}
            model={model}
            stepModel={stepModel}
            providersHealth={providersHealth}
            ideaCount={ideas.length}
            painPoint={painPoint}
          />
        }
      >
        {tab === 'setup' && (
          <SetupView
            intake={intake}
            onIntakeChange={updateIntake}
            providersHealth={providersHealth}
            provider={provider}
            stepModel={stepModel}
            onProviderChange={handleProviderChange}
            onContinue={handleContinue}
            continuing={continuing}
            continueError={continueError}
          />
        )}

        {tab === 'discover' && !discoveryRun && (
          <DiscoverView
            sessionPainPointCount={sessionPainPoints.length}
            hasProvider={!!provider}
            recommendations={recs.discovery.items}
            adjustmentNote={recs.discovery.adjustmentNote}
            onRecommend={() => handleRecommend('discovery')}
            recommending={recommendingStage === 'discovery'}
            thinking={thinking}
            recommendError={recs.discovery.error}
            onStart={(method) => startRun('discover', method)}
            starting={starting}
            startError={startError}
            onGoToSetup={() => setTab('setup')}
          />
        )}

        {tab === 'discover' && discoveryRun && (
          <FrameworkRunView
            run={discoveryRun}
            {...runProps('discover')}
            banner={
              discoveryRun.status === 'running' &&
              !answering && (
                <div className="flex justify-end">
                  <Button size="xs" variant="ghost" onClick={() => setDiscoveryRun(null)}>
                    先不找了，回痛點發想
                  </Button>
                </div>
              )
            }
            finishedContent={
              <DiscoveryResult
                found={painPoints.filter((p) => p.method_run_id === discoveryRun.id)}
                onUse={takePainPoint}
                onAgain={() => setDiscoveryRun(null)}
              />
            }
          />
        )}

        {tab === 'ideate' && !ideationRun && (
          <IdeateView
            painPoint={painPoint}
            painPoints={painPoints}
            onPickPainPoint={pickPainPoint}
            hasProvider={!!provider}
            recommendations={recs.ideation.items}
            ruleRanking={recs.ideation.ruleRanking}
            adjustmentNote={recs.ideation.adjustmentNote}
            onRecommend={() => handleRecommend('ideation')}
            recommending={recommendingStage === 'ideation'}
            thinking={thinking}
            recommendError={recs.ideation.error}
            onStart={(method) => startRun('ideate', method)}
            starting={starting}
            startError={startError}
            onGoToSetup={() => setTab('setup')}
            onGoToDiscover={() => setTab('discover')}
          />
        )}

        {/* 多人接龍 is one of the methods, so it lives on the same tab — but its
            run is a room of phones rather than one person's transcript. */}
        {tab === 'ideate' && ideationRun?.mode === 'relay' && (
          <RelayHostView
            runId={ideationRun.id}
            onProgress={(status, roundIndex, rounds) =>
              setIdeationRun((prev) =>
                prev && prev.id === ideationRun.id
                  ? {
                      ...prev,
                      status,
                      current_step_index: roundIndex,
                      relay_rounds: rounds,
                    }
                  : prev,
              )
            }
            onRestart={() => startRun('ideate', ideationRun.method_name)}
            restarting={starting}
          />
        )}

        {tab === 'ideate' && ideationRun && ideationRun.mode !== 'relay' && (
          <FrameworkRunView
            run={ideationRun}
            {...runProps('ideate')}
            banner={
              <PainPointBanner
                painPoint={painPoints.find((p) => p.id === ideationRun.pain_point_id) ?? null}
                action={
                  !answering && (
                    <Button size="xs" variant="ghost" onClick={() => setIdeationRun(null)}>
                      {ideationRun.status === 'running' ? '換一個方法' : '再跑一個方法'}
                    </Button>
                  )
                }
              />
            }
          />
        )}

        {tab === 'converge' && (
          <ConvergenceView
            key={convergeIdeaId ?? 'none'}
            ideas={libraryIdeas}
            painPoints={painPoints}
            projects={convergenceProjects}
            idea={convergeIdea}
            project={convergeProject}
            onPickIdea={(id) => void handleConverge(id)}
            opening={openingConvergence}
            provider={provider}
            model={model}
            hasProvider={!!provider}
            onGoToLibrary={() => setTab('idea-library')}
          />
        )}

        {openedLibraries.has('pain-library') && (
          <Activity mode={libraryMode('pain-library')}>
            <PainPointLibrary
              painPoints={painPoints}
              ideas={libraryIdeas}
              links={painPointLinks}
              analyze={analyzeStateFor('pain-points')}
              currentSessionId={session?.id ?? null}
              onCreate={createPainPoint}
              onUpdate={updatePainPoint}
              onDelete={deletePainPoint}
              onUse={takePainPoint}
            />
          </Activity>
        )}

        {openedLibraries.has('idea-library') && (
          <Activity mode={libraryMode('idea-library')}>
            <IdeaLibrary
              ideas={libraryIdeas}
              painPoints={painPoints}
              links={ideaLinks}
              analyze={analyzeStateFor('ideas')}
              onSetSize={handleSetSize}
              hasProvider={!!provider}
              onDelete={handleDeleteIdeas}
              onSynthesize={handleSynthesize}
              synthesizing={synthesizing}
              thinking={thinking}
              synthError={synthError}
              onConverge={(id) => void handleConverge(id)}
            />
          </Activity>
        )}
      </AppShell>
    </>
  )
}

export default App

/** What a stage's method recommendation currently shows. */
interface Recommendations {
  items: MethodRecommendation[]
  ruleRanking: string[]
  adjustmentNote: string
  error: string | null
}

const NO_RECOMMENDATIONS: Recommendations = {
  items: [],
  ruleRanking: [],
  adjustmentNote: '',
  error: null,
}
