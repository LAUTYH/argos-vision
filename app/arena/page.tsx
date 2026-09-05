"use client";

import { useReducedMotion } from "motion/react";
import { Pause, Play, RotateCcw } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { BENCH_H, BENCH_MODELS, BENCH_W, benchScene, LA_MODES, OTHER_BENCHMARKS, type BenchBox, type BenchModel } from "@/lib/arena/bench";
import { FONTS, hexAlpha, roundRect } from "@/lib/render/canvas";
import { hashRng } from "@/lib/sim/rng";
import { RUNTIME } from "@/lib/data/company";
import { useEngine } from "@/lib/store/engine-hooks";
import { Panel } from "@/components/modules/ModulePage";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Hint } from "@/components/ui/tooltip";
import { cn, fmt } from "@/lib/utils";

const PROMPT = "Locate all instances matching: caja, pallet, bidón";

function paintYard(ctx: CanvasRenderingContext2D, boxes: BenchBox[], seed: number): void {
  ctx.fillStyle = "#34373c";
  ctx.fillRect(0, 0, BENCH_W, BENCH_H);
  const r = hashRng(seed, "yardnoise");
  for (let i = 0; i < 500; i++) {
    ctx.fillStyle = `rgba(${r.chance(0.5) ? "255,255,255" : "0,0,0"},${r.float(0.02, 0.05)})`;
    ctx.fillRect(r.float(0, BENCH_W), r.float(0, BENCH_H), r.float(2, 8), r.float(2, 8));
  }
  ctx.strokeStyle = "rgba(235,190,60,0.35)";
  ctx.lineWidth = 2;
  for (let x = 20; x < BENCH_W; x += 200) ctx.strokeRect(x, 14, 180, BENCH_H - 28);
  for (const b of boxes) {
    ctx.fillStyle = "rgba(0,0,0,0.35)";
    ctx.fillRect(b.x + 4, b.y + 5, b.w, b.h);
    if (b.label === "bidón") {
      ctx.fillStyle = `hsl(${210 + b.tone * 30} 30% ${30 + b.tone * 10}%)`;
      ctx.beginPath();
      ctx.arc(b.x + b.w / 2, b.y + b.h / 2, b.w / 2, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "rgba(255,255,255,0.18)";
      ctx.beginPath();
      ctx.arc(b.x + b.w / 2, b.y + b.h / 2, b.w / 5, 0, Math.PI * 2);
      ctx.fill();
    } else if (b.label === "pallet") {
      ctx.fillStyle = `hsl(28 30% ${28 + b.tone * 8}%)`;
      ctx.fillRect(b.x, b.y, b.w, b.h);
      ctx.fillStyle = "rgba(0,0,0,0.25)";
      for (let i = 1; i < 4; i++) ctx.fillRect(b.x, b.y + (b.h / 4) * i - 1, b.w, 2);
    } else {
      ctx.fillStyle = `hsl(31 36% ${34 + b.tone * 20}%)`;
      ctx.fillRect(b.x, b.y, b.w, b.h);
      ctx.fillStyle = "rgba(200,190,170,0.6)";
      ctx.fillRect(b.x + b.w / 2 - 2, b.y, 4, b.h);
    }
    ctx.strokeStyle = "rgba(0,0,0,0.3)";
    ctx.lineWidth = 1;
    ctx.strokeRect(b.x, b.y, b.w, b.h);
  }
}

interface RunState {
  running: boolean;
  elapsed: number;
}

function decodedCount(model: BenchModel, elapsed: number, total: number): number {
  const step = model.parallel / model.bps;
  return Math.min(total, Math.floor(elapsed / step) * model.parallel);
}

function ModelPanel({ model, boxes, elapsed, yard, seed }: { model: BenchModel; boxes: BenchBox[]; elapsed: number; yard: HTMLCanvasElement | null; seed: number }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const n = decodedCount(model, elapsed, boxes.length);
  const done = n >= boxes.length;
  const finishAt = (boxes.length / model.parallel) * (model.parallel / model.bps);
  const shown = done ? finishAt : elapsed;
  const tokens = n * 6;
  useEffect(() => {
    const c = ref.current;
    if (!c || !yard) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const cssW = c.clientWidth;
    const cssH = (cssW * BENCH_H) / BENCH_W;
    if (c.width !== Math.round(cssW * dpr)) {
      c.width = Math.round(cssW * dpr);
      c.height = Math.round(cssH * dpr);
    }
    const ctx = c.getContext("2d");
    if (!ctx) return;
    const s = (cssW * dpr) / BENCH_W;
    ctx.setTransform(s, 0, 0, s, 0, 0);
    ctx.drawImage(yard, 0, 0);
    const px = 1 / (s / dpr);
    const r = hashRng(seed, model.id);
    ctx.font = `500 ${10 * px}px ${FONTS.mono}`;
    ctx.textBaseline = "middle";
    for (let i = 0; i < n; i++) {
      const b = boxes[i];
      if (!b) continue;
      const jx = r.gaussian(0, 0.8);
      const jy = r.gaussian(0, 0.8);
      ctx.strokeStyle = model.color;
      ctx.lineWidth = 1.25 * px;
      ctx.strokeRect(b.x + jx, b.y + jy, b.w, b.h);
      const conf = (0.78 + r.float(0, 0.19)).toFixed(2);
      const text = `${b.label} ${conf}`;
      const w = ctx.measureText(text).width + 8 * px;
      ctx.fillStyle = "rgba(6,8,15,0.82)";
      roundRect(ctx, b.x + jx, b.y + jy - 15 * px, w, 14 * px, 2 * px);
      ctx.fill();
      ctx.fillStyle = "#E8ECF4";
      ctx.fillText(text, b.x + jx + 4 * px, b.y + jy - 8 * px);
    }
    // the block currently being decoded
    if (!done) {
      const b = boxes[n];
      if (b) {
        ctx.setLineDash([4 * px, 3 * px]);
        ctx.strokeStyle = hexAlpha(model.color, 0.6);
        ctx.strokeRect(b.x - 2, b.y - 2, b.w + 4, b.h + 4);
        ctx.setLineDash([]);
      }
    }
  }, [boxes, n, done, model, yard, seed]);
  return (
    <div className="panel overflow-hidden">
      <div className="flex items-center gap-2 px-3 py-2">
        <span className="h-2 w-2 rounded-full" style={{ background: model.color }} />
        <div className="min-w-0 flex-1">
          <div className="truncate text-[12px] font-semibold text-text">{model.name}</div>
          <div className="truncate text-[10px] text-dim">{model.decoding}</div>
        </div>
        <Badge tone={done ? "accent" : "neutral"}>{done ? "listo" : "decodificando"}</Badge>
      </div>
      <canvas ref={ref} className="block w-full bg-black" style={{ aspectRatio: `${BENCH_W} / ${BENCH_H}` }} aria-label={`Salida simulada de ${model.name}`} role="img" />
      <div className="grid grid-cols-4 gap-2 border-t border-border px-3 py-2">
        <Stat label="cajas" value={`${n}/${boxes.length}`} />
        <Stat label="tiempo" value={`${fmt(shown, 2)} s`} />
        <Stat label="boxes/s" value={fmt(model.bps, 1)} />
        <Stat label="tokens" value={fmt(tokens)} />
      </div>
      <div className="h-[3px] w-full bg-white/[0.05]">
        <div className="h-full transition-[width] duration-100" style={{ width: `${(n / boxes.length) * 100}%`, background: model.color }} />
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="num text-right">
      <div className="text-[13px] text-text">{value}</div>
      <div className="text-[9px] uppercase tracking-[0.06em] text-dim">{label}</div>
    </div>
  );
}

const maxBps = Math.max(...BENCH_MODELS.map((m) => m.bps));

export default function ArenaPage() {
  const engine = useEngine();
  const reduced = useReducedMotion();
  const seed = engine.seed;
  const [run, setRun] = useState<RunState>({ running: true, elapsed: 0 });
  const [boxes] = useState(() => benchScene(seed));
  const [yard, setYard] = useState<HTMLCanvasElement | null>(null);
  useEffect(() => {
    const c = document.createElement("canvas");
    c.width = BENCH_W;
    c.height = BENCH_H;
    const ctx = c.getContext("2d");
    if (ctx) paintYard(ctx, boxes, seed);
    setYard(c);
  }, [boxes, seed]);
  useEffect(() => {
    if (!run.running) return;
    let raf = 0;
    let last = performance.now();
    const loop = (now: number) => {
      const dt = Math.min(0.1, (now - last) / 1000);
      last = now;
      setRun((r) => {
        const slowest = BENCH_MODELS.reduce((m, x) => Math.max(m, boxes.length / x.bps), 0);
        const next = r.elapsed + dt * (reduced ? 4 : 1);
        return next >= slowest + 2.5 ? { running: true, elapsed: 0 } : { running: true, elapsed: next };
      });
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [run.running, boxes.length, reduced]);

  return (
    <div className="mx-auto flex max-w-[1600px] flex-col gap-4">
      <section className="panel flex flex-wrap items-center gap-3 px-4 py-3">
        <div className="min-w-0 flex-1">
          <div className="text-[11px] uppercase tracking-[0.08em] text-muted">Mismo frame · mismo prompt · tres decodificadores</div>
          <div className="num mt-0.5 truncate text-[14px] text-text">“{PROMPT}”</div>
        </div>
        <div className="num text-[11px] text-muted">
          {boxes.length} objetos · <span className="text-text">{fmt(run.elapsed, 1)} s</span>
        </div>
        <Button size="sm" variant="outline" onClick={() => setRun((r) => ({ ...r, running: !r.running }))}>
          {run.running ? <Pause size={13} /> : <Play size={13} />}
          {run.running ? "Pausar" : "Reanudar"}
        </Button>
        <Button size="sm" variant="outline" onClick={() => setRun({ running: true, elapsed: 0 })}>
          <RotateCcw size={13} /> Reiniciar
        </Button>
      </section>

      <section className="grid grid-cols-1 gap-4 lg:grid-cols-3" aria-label="Comparación de modelos">
        {BENCH_MODELS.map((m) => (
          <ModelPanel key={m.id} model={m} boxes={boxes} elapsed={run.elapsed} yard={yard} seed={seed} />
        ))}
      </section>

      <div className="grid grid-cols-12 items-start gap-4">
        <div className="col-span-12 flex flex-col gap-4 xl:col-span-8">
        <Panel title="Tabla 1 del paper · COCO y LVIS · H100, batch 1, BF16">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-[12px]">
              <thead>
                <tr className="text-[10px] uppercase tracking-[0.06em] text-dim">
                  <th className="px-3 py-2 text-left font-medium">Modelo</th>
                  <th className="py-2 text-right font-medium">boxes/s</th>
                  <th className="py-2 text-right font-medium">COCO F1@0.5</th>
                  <th className="py-2 text-right font-medium">F1@0.95</th>
                  <th className="py-2 text-right font-medium">F1@mIoU</th>
                  <th className="py-2 text-right font-medium">LVIS F1@0.5</th>
                  <th className="py-2 text-right font-medium">F1@0.95</th>
                  <th className="px-3 py-2 text-right font-medium">F1@mIoU</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {BENCH_MODELS.map((m) => (
                  <tr key={m.id} className={cn(m.id === "locate-anything" && "bg-white/[0.03]")}>
                    <td className="px-3 py-2">
                      <div className="flex items-center gap-2 text-text">
                        <span className="h-2 w-2 rounded-full" style={{ background: m.color }} />
                        {m.name}
                      </div>
                      <div className="text-[10px] text-dim">{m.params}</div>
                    </td>
                    <td className="num py-2 text-right text-text">{fmt(m.bps, 1)}</td>
                    <Cell v={m.coco.f1_50} />
                    <Cell v={m.coco.f1_95} strong={m.id === "locate-anything"} />
                    <Cell v={m.coco.f1_mIoU} />
                    <Cell v={m.lvis.f1_50} />
                    <Cell v={m.lvis.f1_95} strong={m.id === "locate-anything"} />
                    <Cell v={m.lvis.f1_mIoU} last />
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="border-t border-border px-3 py-2 text-[10px] leading-relaxed text-dim">
            Fuente: LocateAnything (arXiv 2605.27365), Tabla 1 y Tabla 12. Lado corto 840 px, imágenes COCO. Qwen3-VL-8B: 1.0 boxes/s, COCO F1@0.5 62.8 / F1@0.95 14.0 / mIoU 45.7; sus valores en LVIS no
            figuran en la tabla. La animación de arriba reproduce las tasas de decodificación publicadas, no mide nada.
          </div>
        </Panel>
        <Panel title="Throughput · boxes/s en una H100">
          <ul className="flex flex-col gap-3 px-3 py-3">
            {BENCH_MODELS.map((m) => (
              <li key={m.id} className="flex items-center gap-3">
                <span className="w-[132px] shrink-0 truncate text-[12px] text-text">{m.name}</span>
                <span className="relative h-4 flex-1 overflow-hidden rounded-[3px] bg-white/[0.04]">
                  <span className="absolute inset-y-0 left-0 rounded-[3px]" style={{ width: `${(m.bps / maxBps) * 100}%`, background: m.color, opacity: m.id === "locate-anything" ? 0.9 : 0.55 }} />
                </span>
                <span className="num w-[76px] shrink-0 text-right text-[12px] text-text">
                  {fmt(m.bps, 1)} <span className="text-dim">b/s</span>
                </span>
                <span className="num w-[48px] shrink-0 text-right text-[11px] text-muted">{m.id === "locate-anything" ? "—" : `${fmt(BENCH_MODELS[0]!.bps / m.bps, 1)}×`}</span>
              </li>
            ))}
          </ul>
          <div className="border-t border-border px-3 py-2 text-[10px] text-dim">
            Parallel Box Decoding emite la caja completa en un paso en lugar de token por token: 2,5× sobre Rex-Omni y ~10× sobre Qwen3-VL, con mejor F1 a IoU alto. {RUNTIME.note}
          </div>
        </Panel>
        </div>
        <div className="col-span-12 flex flex-col gap-4 xl:col-span-4">
          <Panel title="Modos de inferencia · LocateAnything">
            <ul className="divide-y divide-border">
              {LA_MODES.map((m) => (
                <li key={m.mode} className="flex items-center justify-between px-3 py-2 text-[12px]">
                  <span className="text-text">{m.label}</span>
                  <span className="num text-muted">
                    <span className="text-text">{fmt(m.bps, 1)}</span> boxes/s
                  </span>
                </li>
              ))}
            </ul>
            <div className="border-t border-border px-3 py-2 text-[10px] leading-relaxed text-dim">
              Híbrido: decodifica bloques en paralelo y cae a token por token cuando la probabilidad de una coordenada es &lt; 0.7 o el bloque tiene ambigüedad espacial.
            </div>
          </Panel>
          <Panel title="Otros benchmarks · F1">
            <table className="w-full text-[12px]">
              <thead>
                <tr className="text-[10px] uppercase tracking-[0.06em] text-dim">
                  <th className="px-3 py-1.5 text-left font-medium">Benchmark</th>
                  <th className="py-1.5 text-right font-medium">LA-3B</th>
                  <th className="px-3 py-1.5 text-right font-medium">Rex-Omni</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {OTHER_BENCHMARKS.map((b) => (
                  <tr key={b.name}>
                    <td className="px-3 py-1.5 text-muted">{b.name}</td>
                    <td className="num py-1.5 text-right text-text">{b.la}</td>
                    <td className="num px-3 py-1.5 text-right text-muted">{b.rex}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Panel>
        </div>
      </div>
      <Hint label="Los feeds de los módulos simulan un runtime de producción; las cifras de esta pantalla son las publicadas.">
        <p className="cursor-help text-[10px] text-dim">Modelo de referencia: nvidia/LocateAnything-3B · licencia NVIDIA no comercial · integración descrita en lib/inference/locate-anything.ts</p>
      </Hint>
    </div>
  );
}

function Cell({ v, strong = false, last = false }: { v: number | null; strong?: boolean; last?: boolean }) {
  return <td className={cn("num py-2 text-right", last && "px-3", v === null ? "text-dim" : strong ? "text-accent" : "text-muted")}>{v === null ? "—" : fmt(v, 1)}</td>;
}
