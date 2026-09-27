import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react'

/**
 * Theme state, in about forty lines.
 *
 * This replaced `next-themes`, which exists to stop a server-rendered page
 * flashing the wrong theme before hydration. This app is a Vite SPA — there is
 * no server-rendered HTML — so its no-flash `<script>` does nothing here except
 * log "Encountered a script tag while rendering React component" to the console
 * on every load. The flash is prevented instead by the inline script in
 * index.html, which runs before first paint.
 */

export type Theme = 'light' | 'dark' | 'system'

const STORAGE_KEY = 'ideation-theme'

interface ThemeContextValue {
  /** What the user chose, `system` included. */
  theme: Theme
  /** What is actually on screen right now. */
  resolvedTheme: 'light' | 'dark'
  setTheme: (theme: Theme) => void
}

const ThemeContext = createContext<ThemeContextValue | null>(null)

function systemTheme(): 'light' | 'dark' {
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
}

function readStored(): Theme {
  try {
    const stored = localStorage.getItem(STORAGE_KEY)
    if (stored === 'light' || stored === 'dark' || stored === 'system') return stored
  } catch {
    // Private mode, or site data blocked — fall through to the default.
  }
  return 'system'
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<Theme>(readStored)
  const [resolvedTheme, setResolvedTheme] = useState<'light' | 'dark'>(() =>
    readStored() === 'system' ? systemTheme() : (readStored() as 'light' | 'dark'),
  )

  // One effect owns the class on <html>, and re-runs when the OS flips while
  // the user is on `system` — which is the case the inline script can't cover,
  // since it only runs once.
  useEffect(() => {
    const media = window.matchMedia('(prefers-color-scheme: dark)')

    const apply = () => {
      const next = theme === 'system' ? (media.matches ? 'dark' : 'light') : theme
      setResolvedTheme(next)
      document.documentElement.classList.toggle('dark', next === 'dark')
      // Tells the browser which palette to use for form controls and
      // scrollbars it draws itself.
      document.documentElement.style.colorScheme = next
    }

    apply()
    if (theme !== 'system') return
    media.addEventListener('change', apply)
    return () => media.removeEventListener('change', apply)
  }, [theme])

  const setTheme = useCallback((next: Theme) => {
    setThemeState(next)
    try {
      localStorage.setItem(STORAGE_KEY, next)
    } catch {
      // Not being able to remember the choice is not a reason to ignore it.
    }
  }, [])

  return (
    <ThemeContext.Provider value={{ theme, resolvedTheme, setTheme }}>
      {children}
    </ThemeContext.Provider>
  )
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext)
  if (!ctx) throw new Error('useTheme must be used inside <ThemeProvider>')
  return ctx
}
