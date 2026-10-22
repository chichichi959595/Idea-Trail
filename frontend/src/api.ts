import type {
  AnswerStepResponse,
  ConvergenceAgentStage,
  ConvergencePatch,
  ConvergenceProject,
  DebateMode,
  Idea,
  LibraryLink,
  IdeaSize,
  MethodCatalogEntry,
  MethodRecommendationResult,
  MethodStage,
  MethodRun,
  PainCheck,
  PainPoint,
  PainPointDraft,
  ProvidersHealth,
  Session,
} from './types'

// Same origin as the page, through the Vite proxy (see vite.config.ts) — so it
// works unchanged from the host's localhost, a phone on the LAN, or an ngrok URL.
export const BASE_URL = '/api'

/**
 * Sent on every request. ngrok's free tier answers a browser-looking request
 * with an HTML warning page instead of passing it through; this header is how
 * a page opts out of that for its own API calls. Harmless everywhere else.
 */
export const BASE_HEADERS = {
  'Content-Type': 'application/json',
  'ngrok-skip-browser-warning': '1',
}

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE_URL}${path}`, {
    headers: BASE_HEADERS,
    ...options,
  })
  if (!res.ok) {
    const detail = await res.text()
    throw new Error(`${res.status} ${res.statusText}: ${detail}`)
  }
  return res.json() as Promise<T>
}

/** Called with the reasoning text as it arrives, appended chunk by chunk. */
export type OnThinking = (text: string) => void

interface StreamEvent {
  kind: 'thinking' | 'text' | 'result' | 'error' | 'cancelled'
  text?: string
  payload?: unknown
  detail?: string
  status?: number
}

/**
 * The user pressed stop. Thrown instead of resolving, because there is no
 * result — but it is not a failure either, so callers check for it before they
 * show an error.
 */
export class StreamStopped extends Error {
  constructor(detail = '這次呼叫已中止') {
    super(detail)
    this.name = 'StreamStopped'
  }
}

/** True for both halves of a stop: the backend's `cancelled` event, and the
 * local `fetch` abort that usually gets there first. */
export function isStopped(error: unknown): boolean {
  return error instanceof StreamStopped || (error instanceof Error && error.name === 'AbortError')
}

/**
 * POST to an SSE endpoint and resolve with its `result` payload.
 *
 * EventSource can't do this — it's GET-only and can't send a body — so the
 * stream is read off `fetch` by hand. Every endpoint has a plain-JSON twin, so
 * if streaming isn't available (`onThinking` omitted, or a provider that can't
 * stream) nothing here is needed.
 */
async function streamRequest<T>(
  path: string,
  options: RequestInit,
  onThinking?: OnThinking,
): Promise<T> {
  const res = await fetch(`${BASE_URL}${path}`, {
    headers: BASE_HEADERS,
    ...options,
  })
  // Validation failures still come back as real status codes, because the
  // backend checks them before the stream starts.
  if (!res.ok) {
    throw new Error(`${res.status} ${res.statusText}: ${await res.text()}`)
  }
  if (!res.body) throw new Error('這個瀏覽器不支援串流回應')

  const reader = res.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  let result: T | undefined
  let resolved = false

  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })

    // SSE frames are separated by a blank line; a partial frame stays in the
    // buffer until the rest of it arrives.
    let split: number
    while ((split = buffer.indexOf('\n\n')) !== -1) {
      const frame = buffer.slice(0, split)
      buffer = buffer.slice(split + 2)
      const line = frame.split('\n').find((l) => l.startsWith('data: '))
      if (!line) continue
      const event = JSON.parse(line.slice('data: '.length)) as StreamEvent
      if (event.kind === 'thinking' || event.kind === 'text') {
        if (event.text) onThinking?.(event.text)
      } else if (event.kind === 'cancelled') {
        // The backend confirming it stopped. Usually the local abort has
        // already ended this read, so this is the belt to that braces.
        throw new StreamStopped(event.detail)
      } else if (event.kind === 'error') {
        // The status was already sent as 200, so a failure can only arrive
        // like this — treat it exactly like a thrown request error.
        throw new Error(`${event.status ?? 500}: ${event.detail ?? '串流中斷'}`)
      } else if (event.kind === 'result') {
        result = event.payload as T
        resolved = true
      }
    }
  }

  if (!resolved) throw new Error('串流結束但沒有拿到結果')
  return result as T
}

export type LibraryKind = 'ideas' | 'pain-points'

const LINK_PATHS: Record<LibraryKind, string> = {
  ideas: 'idea-links',
  'pain-points': 'pain-point-links',
}

export const api = {
  providersHealth: () => request<ProvidersHealth>('/providers/health'),

  listMethods: () => request<MethodCatalogEntry[]>('/methods'),

  createSession: (payload: Partial<Session>) =>
    request<Session>('/sessions', { method: 'POST', body: JSON.stringify(payload) }),

  getSession: (id: number) => request<Session>(`/sessions/${id}`),

  /** Rewrites a session's intake answers. The setup screen can be returned to
   * and corrected, and every later call reads the stored row — so the row has
   * to be able to follow the form. */
  updateSession: (id: number, payload: Partial<Session>) =>
    request<Session>(`/sessions/${id}`, { method: 'PUT', body: JSON.stringify(payload) }),

  recommendMethods: (
    sessionId: number,
    provider = 'claude',
    model?: string | null,
    painPointId?: number | null,
    onThinking?: OnThinking,
    signal?: AbortSignal,
    /** Which catalog to recommend from: 專案發想's or 痛點發想's. */
    stage: MethodStage = 'ideation',
  ) => {
    const params = new URLSearchParams({ provider, stage })
    if (model) params.set('model', model)
    if (painPointId != null) params.set('pain_point_id', String(painPointId))
    return streamRequest<MethodRecommendationResult>(
      `/sessions/${sessionId}/method-recommendation/stream?${params}`,
      { method: 'POST', signal },
      onThinking,
    )
  },

  createMethodRun: (
    sessionId: number,
    methodName: string,
    provider: string,
    model?: string | null,
    stepModel?: string | null,
    painPointId?: number | null,
  ) =>
    request<MethodRun>(`/sessions/${sessionId}/method-runs`, {
      method: 'POST',
      body: JSON.stringify({
        method_name: methodName,
        provider,
        model: model || null,
        step_model: stepModel || null,
        pain_point_id: painPointId ?? null,
      }),
    }),

  getMethodRun: (runId: number) => request<MethodRun>(`/method-runs/${runId}`),

  answerStep: (
    runId: number,
    stepIndex: number,
    answer: string,
    force = false,
    onThinking?: OnThinking,
    signal?: AbortSignal,
  ) =>
    streamRequest<AnswerStepResponse>(
      `/method-runs/${runId}/answer/stream`,
      {
        method: 'POST',
        body: JSON.stringify({ step_index: stepIndex, answer, force }),
        signal,
      },
      onThinking,
    ),

  retryFinalize: (runId: number, onThinking?: OnThinking, signal?: AbortSignal) =>
    streamRequest<AnswerStepResponse>(
      `/method-runs/${runId}/finalize/stream`,
      { method: 'POST', signal },
      onThinking,
    ),

  /**
   * Stop whatever call this run has in flight.
   *
   * Aborting the `fetch` on its own is not enough: the backend only notices a
   * dead connection when it next writes to it, and a CLI provider writes
   * nothing for the whole call — so the subprocess would run to completion,
   * still spending the user's quota. This is the request that kills it.
   */
  cancelMethodRun: (runId: number) =>
    request<{ stopped: boolean }>(`/method-runs/${runId}/cancel`, { method: 'POST' }),

  listIdeas: (sessionId: number) => request<Idea[]>(`/sessions/${sessionId}/ideas`),

  synthesize: (
    sessionId: number,
    ideaIds: number[],
    provider = 'claude',
    model?: string | null,
    onThinking?: OnThinking,
  ) =>
    streamRequest<Idea[]>(
      `/sessions/${sessionId}/synthesize/stream`,
      {
        method: 'POST',
        body: JSON.stringify({ idea_ids: ideaIds, provider, model: model || null }),
      },
      onThinking,
    ),

  // ---- libraries: span every session, not just this one ----

  /** A light read of the pain point typed on the setup screen, before the
   * team is allowed to skip 痛點發想. Runs on the step model. */
  checkPainPoint: (statement: string, provider: string, model: string) =>
    request<PainCheck>('/pain-check', {
      method: 'POST',
      body: JSON.stringify({ statement, provider, model: model || null }),
    }),

  listPainPoints: () => request<PainPoint[]>('/pain-points'),

  createPainPoint: (draft: PainPointDraft, sessionId?: number | null) =>
    request<PainPoint>('/pain-points', {
      method: 'POST',
      body: JSON.stringify({ ...draft, session_id: sessionId ?? null }),
    }),

  updatePainPoint: (id: number, draft: PainPointDraft) =>
    request<PainPoint>(`/pain-points/${id}`, { method: 'PUT', body: JSON.stringify(draft) }),

  deletePainPoint: (id: number) =>
    request<{ deleted: boolean }>(`/pain-points/${id}`, { method: 'DELETE' }),

  listAllIdeas: () => request<Idea[]>('/ideas'),

  /** Removes an idea from the library, with its AI links and 專案收斂 record. */
  deleteIdea: (id: number) => request<{ ok: true }>(`/ideas/${id}`, { method: 'DELETE' }),

  setIdeaSize: (id: number, size: IdeaSize | null) =>
    request<Idea>(`/ideas/${id}`, { method: 'PATCH', body: JSON.stringify({ size }) }),

  /** AI-judged links for one library's graph. */
  listLinks: (library: LibraryKind) => request<LibraryLink[]>(`/${LINK_PATHS[library]}`),

  analyzeLinks: (
    library: LibraryKind,
    provider: string,
    model?: string | null,
    onThinking?: OnThinking,
  ) =>
    streamRequest<LibraryLink[]>(
      `/${LINK_PATHS[library]}/analyze/stream`,
      { method: 'POST', body: JSON.stringify({ provider, model: model || null }) },
      onThinking,
    ),

  // ---- 專案收斂: one idea at a time, agents argue, the user decides ----

  listConvergenceProjects: () => request<ConvergenceProject[]>('/convergence-projects'),

  /** Get-or-create the convergence record for an idea. `sessionId` is whose
   * team context the agents read; null falls back to the idea's own session. */
  openConvergence: (ideaId: number, sessionId: number | null) =>
    request<ConvergenceProject>('/convergence-projects', {
      method: 'POST',
      body: JSON.stringify({ idea_id: ideaId, session_id: sessionId }),
    }),

  updateConvergence: (id: number, patch: ConvergencePatch) =>
    request<ConvergenceProject>(`/convergence-projects/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(patch),
    }),

  /** Run one agent stage. Every stage answers with the whole updated record. */
  runConvergenceAgent: (
    id: number,
    stage: ConvergenceAgentStage,
    body: {
      provider: string
      model?: string | null
      focus?: string | null
      mode?: DebateMode
      /** debate/reply only: which side the user speaks for, and the line. */
      side?: 'pro' | 'con'
      text?: string
    },
    onThinking?: OnThinking,
    signal?: AbortSignal,
  ) =>
    streamRequest<ConvergenceProject>(
      `/convergence-projects/${id}/${stage}/stream`,
      { method: 'POST', body: JSON.stringify({ ...body, model: body.model || null }), signal },
      onThinking,
    ),

  /** Same reason as `cancelMethodRun`: aborting the fetch alone never reaches
   * a CLI provider that is writing nothing. */
  cancelConvergence: (id: number) =>
    request<{ stopped: boolean }>(`/convergence-projects/${id}/cancel`, { method: 'POST' }),
}
