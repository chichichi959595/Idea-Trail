import { useState } from 'react'
import { ArrowRightIcon, SparklesIcon } from 'lucide-react'
import type { Session } from '../types'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Card, CardContent } from '@/components/ui/card'
import { Chip, SegmentedControl } from '@/components/design/selectable'
import { Divider, Page, SectionHeader } from '@/components/design/section'
import { Display, Eyebrow, Small } from '@/components/design/typography'
import { ErrorState } from '@/components/design/states'
import { AiWorking } from '@/components/design/ai'
import { ThemeControl } from '@/components/design/theme'

interface Props {
  onSubmit: (payload: Partial<Session>) => void
  submitting: boolean
  error: string | null
}

const TECH_OPTIONS = ['前端', '後端', '行動開發（iOS／Android）', '資料／AI', 'UI／UX 設計', '沒有明顯技術背景']
const DOMAIN_OPTIONS = ['教育', '生產力工具', '健康／生活', '社群／社交', '電商／商業', '校園生活', '永續／環境']

const OTHER_OPTION = '其他'

function combineChips(selected: string[], other: string): string {
  const labels = selected.filter((s) => s !== OTHER_OPTION)
  if (selected.includes(OTHER_OPTION) && other.trim()) labels.push(other.trim())
  return labels.join('、')
}

/**
 * The entry screen. It is the only place in the app that gets a full-width
 * display heading and a glow, because it is the one moment where nothing has
 * happened yet — after this, every screen's job is to show work.
 */
export function NewSessionForm({ onSubmit, submitting, error }: Props) {
  const [teamSize, setTeamSize] = useState('3')
  const [timeBudget, setTimeBudget] = useState('')
  const [techSelected, setTechSelected] = useState<string[]>([])
  const [techOther, setTechOther] = useState('')
  const [domainSelected, setDomainSelected] = useState<string[]>([])
  const [domainOther, setDomainOther] = useState('')
  const [constraints, setConstraints] = useState('')
  const [hasClearProblem, setHasClearProblem] = useState<TriValue>('unknown')
  const [clearProblemText, setClearProblemText] = useState('')
  const [hasExistingProduct, setHasExistingProduct] = useState<TriValue>('unknown')
  const [existingProductText, setExistingProductText] = useState('')

  const toBool = (v: TriValue) => (v === 'unknown' ? null : v === 'yes')
  const toggle = (list: string[], setList: (v: string[]) => void, opt: string) =>
    setList(list.includes(opt) ? list.filter((o) => o !== opt) : [...list, opt])

  return (
    <div className="bg-glow">
      <Page className="max-w-3xl">
        <header className="flex flex-col gap-4 pb-10">
          {/* The appearance switch lives in the rail on every other screen, and
              this screen has no rail — so it sits on the badge row here rather
              than leaving the first screen the one place the theme can't be
              changed. */}
          <div className="flex flex-wrap items-center justify-between gap-3">
            <span className="inline-flex w-fit items-center gap-2 rounded-full border border-brand-border bg-brand-muted px-2.5 py-1 text-xs font-medium text-primary">
              <SparklesIcon className="size-3.5" aria-hidden />
              本機 Claude / Codex 訂閱額度驅動
            </span>
            <ThemeControl className="shrink-0" />
          </div>
          <Display>
            把模糊的想法
            <br />
            帶到能動手做的題目
          </Display>
          <Small className="max-w-lg text-base">
            系統會依你們團隊的狀況挑選發想方法，一步步引導，再把過程收斂成具體的候選提案。
          </Small>
        </header>

        <form
          className="flex flex-col gap-8"
          onSubmit={(e) => {
            e.preventDefault()
            onSubmit({
              team_size: teamSize ? Number(teamSize) : null,
              time_budget: timeBudget || null,
              tech_background: combineChips(techSelected, techOther) || null,
              domain_pref: combineChips(domainSelected, domainOther) || null,
              constraints_text: constraints || null,
              has_clear_problem: toBool(hasClearProblem),
              clear_problem_text: (hasClearProblem === 'yes' && clearProblemText.trim()) || null,
              has_existing_product: toBool(hasExistingProduct),
              existing_product_text:
                (hasExistingProduct === 'yes' && existingProductText.trim()) || null,
            })
          }}
        >
          <Card>
            <CardContent className="flex flex-col gap-7">
              <SectionHeader
                eyebrow="01"
                title="團隊現在的狀況"
                description="這些資訊只用來挑方法，填得粗略也沒關係。"
              />

              <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
                <Field label="團隊人數">
                  <Input
                    type="number"
                    min={1}
                    inputMode="numeric"
                    value={teamSize}
                    onChange={(e) => setTeamSize(e.target.value)}
                  />
                </Field>
                <Field label="可用時間">
                  <Input
                    placeholder="例如：2 個月，畢業專題"
                    value={timeBudget}
                    onChange={(e) => setTimeBudget(e.target.value)}
                  />
                </Field>
              </div>

              <Field label="技術背景" hint="可多選">
                <ChipGroup
                  options={TECH_OPTIONS}
                  selected={techSelected}
                  onToggle={(opt) => toggle(techSelected, setTechSelected, opt)}
                  otherValue={techOther}
                  onOtherChange={setTechOther}
                />
              </Field>

              <Field label="領域偏好" hint="可多選">
                <ChipGroup
                  options={DOMAIN_OPTIONS}
                  selected={domainSelected}
                  onToggle={(opt) => toggle(domainSelected, setDomainSelected, opt)}
                  otherValue={domainOther}
                  onOtherChange={setDomainOther}
                />
              </Field>

              <Field label="限制條件">
                <Textarea
                  className="min-h-20"
                  placeholder="例如：希望有真實使用者可以測試，不要太難維護"
                  value={constraints}
                  onChange={(e) => setConstraints(e.target.value)}
                />
              </Field>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="flex flex-col gap-1">
              <SectionHeader
                eyebrow="02"
                title="你們的起點"
                description="有沒有既有的問題或題目，會直接改變適合的發想方法。"
                className="pb-3"
              />

              <TriChoice
                label="已經有明確想解決的問題？"
                value={hasClearProblem}
                onChange={setHasClearProblem}
                followUp={{
                  label: '那個問題是什麼？',
                  placeholder: '例如：系上的二手書買賣都靠社群貼文，買賣雙方很難對上',
                  value: clearProblemText,
                  onChange: setClearProblemText,
                }}
              />
              <Divider />
              <TriChoice
                label="有既有產品／題目想改造？"
                value={hasExistingProduct}
                onChange={setHasExistingProduct}
                followUp={{
                  label: '想改造的是什麼？',
                  placeholder: '例如：去年的社團報名網站，現在流程太繞',
                  value: existingProductText,
                  onChange: setExistingProductText,
                }}
              />
            </CardContent>
          </Card>

          {error && <ErrorState title="建立工作台失敗" detail={error} />}

          <div className="flex flex-wrap items-center gap-4">
            <Button type="submit" size="xl" disabled={submitting} className="w-full sm:w-auto">
              建立工作台
              <ArrowRightIcon />
            </Button>
            {submitting && <AiWorking label="建立工作台中" detail="正在準備方法目錄" />}
          </div>
        </form>
      </Page>
    </div>
  )
}

