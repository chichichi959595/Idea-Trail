import { BASE_HEADERS, BASE_URL } from '../api'
import type { PainPoint } from '../types'
import type { JoinOrigins, RelayHostState, RelayPhoneState } from './types'

/**
 * A failed relay call, carrying the backend's own sentence.
 *
 * The rest of the app shows errors to the person who is debugging it; these
 * are shown on a stranger's phone in the middle of a workshop, so the message
 * is the backend's `detail` ("這一場已經開始了…") rather than a status line.
 */
export class RelayError extends Error {
  readonly status: number

  constructor(status: number, message: string) {
    super(message)
    this.name = 'RelayError'
    this.status = status
  }
}

async function call<T>(path: string, init: RequestInit & { token?: string } = {}): Promise<T> {
  const { token, ...rest } = init
  const res = await fetch(`${BASE_URL}${path}`, {
    ...rest,
    headers: { ...BASE_HEADERS, ...(token ? { 'X-Relay-Token': token } : {}) },
  })
  if (!res.ok) {
    let detail = res.statusText
    try {
      const body = await res.json()
      if (typeof body?.detail === 'string') detail = body.detail
    } catch {
      // Not JSON (a proxy error page, say) — the status text will do.
    }
    throw new RelayError(res.status, detail)
  }
  return res.json() as Promise<T>
}

const post = (body?: unknown) => ({
  method: 'POST',
  body: body === undefined ? undefined : JSON.stringify(body),
})

export const relayApi = {
  // host — the run itself is opened by `api.createMethodRun`, like any method's
  get: (runId: number) => call<RelayHostState>(`/relay-runs/${runId}`),
  start: (runId: number) => call<RelayHostState>(`/relay-runs/${runId}/start`, post()),
  advance: (runId: number) => call<RelayHostState>(`/relay-runs/${runId}/advance`, post()),
  savePainPoint: (runId: number, chainIndex: number) =>
    call<PainPoint>(`/relay-runs/${runId}/chains/${chainIndex}/pain-point`, post()),
  joinOrigins: () => call<JoinOrigins>('/network/join-origins'),
  startNgrok: (port: number) => call<JoinOrigins>('/network/ngrok/start', post({ port })),
  stopNgrok: () => call<JoinOrigins>('/network/ngrok/stop', post()),

  // phone
  peek: (code: string) =>
    call<{ join_code: string; status: string; participant_count: number }>(`/relay/${code}`),
  join: (code: string, displayName: string) =>
    call<RelayPhoneState & { token: string }>(
      `/relay/${code}/join`,
      post({ display_name: displayName }),
    ),
  me: (code: string, token: string) => call<RelayPhoneState>(`/relay/${code}/me`, { token }),
  submit: (code: string, token: string, cellId: number, answerText: string) =>
    call<RelayPhoneState>(`/relay/${code}/cells/${cellId}`, {
      ...post({ answer_text: answerText }),
      token,
    }),
  flag: (code: string, token: string, cellId: number, flagged: boolean) =>
    call<RelayPhoneState>(`/relay/${code}/cells/${cellId}/flag`, {
      ...post({ flagged }),
      token,
    }),
}
