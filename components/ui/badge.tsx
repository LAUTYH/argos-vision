import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const badgeVariants = cva("inline-flex h-[20px] items-center gap-1 rounded-[4px] border px-1.5 text-[10px] font-semibold uppercase tracking-[0.08em] leading-none", {
  variants: {
    tone: {
      neutral: "border-border-strong bg-surface-2 text-muted",
      accent: "border-accent/50 bg-accent/10 text-accent",
      amber: "border-amber/50 bg-amber/10 text-amber",
      red: "border-red/50 bg-red/10 text-red",
      cyan: "border-cyan/40 bg-cyan/10 text-cyan",
    },
  },
  defaultVariants: { tone: "neutral" },
});

export interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement>, VariantProps<typeof badgeVariants> {}

export function Badge({ className, tone, ...props }: BadgeProps) {
  return <span className={cn(badgeVariants({ tone }), className)} {...props} />;
}
