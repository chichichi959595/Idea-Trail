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
// screen's QR code. A phone never sees the workbench, so this is a URL check
// rather than a router.
//
// The QR code carries `/?join=CODE`, not `/join/CODE`. Through ngrok's free
// tier the page is first served ngrok's warning, whose "Visit Site" sets a
// cookie with no Path — and WebKit (every iOS browser) scopes that to the
// page's directory. On `/join/CODE` that's `/join`, so the scripts under
// `/src` and `/@vite` go out without it, get the warning page back instead
// of JavaScript, and the iPad sits on a blank screen. From `/` the cookie
// covers the whole site. `/join/CODE` still works when typed by hand.
const joinParam = new URLSearchParams(window.location.search).get('join')
const joinPath = window.location.pathname.match(/^\/join(?:\/([A-Za-z0-9]+))?\/?$/)
const join =
  joinParam !== null
    ? { code: /^[A-Za-z0-9]+$/.test(joinParam) ? joinParam : undefined }
    : joinPath
      ? { code: joinPath[1] }
      : null

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      {/* Owns the `.dark` class on <html>, which is what the token layer keys
          off (see the `@custom-variant dark` in index.css). */}
      <ThemeProvider>
        {/* One provider at the root: prompt-kit's PromptInputAction and the
            shadcn Tooltip both expect to find one already mounted. */}
        <TooltipProvider delayDuration={300}>
          {join ? <JoinApp code={join.code?.toUpperCase()} /> : <App />}
          <Toaster position="bottom-right" />
        </TooltipProvider>
      </ThemeProvider>
    </QueryClientProvider>
  </StrictMode>,
)
