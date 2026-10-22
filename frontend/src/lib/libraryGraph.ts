import {
  IDEA_SIZE_LABELS,
  PAIN_POINT_SOURCE_LABELS,
  type Idea,
  type IdeaSize,
  type LibraryLink,
  type PainPoint,
} from '../types'

/**
 * What the two library graphs are drawn from: the dots, the lines between
 * them and why, and which colour each dot wears. The drawing itself
 * (`ForceGraph`) knows nothing about ideas or pain points — everything
 * library-specific is decided here.
 */

export interface GraphNode {
  id: number
  label: string
  r: number
  fill: string
  /** Drawn as a ring rather than a disc — "not in any colour group". */
  hollow: boolean
  /** Lines under the title in the hover card. */
  details: string[]
  /** Whether the label shows at rest, before anything is hovered. */
  prominent: boolean
}

export interface GraphEdge {
  source: number
  target: number
  kind: string
  /** Shown on hover: why these two are joined. */
  reason: string
}

export interface EdgeStyle {
  label: string
  /** Spring rest length — the closer the relation, the shorter. */
  distance: number
  strength: number
  width: number
  dash?: string
  /** AI-judged: drawn in the AI colour, so it never passes for a fact. */
  ai?: boolean
}

export interface LegendItem {
  label: string
  color: string
  hollow?: boolean
}

/** Three hues at most — beyond three, side-by-side dots stop being
 * distinguishable for colour-blind readers. */
export const SERIES = ['var(--series-1)', 'var(--series-2)', 'var(--series-3)'] as const
export const OTHER_COLOR = 'var(--series-other)'

export const SEMANTIC_STYLE: EdgeStyle = {
  label: 'AI 判斷相關',
  distance: 70,
  strength: 0.6,
  width: 1,
  dash: '4 3',
  ai: true,
}

export function semanticEdges(links: LibraryLink[]): GraphEdge[] {
  return links.map((l) => ({
    source: l.a,
    target: l.b,
    kind: 'semantic',
    reason: l.reason,
  }))
}

/** Joins items into one edge set: within each group, everything hangs off the
 * group's first member. Pairwise would turn a group of eight into 28 edges, a
 * hairball that says nothing more than "these belong together". */
function starEdges<T extends { id: number }>(
  items: T[],
  groupOf: (item: T) => number | null,
  kind: string,
  reason: string,
  into: Map<string, GraphEdge>,
) {
  const heads = new Map<number, number>()
  for (const item of items) {
    const group = groupOf(item)
    if (group === null) continue
    const head = heads.get(group)
    if (head === undefined) heads.set(group, item.id)
    else addEdge(into, head, item.id, kind, reason)
  }
  return heads
}

function addEdge(into: Map<string, GraphEdge>, a: number, b: number, kind: string, reason: string) {
  if (a === b) return
  const key = a < b ? `${a}-${b}` : `${b}-${a}`
  // First kind wins, and callers add the closest relation first.
  if (!into.has(key)) into.set(key, { source: a, target: b, kind, reason })
}

// ---- ideas -----------------------------------------------------------------

export const IDEA_EDGE_STYLES: Record<string, EdgeStyle> = {
  merged: { label: '整合自', distance: 46, strength: 0.7, width: 1.6 },
  run: { label: '同一輪發想', distance: 56, strength: 0.7, width: 1 },
  pain: {
    label: '同一個痛點',
    distance: 96,
    strength: 0.25,
    width: 1,
    dash: '1 3',
  },
  semantic: SEMANTIC_STYLE,
}

/** Dot radius. Unset draws as medium, so setting "中" changes nothing visible. */
const IDEA_RADIUS: Record<IdeaSize, number> = { s: 5, m: 8.5, l: 14 }

/** Merged-from, same run, then same pain point — runs on one pain point are
 * chained through their first ideas, on a longer spring. */
