import { MoonIcon, SunIcon } from 'lucide-react'
import { useTheme } from './theme-provider'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

/**
 * Light / dark, as a single toggle button. The first visit starts from the
 * OS setting; one click flips between the two looks from then on, with the
 * new theme spreading out from the button as a circle.
 *
 * `ThemeProvider` owns the class on `<html>`; the token layer in index.css
 * does the rest.
 */
export function ThemeControl({ className }: { className?: string }) {
  const { theme, setTheme } = useTheme()
  const isDark = theme === 'dark'

  return (
    <Button
      type="button"
      variant="ghost"
      size="icon-sm"
      aria-label={isDark ? '切換為亮色' : '切換為暗色'}
      onClick={(e) => {
        // The new theme grows out of the button itself.
        const box = e.currentTarget.getBoundingClientRect()
        setTheme(isDark ? 'light' : 'dark', {
          x: box.left + box.width / 2,
          y: box.top + box.height / 2,
        })
      }}
      // Round, to match the circle the new theme spreads out as.
      className={cn('rounded-full', className)}
    >
      {isDark ? <MoonIcon className="size-3.5" /> : <SunIcon className="size-3.5" />}
    </Button>
  )
}
