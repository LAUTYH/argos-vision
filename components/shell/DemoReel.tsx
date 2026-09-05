"use client";

import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef } from "react";
import { MODULES } from "@/lib/data/company";
import { REEL, REEL_DURATION, type ReelAction } from "@/lib/sim/timeline";
import { useEngine, useEngineFrame } from "@/lib/store/engine-hooks";
import { setUi, useUi } from "@/lib/store/ui";
import { fmtTime } from "@/lib/utils";

const TYPE_INTERVAL = 0.055;
const TYPE_HOLD = 0.5;

/**
 * Hands-free 90 s tour. Runs on simulation time so the beats line up with
 * the scripted world events, and a recording is identical run to run.
 */
export function DemoReel() {
  const ui = useUi();
  const engine = useEngine();
  const router = useRouter();
  const pathname = usePathname();
  useEngineFrame();
  const stepRef = useRef(-1);
  const doneRef = useRef(new Set<string>());
  const typingRef = useRef<{ action: ReelAction & { type: "prompt" }; module: string; start: number; key: string } | null>(null);

  // key D toggles, Escape stops
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target;
      if (el instanceof HTMLElement && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.isContentEditable)) return;
      if (e.metaKey || e.ctrlKey) return;
      if (e.key === "d" || e.key === "D") setUi({ reelActive: !ui.reelActive });
      if (e.key === "Escape" && ui.reelActive) setUi({ reelActive: false });
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [ui.reelActive]);

  // start / stop
  useEffect(() => {
    if (ui.reelActive) {
      stepRef.current = -1;
      doneRef.current = new Set();
      typingRef.current = null;
      engine.setSpeed(1);
      engine.seek(0);
      engine.play();
      for (const m of MODULES) engine.setRaw(m.id, false);
    } else {
      typingRef.current = null;
      setUi({ reelDraft: null, reelStep: 0 });
    }
  }, [ui.reelActive, engine]);

  // per-frame scheduler
  useEffect(() => {
    if (!ui.reelActive) return;
    const t = engine.t;
    if (t >= REEL_DURATION) {
      setUi({ reelActive: false });
      return;
    }
    let idx = 0;
    for (let i = 0; i < REEL.length; i++) if ((REEL[i]?.at ?? 0) <= t) idx = i;
    const step = REEL[idx];
    if (!step) return;
    if (idx !== stepRef.current) {
      stepRef.current = idx;
      setUi({ reelStep: idx });
      if (pathname !== step.route) router.push(step.route);
    }
    const mod = MODULES.find((m) => m.path === step.route);
    for (const action of step.actions ?? []) {
      const key = `${idx}:${action.at}:${action.type}`;
      if (doneRef.current.has(key) || t < action.at) continue;
      if (!mod) {
        doneRef.current.add(key);
        continue;
      }
      if (action.type === "raw") {
        engine.setRaw(mod.id, action.on);
        doneRef.current.add(key);
      } else if (action.type === "layer") {
        engine.setLayer(mod.id, action.layer, action.on);
        doneRef.current.add(key);
      } else if (action.type === "prompt") {
        if (!typingRef.current) typingRef.current = { action, module: mod.id, start: action.at, key };
      }
    }
    const typing = typingRef.current;
    if (typing && mod) {
      const chars = Math.floor((t - typing.start) / TYPE_INTERVAL);
      const text = typing.action.text;
      if (chars < text.length) {
        setUi({ reelDraft: { module: typing.module, text: text.slice(0, chars) } });
      } else if (t - typing.start < text.length * TYPE_INTERVAL + TYPE_HOLD) {
        setUi({ reelDraft: { module: typing.module, text } });
      } else {
        engine.addPrompt(mod.id, text);
        setUi({ reelDraft: null });
        doneRef.current.add(typing.key);
        typingRef.current = null;
      }
    }
  });

  if (!ui.reelActive) return null;
  const step = REEL[ui.reelStep];
  const next = REEL[ui.reelStep + 1];
  const progress = Math.min(1, engine.t / REEL_DURATION);
  const stepProgress = step ? Math.min(1, (engine.t - step.at) / ((next?.at ?? REEL_DURATION) - step.at)) : 0;
  if (ui.chromeHidden) return null;
  return (
    <div className="pointer-events-none fixed bottom-4 left-1/2 z-50 w-[min(760px,calc(100vw-120px))] -translate-x-1/2">
      <div className="glass rounded-lg border border-border-strong px-4 py-3 shadow-2xl">
        <div className="flex items-center gap-3">
          <span className="pulse-dot h-2 w-2 rounded-full bg-accent" />
          <div className="min-w-0 flex-1">
            <div className="flex items-baseline gap-2">
              <span className="text-[12px] font-semibold text-text">{step?.title}</span>
              <span className="num text-[10px] text-dim">
                {ui.reelStep + 1}/{REEL.length}
              </span>
            </div>
            <div className="truncate text-[11px] text-muted">{step?.caption}</div>
          </div>
          <div className="num text-right text-[11px] text-muted">
            {fmtTime(engine.t)} <span className="text-dim">/ {fmtTime(REEL_DURATION)}</span>
          </div>
        </div>
        <div className="mt-2.5 h-[3px] w-full overflow-hidden rounded-full bg-white/[0.06]">
          <div className="h-full rounded-full bg-accent/80" style={{ width: `${progress * 100}%` }} />
        </div>
        <div className="mt-1 h-[2px] w-full overflow-hidden rounded-full bg-white/[0.04]">
          <div className="h-full rounded-full bg-muted/60" style={{ width: `${stepProgress * 100}%` }} />
        </div>
      </div>
    </div>
  );
}
