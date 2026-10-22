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
  /** The setup screen's problem as it stands in the pain point library; null
   * when the team said they don't have one. Only on create/update responses. */
  setup_pain_point_id?: number | null
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
  /** Model for this run's convergence call. */
  model: string | null
  /** Model for this run's per-step agents; null = same as `model`. */
  step_model: string | null
  /** 'failed' = every step was answered but the convergence call produced no
   * ideas. The answers are all still there; only the last call needs replaying.
   * A relay run goes lobby → writing → revealed instead. */
  status: 'running' | 'done' | 'failed' | 'lobby' | 'writing' | 'revealed'
  current_step_index: number
  started_at: string
  finished_at: string | null
  /** 'relay' = 多人接龍: phones write in `relay_cells`, `steps` stays empty. */
  mode: 'solo' | 'relay'
  join_code: string | null
  /** How many rounds this relay runs — set by the room's size at start. */
  relay_rounds: number | null
  /** The pain point an ideation run works on; null for a discovery run. */
  pain_point_id: number | null
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
  pain_point_id: number | null
  /** Set by the user in the idea library; null = not set, drawn as medium. */
  size: IdeaSize | null
  created_at: string
}

export type IdeaSize = 's' | 'm' | 'l'

export const IDEA_SIZE_LABELS: Record<IdeaSize, string> = {
  s: '小',
  m: '中',
  l: '大',
}

export interface PainPoint {
  id: number
  session_id: number | null
  statement: string
  who: string | null
  context: string | null
  current_workaround: string | null
  /** 'setup' = written on the setup screen; 'discovery' = found in 痛點發想;
   * 'manual' = typed straight into the library. */
  source: 'setup' | 'discovery' | 'manual'
  method_run_id: number | null
  created_at: string
  idea_count?: number
}

export const PAIN_POINT_SOURCE_LABELS: Record<PainPoint['source'], string> = {
  setup: '開始設定',
  discovery: '痛點發想',
  manual: '手動新增',
}

export type PainPointDraft = Pick<PainPoint, 'statement' | 'who' | 'context' | 'current_workaround'>

/** An AI-judged relation between two library items (two ideas, or two pain
 * points), smaller id first. */
export interface LibraryLink {
  a: number
  b: number
  reason: string
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
  /** This provider's own pick for the per-step agents — a tier below
   * default_model where it has one to step down to. */
  default_step_model?: string | null
  /** 'slow' routes through a coding-agent CLI; 'fast' calls the API directly. */
  speed_tier?: 'fast' | 'slow'
  /** One sentence on what that tradeoff costs, shown on the card. */
  speed_note?: string
  detail?: string
  [key: string]: unknown
}

export type ProvidersHealth = Record<ProviderId, ProviderHealth>

export const PROVIDER_IDS = ['anthropic', 'claude', 'codex'] as const
export type ProviderId = (typeof PROVIDER_IDS)[number]

export const PROVIDER_LABELS: Record<ProviderId, string> = {
  anthropic: 'Anthropic API',
  claude: 'Claude Code',
  codex: 'Codex',
}

/** What to do when a provider reports itself unavailable. The CLI routes need
 * a terminal login; the API route needs a key in the backend's environment. */
export const PROVIDER_UNAVAILABLE_HINTS: Record<ProviderId, string> = {
  anthropic: '後端沒有可用的 ANTHROPIC_API_KEY，設好之後重啟後端再重新整理。',
  claude: '這台機器沒有登入 Claude Code，先在終端機登入後重新整理。',
  codex: '這台機器沒有登入 Codex，先在終端機登入後重新整理。',
}

export const PROVIDER_TAGLINES: Record<ProviderId, string> = {
  anthropic: 'ANTHROPIC_API_KEY 計費，直接呼叫 API',
  claude: '本機 Claude Code 訂閱額度',
  codex: '本機 ChatGPT / Codex 訂閱額度',
}