export function ideaStructuralEdges(ideas: Idea[]): GraphEdge[] {
  const ids = new Set(ideas.map((i) => i.id))
  const edges = new Map<string, GraphEdge>()
  for (const idea of ideas) {
    for (const parent of idea.parent_idea_ids ?? []) {
      if (ids.has(parent)) addEdge(edges, parent, idea.id, 'merged', '整合自')
    }
  }
  const runHeads = starEdges(ideas, (i) => i.method_run_id, 'run', '同一輪發想', edges)
  const heads = new Set(runHeads.values())
  starEdges(
    // One representative per run joins its pain point's chain.
    ideas.filter((i) => i.method_run_id === null || heads.has(i.id)),
    (i) => i.pain_point_id,
    'pain',
    '同一個痛點',
    edges,
  )
  return [...edges.values()]
}

/** One choice in the dropdown under a graph: which group to colour. */
export interface ColorOption {
  value: string
  label: string
}

/** The dropdown's "colour everything" choice — the graph as it always was. */
export const COLOR_ALL = 'all'
const NO_PAIN_POINT = 'none'

/** Every pain point in the library, then the ideas that have none. */
export function ideaColorOptions(painPoints: PainPoint[]): ColorOption[] {
  return [
    ...painPoints.map((p) => ({ value: String(p.id), label: p.statement })),
    { value: NO_PAIN_POINT, label: '沒有指定痛點' },
  ]
}

/**
 * Colours by pain point — only the three with the most ideas get a hue.
 * With `focus` set to one pain point (or to `none`), only its ideas are
 * coloured and every other dot goes grey.
 */
export function ideaColors(ideas: Idea[], painPoints: PainPoint[], focus = COLOR_ALL) {
  if (focus !== COLOR_ALL) {
    // The dropdown already names it; the legend only has to give its colour.
    const target = focus === NO_PAIN_POINT ? null : Number(focus)
    return {
      legend: [
        {
          label: target === null ? '沒有指定痛點' : '這個痛點',
          color: SERIES[0],
          hollow: target === null,
        },
        { label: '其他想法', color: OTHER_COLOR },
      ],
      colorOf: (idea: Idea) =>
        idea.pain_point_id === target
          ? { fill: SERIES[0], hollow: target === null }
          : { fill: OTHER_COLOR, hollow: false },
    }
  }
  const counts = new Map<number, number>()
  for (const idea of ideas) {
    if (idea.pain_point_id !== null) {
      counts.set(idea.pain_point_id, (counts.get(idea.pain_point_id) ?? 0) + 1)
    }
  }
  // Ties go to the older pain point, so a new idea elsewhere can't reshuffle
  // the colours already on screen.
  const ranked = [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0] - b[0])
  const statement = new Map(painPoints.map((p) => [p.id, p.statement]))

  const byPainPoint = new Map<number, string>()
  const legend: LegendItem[] = []
  ranked.slice(0, SERIES.length).forEach(([id], i) => {
    byPainPoint.set(id, SERIES[i])
    legend.push({
      label: statement.get(id) ?? '（已刪除的痛點）',
      color: SERIES[i],
    })
  })
  if (ranked.length > SERIES.length) legend.push({ label: '其他痛點', color: OTHER_COLOR })
  if (ideas.some((i) => i.pain_point_id === null)) {
    legend.push({ label: '沒有指定痛點', color: OTHER_COLOR, hollow: true })
  }
  const colorOf = (idea: Idea) =>
    idea.pain_point_id === null
      ? { fill: OTHER_COLOR, hollow: true }
      : {
          fill: byPainPoint.get(idea.pain_point_id) ?? OTHER_COLOR,
          hollow: false,
        }
  return { legend, colorOf }
}

export function ideaNodes(
  ideas: Idea[],
  colorOf: (idea: Idea) => { fill: string; hollow: boolean },
  painPointLabel: (id: number | null) => string | null,
): GraphNode[] {
  return ideas.map((idea) => ({
    id: idea.id,
    label: idea.title,
    r: IDEA_RADIUS[idea.size ?? 'm'],
    ...colorOf(idea),
    details: [
      painPointLabel(idea.pain_point_id) ?? '沒有指定痛點',
      `規模：${idea.size ? IDEA_SIZE_LABELS[idea.size] : '未設定'}`,
    ],
    prominent: idea.size === 'l',
  }))
}

// ---- pain points -----------------------------------------------------------

export const PAIN_POINT_EDGE_STYLES: Record<string, EdgeStyle> = {
  merged: {
    label: '有想法整合了兩者',
    distance: 60,
    strength: 0.6,
    width: 1.6,
  },
  run: { label: '同一輪痛點發想', distance: 56, strength: 0.7, width: 1 },
  semantic: SEMANTIC_STYLE,
}

