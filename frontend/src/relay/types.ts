/** 多人接龍 — mirrors backend/app/api/relay.py. */

export type RelayStatus = 'lobby' | 'writing' | 'revealed'

export interface RelayParticipant {
  id: number
  display_name: string
  seat_index: number
}

export interface RelayRung {
  question: string
  role: 'who' | 'context' | 'pain' | 'current_fix' | 'other'
}

export interface RelayChainCell {
  round_index: number
  question: string
  role: RelayRung['role']
  /** null = the timer ran out before anything was written. */
  answer: string | null
  flagged_unclear: boolean
  /** Host view only. Phones never learn who wrote what. */
  author?: string | null
  latency_ms?: number | null
}

export interface RelayChain {
  chain_index: number
  cells: RelayChainCell[]
}

export interface RoundProgress {
  submitted: number
  total: number
}

/** A deadline plus the server's clock at the moment of the response, so a
 * phone with a drifting clock still counts down from the right number. */
export interface RelayClock {
  timer_seconds: number | null
  deadline_at: string | null
  server_now: string
}

export interface RelayHostState extends Partial<RelayClock> {
  id: number
  session_id: number
  join_code: string
  status: RelayStatus
  min_participants: number
  participants: RelayParticipant[]
  rungs: RelayRung[]
  round_index: number
  rounds: number | null
  started_at: string
  finished_at: string | null
  progress?: RoundProgress
  chains?: RelayChain[]
}

export interface PaperLayer {
  cell_id: number
  round_index: number
  question: string
  answer: string | null
  flagged_unclear: boolean
}

export interface RelayRound extends RelayClock {
  cell_id: number
  round_index: number
  rounds: number
  question: string
  /** Everything already on the paper in this phone's hands — and nothing from
   * any other paper. Empty in round one. */
  paper: PaperLayer[]
  submitted: boolean
  progress: RoundProgress
}

export interface RelayPhoneState {
  status: RelayStatus
  join_code: string
  me: { display_name: string; seat_index: number }
  participant_count: number
  min_participants: number
  round?: RelayRound
  chains?: RelayChain[]
}

export interface JoinOrigins {
  lan_ip: string | null
  ngrok_url: string | null
}
