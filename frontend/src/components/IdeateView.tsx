import { useState, type ReactNode } from 'react'
import { ArrowRightIcon, SearchIcon } from 'lucide-react'
import { PAIN_POINT_SOURCE_LABELS, type MethodRecommendation, type PainPoint } from '../types'
import { useMethodCatalog } from '../useMethodCatalog'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Selectable } from '@/components/design/selectable'
import { Screen, ScreenBody, ScreenHeader } from '@/components/design/section'
import { StepPanel } from '@/components/design/step-panel'
import { Subhead } from '@/components/design/typography'
import { Notice } from '@/components/design/states'
import { AiWorking } from '@/components/design/ai'
import { PainPointFacts } from './painpoints'
import { MethodBrief, MethodPicker, PickerDescription, RecommendButton } from './MethodPicker'

interface Props {
  painPoint: PainPoint | null
  painPoints: PainPoint[]
  onPickPainPoint: (id: number | null) => void
  hasProvider: boolean
  recommendations: MethodRecommendation[]
  ruleRanking: string[]
  adjustmentNote: string
  onRecommend: () => void
  recommending: boolean
  thinking: string
  recommendError: string | null
  onStart: (method: string) => void
  starting: boolean
  startError: string | null
  onGoToSetup: () => void
  onGoToDiscover: () => void
}

/**
 * 專案發想, before a method is running: which pain point this round works on,
 * and which method to work on it with.
 *
 * The pain point comes first because it is what the recommendation reads —
 * the same team gets different methods for "排隊買午餐" than for no problem
 * at all — so changing it clears the recommendation rather than leaving one
 * up that was argued for a different problem.
 */
export function IdeateView({
  painPoint,
  painPoints,
  onPickPainPoint,
  hasProvider,
  recommendations,
  ruleRanking,
  adjustmentNote,
  onRecommend,
  recommending,
  thinking,
  recommendError,
  onStart,
  starting,
  startError,
  onGoToSetup,
  onGoToDiscover,
}: Props) {
  const { methods: catalog, get } = useMethodCatalog()
  const allMethods = catalog.filter((m) => m.stage === 'ideation')
  const [selectedMethod, setSelectedMethod] = useState<string | null>(null)
  // Arriving with a pain point already chosen — from 痛點發想, the library,
  // or the setup screen — means the first page is done; open on the second.
  const [tab, setTab] = useState(painPoint ? 'method' : 'pain')

  // The whole library sits on the page rather than behind a dialog: picking
  // the problem is this page's one job, and the list is short enough to scan.
  const painPage =
    painPoints.length > 0 ? (
      <div className="flex flex-col gap-2.5">
        {painPoints.map((p) => (
          <Selectable
            key={p.id}
            selected={p.id === painPoint?.id}
            onSelect={() => p.id !== painPoint?.id && onPickPainPoint(p.id)}
            className="gap-2 pr-12"
          >
            <span className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
              <Subhead className="text-pretty">{p.statement}</Subhead>
              <Badge variant="soft" className="translate-y-[-1px]">
                {PAIN_POINT_SOURCE_LABELS[p.source]}
              </Badge>
            </span>
            <PainPointFacts painPoint={p} />
          </Selectable>
        ))}
      </div>
    ) : (
      <Notice
        tone="brand"
        icon={SearchIcon}
        title="痛點庫還是空的"
        actions={
          <Button size="sm" onClick={onGoToDiscover}>
            前往痛點發想
          </Button>
        }
      >
        先去痛點發想找出幾個痛點，或在開始設定寫下你們已經有的那一個。
      </Notice>
    )

  // Two answers read side by side as one summary — the same label column and
  // the same weight for both, rather than one bare line and one boxed card.
  const readyPage = (
    <dl className="flex flex-col divide-y divide-border border-y border-border">
      <SummaryRow label="要解決的痛點">
        {painPoint ? (
          <div className="flex flex-col gap-2">
            <Subhead className="text-pretty">{painPoint.statement}</Subhead>
            <PainPointFacts painPoint={painPoint} />
          </div>
        ) : (
          <Notice
            tone="warning"
            title="還沒選痛點"
            actions={
              <Button size="sm" variant="outline" onClick={() => setTab('pain')}>
                回去選痛點
              </Button>
            }
          >
            先在第 1 頁挑一個要解決的痛點，才能開始。
          </Notice>
        )}
      </SummaryRow>
      <SummaryRow label="發想方法">
        {selectedMethod ? (
          <MethodBrief method={selectedMethod} />
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
            先在第 2 頁挑一個發想方法，才能開始。
          </Notice>
        )}
      </SummaryRow>
    </dl>
  )

  return (
    <Screen>
      <ScreenHeader title="專案發想" description="針對一個痛點，挑一種發想方法把它變成專案想法。" />

      <ScreenBody className="gap-6">
        <StepPanel
          value={tab}
          onValueChange={setTab}
          finish={
            starting ? (
              <AiWorking
                label="正在開場"
                detail={
                  selectedMethod && get(selectedMethod)?.mode === 'relay'
                    ? '準備 QR code 讓大家加入'
                    : '準備第一個引導問題'
                }
              />
            ) : (
              <Button
                size="sm"
                disabled={!painPoint || !selectedMethod || !hasProvider}
                onClick={() => painPoint && selectedMethod && onStart(selectedMethod)}
              >
                開始發想
                <ArrowRightIcon />
              </Button>
            )
          }
          steps={[
            {
              id: 'pain',
              label: '要解決的痛點',
              description: '從痛點庫挑一個。所有方法的每一步，AI 都會扣回這個痛點。',
              actions: painPoints.length > 0 && (
                <Button variant="outline" size="sm" onClick={onGoToDiscover}>
                  <SearchIcon />
                  再去找痛點
                </Button>
              ),
              done: painPoint !== null,
              content: painPage,
            },
            {
              id: 'method',
              label: '發想方法',
              description: (
                <PickerDescription readsFrom="團隊條件跟這個痛點" methodCount={allMethods.length} />
              ),
              actions: (
                <RecommendButton
                  hasProvider={hasProvider}
                  recommending={recommending}
                  hasResult={recommendations.length > 0 || recommendError !== null}
                  onRecommend={onRecommend}
                />
              ),
              done: selectedMethod !== null,
              content: (
                <MethodPicker
                  readsFrom="團隊條件跟這個痛點"
                  methods={allMethods}
                  hasProvider={hasProvider}
                  recommendations={recommendations}
                  ruleRanking={ruleRanking}
                  adjustmentNote={adjustmentNote}
                  recommending={recommending}
                  thinking={thinking}
                  recommendError={recommendError}
                  selected={selectedMethod}
                  onSelect={setSelectedMethod}
                  starting={starting}
                  startError={startError}
                  onGoToSetup={onGoToSetup}
                />
              ),
            },
            {
              id: 'ready',
              label: '開始之前',
              description: '確認這一輪要解決的痛點跟用的方法。開始後每一步都會扣回這個痛點。',
              content: readyPage,
            },
          ]}
        />
      </ScreenBody>

    </Screen>
  )
}

function SummaryRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid grid-cols-1 gap-x-8 gap-y-2 py-5 sm:grid-cols-[7.5rem_minmax(0,1fr)]">
      <dt className="text-sm text-muted-foreground sm:pt-px">{label}</dt>
      <dd className="min-w-0">{children}</dd>
    </div>
  )
}
