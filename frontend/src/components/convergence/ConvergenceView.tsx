import { useState, type ReactNode } from 'react'
import { LightbulbIcon } from 'lucide-react'
import type { ConvergenceProject, Idea, PainPoint } from '../../types'
import { Button } from '@/components/ui/button'
import { Screen, ScreenBody, ScreenHeader } from '@/components/design/section'
import { StepPanel } from '@/components/design/step-panel'
import { Notice } from '@/components/design/states'
import { AiWorking } from '@/components/design/ai'
import { DemandStage } from './DemandStage'
import { FeasibilityButton, FeasibilityStage } from './FeasibilityStage'
import { EstimateButton, MatrixStage } from './MatrixStage'
import { MoscowStage, SuggestFeaturesButton } from './MoscowStage'
import { PickStage } from './PickStage'
import { ResearchButton, ResearchStage } from './ResearchStage'
import { isPlaced, onMatrix, useConvergenceActions } from './model'

interface Props {
  /** The whole idea library: the topic is picked from it. */
  ideas: Idea[]
  painPoints: PainPoint[]
  projects: ConvergenceProject[]
  /** The idea being converged; null until one is picked. */
  idea: Idea | null
  /** Its record. Null while it is still being opened. */
  project: ConvergenceProject | null
  onPickIdea: (id: number) => void
  opening: boolean
  provider: string
  model: string
  hasProvider: boolean
  onGoToLibrary: () => void
}

/**
 * 專案收斂: one idea, six pages, walked left to right.
 *
 * 選題 → 需求分析 (正反方) → MVP (MoSCoW) → 效益 × 成本 → 競品搜尋 → 可行性
 *
 * Every agent on the way gives reasons; every call that matters — is the need
 * real, which bucket a feature goes in, where it sits on the matrix, go or
 * not — is the user's, and stored apart from what the agents said.
 *
 * Keyed by idea in App, so switching ideas starts the pages over.
 */
export function ConvergenceView({
  ideas,
  painPoints,
  projects,
  idea,
  project,
  onPickIdea,
  opening,
  provider,
  model,
  hasProvider,
  onGoToLibrary,
}: Props) {
  const [tab, setTab] = useState(idea ? 'demand' : 'pick')
  const actions = useConvergenceActions(project, provider, model)

  const needsProject = (content: (p: ConvergenceProject) => ReactNode) =>
    project ? (
      content(project)
    ) : opening ? (
      <AiWorking label="正在打開收斂紀錄" />
    ) : (
      <Notice
        tone="brand"
        icon={LightbulbIcon}
        title="還沒選要收斂的想法"
        actions={
          <Button size="sm" onClick={() => setTab('pick')}>
            回到選題
          </Button>
        }
      >
        先在第 1 頁挑一個想法。
      </Notice>
    )
  const action = (content: (p: ConvergenceProject) => ReactNode) =>
    project ? content(project) : undefined

  const features = project?.features ?? []
  const matrixFeatures = features.filter(onMatrix)

  return (
    <Screen>
      <ScreenHeader
        title="專案收斂"
        description="從需求是否成立、MVP 範圍、優先順序到競品與可行性，一步步把一個想法收斂成要不要做的決定。"
      />

      <ScreenBody className="gap-6">
        <StepPanel
          value={tab}
          onValueChange={setTab}
          steps={[
            {
              id: 'pick',
              label: '選題',
              description: '一次收斂一個想法。從想法庫帶過來的已經選好了，也可以在這裡換。',
              done: project !== null,
              content: (
                <PickStage
                  ideas={ideas}
                  painPoints={painPoints}
                  projects={projects}
                  idea={idea}
                  onPick={onPickIdea}
                  opening={opening}
                  onGoToLibrary={onGoToLibrary}
                />
              ),
            },
            {
              id: 'demand',
              label: '需求分析',
              description: '正方說需求是真的，反方找它不成立的地方。對話模式一人一句，分析模式寫完整論述，最後由你判定。',
              done: !!project?.demand_verdict,
              content: needsProject((p) => (
                <DemandStage project={p} actions={actions} hasProvider={hasProvider} />
              )),
            },
            {
              id: 'mvp',
              label: 'MVP 範圍',
              description: '用 MoSCoW 切出最小可行性產品：AI 先列功能，你新增、刪除，再拖進四個分類。',
              actions: action((p) => (
                <SuggestFeaturesButton project={p} actions={actions} hasProvider={hasProvider} />
              )),
              done:
                features.length > 0 &&
                features.every((f) => f.moscow !== null) &&
                features.some((f) => f.moscow === 'must'),
              content: needsProject((p) => (
                <MoscowStage project={p} actions={actions} hasProvider={hasProvider} />
              )),
            },
            {
              id: 'matrix',
              label: '效益 × 成本',
              description: '高效益、低成本的優先。Must 會特別標出來——成本再高也不會被排除。',
              actions: action((p) => (
                <EstimateButton project={p} actions={actions} hasProvider={hasProvider} />
              )),
              done: matrixFeatures.length > 0 && matrixFeatures.every(isPlaced),
              content: needsProject((p) => <MatrixStage project={p} actions={actions} />),
            },
            {
              id: 'research',
              label: '競品搜尋',
              description: '依定好的功能搜尋 GitHub 與網路，看哪些別人已經做了、哪些是你們的差異化。',
              actions: action((p) => (
                <ResearchButton project={p} actions={actions} hasProvider={hasProvider} />
              )),
              done: !!project?.research,
              content: needsProject((p) => (
                <ResearchStage project={p} actions={actions} provider={provider} />
              )),
            },
            {
              id: 'feasibility',
              label: '可行性',
              description: '綜合前面每一頁，評估技術可行性與投入效益，再由你決定要不要做。',
              actions: action((p) => (
                <FeasibilityButton project={p} actions={actions} hasProvider={hasProvider} />
              )),
              done: !!project?.decision,
              content: needsProject((p) => <FeasibilityStage project={p} actions={actions} />),
            },
          ]}
        />
      </ScreenBody>
    </Screen>
  )
}
