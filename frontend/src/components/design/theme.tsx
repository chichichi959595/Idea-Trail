import { MonitorIcon, MoonIcon, SunIcon } from 'lucide-react'
import { useTheme } from './theme-provider'
import { SegmentedControl } from './selectable'

/**
 * Light / dark / follow-system, as a segmented control rather than a two-state
 * toggle — "follow the system" has to be reachable, or the app fights the OS
 * for anyone who switches at sunset.
 *
 * `ThemeProvider` owns the class on `<html>`; the token layer in index.css
 * does the rest.
 */
export function ThemeControl({ className }: { className?: string }) {
  const { theme, setTheme } = useTheme()

  return (
    <SegmentedControl
      aria-label="外觀"
      value={theme}
      onChange={setTheme}
      // No width opinion of its own: the rail stretches it across the column,
      // the entry screen keeps it at its intrinsic size beside the badge.
      className={className}
      options={[
        { value: 'light', label: <SunIcon className="size-3.5" aria-label="亮色" /> },
        { value: 'dark', label: <MoonIcon className="size-3.5" aria-label="暗色" /> },
        { value: 'system', label: <MonitorIcon className="size-3.5" aria-label="跟隨系統" /> },
      ]}
    />
  )
}
