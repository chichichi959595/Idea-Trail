import { useState } from 'react'
import type { Session } from '../types'
import {
  Body,
  Button,
  ChipSelect,
  Field,
  FormPanel,
  Headline,
  inputClass,
  Meta,
  OTHER_OPTION,
  SectionLabel,
  textareaClass,
  ThinkingIndicator,
} from './ui'

interface Props {
  onSubmit: (payload: Partial<Session>) => void
  submitting: boolean
  error: string | null
}

const TECH_OPTIONS = ['前端', '後端', '行動開發（iOS／Android）', '資料／AI', 'UI／UX 設計', '沒有明顯技術背景']
const DOMAIN_OPTIONS = ['教育', '生產力工具', '健康／生活', '社群／社交', '電商／商業', '校園生活', '永續／環境']

function combineChips(selected: string[], other: string): string {
  const labels = selected.filter((s) => s !== OTHER_OPTION)
  if (selected.includes(OTHER_OPTION) && other.trim()) labels.push(other.trim())
  return labels.join('、')
}

export function NewSessionForm({ onSubmit, submitting, error }: Props) {
  const [teamSize, setTeamSize] = useState('3')
  const [timeBudget, setTimeBudget] = useState('')
  const [techSelected, setTechSelected] = useState<string[]>([])
  const [techOther, setTechOther] = useState('')
  const [domainSelected, setDomainSelected] = useState<string[]>([])
  const [domainOther, setDomainOther] = useState('')
  const [constraints, setConstraints] = useState('')
  const [hasClearProblem, setHasClearProblem] = useState<string>('unknown')
  const [hasExistingProduct, setHasExistingProduct] = useState<string>('unknown')
  const [isTechDriven, setIsTechDriven] = useState<string>('unknown')

  const toBool = (v: string) => (v === 'unknown' ? null : v === 'yes')
  const toggle = (list: string[], setList: (v: string[]) => void, opt: string) =>
    setList(list.includes(opt) ? list.filter((o) => o !== opt) : [...list, opt])

  return (
    <FormPanel
      className="mt-8"
      onSubmit={(e) => {
        e.preventDefault()
        onSubmit({
          team_size: teamSize ? Number(teamSize) : null,
          time_budget: timeBudget || null,
          tech_background: combineChips(techSelected, techOther) || null,
          domain_pref: combineChips(domainSelected, domainOther) || null,
          constraints_text: constraints || null,
          has_clear_problem: toBool(hasClearProblem),
          has_existing_product: toBool(hasExistingProduct),
          is_tech_driven: toBool(isTechDriven),
        })
      }}
    >
      <SectionLabel number="01">System</SectionLabel>
      <Headline className="mb-2">基本資訊收集</Headline>
      <Body className="mb-8 text-foreground/70">
        先填一下團隊現在的狀況，系統會依這些資訊推薦發想方法。
      </Body>

      <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
        <Field label="團隊人數">
          <input
            className={inputClass}
            type="number"
            min={1}
            value={teamSize}
            onChange={(e) => setTeamSize(e.target.value)}
          />
        </Field>

        <Field label="可用時間">
          <input
            className={inputClass}
            placeholder="例如：2 個月，畢業專題"
            value={timeBudget}
            onChange={(e) => setTimeBudget(e.target.value)}
          />
        </Field>
      </div>

      <div className="mt-6">
        <Field label="技術背景">
          <ChipSelect
            options={TECH_OPTIONS}
            selected={techSelected}
            onToggle={(opt) => toggle(techSelected, setTechSelected, opt)}
            otherValue={techOther}
            onOtherChange={setTechOther}
          />
        </Field>
      </div>

      <div className="mt-6">
        <Field label="領域偏好">
          <ChipSelect
            options={DOMAIN_OPTIONS}
            selected={domainSelected}
            onToggle={(opt) => toggle(domainSelected, setDomainSelected, opt)}
            otherValue={domainOther}
            onOtherChange={setDomainOther}
          />
        </Field>
      </div>

      <div className="mt-6">
        <Field label="限制條件">
          <textarea
            className={`${textareaClass} min-h-20 resize-y`}
            placeholder="例如：希望有真實使用者可以測試，不要太難維護"
            value={constraints}
            onChange={(e) => setConstraints(e.target.value)}
          />
        </Field>
      </div>

      <div className="mt-8 flex flex-col gap-5 border-t-2 border-foreground/15 pt-6">
        <TriChoice label="目前已經有明確想解決的問題？" value={hasClearProblem} onChange={setHasClearProblem} />
        <TriChoice
          label="有既有產品/題目想改造？"
          value={hasExistingProduct}
          onChange={setHasExistingProduct}
        />
        <TriChoice label="技術導向但還不確定應用場景？" value={isTechDriven} onChange={setIsTechDriven} />
      </div>

      {error && (
        <p className="mt-6 border-2 border-accent bg-accent/5 px-4 py-3 text-sm font-bold text-accent">
          {error}
        </p>
      )}

      <div className="mt-8 flex flex-wrap items-center gap-4">
        <Button type="submit" disabled={submitting} className="w-full sm:w-auto">
          {submitting ? '建立中…' : '建立工作台並取得方法推薦'}
        </Button>
        {submitting && <ThinkingIndicator label="AI 正在分析並準備方法推薦…" />}
      </div>
    </FormPanel>
  )
}

function TriChoice({
  label,
  value,
  onChange,
}: {
  label: string
  value: string
  onChange: (v: string) => void
}) {
  return (
    <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
      <Meta className="text-foreground">{label}</Meta>
      <div className="flex gap-0">
        {(['yes', 'no', 'unknown'] as const).map((opt, i) => (
          <button
            type="button"
            key={opt}
            onClick={() => onChange(opt)}
            className={`min-h-11 border-2 border-foreground px-4 text-xs font-bold uppercase tracking-widest transition-colors duration-150 ${
              i > 0 ? '-ml-0.5' : ''
            } ${value === opt ? 'bg-accent border-accent text-background' : 'bg-background text-foreground hover:bg-muted'}`}
          >
            {opt === 'yes' ? '是' : opt === 'no' ? '否' : '不確定'}
          </button>
        ))}
      </div>
    </div>
  )
}
