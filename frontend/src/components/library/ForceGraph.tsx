import { useEffect, useMemo, useRef, useState } from 'react'
import {
  forceCollide,
  forceLink,
  forceManyBody,
  forceSimulation,
  forceX,
  forceY,
  type Simulation,
  type SimulationLinkDatum,
  type SimulationNodeDatum,
} from 'd3-force'
import { LocateFixedIcon, MinusIcon, PlusIcon } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import type { EdgeStyle, GraphEdge, GraphNode } from '@/lib/libraryGraph'

type Node = SimulationNodeDatum & { id: number; node: GraphNode }
type Link = SimulationLinkDatum<Node> & { edge: GraphEdge }

interface View {
  x: number
  y: number
  k: number
}

const MIN_ZOOM = 0.25
const MAX_ZOOM = 3
const clampZoom = (k: number) => Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, k))

/** Labels are drawn in screen space, at one size whatever the zoom. */
const LABEL_PX = 12
const LABEL_MAX_CHARS = 16
/** Zoomed in this far, every dot is a label candidate, not just the prominent. */
const LABEL_ALL_ZOOM = 1.5

/**
 * A library as a force-directed graph, Obsidian-style: linked items pull
 * together, everything else pushes apart.
 *
 * Drawn as plain SVG from d3-force's positions; d3 only does the physics.
 * Scroll zooms around the pointer, dragging the background pans, dragging a
 * dot pins it while held.
 *
 * Labels are the hard part. They stay one size on screen while the dots move
 * closer as you zoom out, so any fixed rule for which ones to show ends in a
 * pile of overlapping text. Instead they're placed in screen space, most
 * important first, and a label that would overlap one already placed is
 * simply not drawn. The hovered dot gets none at all — the hover card
 * already says what it is.
 */
