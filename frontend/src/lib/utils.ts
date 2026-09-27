import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

/** Merge Tailwind class lists so a caller's className always wins over a
 * component's own defaults. Every component in the design system takes a
 * `className` and funnels it through here. */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}
