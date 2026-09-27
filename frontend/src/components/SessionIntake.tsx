import { EraserIcon } from 'lucide-react'
import {
  DOMAIN_OPTIONS,
  OTHER_OPTION,
  TECH_OPTIONS,
  type Intake,
  type TriValue,
} from '../intake'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Chip, SegmentedControl } from '@/components/design/selectable'
import { Divider, SectionHeader } from '@/components/design/section'
import { Eyebrow } from '@/components/design/typography'

/**
 * The team's own answers, as a controlled block.
 *
 * Controlled rather than self-owning, because this now sits on a screen the
 * user leaves and comes back to: the draft belongs to the session above it, so
 * it survives a trip to the idea wall and back.
 */
export function SessionIntake({
  value,
  onChange,
}: {
  value: Intake
  onChange: (patch: Partial<Intake>) => void
}) {
  const toggle = (list: string[], key: 'techSelected' | 'domainSelected', opt: string) =>
    onChange({
      [key]: list.includes(opt) ? list.filter((o) => o !== opt) : [...list, opt],
    } as Partial<Intake>)

  return (
    <div className="flex flex-col gap-7">
      <SectionHeader
        eyebrow="01"
        title="團隊現在的狀況"
        description="這些資訊只用來挑方法，填得粗略也沒關係，之後想改隨時可以回來改。"
      />

      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
        <Field label="團隊人數">
          <Input
            type="number"
            min={1}
            inputMode="numeric"
            value={value.teamSize}
            onChange={(e) => onChange({ teamSize: e.target.value })}
          />
        </Field>
        <Field label="可用時間">
          <Input
            placeholder="例如：2 個月，畢業專題"
            value={value.timeBudget}
            onChange={(e) => onChange({ timeBudget: e.target.value })}
          />
        </Field>
      </div>

      <Field label="技術背景" hint="可多選" group>
        <ChipGroup
          label="技術背景"
          options={TECH_OPTIONS}
          selected={value.techSelected}
          onToggle={(opt) => toggle(value.techSelected, 'techSelected', opt)}
          onClear={() => onChange({ techSelected: [], techOther: '' })}
          otherValue={value.techOther}
          onOtherChange={(v) => onChange({ techOther: v })}
        />
      </Field>

      <Field label="領域偏好" hint="可多選" group>
        <ChipGroup
          label="領域偏好"
          options={DOMAIN_OPTIONS}
          selected={value.domainSelected}
          onToggle={(opt) => toggle(value.domainSelected, 'domainSelected', opt)}
          onClear={() => onChange({ domainSelected: [], domainOther: '' })}
          otherValue={value.domainOther}
          onOtherChange={(v) => onChange({ domainOther: v })}
        />
      </Field>

      <Field label="限制條件">
        <Textarea
          className="min-h-20"
          placeholder="例如：希望有真實使用者可以測試，不要太難維護"
          value={value.constraints}
          onChange={(e) => onChange({ constraints: e.target.value })}
        />
      </Field>

      <div className="flex flex-col gap-1">
        <SectionHeader
          title="你們的起點"
          description="有沒有既有的問題或題目，會直接改變適合的發想方法。"
          className="pb-3"
        />

        <TriChoice
          label="已經有明確想解決的問題？"
          value={value.hasClearProblem}
          onChange={(v) => onChange({ hasClearProblem: v })}
          followUp={{
            label: '那個問題是什麼？',
            placeholder: '例如：系上的二手書買賣都靠社群貼文，買賣雙方很難對上',
            value: value.clearProblemText,
            onChange: (v) => onChange({ clearProblemText: v }),
          }}
        />
        <Divider />
        <TriChoice
          label="有既有產品／題目想改造？"
          value={value.hasExistingProduct}
          onChange={(v) => onChange({ hasExistingProduct: v })}
          followUp={{
            label: '想改造的是什麼？',
            placeholder: '例如：去年的社團報名網站，現在流程太繞',
            value: value.existingProductText,
            onChange: (v) => onChange({ existingProductText: v }),
          }}
        />
      </div>
    </div>
  )
}

