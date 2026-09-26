export interface Session {
  id: number
  team_size: number | null
  time_budget: string | null
  tech_background: string | null
  domain_pref: string | null
  constraints_text: string | null
  has_clear_problem: boolean | null
  clear_problem_text: string | null
  has_existing_product: boolean | null
  existing_product_text: string | null
  created_at: string
}

export interface MethodRecommendation {
  id: number
  method: string
  rank: number
  rationale: string
}

export interface MethodRecommendationResult {
  recommendations: MethodRecommendation[]
  /** What the rules alone ranked, before the AI adjusted it. */
  rule_ranking: string[]
  /** The AI's own note on what it changed and why. */
  adjustment_note: string
}

export interface MethodStep {
  id: number
  step_index: number
  step_name: string
  question_shown: string
  /** Countdown for this step in seconds, or null if it isn't time-boxed. */
  timer_seconds: number | null
  user_answer: string | null
  agent_output: { analysis?: string; idea_fragments?: string[] } | null
  created_at: string
}

export interface MethodRun {
  id: number
  session_id: number
  method_name: string
  provider: string
  model: string | null
  status: 'running' | 'done' | 'failed'
  /** 'failed' = every step was answered but the convergence call produced no
   * ideas. The answers are all still there; only the last call needs replaying. */
  current_step_index: number
  started_at: string
  finished_at: string | null
  steps: MethodStep[]
}

export interface Idea {
  id: number
  session_id: number
  method_run_id: number | null
  title: string
  description: string
  source_method: string | null
  is_synthesized: boolean
  parent_idea_ids: number[] | null
  created_at: string
}

/** One model the provider will accept, as offered in the picker. */
export interface ModelOption {
  id: string
  label: string
  description: string
}

export interface ProviderHealth {
  ok: boolean
  label?: string
  models?: ModelOption[]
  /** Used when the user doesn't pick one; null = let the CLI decide. */
  default_model?: string | null
  detail?: string
  [key: string]: unknown
}

export interface ProvidersHealth {
  claude: ProviderHealth
  codex: ProviderHealth
}

export const PROVIDER_IDS = ['claude', 'codex'] as const
export type ProviderId = (typeof PROVIDER_IDS)[number]

export const PROVIDER_LABELS: Record<ProviderId, string> = {
  claude: 'Claude Code',
  codex: 'Codex',
}

export const PROVIDER_TAGLINES: Record<ProviderId, string> = {
  claude: '本機 Claude Code 訂閱額度',
  codex: '本機 ChatGPT / Codex 訂閱額度',
}

export interface AnswerStepResponse {
  accepted: boolean
  feedback: string | null
  method_run: MethodRun
  ideas: Idea[] | null
}

/** One ideation method as served by `GET /methods`. The backend's
 * FrameworkAgent classes are the single source of truth for this — there is
 * deliberately no second copy of labels/descriptions here. */
export interface MethodCatalogEntry {
  name: string
  /** Full name, for headings. */
  label: string
  /** Compact name, for tags in tight spots like the idea board. */
  short_label: string
  description: string
  tutorial: { intro: string; how_to: string }
  step_count: number
}
