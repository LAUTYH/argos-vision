import { cva, type VariantProps } from "class-variance-authority";
import * as React from "react";
import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-1.5 whitespace-nowrap rounded-md border text-[12px] font-medium transition-[background-color,border-color,color,transform] duration-150 ease-[var(--ease-spring)] disabled:pointer-events-none disabled:opacity-40 active:scale-[0.98] select-none",
  {
    variants: {
      variant: {
        default: "border-border-strong bg-surface-2 text-text hover:bg-surface-3 hover:border-white/15",
        ghost: "border-transparent bg-transparent text-muted hover:text-text hover:bg-white/[0.05]",
        primary: "border-accent/60 bg-accent/15 text-accent hover:bg-accent/22",
        outline: "border-border-strong bg-transparent text-text hover:bg-white/[0.05]",
        danger: "border-red/50 bg-red/10 text-red hover:bg-red/18",
      },
      size: {
        sm: "h-7 px-2.5",
        md: "h-8 px-3",
        icon: "h-8 w-8 p-0",
        iconSm: "h-7 w-7 p-0",
      },
      active: {
        true: "border-accent/60 bg-accent/12 text-accent",
        false: "",
      },
    },
    defaultVariants: { variant: "default", size: "md", active: false },
  },
);

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement>, VariantProps<typeof buttonVariants> {}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(function Button({ className, variant, size, active, type = "button", ...props }, ref) {
  return <button ref={ref} type={type} className={cn(buttonVariants({ variant, size, active }), className)} {...props} />;
});

export { buttonVariants };