export function ForceGraph({
  nodes,
  edges,
  edgeStyles,
  selectedId,
  onSelect,
  ariaLabel,
  className,
}: {
  nodes: GraphNode[]
  edges: GraphEdge[]
  edgeStyles: Record<string, EdgeStyle>
  selectedId: number | null
  onSelect: (id: number) => void
  ariaLabel: string
  className?: string
}) {
  const container = useRef<HTMLDivElement>(null)
  const svg = useRef<SVGSVGElement>(null)
  const [size, setSize] = useState({ w: 800, h: 560 })
  const [view, setView] = useState<View>({ x: 0, y: 0, k: 1 })
  const [, setFrame] = useState(0)
  const [hovered, setHovered] = useState<number | null>(null)
  const [hoveredEdge, setHoveredEdge] = useState<Link | null>(null)

  // Positions outlive a re-layout: adding one item, or switching link mode,
  // should nudge the picture, not throw it away and start from a heap.
  const positions = useRef(new Map<number, { x: number; y: number }>())
  const simNodes = useRef<Node[]>([])
  const simLinks = useRef<Link[]>([])
  const sim = useRef<Simulation<Node, Link> | null>(null)
  // Once the user has zoomed or panned, the picture is theirs: the automatic
  // fit stops moving it.
  const userMoved = useRef(false)
  const sizeRef = useRef(size)

  useEffect(() => {
    sizeRef.current = size
  }, [size])

  useEffect(() => {
    const el = container.current
    if (!el) return
    const observer = new ResizeObserver(([entry]) => {
      setSize({ w: entry.contentRect.width, h: entry.contentRect.height })
    })
    observer.observe(el)
    return () => observer.disconnect()
  }, [])

  /** Zoom and centre so every dot is in frame. */
  function fit(list: Node[] = simNodes.current) {
    if (list.length === 0) return
    const { w, h } = sizeRef.current
    let minX = Infinity
    let minY = Infinity
    let maxX = -Infinity
    let maxY = -Infinity
    for (const n of list) {
      const x = n.x ?? 0
      const y = n.y ?? 0
      minX = Math.min(minX, x - n.node.r)
      maxX = Math.max(maxX, x + n.node.r)
      minY = Math.min(minY, y - n.node.r)
      maxY = Math.max(maxY, y + n.node.r)
    }
    const pad = 56
    const k = clampZoom(
      Math.min((w - pad * 2) / (maxX - minX || 1), (h - pad * 2) / (maxY - minY || 1), 1.4),
    )
    setView({ k, x: -((minX + maxX) / 2) * k, y: -((minY + maxY) / 2) * k })
  }

  useEffect(() => {
    const known = positions.current
    const nextNodes: Node[] = nodes.map((node, i) => {
      const prev = known.get(node.id)
      // New dots start on a small spiral rather than all at the origin, which
      // would make the first frames an explosion.
      const angle = i * 2.4
      const radius = 12 * Math.sqrt(i + 1)
      return {
        id: node.id,
        node,
        x: prev?.x ?? Math.cos(angle) * radius,
        y: prev?.y ?? Math.sin(angle) * radius,
      }
    })
    const byId = new Map(nextNodes.map((n) => [n.id, n]))
    const nextLinks: Link[] = edges
      .filter((e) => byId.has(e.source) && byId.has(e.target))
      .map((edge) => ({ source: edge.source, target: edge.target, edge }))

    simNodes.current = nextNodes
    simLinks.current = nextLinks

    const style = (l: Link) => edgeStyles[l.edge.kind]
    const simulation = forceSimulation<Node, Link>(nextNodes)
      .force(
        'link',
        forceLink<Node, Link>(nextLinks)
          .id((n) => n.id)
          .distance((l) => {
            const s = l.source as Node
            const t = l.target as Node
            return (style(l)?.distance ?? 60) + s.node.r + t.node.r
          })
          .strength((l) => style(l)?.strength ?? 0.5),
      )
      .force('charge', forceManyBody<Node>().strength(-150))
      // A gentle pull to the middle keeps unlinked dots from drifting off.
      .force('x', forceX<Node>(0).strength(0.06))
      .force('y', forceY<Node>(0).strength(0.06))
      .force('collide', forceCollide<Node>((n) => n.node.r + 6))

    let raf = 0
    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    if (reduceMotion) {
      simulation.stop()
      simulation.tick(300)
      if (!userMoved.current) fit(nextNodes)
      setFrame((f) => f + 1)
    } else {
      // Fit while the layout is still spreading out, then once more when it
      // comes to rest — unless the user has taken over the view by then.
      simulation.on('tick', () => {
        cancelAnimationFrame(raf)
        raf = requestAnimationFrame(() => {
          if (!userMoved.current && simulation.alpha() > 0.05) fit(nextNodes)
          setFrame((f) => f + 1)
        })
      })
      simulation.on('end', () => {
        if (!userMoved.current) fit(nextNodes)
      })
      if (known.size > 0) simulation.alpha(0.4)
    }
    sim.current = simulation
    return () => {
      for (const n of nextNodes) known.set(n.id, { x: n.x ?? 0, y: n.y ?? 0 })
      cancelAnimationFrame(raf)
      simulation.stop()
    }
    // `fit` only reads refs; including it would restart the physics on every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nodes, edges, edgeStyles])

  // Zoom has to cancel the page's own scroll, which React's passive wheel
  // listener can't do — so it is attached by hand.
  useEffect(() => {
    const el = svg.current
    if (!el) return
    const onWheel = (e: WheelEvent) => {
      e.preventDefault()
      userMoved.current = true
      const rect = el.getBoundingClientRect()
      const px = e.clientX - rect.left - rect.width / 2
      const py = e.clientY - rect.top - rect.height / 2
      setView((v) => {
        const k = clampZoom(v.k * Math.exp(-e.deltaY * 0.0015))
        // Keep the point under the cursor where it is.
        return { k, x: px - ((px - v.x) * k) / v.k, y: py - ((py - v.y) * k) / v.k }
      })
    }
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => el.removeEventListener('wheel', onWheel)
  }, [])

  const neighbours = useMemo(() => {
    const map = new Map<number, Set<number>>()
    for (const e of edges) {
      if (!map.has(e.source)) map.set(e.source, new Set())
      if (!map.has(e.target)) map.set(e.target, new Set())
      map.get(e.source)!.add(e.target)
      map.get(e.target)!.add(e.source)
    }
    return map
  }, [edges])

  const focus = hovered ?? selectedId
  const lit = focus !== null ? new Set([focus, ...(neighbours.get(focus) ?? [])]) : null

  // Graph → screen, relative to the SVG's top-left.
  const toScreen = (x: number, y: number) => ({
    x: size.w / 2 + view.x + x * view.k,
    y: size.h / 2 + view.y + y * view.k,
  })

  // ---- pointer: pan the background, drag a dot ----
  const drag = useRef<
    | { kind: 'pan'; startX: number; startY: number; view: View; moved: boolean }
    | { kind: 'node'; node: Node; startX: number; startY: number; moved: boolean }
    | null
  >(null)

  function toGraph(clientX: number, clientY: number) {
    const rect = svg.current!.getBoundingClientRect()
    return {
      x: (clientX - rect.left - rect.width / 2 - view.x) / view.k,
      y: (clientY - rect.top - rect.height / 2 - view.y) / view.k,
    }
  }

  function onPointerDown(e: React.PointerEvent, node?: Node) {
    if (e.button !== 0) return
    ;(e.currentTarget as Element).setPointerCapture?.(e.pointerId)
    drag.current = node
      ? { kind: 'node', node, startX: e.clientX, startY: e.clientY, moved: false }
      : { kind: 'pan', startX: e.clientX, startY: e.clientY, view, moved: false }
  }

  function onPointerMove(e: React.PointerEvent) {
    const d = drag.current
    if (!d) return
    const dx = e.clientX - d.startX
    const dy = e.clientY - d.startY
    if (!d.moved && Math.hypot(dx, dy) < 3) return
    d.moved = true
    if (d.kind === 'pan') {
      userMoved.current = true
      setView({ ...d.view, x: d.view.x + dx, y: d.view.y + dy })
    } else {
      const p = toGraph(e.clientX, e.clientY)
      d.node.fx = p.x
      d.node.fy = p.y
      sim.current?.alphaTarget(0.25).restart()
    }
  }

  function onPointerUp() {
    const d = drag.current
    drag.current = null
    if (!d || d.kind !== 'node') return
    d.node.fx = null
    d.node.fy = null
    sim.current?.alphaTarget(0)
    // A press that didn't travel is a click.
    if (!d.moved) onSelect(d.node.id)
  }

  const zoomBy = (factor: number) => {
    userMoved.current = true
    setView((v) => ({ ...v, k: clampZoom(v.k * factor) }))
  }

  // Positions live in the simulation's own objects, which it mutates in place;
  // the frame counter above is what re-renders this as they move.
  // eslint-disable-next-line react-hooks/refs
  const drawnNodes = simNodes.current
  // eslint-disable-next-line react-hooks/refs
  const drawnLinks = simLinks.current

  const labels = placeLabels(drawnNodes, {
    focus,
    hovered,
    lit,
    zoomedIn: view.k >= LABEL_ALL_ZOOM,
    toScreen,
    width: size.w,
    height: size.h,
    k: view.k,
  })

  const hoveredNode = hovered !== null ? drawnNodes.find((n) => n.id === hovered) : undefined
  const transform = `translate(${size.w / 2 + view.x} ${size.h / 2 + view.y}) scale(${view.k})`

  return (
    <div
      ref={container}
      className={cn('relative overflow-hidden rounded-2xl border border-border bg-surface', className)}
    >
      <svg
        ref={svg}
        width={size.w}
        height={size.h}
        className="block cursor-grab touch-none select-none active:cursor-grabbing"
        onPointerDown={(e) => onPointerDown(e)}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        role="img"
        aria-label={ariaLabel}
      >
        <g transform={transform}>
          {drawnLinks.map((l) => {
            const s = l.source as Node
            const t = l.target as Node
            const st = edgeStyles[l.edge.kind]
            const on = lit ? (s.id === focus || t.id === focus) : false
            return (
              <g key={`${s.id}-${t.id}`}>
                <line
                  x1={s.x}
                  y1={s.y}
                  x2={t.x}
                  y2={t.y}
                  className={st?.ai ? 'stroke-ai' : 'stroke-muted-foreground'}
                  // Hairlines stay hairlines at any zoom.
                  strokeWidth={(st?.width ?? 1) / view.k}
                  strokeDasharray={
                    st?.dash
                      ?.split(' ')
                      .map((v) => Number(v) / view.k)
                      .join(' ') ?? undefined
                  }
                  strokeLinecap="round"
                  opacity={lit ? (on ? 0.9 : 0.08) : st?.ai ? 0.55 : 0.35}
                />
                {/* A wider invisible stroke, so the edge is hoverable at all. */}
                <line
                  x1={s.x}
                  y1={s.y}
                  x2={t.x}
                  y2={t.y}
                  stroke="transparent"
                  strokeWidth={10 / view.k}
                  onPointerEnter={() => setHoveredEdge(l)}
                  onPointerLeave={() => setHoveredEdge(null)}
                />
              </g>
            )
          })}

          {drawnNodes.map((n) => {
            const { fill, hollow, r } = n.node
            const dim = lit && !lit.has(n.id)
            return (
              <g
                key={n.id}
                transform={`translate(${n.x ?? 0} ${n.y ?? 0})`}
                opacity={dim ? 0.2 : 1}
                className="cursor-pointer transition-opacity duration-150 focus-visible:outline-none"
                tabIndex={0}
                role="button"
                aria-label={n.node.label}
                onPointerDown={(e) => {
                  e.stopPropagation()
                  onPointerDown(e, n)
                }}
                onPointerEnter={() => setHovered(n.id)}
                onPointerLeave={() => setHovered((h) => (h === n.id ? null : h))}
                onFocus={() => setHovered(n.id)}
                onBlur={() => setHovered((h) => (h === n.id ? null : h))}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault()
                    onSelect(n.id)
                  }
                }}
              >
                {/* Hit target bigger than the dot, in screen terms. */}
                <circle r={r + 7 / view.k} fill="transparent" />
                {n.id === selectedId && (
                  <circle
                    r={r + 4.5 / view.k}
                    fill="none"
                    className="stroke-primary"
                    strokeWidth={2 / view.k}
                  />
                )}
                <circle
                  r={r}
                  style={{
                    fill: hollow ? 'var(--surface)' : fill,
                    stroke: hollow ? fill : 'var(--surface)',
                  }}
                  strokeWidth={2 / Math.max(view.k, 1)}
                />
              </g>
            )
          })}
        </g>

        {/* Labels last and outside the zoom transform: one size on screen,
            and nothing paints over a title. */}
        <g className="pointer-events-none" fontSize={LABEL_PX}>
          {labels.map((l) => (
            <text
              key={l.id}
              x={l.x}
              y={l.y}
              textAnchor="middle"
              dominantBaseline="hanging"
              className={cn(
                '[paint-order:stroke] stroke-surface',
                l.strong ? 'fill-foreground font-medium' : 'fill-muted-foreground',
              )}
              strokeWidth={3}
              strokeLinejoin="round"
            >
              {l.text}
            </text>
          ))}
        </g>
      </svg>

      {hoveredNode && (
        <HoverCard
          at={toScreen(hoveredNode.x ?? 0, hoveredNode.y ?? 0)}
          gap={hoveredNode.node.r * view.k + 10}
          bounds={size}
        >
          <p className="text-sm leading-snug font-medium text-pretty">{hoveredNode.node.label}</p>
          {hoveredNode.node.details.map((line, i) => (
            <p key={i} className="mt-1 text-xs leading-snug text-muted-foreground">
              {line}
            </p>
          ))}
          <p className="mt-1 text-xs text-muted-foreground">
            {neighbours.get(hoveredNode.id)?.size ?? 0} 條關聯
          </p>
        </HoverCard>
      )}

      {hoveredEdge && !hoveredNode && (
        <HoverCard
          at={toScreen(
            (((hoveredEdge.source as Node).x ?? 0) + ((hoveredEdge.target as Node).x ?? 0)) / 2,
            (((hoveredEdge.source as Node).y ?? 0) + ((hoveredEdge.target as Node).y ?? 0)) / 2,
          )}
          gap={8}
          bounds={size}
        >
          <p className="text-xs">
            <span className="text-muted-foreground">
              {edgeStyles[hoveredEdge.edge.kind]?.label}
            </span>
            {hoveredEdge.edge.reason &&
              hoveredEdge.edge.reason !== edgeStyles[hoveredEdge.edge.kind]?.label && (
                <> · {hoveredEdge.edge.reason}</>
              )}
          </p>
        </HoverCard>
      )}

      <div className="absolute right-3 bottom-3 flex flex-col gap-1 rounded-lg border border-border bg-surface/90 p-1 shadow-xs backdrop-blur-sm">
        <Button size="icon-xs" variant="ghost" aria-label="放大" onClick={() => zoomBy(1.25)}>
          <PlusIcon />
        </Button>
        <Button size="icon-xs" variant="ghost" aria-label="縮小" onClick={() => zoomBy(0.8)}>
          <MinusIcon />
        </Button>
        <Button
          size="icon-xs"
          variant="ghost"
          aria-label="全部放進畫面"
          onClick={() => {
            userMoved.current = false
            fit()
          }}
        >
          <LocateFixedIcon />
        </Button>
      </div>
    </div>
  )
}

