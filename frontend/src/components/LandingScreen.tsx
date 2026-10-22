import { ArrowRightIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Page } from '@/components/design/section'
import { Display, Small } from '@/components/design/typography'
import { ThemeControl } from '@/components/design/theme'
import { BrandMark, PRODUCT_NAME } from '@/components/design/brand'

/**
 * The entry screen: the product's name, what it believes, and one way in.
 *
 * It used to carry the whole intake form as well, which made the first thing
 * anyone saw a questionnaire. Those questions now live on the setup screen
 * beside the other setup — the provider, the model, the method — where they can
 * also be corrected later. What is left here is the one screen in the app where
 * nothing has happened yet, so it is the only one that gets a display heading
 * and a glow.
 */
export function LandingScreen({ onStart }: { onStart: () => void }) {
  return (
    <div className="bg-glow">
      <Page className="max-w-3xl justify-center">
        <header className="flex flex-col gap-6 px-5">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <Display className="flex items-center gap-4">
              <BrandMark className="size-11 gap-[4px] rounded-[14px] p-[8px] sm:size-14 sm:gap-[5px] sm:rounded-[18px] sm:p-[10px]" />
              {PRODUCT_NAME}
            </Display>
            <ThemeControl className="shrink-0" />
          </div>

          {/* The one line that says what the product believes. It earns the
              brand rule and the larger size because it is the argument for
              using a guided method at all rather than asking a model for ten
              titles. */}
          <p className="border-l-2 border-primary/40 pl-4 text-lg leading-relaxed font-medium text-pretty text-foreground/90 sm:text-xl">
            好題目不是憑靈感想出來的，是被一步一步問出來的。
          </p>

          <Small className="text-base">
            系統會依你們團隊的狀況挑選發想方法，一步步引導，再把過程彙整成具體的候選提案。
          </Small>

          <div className="flex pt-2">
            <Button size="xl" className="w-fit" onClick={onStart}>
              開始
              <ArrowRightIcon />
            </Button>
          </div>
        </header>
      </Page>
    </div>
  )
}