/**
 * Label + optional hint above a control.
 *
 * `group` swaps the `<label>` for a labelled group. A `<label>` forwards its
 * clicks to one control, which is wrong (and, with a clear button inside,
 * actively confusing) for a field whose body is a set of buttons.
 */
function Field({
  label,
  hint,
  group = false,
  children,
}: {
  label: string
  hint?: string
  group?: boolean
  children: React.ReactNode
}) {
  const Wrapper = group ? 'div' : 'label'
  return (
    <Wrapper
      className="flex flex-col gap-2"
      {...(group ? { role: 'group', 'aria-label': label } : {})}
    >
      <span className="flex items-baseline gap-2">
        <span className="text-sm font-medium">{label}</span>
        {hint && <Eyebrow className="normal-case tracking-normal">{hint}</Eyebrow>}
      </span>
      {children}
    </Wrapper>
  )
}

/**
 * Multi-select chips in two parts: what you've chosen on top, what's left to
 * choose from below.
 *
 * One wrapping row of toggles made the answer to "so what did we say we know?"
 * something you had to re-read the whole row to work out, picking the ticked
 * ones out of the unticked. Splitting it means the chosen set is a short line
 * you can read at a glance, and the pool below is a grid — several columns, one
 * option per cell — so twelve options scan as a list of choices rather than as
 * a paragraph of pills at ragged widths.
 *
 * 其他 lives in the pool like any other option and brings its free-text box with
 * it when it moves up.
 */
function ChipGroup({
  label,
  options,
  selected,
  onToggle,
  onClear,
  otherValue,
  onOtherChange,
}: {
  label: string
  options: string[]
  selected: string[]
  onToggle: (option: string) => void
  onClear: () => void
  otherValue: string
  onOtherChange: (value: string) => void
}) {
  const all = [...options, OTHER_OPTION]
  // Ordered by the catalog, not by when each one was clicked: the chosen row is
  // read as a set, and having it reshuffle on every pick makes it look like
  // something else changed too.
  const chosen = all.filter((opt) => selected.includes(opt))
  const pool = all.filter((opt) => !selected.includes(opt))

  return (
    <div className="flex flex-col gap-2.5 rounded-xl border border-border bg-subtle p-3">
      <div className="flex items-start justify-between gap-3">
        {chosen.length > 0 ? (
          <div className="flex flex-wrap gap-1.5">
            {chosen.map((opt) => (
              <Chip key={opt} selected indicator="remove" onSelect={() => onToggle(opt)}>
                {opt}
              </Chip>
            ))}
          </div>
        ) : (
          // Indented to the chips' own label position, not to the container
          // edge — otherwise the empty state sits a notch left of everything
          // that replaces it.
          <p className="py-1.5 pl-3 text-sm text-muted-foreground">
            還沒選，從下面點一個就會移上來
          </p>
        )}

        <Button
          type="button"
          variant="ghost"
          size="xs"
          className="mt-1 shrink-0 text-muted-foreground hover:text-foreground"
          disabled={chosen.length === 0}
          onClick={onClear}
          aria-label={`清空${label}`}
        >
          <EraserIcon />
          清空
        </Button>
      </div>

      {pool.length > 0 && (
        <>
          <div aria-hidden className="divider-fade" />
          <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2 lg:grid-cols-3">
            {pool.map((opt) => (
              <Chip
                key={opt}
                indicator="add"
                onSelect={() => onToggle(opt)}
                className="w-full justify-start"
              >
                {opt}
              </Chip>
            ))}
          </div>
        </>
      )}

      {selected.includes(OTHER_OPTION) && (
        <Input
          placeholder="請說明"
          aria-label={`${label}：其他`}
          value={otherValue}
          onChange={(e) => onOtherChange(e.target.value)}
        />
      )}
    </div>
  )
}

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
        <div
          className={cn('animate-in fade-in slide-in-from-top-1 flex flex-col gap-2 duration-200')}
        >
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