/**
 * A card next to a point on the graph, kept inside the frame: under the
 * point when there is room, above it otherwise, and never past either edge.
 * Its width is fixed so the text wraps the same way at every zoom.
 */
function HoverCard({
  at,
  gap,
  bounds,
  children,
}: {
  at: { x: number; y: number }
  gap: number
  bounds: { w: number; h: number }
  children: React.ReactNode
}) {
  const WIDTH = 256
  const EDGE = 8
  const left = Math.min(Math.max(at.x - WIDTH / 2, EDGE), Math.max(bounds.w - WIDTH - EDGE, EDGE))
  const below = at.y + gap + 120 < bounds.h
  return (
    <div
      className="pointer-events-none absolute z-10 rounded-lg border border-border bg-popover px-3 py-2 text-popover-foreground shadow-md"
      style={{
        width: WIDTH,
        left,
        ...(below ? { top: at.y + gap } : { bottom: bounds.h - at.y + gap }),
      }}
    >
      {children}
    </div>
  )
}

interface PlacedLabel {
  id: number
  x: number
  y: number
  text: string
  strong: boolean
}

/**
 * Which labels to draw, in screen space.
 *
 * Candidates in priority order — the selected dot, the focused dot's
 * neighbours, then the prominent dots (or every dot, zoomed in) — each
 * accepted only if its box doesn't overlap one already accepted or run off the
 * frame. The hovered dot is skipped: its card carries its name.
 */
