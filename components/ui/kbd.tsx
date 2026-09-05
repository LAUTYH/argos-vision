import { cn } from "@/lib/utils";

export function Kbd({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <kbd
      className={cn(
        "num inline-flex h-[18px] min-w-[18px] items-center justify-center rounded-[3px] border border-border-strong bg-surface-3 px-1 text-[10px] font-medium leading-none text-muted",
        className,
      )}
    >
      {children}
    </kbd>
  );
}
