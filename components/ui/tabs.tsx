"use client";

import { Tabs as TabsPrimitive } from "radix-ui";
import * as React from "react";
import { cn } from "@/lib/utils";

export const Tabs = TabsPrimitive.Root;

export const TabsList = React.forwardRef<React.ComponentRef<typeof TabsPrimitive.List>, React.ComponentPropsWithoutRef<typeof TabsPrimitive.List>>(
  function TabsList({ className, ...props }, ref) {
    return <TabsPrimitive.List ref={ref} className={cn("inline-flex h-8 items-center gap-0.5 rounded-md border border-border bg-surface-2 p-0.5", className)} {...props} />;
  },
);

export const TabsTrigger = React.forwardRef<React.ComponentRef<typeof TabsPrimitive.Trigger>, React.ComponentPropsWithoutRef<typeof TabsPrimitive.Trigger>>(
  function TabsTrigger({ className, ...props }, ref) {
    return (
      <TabsPrimitive.Trigger
        ref={ref}
        className={cn(
          "inline-flex h-7 items-center rounded-[4px] px-2.5 text-[12px] font-medium text-muted transition-colors duration-150 hover:text-text data-[state=active]:bg-surface-3 data-[state=active]:text-text",
          className,
        )}
        {...props}
      />
    );
  },
);

export const TabsContent = TabsPrimitive.Content;
