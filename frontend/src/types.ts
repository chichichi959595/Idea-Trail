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

export const METHOD_LABELS: Record<string, string> = {
  pain_point: '痛點導向',
  user_journey: '使用者旅程',
  scamper: 'SCAMPER',
  reverse_thinking: '逆向思考',
  analogy: '類比法',
  capability_mapping: '能力對應問題',
  how_might_we: 'HMW',
  mashup: '混搭法（Mash-up）',
  random_input: 'RANDOM INPUT',
  crazy_8s: 'Crazy 8s',
}

/** Short, fixed description of what each method IS — shown by default.
 * The AI-personalized rationale (why it suits this team) goes behind "更多...". */
export const METHOD_DESCRIPTIONS: Record<string, string> = {
  pain_point: '從最近讓你覺得麻煩的事情出發，逐步問出誰遇到、多常發生、現在怎麼解決，收斂成具體題目。',
  user_journey: '把使用情境攤開成完整旅程，找出體驗最差、最值得切入的環節。',
  scamper: '針對一個現有對象，用七個角度（替代／結合／調整／修改／其他用途／消除／反轉）逐一發想改造方式。',
  reverse_thinking: '故意想一堆最爛、最沒用的點子，挖出爛在哪裡，再把最有趣的一個調轉成有商機的方向。',
  analogy: '借用其他領域已經解決類似問題的做法，類比套用到你的情境。',
  capability_mapping: '從你們已經會的技術出發，反推可以解決哪些問題，並檢查問題本身是否值得做。',
  how_might_we: '把觀察到的問題改寫成一句「How might we...?」，再針對這句話大量發想解法。',
  mashup: '分別列出對象、痛點、技術三份清單，再隨機強迫組合出新方向。',
  random_input: '抽一個完全無關的隨機詞彙，強迫把它跟你的主題湊在一起，逼出意外的連結。',
  crazy_8s: '針對一個具體問題，每 30 秒衝一個解法，8 個解法不准評論自己，越後面擠出來的往往越有突破性。',
}

export interface MethodTutorial {
  /** What the method is and why it works — the underlying idea. */
  intro: string
  /** How to actually play it within this flow, in plain terms. */
  howTo: string
}

/** Fuller "what is this / how do I play it" copy — shown on demand during
 * a run, next to the method name, so people don't need to already know
 * the technique before they can use it well. */
export const METHOD_TUTORIALS: Record<string, MethodTutorial> = {
  pain_point: {
    intro: '從真實觀察到的困擾出發，而不是憑空想題目：核心假設是「先有痛點、才有解法」。',
    howTo: '依序回答最近卡在什麼事、誰會遇到、現在怎麼解決、為什麼不好、多常發生、解決後的價值。回答越具體，AI 抽出的想法片段就越準。',
  },
  scamper: {
    intro: '針對一個現有的產品、服務或流程，用七個固定角度逐一逼問「還能怎麼改」，是最經典的產品改造發想法。',
    howTo: '先講清楚要套用的對象是什麼，接著依序回答替代、結合、調整、修改、其他用途、消除、反轉七個角度，每個角度舉一個具體例子就好，不用每個都很厲害。',
  },
  reverse_thinking: {
    intro: '源自「最糟點子法」：與其直接想好點子，不如先故意想最爛的點子，因為爛點子往往能暴露出真正重要的限制條件，再把它們調轉回來。',
    howTo: '先講情境，接著刻意想幾個爛到不行的點子，說出它們爛在哪裡，最後挑一個最有趣的爛點子，把它修正成一個說得通的方向。',
  },
  user_journey: {
    intro: '把使用情境攤開成一段完整的旅程，從旅程裡最痛的那個瞬間找切入點，而不是憑空想功能。',
    howTo: '依序描述主角是誰、他為什麼開始這趟旅程、大致經歷哪些步驟、哪個階段最卡，最後指出如果只能改一個瞬間會是哪裡。',
  },
  analogy: {
    intro: '太陽底下沒有新鮮事：先描述你的問題結構，再去別的領域（甚至大自然）找已經解決類似結構問題的做法，把邏輯借過來套用。',
    howTo: '描述你的問題，想一個結構類似但完全不同領域的例子，說明那個領域怎麼解決，最後把那套邏輯套回你的題目。',
  },
  capability_mapping: {
    intro: '從你們已經會的技術出發往回推可以解決什麼問題，適合技術導向但還沒有明確題目的團隊；但要小心不要變成「為技術找題目」。',
    howTo: '先列出拿手或想練的技術，講出它的獨特優勢，想像誰的問題剛好需要這個技術，最後拿掉技術濾鏡，誠實檢查這個問題本身重不重要。',
  },
  how_might_we: {
    intro: '把一個模糊的困擾改寫成一句「How might we...?（我們可以怎麼做，讓...？）」，是設計思考裡最常見的重新框定問題手法，能把抱怨轉成可以發想的問句。',
    howTo: '先講原始觀察到的問題，把它改寫成一句 HMW 問句，針對這句話盡量列出解法，最後挑一個自己最想深入的。',
  },
  mashup: {
    intro: '準備三種不同性質的清單——對象/場景、痛點/需求、技術/媒介——分開發散、再隨機強迫組合，逼出原本不會想到的交集。',
    howTo: '分別各自列出 3 個對象、3 個痛點、3 個技術（先不用互相對應），最後從三份清單裡各挑一個硬湊在一起，看看會變成什麼。',
  },
  random_input: {
    intro: '抽一個跟主題完全無關的隨機詞彙，強迫自己把它跟主題湊在一起，用不合理的連結逼出跳脫慣性的點子，適合已經有大方向、只是想不出新意的情況。',
    howTo: '先講你們的主題方向，接著系統會給一個隨機詞彙，想辦法硬把它跟主題湊在一起想出一個點子，重複三次後，挑一個比較有潛力的延伸。',
  },
  crazy_8s: {
    intro: '針對「同一個」具體問題，逼自己在極短時間內畫出 8 個不同的解法，規則是不准評論、不准刪除、先求數量——前幾個通常是老掉牙的常識，但越後面擠出來的往往越有突破性。',
    howTo: '先講清楚要解決的具體問題，接著每一步都有 30 秒的限時，針對同一個問題寫下一個新解法（不是點子，是解法），共 8 步，不要回頭修改或刪除前面寫的。',
  },
}

// Per-step countdown in seconds; only Crazy 8s's solution steps use this.
export function getStepTimerSeconds(methodName: string, stepName: string): number | null {
  if (methodName === 'crazy_8s' && stepName.startsWith('solution_')) return 30
  return null
}

export const IMPLEMENTED_METHODS = new Set([
  'scamper',
  'pain_point',
  'reverse_thinking',
  'user_journey',
  'analogy',
  'capability_mapping',
  'how_might_we',
  'mashup',
  'random_input',
  'crazy_8s',
])
