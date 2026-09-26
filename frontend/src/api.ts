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

export const api = {
  providersHealth: () => request<ProvidersHealth>('/providers/health'),

  listMethods: () => request<MethodCatalogEntry[]>('/methods'),

  createSession: (payload: Partial<Session>) =>
    request<Session>('/sessions', { method: 'POST', body: JSON.stringify(payload) }),

  getSession: (id: number) => request<Session>(`/sessions/${id}`),

  recommendMethods: (sessionId: number, provider = 'claude', model?: string | null) => {
    const params = new URLSearchParams({ provider })
    if (model) params.set('model', model)
    return request<MethodRecommendationResult>(
      `/sessions/${sessionId}/method-recommendation?${params}`,
      { method: 'POST' },
    )
  },

  createMethodRun: (sessionId: number, methodName: string, provider: string, model?: string | null) =>
    request<MethodRun>(`/sessions/${sessionId}/method-runs`, {
      method: 'POST',
      body: JSON.stringify({ method_name: methodName, provider, model: model || null }),
    }),

  getMethodRun: (runId: number) => request<MethodRun>(`/method-runs/${runId}`),

  answerStep: (runId: number, stepIndex: number, answer: string, force = false) =>
    request<AnswerStepResponse>(`/method-runs/${runId}/answer`, {
      method: 'POST',
      body: JSON.stringify({ step_index: stepIndex, answer, force }),
    }),

  retryFinalize: (runId: number) =>
    request<AnswerStepResponse>(`/method-runs/${runId}/finalize`, { method: 'POST' }),

  listIdeas: (sessionId: number) => request<Idea[]>(`/sessions/${sessionId}/ideas`),

  synthesize: (sessionId: number, ideaIds: number[], provider = 'claude', model?: string | null) =>
    request<Idea[]>(`/sessions/${sessionId}/synthesize`, {
      method: 'POST',
      body: JSON.stringify({ idea_ids: ideaIds, provider, model: model || null }),
    }),
}
