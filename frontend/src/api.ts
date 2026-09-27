import type {
  AnswerStepResponse,
  Idea,
  MethodCatalogEntry,
  MethodRecommendationResult,
  MethodRun,
  ProvidersHealth,
  Session,
} from './types'

const BASE_URL = 'http://127.0.0.1:8000'

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE_URL}${path}`, {
    headers: { 'Content-Type': 'application/json' },
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
  kind: 'thinking' | 'text' | 'result' | 'error'
  text?: string
  payload?: unknown
  detail?: string
  status?: number
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
    headers: { 'Content-Type': 'application/json' },
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

export const api = {
  providersHealth: () => request<ProvidersHealth>('/providers/health'),

  listMethods: () => request<MethodCatalogEntry[]>('/methods'),

  createSession: (payload: Partial<Session>) =>
    request<Session>('/sessions', { method: 'POST', body: JSON.stringify(payload) }),

  getSession: (id: number) => request<Session>(`/sessions/${id}`),

  recommendMethods: (
    sessionId: number,
    provider = 'claude',
    model?: string | null,
    onThinking?: OnThinking,
  ) => {
    const params = new URLSearchParams({ provider })
    if (model) params.set('model', model)
    return streamRequest<MethodRecommendationResult>(
      `/sessions/${sessionId}/method-recommendation/stream?${params}`,
      { method: 'POST' },
      onThinking,
    )
  },

  createMethodRun: (
    sessionId: number,
    methodName: string,
    provider: string,
    model?: string | null,
    stepModel?: string | null,
  ) =>
    request<MethodRun>(`/sessions/${sessionId}/method-runs`, {
      method: 'POST',
      body: JSON.stringify({
        method_name: methodName,
        provider,
        model: model || null,
        step_model: stepModel || null,
      }),
    }),

  getMethodRun: (runId: number) => request<MethodRun>(`/method-runs/${runId}`),

  answerStep: (
    runId: number,
    stepIndex: number,
    answer: string,
    force = false,
    onThinking?: OnThinking,
  ) =>
    streamRequest<AnswerStepResponse>(
      `/method-runs/${runId}/answer/stream`,
      { method: 'POST', body: JSON.stringify({ step_index: stepIndex, answer, force }) },
      onThinking,
    ),

  retryFinalize: (runId: number, onThinking?: OnThinking) =>
    streamRequest<AnswerStepResponse>(
      `/method-runs/${runId}/finalize/stream`,
      { method: 'POST' },
      onThinking,
    ),

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
}
