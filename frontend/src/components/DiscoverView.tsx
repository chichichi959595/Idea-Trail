import { useState } from 'react'
import { ArrowRightIcon, RotateCcwIcon } from 'lucide-react'
import type { MethodRecommendation, PainPoint } from '../types'
import { useMethodCatalog } from '../useMethodCatalog'
import { Button } from '@/components/ui/button'
import { Screen, ScreenBody, ScreenHeader } from '@/components/design/section'
import { StepPanel } from '@/components/design/step-panel'
import { Notice } from '@/components/design/states'
import { AiWorking } from '@/components/design/ai'
import { PainPointCard } from './painpoints'
import { MethodBrief, MethodPicker, PickerDescription, RecommendButton } from './MethodPicker'

interface Props {
  /** Pain points found in this session — only counted, to word the start
   * button as another round once there are some. */
  sessionPainPointCount: number
  hasProvider: boolean
  recommendations: MethodRecommendation[]
  adjustmentNote: string
  onRecommend: () => void
  recommending: boolean
  thinking: string
  recommendError: string | null
  onStart: (method: string) => void
  starting: boolean
  startError: string | null
  onGoToSetup: () => void
}

/**
 * 痛點發想, between runs: which method to find pain points with.
 *
 * Laid out like 專案發想 on purpose: both stages are "pick a method, run it",
 * in the same paged window the setup screen uses, with the same picker fed
 * this stage's catalog. What a run finds is shown at the end of that run and
 * kept in 痛點庫, which is also where one is written down by hand.
 */
export function DiscoverView({
  sessionPainPointCount,
  hasProvider,
  recommendations,
  adjustmentNote,
  onRecommend,
  recommending,
  thinking,
  recommendError,
  onStart,
  starting,
  startError,
  onGoToSetup,
}: Props) {
  const { methods: catalog } = useMethodCatalog()
  const methods = catalog.filter((m) => m.stage === 'discovery')
  const [picked, setPicked] = useState<string | null>(null)
  // With a single method in the catalog there is nothing to choose between,
  // so it starts out chosen — the picker is still there, but the footer's
  // button works without a click on the only card.
  const selected = picked ?? (methods.length === 1 ? methods[0].name : null)
  const [tab, setTab] = useState('method')

  return (
    <Screen>
      <ScreenHeader
        title="痛點發想"
        description="還沒有痛點也沒關係：挑一種找痛點的方法，把困擾整理進痛點庫。"
      />

      <ScreenBody className="gap-10">
        <StepPanel
          value={tab}
          onValueChange={setTab}
          finish={
            starting ? (
              <AiWorking label="正在開場" detail="準備第一個引導問題" />
            ) : (
              <Button
                size="sm"
                disabled={!selected || !hasProvider}
                onClick={() => selected && onStart(selected)}
              >
                {sessionPainPointCount > 0 ? '再找一輪' : '開始找痛點'}
                <ArrowRightIcon />
              </Button>
            )
          }
          steps={[
            {
              id: 'method',
              label: '找痛點的方法',
              description: <PickerDescription readsFrom="團隊條件" methodCount={methods.length} />,
              actions: (
                <RecommendButton
                  hasProvider={hasProvider}
                  recommending={recommending}
                  hasResult={recommendations.length > 0 || recommendError !== null}
                  onRecommend={onRecommend}
                />
              ),
              done: selected !== null,
              content: (
                <MethodPicker
                  readsFrom="團隊條件"
                  methods={methods}
                  hasProvider={hasProvider}
                  recommendations={recommendations}
                  ruleRanking={[]}
                  adjustmentNote={adjustmentNote}
                  recommending={recommending}
                  thinking={thinking}
                  recommendError={recommendError}
                  selected={selected}
                  onSelect={setPicked}
                  starting={starting}
                  startError={startError}
                  onGoToSetup={onGoToSetup}
                />
              ),
            },
            {
              id: 'ready',
              label: '開始之前',
              description: '走完之後，AI 會把找到的困擾整理成幾筆痛點，存進痛點庫。',
              content: selected ? (
                <MethodBrief method={selected} />
              ) : (
                <Notice
                  tone="warning"
                  title="還沒選方法"
                  actions={
                    <Button size="sm" variant="outline" onClick={() => setTab('method')}>
                      回去選方法
                    </Button>
                  }
                >
                  先在第 1 頁挑一個找痛點的方法，才能開始。
                </Notice>
              ),
            },
          ]}
        />
      </ScreenBody>
    </Screen>
  )
}

/** The closing turn of a finished 痛點發想 run: what it found, and where to
 * take each one. */
export function DiscoveryResult({
  found,
  onUse,
  onAgain,
}: {
  found: PainPoint[]
  onUse: (painPointId: number) => void
  onAgain: () => void
}) {
  return (
    <div className="flex flex-col gap-3">
      <p>
        {found.length > 0
          ? `整理出 ${found.length} 個痛點，已經存進痛點庫。挑一個帶去專案發想：`
          : '這一輪的痛點已經存進痛點庫。'}
      </p>
      <div className="flex flex-col gap-2">
        {found.map((p) => (
          <PainPointCard
            key={p.id}
            painPoint={p}
            showSource={false}
            actions={
              <Button size="sm" onClick={() => onUse(p.id)}>
                用這個去發想
                <ArrowRightIcon />
              </Button>
            }
          />
        ))}
      </div>
      <div className="flex justify-end">
        <Button size="sm" variant="outline" onClick={onAgain}>
          <RotateCcwIcon />
          回痛點發想
        </Button>
      </div>
    </div>
  )
}
