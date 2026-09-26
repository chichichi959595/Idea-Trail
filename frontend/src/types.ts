export interface Session {
  id: number
  team_size: number | null
  time_budget: string | null
  tech_background: string | null
  domain_pref: string | null
  constraints_text: string | null
  has_clear_problem: boolean | null
  has_existing_product: boolean | null
  is_tech_driven: boolean | null
  created_at: string
}

export interface MethodRecommendation {
  id: number
  method: string
  rank: number
  rationale: string
}

export interface MethodStep {
  id: number
  step_index: number
  step_name: string
  question_shown: string
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
  status: 'running' | 'done'
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

export interface ProvidersHealth {
  claude: { ok: boolean; [key: string]: unknown }
  codex: { ok: boolean; [key: string]: unknown }
}

export interface AnswerStepResponse {
  accepted: boolean
  feedback: string | null
  method_run: MethodRun
  ideas: Idea[] | null
}

export const METHOD_LABELS: Record<string, string> = {
  pain_point: '痛點導向',
  user_journey: '使用者旅程',
  scamper: 'SCAMPER',
  reverse_thinking: '逆向思考',
  analogy: '類比法',
  capability_mapping: '能力對應問題',
}

/** Short, fixed description of what each method IS — shown by default.
 * The AI-personalized rationale (why it suits this team) goes behind "更多...". */
export const METHOD_DESCRIPTIONS: Record<string, string> = {
  pain_point: '從最近讓你覺得麻煩的事情出發，逐步問出誰遇到、多常發生、現在怎麼解決，收斂成具體題目。',
  user_journey: '把使用情境攤開成完整旅程，找出體驗最差、最值得切入的環節。',
  scamper: '針對一個現有對象，用七個角度（替代／結合／調整／修改／其他用途／消除／反轉）逐一發想改造方式。',
  reverse_thinking: '從「怎麼讓問題變更糟」反向推導，找出真正該解決的關鍵點。',
  analogy: '借用其他領域已經解決類似問題的做法，類比套用到你的情境。',
  capability_mapping: '從你們已經會的技術出發，反推可以解決哪些問題。',
}

export const IMPLEMENTED_METHODS = new Set(['scamper', 'pain_point'])
