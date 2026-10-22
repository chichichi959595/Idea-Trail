import { useState } from 'react'
import { ArrowRightIcon, SearchIcon } from 'lucide-react'
import type { MethodRecommendation, PainPoint } from '../types'
import { useMethodCatalog } from '../useMethodCatalog'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Selectable } from '@/components/design/selectable'
import { Screen, ScreenBody, ScreenHeader } from '@/components/design/section'
import { StepPanel } from '@/components/design/step-panel'
import { Eyebrow, Small, Subhead } from '@/components/design/typography'
import { Notice } from '@/components/design/states'
import { AiWorking } from '@/components/design/ai'
import { PainPointCard, PainPointFacts } from './painpoints'
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
  const [picking, setPicking] = useState(false)
  // Arriving with a pain point already chosen — from 痛點發想, the library,
  // or the setup screen — means the first page is done; open on the second.
  const [tab, setTab] = useState(painPoint ? 'method' : 'pain')

  const painPage = painPoint ? (
    <div className="flex flex-col gap-3">
      <PainPointCard painPoint={painPoint} selected />
    </div>
  ) : painPoints.length > 0 ? (
    <Notice
      tone="brand"
      icon={SearchIcon}
      title="還沒選痛點"
      actions={
        <>
          <Button size="sm" onClick={() => setPicking(true)}>
            從痛點庫挑
          </Button>
          <Button size="sm" variant="outline" onClick={onGoToDiscover}>
            再去找痛點
          </Button>
        </>
      }
    >
      也可以不選直接發想，想法就只會依團隊條件發散，比較難收斂到一個真實的問題上。
    </Notice>
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

  const readyPage = (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-2">
        <Eyebrow>要解決的痛點</Eyebrow>
        {painPoint ? (
          <Subhead className="text-pretty">{painPoint.statement}</Subhead>
        ) : (
          <Small>不指定痛點，想法會只依團隊條件發散。</Small>
        )}
      </div>
      <div className="flex flex-col gap-2">
        <Eyebrow>發想方法</Eyebrow>
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
      </div>
    </div>
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
                disabled={!selectedMethod || !hasProvider}
                onClick={() => selectedMethod && onStart(selectedMethod)}
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
              actions: painPoint && painPoints.length > 0 && (
                <Button variant="outline" size="sm" onClick={() => setPicking(true)}>
                  換一個
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

      <PainPointPicker
        open={picking}
        painPoints={painPoints}
        currentId={painPoint?.id ?? null}
        onPick={(id) => {
          onPickPainPoint(id)
          setPicking(false)
        }}
        onClose={() => setPicking(false)}
      />
    </Screen>
  )
}

function PainPointPicker({
  open,
  painPoints,
  currentId,
  onPick,
  onClose,
}: {
  open: boolean
  painPoints: PainPoint[]
  currentId: number | null
  onPick: (id: number | null) => void
  onClose: () => void
}) {
  return (
    <Dialog open={open} onOpenChange={(next) => !next && onClose()}>
      <DialogContent className="max-h-[85svh] gap-4 overflow-y-auto sm:max-w-xl">
        <DialogHeader className="text-left">
          <DialogTitle>從痛點庫挑一個</DialogTitle>
          <DialogDescription>包含其他場次找到的痛點。</DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-2">
          {painPoints.map((p) => (
            <Selectable
              key={p.id}
              selected={p.id === currentId}
              onSelect={() => onPick(p.id)}
              className="gap-1.5 pr-11"
            >
              <Subhead className="text-pretty">{p.statement}</Subhead>
              <PainPointFacts painPoint={p} />
            </Selectable>
          ))}
          {currentId !== null && (
            <Button variant="ghost" size="sm" className="self-start" onClick={() => onPick(null)}>
              不指定痛點
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
