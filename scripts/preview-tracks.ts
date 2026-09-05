/**
 * Renders a check image: the real frame with its precomputed boxes drawn on
 * top, using the same normalised coordinates the browser overlay uses. If the
 * boxes land on the objects here, they land on them in the app.
 *
 *   pnpm preview:tracks patio 6.0
 */
import { execFileSync } from "node:child_process";
import { readFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";

interface TrackFile {
  sampleFps: number;
  frames: Array<{ t: number; d: Array<[number, string, number, number, number, number, number]> }>;
}

const COLOR: Record<string, string> = {
  camion: "0xE0C9A6",
  auto: "0xC792EA",
  caja: "0x6FA8FF",
  bulto: "0x4DD4AC",
  persona: "0x6FA8FF",
  pallet: "0xE0C9A6",
};

const id = process.argv[2] ?? "patio";
const at = Number(process.argv[3] ?? 6);
const outDir = ".preview";
mkdirSync(outDir, { recursive: true });

const file = JSON.parse(readFileSync(join("public/feeds", `${id}.tracks.json`), "utf8")) as TrackFile;
const idx = Math.min(file.frames.length - 1, Math.round(at * file.sampleFps));
const frame = file.frames[idx];
if (!frame) throw new Error("sin frame");

const W = 1280;
const H = 720;
const filters: string[] = [];
for (const [tid, cls, x, y, w, h] of frame.d) {
  const c = COLOR[cls] ?? "0xFFFFFF";
  const px = Math.round(x * W);
  const py = Math.round(y * H);
  const pw = Math.max(2, Math.round(w * W));
  const ph = Math.max(2, Math.round(h * H));
  filters.push(`drawbox=x=${px}:y=${py}:w=${pw}:h=${ph}:color=${c}@0.95:t=2`);
  filters.push(`drawtext=text='${cls} ${tid}':x=${px + 3}:y=${Math.max(2, py - 14)}:fontsize=13:fontcolor=white:box=1:boxcolor=black@0.65:boxborderw=3`);
}

const out = join(outDir, `${id}-${at}.png`);
execFileSync("ffmpeg", [
  "-y", "-loglevel", "error",
  "-ss", String(frame.t), "-i", join("public/feeds", `${id}.mp4`),
  "-vframes", "1",
  "-vf", filters.length ? filters.join(",") : "null",
  out,
]);
console.warn(`${out}  ·  t=${frame.t}s  ·  ${frame.d.length} cajas`);