/** Label + optional hint above a control. Replaces the old bare `<label>` +
 * uppercase `Meta`, so every field on every screen has the same header shape. */
function Field({
  label,
  hint,
  children,
}: {
  label: string
  hint?: string
  children: React.ReactNode
}) {
  return (
    <label className="flex flex-col gap-2">
      <span className="flex items-baseline gap-2">
        <span className="text-sm font-medium">{label}</span>
        {hint && <Eyebrow className="normal-case tracking-normal">{hint}</Eyebrow>}
      </span>
      {children}
    </label>
  )
}

/** Multi-select chips with a built-in 其他 free-text escape hatch. */
function ChipGroup({
  options,
  selected,
  onToggle,
  otherValue,
  onOtherChange,
}: {
  options: string[]
  selected: string[]
  onToggle: (option: string) => void
  otherValue: string
  onOtherChange: (value: string) => void
}) {
  return (
    <div className="flex flex-col gap-2.5">
      <div className="flex flex-wrap gap-1.5">
        {[...options, OTHER_OPTION].map((opt) => (
          <Chip key={opt} selected={selected.includes(opt)} onSelect={() => onToggle(opt)}>
            {opt}
          </Chip>
        ))}
      </div>
      {selected.includes(OTHER_OPTION) && (
        <Input
          placeholder="請說明"
          value={otherValue}
          onChange={(e) => onOtherChange(e.target.value)}
        />
      )}
    </div>
  )
}

type TriValue = 'yes' | 'no' | 'unknown'

interface FollowUp {
  label: string
  placeholder: string
  value: string
  onChange: (v: string) => void
}

/**
 * 是 / 否 / 不確定 on one row, with the follow-up textarea revealed only for 是.
 * The reveal is indented under the question rather than boxed, so the answer
 * stays visually owned by the question it belongs to.
 */
function TriChoice({
  label,
  value,
  onChange,
  followUp,
}: {
  label: string
  value: TriValue
  onChange: (v: TriValue) => void
  followUp?: FollowUp
}) {
  return (
    <div className="flex flex-col gap-3 py-3">
      <div className="flex flex-col gap-2.5 sm:flex-row sm:items-center sm:justify-between sm:gap-6">
        <span className="text-sm font-medium">{label}</span>
        <SegmentedControl
          aria-label={label}
          value={value}
          onChange={onChange}
          className="shrink-0"
          options={[
            { value: 'yes', label: '是' },
            { value: 'no', label: '否' },
            { value: 'unknown', label: '不確定' },
          ]}
        />
      </div>

      {followUp && value === 'yes' && (
        <div className={cn('animate-in fade-in slide-in-from-top-1 flex flex-col gap-2 duration-200')}>
          <Eyebrow>{followUp.label}</Eyebrow>
          <Textarea
            className="min-h-16"
            placeholder={followUp.placeholder}
            value={followUp.value}
            onChange={(e) => followUp.onChange(e.target.value)}
          />
        </div>
      )}
    </div>
  )
}
