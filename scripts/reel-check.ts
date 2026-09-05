/**
 * Walks the demo reel second by second and reports what the viewer would see:
 * which module is on screen, and which simulated events fire while it is.
 * Used to keep the 90 s story tight. Run with `pnpm reel:check`.
 */
import { MODULES } from "../lib/data/company";
import { createWorld, MODULE_IDS, type ModuleData } from "../lib/sim/modules";
import { REEL, REEL_DURATION } from "../lib/sim/timeline";
import type { ModuleId } from "../lib/sim/types";
import { World } from "../lib/sim/world";

const SEED = 20260904;
const worlds = Object.fromEntries(MODULE_IDS.map((m) => [m, createWorld(m, SEED)])) as Record<ModuleId, World<ModuleData>>;
for (const m of MODULE_IDS) worlds[m].stepTo(REEL_DURATION + 1);

let gaps = 0;
console.warn(`Demo reel · ${REEL.length} pasos · ${REEL_DURATION} s\n`);
REEL.forEach((step, i) => {
  const next = REEL[i + 1];
  const end = next ? next.at : REEL_DURATION;
  const mod = MODULES.find((m) => m.path === step.route);
  const dur = end - step.at;
  const events = mod
    ? worlds[mod.id].state.events.filter((e) => e.t >= step.at && e.t < end)
    : [];
  const notable = events.filter((e) => e.severity !== "info");
  const flag = mod && notable.length === 0 && dur > 6 ? "  ← sin evento destacado" : "";
  if (flag) gaps++;
  console.warn(
    `${String(step.at).padStart(3)}s → ${String(end).padStart(3)}s  (${String(dur).padStart(2)}s)  ${step.route.padEnd(12)} ${String(events.length).padStart(2)} ev / ${notable.length} destacados${flag}`,
  );
  for (const e of notable.slice(0, 3)) console.warn(`            ${e.t.toFixed(1)}s [${e.severity}] ${e.title}`);
  for (const a of step.actions ?? []) console.warn(`            ${a.at}s · acción ${a.type}${"text" in a ? ` "${a.text}"` : ""}${"on" in a ? ` ${a.on}` : ""}`);
});
console.warn(`\npasos sin evento destacado: ${gaps}`);
