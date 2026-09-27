import type { Session } from './types'

/**
 * What the team says about itself, as the form holds it.
 *
 * This lives outside the components because it outlived the screen it started
 * on: the answers used to be collected once on the entry screen and then only
 * existed as a row in the database. They are now part of the setup screen, which
 * the user can come back to and correct, so the draft has to be owned above both
 * the form and the save.
 */

export type TriValue = 'yes' | 'no' | 'unknown'

export interface Intake {
  teamSize: string
  timeBudget: string
  techSelected: string[]
  techOther: string
  domainSelected: string[]
  domainOther: string
  constraints: string
  hasClearProblem: TriValue
  clearProblemText: string
  hasExistingProduct: TriValue
  existingProductText: string
}

export const TECH_OPTIONS = [
  '前端',
  '後端',
  '行動開發（iOS／Android）',
  '資料／AI',
  'UI／UX 設計',
  '沒有明顯技術背景',
]

export const DOMAIN_OPTIONS = [
  '教育',
  '生產力工具',
  '健康／生活',
  '社群／社交',
  '電商／商業',
  '校園生活',
  '永續／環境',
]

export const OTHER_OPTION = '其他'

export const EMPTY_INTAKE: Intake = {
  teamSize: '3',
  timeBudget: '',
  techSelected: [],
  techOther: '',
  domainSelected: [],
  domainOther: '',
  constraints: '',
  hasClearProblem: 'unknown',
  clearProblemText: '',
  hasExistingProduct: 'unknown',
  existingProductText: '',
}

function combineChips(selected: string[], other: string): string {
  const labels = selected.filter((s) => s !== OTHER_OPTION)
  if (selected.includes(OTHER_OPTION) && other.trim()) labels.push(other.trim())
  return labels.join('、')
}

const toBool = (v: TriValue) => (v === 'unknown' ? null : v === 'yes')

/** The form's shape, as the API wants it. Empty strings become nulls, because
 * "not answered" is a real state the method selector reads. */
export function toSessionPayload(intake: Intake): Partial<Session> {
  return {
    team_size: intake.teamSize ? Number(intake.teamSize) : null,
    time_budget: intake.timeBudget || null,
    tech_background: combineChips(intake.techSelected, intake.techOther) || null,
    domain_pref: combineChips(intake.domainSelected, intake.domainOther) || null,
    constraints_text: intake.constraints || null,
    has_clear_problem: toBool(intake.hasClearProblem),
    clear_problem_text:
      (intake.hasClearProblem === 'yes' && intake.clearProblemText.trim()) || null,
    has_existing_product: toBool(intake.hasExistingProduct),
    existing_product_text:
      (intake.hasExistingProduct === 'yes' && intake.existingProductText.trim()) || null,
  }
}