/**
 * Found together, or worked on together.
 *
 * "Worked on together" is read off the idea library: a synthesized idea whose
 * parents came from two different pain points is evidence the team saw a
 * connection between those problems.
 */
export function painPointStructuralEdges(painPoints: PainPoint[], ideas: Idea[]): GraphEdge[] {
  const ids = new Set(painPoints.map((p) => p.id))
  const edges = new Map<string, GraphEdge>()

  const painOf = new Map(ideas.map((i) => [i.id, i.pain_point_id]))
  for (const idea of ideas) {
    if (!idea.is_synthesized) continue
    const parents = [
      ...new Set(
        (idea.parent_idea_ids ?? [])
          .map((id) => painOf.get(id))
          .filter((p): p is number => p != null && ids.has(p)),
      ),
    ]
    for (let i = 1; i < parents.length; i++) {
      addEdge(edges, parents[0], parents[i], 'merged', `「${idea.title}」整合了兩者`)
    }
  }
  starEdges(painPoints, (p) => p.method_run_id, 'run', '同一輪痛點發想', edges)
  return [...edges.values()]
}

const SOURCES = ['discovery', 'setup', 'manual'] as const

/** The sources that actually occur in the library. */
export function painPointColorOptions(painPoints: PainPoint[]): ColorOption[] {
  const present = new Set(painPoints.map((p) => p.source))
  return SOURCES.filter((s) => present.has(s)).map((s) => ({
    value: s,
    label: PAIN_POINT_SOURCE_LABELS[s],
  }))
}

/** Coloured by where the pain point came from — exactly three, so each
 * gets a hue of its own. With `focus` set to one source, only that source
 * keeps its hue and the rest go grey. */
export function painPointColors(painPoints: PainPoint[], focus = COLOR_ALL) {
  const color = Object.fromEntries(SOURCES.map((s, i) => [s, SERIES[i]])) as Record<
    PainPoint['source'],
    string
  >
  const fillOf = (s: PainPoint['source']) =>
    focus === COLOR_ALL || focus === s ? color[s] : OTHER_COLOR
  const legend =
    focus === COLOR_ALL
      ? painPointColorOptions(painPoints).map((o) => ({
          label: o.label,
          color: color[o.value as PainPoint['source']],
        }))
      : [
          // The dropdown already names it; the legend only has to give its colour.
          { label: '這個來源', color: color[focus as PainPoint['source']] },
          { label: '其他來源', color: OTHER_COLOR },
        ]
  return {
    legend,
    colorOf: (p: PainPoint) => ({ fill: fillOf(p.source), hollow: false }),
  }
}

/** Sized by how many ideas have been built on it: the problems the teams
 * keep coming back to are the big ones. Square root, so ten ideas reads as
 * bigger than one without dwarfing the rest. */
export function painPointRadius(ideaCount: number) {
  return Math.min(5.5 + 2.6 * Math.sqrt(ideaCount), 18)
}

export function painPointNodes(
  painPoints: PainPoint[],
  colorOf: (p: PainPoint) => { fill: string; hollow: boolean },
): GraphNode[] {
  const counts = painPoints.map((p) => p.idea_count ?? 0)
  // The top fifth by idea count keep their label at rest.
  const threshold = [...counts].sort((a, b) => b - a)[Math.floor(counts.length / 5)] ?? 0
  return painPoints.map((p, i) => ({
    id: p.id,
    label: p.statement,
    r: painPointRadius(counts[i]),
    ...colorOf(p),
    details: [
      [p.who, p.context].filter(Boolean).join(' · ') || PAIN_POINT_SOURCE_LABELS[p.source],
      `${counts[i]} 個想法`,
    ],
    prominent: counts[i] > 0 && counts[i] >= threshold,
  }))
}

/** Whether a library has items newer than its last AI analysis. */
export function isStale(items: { created_at: string }[], links: { created_at: string }[]) {
  if (links.length === 0) return false
  const newest = items.reduce((t, i) => (i.created_at > t ? i.created_at : t), '')
  const analyzed = links.reduce((t, l) => (l.created_at > t ? l.created_at : t), '')
  return newest > analyzed
}
