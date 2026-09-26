import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from './api'
import type { Idea, MethodRecommendation, MethodRun, Session } from './types'
import { NewSessionForm } from './components/NewSessionForm'
import { MethodSelectorView } from './components/MethodSelectorView'
import { FrameworkRunView } from './components/FrameworkRunView'
import { IdeaBoard } from './components/IdeaBoard'
import { ProposalDetail } from './components/ProposalDetail'
import { Display, Meta } from './components/ui'

type Tab = 'select' | 'run' | 'ideas'

function App() {
  const queryClient = useQueryClient()

  const [session, setSession] = useState<Session | null>(null)
  const [recommendations, setRecommendations] = useState<MethodRecommendation[]>([])
  const [ruleRanking, setRuleRanking] = useState<string[]>([])
  const [adjustmentNote, setAdjustmentNote] = useState('')
  const [activeRun, setActiveRun] = useState<MethodRun | null>(null)
  const [tab, setTab] = useState<Tab>('select')
  // '' = no provider chosen yet — neither button should look selected until
  // the user actually picks one (that pick is what kicks off the AI call).
  const [provider, setProvider] = useState('')
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
  async function handleSelectProvider(p: string) {
    if (!session) return
    setProvider(p)
    setRecommending(true)
    setRecommendError(null)
    setRecommendations([])
    setRuleRanking([])
    setAdjustmentNote('')
    try {
      const res = await api.recommendMethods(session.id, p)
      setRecommendations(res.recommendations)
      setRuleRanking(res.rule_ranking)
      setAdjustmentNote(res.adjustment_note)
    } catch (e) {
      setRecommendError(e instanceof Error ? e.message : String(e))
    } finally {
      setRecommending(false)
    }
  }

  async function handleStartMethod(method: string) {
    if (!session) return
    setStarting(true)
    setRunError(null)
    setRunFeedback(null)
    try {
      const run = await api.createMethodRun(session.id, method, provider)
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
    setAnswering(true)
    setRunError(null)
    try {
      const result = await api.answerStep(activeRun.id, stepIndex, answer, force)
      setActiveRun(result.method_run)
      setRunFeedback(result.accepted ? null : result.feedback)
      if (result.ideas) {
        queryClient.invalidateQueries({ queryKey: ['ideas', session?.id] })
      }
    } catch (e) {
      setRunError(e instanceof Error ? e.message : String(e))
    } finally {
      setAnswering(false)
    }
  }

  async function handleSynthesize() {
    if (!session) return
    setSynthesizing(true)
    setSynthError(null)
    try {
      await api.synthesize(session.id, selectedIdeaIds, provider)
      setSelectedIdeaIds([])
      queryClient.invalidateQueries({ queryKey: ['ideas', session.id] })
    } catch (e) {
      setSynthError(e instanceof Error ? e.message : String(e))
    } finally {
      setSynthesizing(false)
    }
  }

  function toggleSelectIdea(id: number) {
    setSelectedIdeaIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]))
  }

  const tabs: { id: Tab; label: string; disabled?: boolean }[] = [
    { id: 'select', label: '方法選擇' },
    { id: 'run', label: '發想中', disabled: !activeRun },
    { id: 'ideas', label: `想法牆 (${ideas.length})` },
  ]

  return (
    <div className="swiss-noise min-h-screen">
      <div className="mx-auto max-w-5xl px-4 py-12 sm:px-8 sm:py-16">
        <header className="mb-4">
          <Meta className="text-accent mb-3 block">Project Ideation Workbench</Meta>
          <Display>
            <span className="block">AI 專案</span>
            <span className="mt-2 block">發想引導系統</span>
          </Display>
          <p className="text-foreground/50 mt-4 text-sm font-medium sm:text-base">
            本機 Claude / Codex 訂閱額度驅動 — 不使用付費 API Key
          </p>
        </header>

        {!session ? (
          <NewSessionForm onSubmit={handleCreateSession} submitting={creatingSession} error={sessionError} />
        ) : (
          <>
            <nav className="border-foreground mt-10 flex gap-1 border-b-2">
              {tabs.map((t) => (
                <button
                  key={t.id}
                  disabled={t.disabled}
                  onClick={() => setTab(t.id)}
                  className={`-mb-0.5 border-b-4 px-4 py-3 text-xs font-bold tracking-widest uppercase transition-colors duration-150 disabled:cursor-not-allowed disabled:opacity-30 ${
                    tab === t.id
                      ? 'border-accent text-foreground'
                      : 'text-foreground/40 hover:text-foreground border-transparent'
                  }`}
                >
                  {t.label}
                </button>
              ))}
            </nav>

            {tab === 'select' && (
            <MethodSelectorView
              recommendations={recommendations}
              ruleRanking={ruleRanking}
              adjustmentNote={adjustmentNote}
              providersHealth={providersHealth}
              provider={provider}
              onProviderChange={handleSelectProvider}
              recommending={recommending}
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
              error={runError}
              feedback={runFeedback}
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
              onOpenDetail={setDetailIdea}
              onBackToMethods={() => setTab('select')}
              error={synthError}
            />
          )}
          </>
        )}

        {detailIdea && (
          <ProposalDetail idea={detailIdea} allIdeas={ideas} onClose={() => setDetailIdea(null)} />
        )}
      </div>
    </div>
  )
}

export default App
