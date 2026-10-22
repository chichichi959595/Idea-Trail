import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { ThemeProvider } from '@/components/design/theme-provider'
import { TooltipProvider } from '@/components/ui/tooltip'
import { Toaster } from '@/components/ui/sonner'
import './index.css'
import App from './App.tsx'
import { JoinApp } from './relay/JoinApp'

const queryClient = new QueryClient()

// The one other page: a participant's phone in 多人接龍, reached from the host
// screen's QR code. A phone never sees the workbench, so this is a path check
// rather than a router.
const join = window.location.pathname.match(/^\/join(?:\/([A-Za-z0-9]+))?\/?$/)

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      {/* Owns the `.dark` class on <html>, which is what the token layer keys
          off (see the `@custom-variant dark` in index.css). */}
      <ThemeProvider>
        {/* One provider at the root: prompt-kit's PromptInputAction and the
            shadcn Tooltip both expect to find one already mounted. */}
        <TooltipProvider delayDuration={300}>
          {join ? <JoinApp code={join[1]?.toUpperCase()} /> : <App />}
          <Toaster position="bottom-right" />
        </TooltipProvider>
      </ThemeProvider>
    </QueryClientProvider>
  </StrictMode>,
)
