import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { cn } from "@/lib/utils"
import { Slot } from "radix-ui"

/**
 * shadcn/ui Button, retuned for this design system:
 *  - `rounded-lg` so buttons share the radius scale with cards and inputs
 *  - solid variants carry `shadow-xs` and a 1% press-down, so a click is felt
 *  - `brand`/`ai`/`success`/`warning` tones added, because status needed to
 *    stop borrowing the primary colour
 */
const buttonVariants = cva(
  "inline-flex shrink-0 items-center justify-center gap-2 rounded-lg text-sm font-medium whitespace-nowrap transition-[color,background-color,border-color,box-shadow,transform] duration-150 ease-[var(--ease-out-quint)] outline-none focus-visible:ring-[3px] focus-visible:ring-ring active:scale-[0.99] disabled:pointer-events-none disabled:opacity-45 disabled:active:scale-100 aria-invalid:border-destructive aria-invalid:ring-destructive/20 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
  {
    variants: {
      variant: {
        default:
          "bg-primary text-primary-foreground shadow-xs hover:bg-primary/90",
        ai: "bg-ai text-ai-foreground shadow-xs hover:bg-ai/90",
        destructive:
          "bg-destructive text-destructive-foreground shadow-xs hover:bg-destructive/90 focus-visible:ring-destructive/40",
        success:
          "bg-success text-success-foreground shadow-xs hover:bg-success/90",
        outline:
          "border border-input bg-surface shadow-xs hover:border-border-strong hover:bg-accent hover:text-accent-foreground",
        secondary:
          "bg-secondary text-secondary-foreground hover:bg-secondary/70",
        ghost: "hover:bg-accent hover:text-accent-foreground",
        // Quiet tinted button — reads as "on brand" without competing with the
        // one solid primary action a screen is allowed.
        soft: "bg-brand-muted text-primary hover:bg-brand-muted/70",
        link: "text-primary underline-offset-4 hover:underline",
      },
      size: {
        default: "h-9 px-4 py-2 has-[>svg]:px-3",
        xs: "h-6 gap-1 rounded-md px-2 text-xs has-[>svg]:px-1.5 [&_svg:not([class*='size-'])]:size-3",
        sm: "h-8 gap-1.5 rounded-md px-3 has-[>svg]:px-2.5",
        lg: "h-10 px-5 text-sm has-[>svg]:px-4",
        xl: "h-11 gap-2.5 rounded-xl px-6 text-sm has-[>svg]:px-5",
        icon: "size-9",
        "icon-xs": "size-6 rounded-md [&_svg:not([class*='size-'])]:size-3",
        "icon-sm": "size-8 rounded-md",
        "icon-lg": "size-10",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

function Button({
  className,
  variant = "default",
  size = "default",
  asChild = false,
  ...props
}: React.ComponentProps<"button"> &
  VariantProps<typeof buttonVariants> & {
    asChild?: boolean
  }) {
  const Comp = asChild ? Slot.Root : "button"

  return (
    <Comp
      data-slot="button"
      data-variant={variant}
      data-size={size}
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  )
}

export { Button, buttonVariants }
