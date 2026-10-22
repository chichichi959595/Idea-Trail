import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react'
import { flushSync } from 'react-dom'

/**
 * Theme state: light or dark, nothing else.
 *
 * Until the user picks one, the first paint follows whatever the OS is set to
 * *at load time*. After that the choice is theirs and is remembered; the app
 * never flips on its own because the OS did — a theme that changes under you
 * mid-session is what made the old `system` mode feel unpredictable.
 *
 * This replaced `next-themes`, which exists to stop a server-rendered page
 * flashing the wrong theme before hydration. This app is a Vite SPA, so the
 * flash is prevented instead by the inline script in index.html, which runs
 * before first paint. Keep `STORAGE_KEY` and `initialTheme` in step with it.
 */

export type Theme = 'light' | 'dark'

/** Viewport point the new theme grows out from — the toggle's centre. */
export interface ThemeOrigin {
  x: number
  y: number
}

const STORAGE_KEY = 'ideation-theme'

const REVEAL_MS = 520

interface ThemeContextValue {
  theme: Theme
  setTheme: (theme: Theme, origin?: ThemeOrigin) => void
}

const ThemeContext = createContext<ThemeContextValue | null>(null)

function initialTheme(): Theme {
  try {
    const stored = localStorage.getItem(STORAGE_KEY)
    if (stored === 'light' || stored === 'dark') return stored
  } catch {
    // Private mode, or site data blocked — fall through to the OS.
  }
  // Nothing chosen yet (or a leftover `system` from the old three-way
  // control): start from what the OS is showing right now.
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
}

/**
 * Flip the class on <html>. Idempotent, so both the reveal path and the
 * effect below can call it.
 */
function applyTheme(theme: Theme) {
  const root = document.documentElement
  root.classList.toggle('dark', theme === 'dark')
  // Tells the browser which palette to use for form controls and
  // scrollbars it draws itself.
  root.style.colorScheme = theme
}

/**
 * Run `swap` with every CSS transition suspended. Without this, the handful of
 * elements that carry `transition-colors` fade over 150ms while everything
 * else snaps — the page changes colour in two waves, and during a reveal the
 * new snapshot would show those elements mid-fade.
 */
function withoutTransitions(swap: () => void, until: Promise<unknown> = Promise.resolve()) {
  const root = document.documentElement
  root.classList.add('theme-switching')
  swap()
  // Force a style flush so the new colours land while transitions are off.
  void window.getComputedStyle(root).opacity
  void until.finally(() => requestAnimationFrame(() => root.classList.remove('theme-switching')))
}

function canReveal(): boolean {
  return (
    typeof document.startViewTransition === 'function' &&
    !window.matchMedia('(prefers-reduced-motion: reduce)').matches
  )
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<Theme>(initialTheme)

  // Keeps <html> in step on mount and on any change that didn't go through
  // the reveal (which applies the class itself, inside the transition).
  useEffect(() => {
    applyTheme(theme)
  }, [theme])

  const setTheme = useCallback((next: Theme, origin?: ThemeOrigin) => {
    try {
      localStorage.setItem(STORAGE_KEY, next)
    } catch {
      // Not being able to remember the choice is not a reason to ignore it.
    }

    if (!origin || !canReveal()) {
      withoutTransitions(() => {
        flushSync(() => setThemeState(next))
        applyTheme(next)
      })
      return
    }

    // The browser snapshots the old page, we swap the theme, then the new
    // page is drawn on top and unclipped as a circle growing from the toggle
    // until it covers the farthest corner of the viewport.
    let done: () => void = () => {}
    const finished = new Promise<void>((resolve) => (done = resolve))
    const transition = document.startViewTransition(() => {
      withoutTransitions(() => {
        flushSync(() => setThemeState(next))
        applyTheme(next)
      }, finished)
    })
    void transition.finished.finally(done)

    void transition.ready.then(() => {
      const { x, y } = origin
      const radius = Math.hypot(
        Math.max(x, window.innerWidth - x),
        Math.max(y, window.innerHeight - y),
      )
      document.documentElement.animate(
        {
          clipPath: [`circle(0px at ${x}px ${y}px)`, `circle(${radius}px at ${x}px ${y}px)`],
        },
        {
          duration: REVEAL_MS,
          easing: 'cubic-bezier(0.65, 0, 0.35, 1)',
          pseudoElement: '::view-transition-new(root)',
        },
      )
    })
  }, [])

  return <ThemeContext.Provider value={{ theme, setTheme }}>{children}</ThemeContext.Provider>
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext)
  if (!ctx) throw new Error('useTheme must be used inside <ThemeProvider>')
  return ctx
}
