// Where Loadout Forge keeps its files, and the user's settings (API keys).
import { mkdir, readFile, writeFile, rename } from "node:fs/promises";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const ROOT = resolve(fileURLToPath(new URL("..", import.meta.url)));
export const DATA_DIR = process.env.LOADOUT_FORGE_DATA ? resolve(process.env.LOADOUT_FORGE_DATA) : join(ROOT, "data");
export const PORT = Number(process.env.PORT) || 7777;
export const ORIGIN = `http://localhost:${PORT}`;

export async function ensureDataDir() { await mkdir(DATA_DIR, { recursive: true }); }

/** Reads data/<name>.json, or returns fallback when it doesn't exist yet. */
export async function readJSON(name, fallback = null) {
  try { return JSON.parse(await readFile(join(DATA_DIR, name + ".json"), "utf8")); }
  catch (e) { if (e.code === "ENOENT") return fallback; throw e; }
}

/** Writes atomically (temp file, then rename) so a crash never leaves a half-written file. */
export async function writeJSON(name, value) {
  await ensureDataDir();
  const file = join(DATA_DIR, name + ".json"), tmp = file + ".tmp";
  await writeFile(tmp, JSON.stringify(value));
  await rename(tmp, file);
}

const DEFAULT_SETTINGS = { bungieApiKey: "", dimApiKey: "", dimAppId: "" };

export async function getSettings() {
  const s = { ...DEFAULT_SETTINGS, ...(await readJSON("settings", {})) };
  // Environment variables win, for people who'd rather not keep keys in a file.
  if (process.env.BUNGIE_API_KEY) s.bungieApiKey = process.env.BUNGIE_API_KEY;
  if (process.env.DIM_API_KEY) s.dimApiKey = process.env.DIM_API_KEY;
  return s;
}
export async function saveSettings(patch) {
  const cur = { ...DEFAULT_SETTINGS, ...(await readJSON("settings", {})) };
  const next = { ...cur };
  for (const k of Object.keys(DEFAULT_SETTINGS)) if (typeof patch[k] === "string") next[k] = patch[k].trim();
  await writeJSON("settings", next);
  return next;
}
/** What the browser is allowed to see: whether keys exist, never the keys themselves. */
export function publicSettings(s) {
  const mask = k => (k ? "••••" + k.slice(-4) : "");
  return { bungieApiKey: mask(s.bungieApiKey), dimApiKey: mask(s.dimApiKey), hasBungieKey: !!s.bungieApiKey, hasDimKey: !!s.dimApiKey, origin: ORIGIN };
}