export interface AnswerStepResponse {
  accepted: boolean
  feedback: string | null
  method_run: MethodRun
  ideas: Idea[] | null
  /** Set when a discovery run converges. */
  pain_points: PainPoint[] | null
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
  /** 'relay' = played by a room of phones rather than answered by one person. */
  mode: 'solo' | 'relay'
  /** Which stage offers it: 'ideation' = 專案發想, 'discovery' = 痛點發想.
   * Each stage picks from — and is recommended from — its own catalog. */
  stage: MethodStage
}

export type MethodStage = 'ideation' | 'discovery'

/** One axis the agent and the user both score an idea on, as served by
 * `GET /evaluation-dimensions` — the backend's `app.agents.evaluator` module
 * is the single source of truth, same convention as MethodCatalogEntry. */
// ---- 專案收斂 ----------------------------------------------------------------

export type MoscowBucket = 'must' | 'should' | 'could' | 'wont'

/** One candidate feature of the MVP. `moscow` is the user's call (null = not
 * sorted yet); `impact`/`effort` are where the user placed it on the matrix,
 * `ai_*` the agent's estimate it started from. All scores are 1~5. */
export interface ConvergenceFeature {
  id: string
  title: string
  description: string
  source: 'ai' | 'user'
  moscow: MoscowBucket | null
  impact: number | null
  effort: number | null
  ai_impact: number | null
  ai_effort: number | null
  ai_rationale: string | null
}

/** 對話: one short line per side. 分析: a full written argument per side. */
export type DebateMode = 'dialogue' | 'analysis'

export interface DebateTurn {
  side: 'pro' | 'con'
  round: number
  /** Missing on turns written before the two modes existed — those are 分析. */
  mode?: DebateMode
  /** "user" = the user joined the 對話 on this side. Missing = an agent. */
  speaker?: 'agent' | 'user'
  argument: string
  key_points: string[]
  focus: string | null
}

export type DemandVerdict = 'real' | 'unsure' | 'not_real'
export type ConvergenceDecision = 'go' | 'pivot' | 'drop'

export interface GithubHit {
  full_name: string
  url: string
  description: string | null
  stars: number
  language: string | null
  updated_at: string | null
}

export interface WebCitation {
  title: string
  url: string
}

export interface Competitor {
  name: string
  /** null when the agent named a link the search never returned. */
  url: string | null
  overlap: string
  gap: string
}

export interface ConvergenceResearch {
  searched_at: string
  queries: string[]
  github: GithubHit[]
  github_error?: string
  web_text: string | null
  web_citations: WebCitation[]
  web_skipped?: string
  web_error?: string
  summary: string
  competitors: Competitor[]
  differentiation: string
}

export interface ConvergenceFeasibility {
  technical: { score: number | null; rationale: string; risks: string[]; suggested_stack: string[] }
  investment: { score: number | null; rationale: string; effort_estimate: string; benefit: string }
  must_fit: string
  open_questions: string[]
  evaluated_at: string
}

/** One idea taken through 專案收斂. The agents' outputs (debate, research,
 * feasibility, ai_* on features) and the user's calls (demand_verdict, the
 * MoSCoW buckets, decision) live side by side, never merged. */
export interface ConvergenceProject {
  id: number
  idea_id: number
  session_id: number | null
  debate: DebateTurn[]
  demand_verdict: DemandVerdict | null
  demand_notes: string | null
  features: ConvergenceFeature[]
  research: ConvergenceResearch | null
  feasibility: ConvergenceFeasibility | null
  decision: ConvergenceDecision | null
  decision_notes: string | null
  created_at: string
  updated_at: string
}

export type ConvergencePatch = Partial<
  Pick<
    ConvergenceProject,
    'demand_verdict' | 'demand_notes' | 'features' | 'debate' | 'decision' | 'decision_notes'
  >
>

/** The agent stages, as their endpoint paths. */
export type ConvergenceAgentStage =
  | 'debate'
  | 'debate/reply'
  | 'features/suggest'
  | 'impact-effort'
  | 'research'
  | 'feasibility'

/** What the setup screen's pain point check made of the team's answer — see
 * `backend/app/agents/pain_check.py`. */
export type PainVerdict = 'clear' | 'vague' | 'not_pain_point'

export interface PainCheck {
  verdict: PainVerdict
  /** One or two sentences addressed to the team. May be empty. */
  feedback: string
}
