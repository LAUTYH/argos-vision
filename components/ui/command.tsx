"use client";

import { Command as CommandPrimitive } from "cmdk";
import { Dialog as DialogPrimitive } from "radix-ui";
import * as React from "react";
import { cn } from "@/lib/utils";

export const Command = React.forwardRef<React.ComponentRef<typeof CommandPrimitive>, React.ComponentPropsWithoutRef<typeof CommandPrimitive>>(
  function Command({ className, ...props }, ref) {
    return <CommandPrimitive ref={ref} className={cn("flex h-full w-full flex-col overflow-hidden rounded-lg bg-surface text-text", className)} {...props} />;
  },
);

export function CommandDialog({ open, onOpenChange, children, label }: { open: boolean; onOpenChange: (o: boolean) => void; children: React.ReactNode; label: string }) {
  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-[70] bg-bg/70 backdrop-blur-[2px]" />
        <DialogPrimitive.Content className="fixed left-1/2 top-[18vh] z-[71] w-[min(92vw,600px)] -translate-x-1/2 overflow-hidden rounded-lg border border-border-strong bg-surface shadow-2xl focus:outline-none">
          <DialogPrimitive.Title className="sr-only">{label}</DialogPrimitive.Title>
          <Command label={label}>{children}</Command>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}

export const CommandInput = React.forwardRef<React.ComponentRef<typeof CommandPrimitive.Input>, React.ComponentPropsWithoutRef<typeof CommandPrimitive.Input>>(
  function CommandInput({ className, ...props }, ref) {
    return (
      <div className="flex items-center border-b border-border px-3">
        <CommandPrimitive.Input
          ref={ref}
          className={cn("h-11 w-full bg-transparent text-[13px] text-text outline-none placeholder:text-dim", className)}
          {...props}
        />
      </div>
    );
  },
);

export const CommandList = React.forwardRef<React.ComponentRef<typeof CommandPrimitive.List>, React.ComponentPropsWithoutRef<typeof CommandPrimitive.List>>(
  function CommandList({ className, ...props }, ref) {
    return <CommandPrimitive.List ref={ref} className={cn("scrollbar-thin max-h-[320px] overflow-y-auto p-1", className)} {...props} />;
  },
);

export const CommandEmpty = CommandPrimitive.Empty;

export const CommandGroup = React.forwardRef<React.ComponentRef<typeof CommandPrimitive.Group>, React.ComponentPropsWithoutRef<typeof CommandPrimitive.Group>>(
  function CommandGroup({ className, ...props }, ref) {
    return (
      <CommandPrimitive.Group
        ref={ref}
        className={cn("overflow-hidden p-1 [&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:py-1.5 [&_[cmdk-group-heading]]:text-[10px] [&_[cmdk-group-heading]]:uppercase [&_[cmdk-group-heading]]:tracking-wider [&_[cmdk-group-heading]]:text-dim", className)}
        {...props}
      />
    );
  },
);

export const CommandItem = React.forwardRef<React.ComponentRef<typeof CommandPrimitive.Item>, React.ComponentPropsWithoutRef<typeof CommandPrimitive.Item>>(
  function CommandItem({ className, ...props }, ref) {
    return (
      <CommandPrimitive.Item
        ref={ref}
        className={cn(
          "relative flex cursor-default select-none items-center gap-2 rounded-[4px] px-2 py-1.5 text-[12px] text-text outline-none data-[selected=true]:bg-white/[0.06] data-[disabled=true]:opacity-40",
          className,
        )}
        {...props}
      />
    );
  },
);