function placeLabels(
  nodes: Node[],
  opts: {
    focus: number | null
    hovered: number | null
    lit: Set<number> | null
    zoomedIn: boolean
    toScreen: (x: number, y: number) => { x: number; y: number }
    width: number
    height: number
    k: number
  },
): PlacedLabel[] {
  const rank = (n: Node) => {
    if (n.id === opts.focus) return 0
    if (opts.lit) return opts.lit.has(n.id) ? 1 : -1
    if (n.node.prominent) return 2
    return opts.zoomedIn ? 3 : -1
  }
  const candidates = nodes
    .filter((n) => n.id !== opts.hovered && rank(n) >= 0)
    .sort((a, b) => rank(a) - rank(b) || b.node.r - a.node.r)

  const boxes: { l: number; r: number; t: number; b: number }[] = []
  const placed: PlacedLabel[] = []
  for (const n of candidates) {
    const text = truncate(n.node.label, LABEL_MAX_CHARS)
    const p = opts.toScreen(n.x ?? 0, n.y ?? 0)
    const w = textWidth(text)
    const top = p.y + n.node.r * opts.k + 4
    const box = { l: p.x - w / 2 - 3, r: p.x + w / 2 + 3, t: top - 1, b: top + LABEL_PX + 3 }
    if (box.l < 0 || box.r > opts.width || box.t < 0 || box.b > opts.height) continue
    if (boxes.some((o) => box.l < o.r && box.r > o.l && box.t < o.b && box.b > o.t)) continue
    boxes.push(box)
    placed.push({ id: n.id, x: p.x, y: top, text, strong: n.id === opts.focus })
  }
  return placed
}

/** Close enough without measuring: CJK glyphs are a full em, Latin about half. */
function textWidth(text: string) {
  let em = 0
  for (const ch of text) em += (ch.codePointAt(0) ?? 0) <= 0x24f ? 0.56 : 1
  return em * LABEL_PX
}

function truncate(text: string, max: number) {
  return text.length > max ? `${text.slice(0, max)}…` : text
}
