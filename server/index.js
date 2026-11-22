// Loadout Forge local server: serves the app and does the work a web page can't (Bungie, DIM, light.gg, files on disk).
// Start with `npm start` or the "Start Loadout Forge" launcher. Listens on this computer only.
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join, normalize } from "node:path";
import { randomBytes } from "node:crypto";
import { spawn } from "node:child_process";
import { ROOT, PORT, ORIGIN, ensureDataDir, readJSON, writeJSON, getSettings, saveSettings, publicSettings, DATA_DIR } from "./config.js";
import { downloadManifest, getManifest, manifestStatus } from "./manifest.js";
import { resolveLoadout, registerDimApp } from "./dim.js";
import { planLoadout } from "./plan.js";

const VERSION = JSON.parse(await readFile(join(ROOT, "package.json"), "utf8")).version;
const STORE_KEYS = new Set(["armor", "weapons", "loadouts"]);
const STATIC_DIRS = ["css", "js"];
const TYPES = { ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8", ".json": "application/json", ".svg": "image/svg+xml", ".png": "image/png" };
const ALLOWED_HOSTS = new Set([`localhost:${PORT}`, `127.0.0.1:${PORT}`]);
const ALLOWED_ORIGINS = new Set([ORIGIN, `http://127.0.0.1:${PORT}`]);

// One manifest download at a time; the page polls for progress.
const job = { running: false, step: "", error: "", finishedAt: null };

function send(res, status, body) {
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" });
  res.end(JSON.stringify(body));
}
async function readBody(req, limit = 50 * 1024 * 1024) {
  const chunks = []; let size = 0;
  for await (const c of req) { size += c.length; if (size > limit) throw Object.assign(new Error("Request too large."), { status: 413 }); chunks.push(c); }
  const text = Buffer.concat(chunks).toString("utf8");
  try { return text ? JSON.parse(text) : {}; } catch { throw Object.assign(new Error("Request body isn't valid JSON."), { status: 400 }); }
}

async function api(req, res, path) {
  const method = req.method;
  if (path === "/api/status" && method === "GET") {
    return send(res, 200, { version: VERSION, settings: publicSettings(await getSettings()), manifest: { ...(await manifestStatus()), job }, dataDir: DATA_DIR });
  }
  if (path === "/api/settings" && method === "POST") {
    const body = await readBody(req);
    const s = await saveSettings(body);
    return send(res, 200, publicSettings(s));
  }
  if (path === "/api/dim/register" && method === "POST") {
    const s = await getSettings();
    const appId = s.dimAppId || `loadoutforge${randomBytes(3).toString("hex")}-dev`;
    const key = await registerDimApp(s.bungieApiKey, appId);
    return send(res, 200, publicSettings(await saveSettings({ dimApiKey: key, dimAppId: appId })));
  }
  if (path === "/api/manifest/update" && method === "POST") {
    if (job.running) return send(res, 202, job);
    const s = await getSettings();
    if (!s.bungieApiKey) return send(res, 400, { error: "Add your Bungie API key first." });
    Object.assign(job, { running: true, step: "Starting", error: "", finishedAt: null });
    downloadManifest(s.bungieApiKey, step => { job.step = step; })
      .then(r => Object.assign(job, { running: false, step: `Ready: ${r.items.toLocaleString()} items`, finishedAt: Date.now() }))
      .catch(e => Object.assign(job, { running: false, error: e.message, finishedAt: Date.now() }));
    return send(res, 202, job);
  }
  const store = path.match(/^\/api\/store\/([a-z]+)$/);
  if (store && STORE_KEYS.has(store[1])) {
    if (method === "GET") return send(res, 200, { value: await readJSON(store[1], null) });
    if (method === "PUT") { const body = await readBody(req); await writeJSON(store[1], body.value ?? null); return send(res, 200, { ok: true }); }
  }
  if (path === "/api/plan" && method === "POST") {
    const { input } = await readBody(req, 2 * 1024 * 1024);
    const m = await getManifest();
    if (!m) return send(res, 409, { error: "Download Bungie's item database in Settings first, so items can be named." });
    const { loadout, source } = await resolveLoadout(input, await getSettings());
    const [armor, weapons] = await Promise.all([readJSON("armor", null), readJSON("weapons", null)]);
    const plan = planLoadout(loadout, m, { armor: armor?.items || [], weapons: weapons?.items || [] });
    return send(res, 200, { plan, source, inventory: { armor: armor?.items?.length || 0, weapons: weapons?.items?.length || 0, sample: !!armor?.meta?.sample } });
  }
  return send(res, 404, { error: "Unknown request." });
}

async function serveStatic(res, path) {
  if (path === "/") path = "/index.html";
  const first = path.split("/")[1];
  if (path !== "/index.html" && !STATIC_DIRS.includes(first)) { res.writeHead(404).end("Not found"); return; }
  const file = normalize(join(ROOT, path));
  if (!file.startsWith(ROOT)) { res.writeHead(403).end(); return; }
  try {
    const body = await readFile(file);
    res.writeHead(200, { "Content-Type": TYPES[extname(file)] || "application/octet-stream", "Cache-Control": "no-store" }).end(body);
  } catch { res.writeHead(404, { "Content-Type": "text/plain" }).end("Not found"); }
}

const server = createServer(async (req, res) => {
  // Only answer this computer's browser: reject other host names (DNS rebinding) and cross-site writes.
  if (!ALLOWED_HOSTS.has(req.headers.host)) { res.writeHead(403).end("Forbidden"); return; }
  const origin = req.headers.origin;
  if (req.method !== "GET" && origin && !ALLOWED_ORIGINS.has(origin)) { res.writeHead(403).end("Forbidden"); return; }
  const path = decodeURIComponent(new URL(req.url, ORIGIN).pathname);
  try {
    if (path.startsWith("/api/")) await api(req, res, path);
    else await serveStatic(res, path);
  } catch (e) {
    send(res, e.status || 500, { error: e.message || "Something went wrong." });
  }
});

await ensureDataDir();
server.on("error", e => {
  if (e.code === "EADDRINUSE") console.error(`Port ${PORT} is busy. Loadout Forge may already be running: open ${ORIGIN}\nOr start on another port with PORT=7778.`);
  else console.error(e);
  process.exit(1);
});
server.listen(PORT, "127.0.0.1", () => {
  console.log(`Loadout Forge ${VERSION} is running at ${ORIGIN}`);
  console.log(`Your data is in ${DATA_DIR}`);
  console.log("Leave this window open while you use it. Close it (or press Ctrl+C) to stop.");
  if (process.argv.includes("--open")) openBrowser(ORIGIN);
});

function openBrowser(url) {
  const cmd = process.platform === "win32" ? ["cmd", ["/c", "start", "", url]] : process.platform === "darwin" ? ["open", [url]] : ["xdg-open", [url]];
  try { spawn(cmd[0], cmd[1], { stdio: "ignore", detached: true }).unref(); } catch { /* the URL is printed above */ }
}
