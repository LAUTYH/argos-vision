"use client";

import { Switch as SwitchPrimitive } from "radix-ui";
import * as React from "react";
import { cn } from "@/lib/utils";

export const Switch = React.forwardRef<React.ComponentRef<typeof SwitchPrimitive.Root>, React.ComponentPropsWithoutRef<typeof SwitchPrimitive.Root>>(
  function Switch({ className, ...props }, ref) {
    return (
      <SwitchPrimitive.Root
        ref={ref}
        className={cn(
          "peer inline-flex h-[16px] w-[28px] shrink-0 cursor-pointer items-center rounded-full border border-border-strong bg-surface-3 transition-colors duration-150 data-[state=checked]:border-accent/60 data-[state=checked]:bg-accent/30 disabled:opacity-40",
          className,
        )}
        {...props}
      >
        <SwitchPrimitive.Thumb className="block h-[12px] w-[12px] translate-x-[1px] rounded-full bg-muted transition-transform duration-150 ease-[var(--ease-spring)] data-[state=checked]:translate-x-[13px] data-[state=checked]:bg-accent" />
      </SwitchPrimitive.Root>
    );
  },
);
