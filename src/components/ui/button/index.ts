import type { VariantProps } from "class-variance-authority"
import { cva } from "class-variance-authority"

export { default as Button } from "./Button.vue"

export const buttonVariants = cva(
  "inline-flex items-center justify-center whitespace-nowrap rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg:not([class*=size-])]:size-4 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        default: "bg-primary text-primary-foreground hover:bg-primary/90",
        destructive:
          "bg-destructive text-destructive-foreground hover:bg-destructive/90",
        outline:
          "border border-input bg-background hover:bg-accent hover:text-accent-foreground",
        secondary:
          "bg-secondary text-secondary-foreground hover:bg-secondary/80",
        ghost: "hover:bg-accent hover:text-accent-foreground",
        link: "text-primary underline-offset-4 hover:underline",
      },
      size: {
        "default": "h-8 gap-1.5 px-3",
        "xs": "h-6 gap-1 rounded px-2 text-xs [&_svg:not([class*=size-])]:size-3.5",
        "sm": "h-7 gap-1 rounded-md px-3 text-xs [&_svg:not([class*=size-])]:size-3.5",
        "lg": "h-9 gap-1.5 rounded-md px-8",
        "icon": "size-8",
        "icon-xs": "size-6 [&_svg:not([class*=size-])]:size-3.5",
        "icon-sm": "size-7 [&_svg:not([class*=size-])]:size-3.5",
        "icon-lg": "size-9",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  },
)

export type ButtonVariants = VariantProps<typeof buttonVariants>
