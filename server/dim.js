// Turning whatever the user pastes (dim.gg link, DIM URL, light.gg page, raw JSON) into a DIM loadout object.
import { ORIGIN } from "./config.js";

const DIM_API = "https://api.destinyitemmanager.com";

/** Recognizes the input without touching the network. Pure. */
export function parseLoadoutInput(raw) {
  const text = String(raw || "").trim();
  if (!text) return { error: "Paste a loadout link or DIM loadout JSON." };
  if (text.startsWith("{")) {
    try { return { kind: "json", loadout: unwrap(JSON.parse(text)) }; }
    catch (e) { return { error: "That looks like JSON but couldn't be read: " + e.message }; }
  }
  let url;
  try { url = new URL(/^https?:\/\//i.test(text) ? text : "https://" + text); }
  catch (e) { return { error: "That isn't a link or loadout JSON Loadout Forge recognizes." }; }
  const host = url.hostname.replace(/^www\./, "");
  const embedded = url.searchParams.get("loadout");
  if (embedded) {
    try { return { kind: "dimUrl", loadout: unwrap(JSON.parse(embedded)) }; }
    catch (e) { return { error: "The link has loadout data, but it couldn't be read." }; }
  }
  if (host === "dim.gg") {
    const shareId = url.pathname.split("/").filter(Boolean)[0];
    if (!shareId) return { error: "That dim.gg link has no loadout code in it." };
    return { kind: "dimShare", shareId, url: url.href };
  }
  if (host === "light.gg" && url.pathname.includes("/loadouts/")) {
    const id = url.pathname.match(/\/loadouts\/(\d+)/)?.[1];
    if (!id) return { error: "That light.gg link doesn't point to a loadout." };
    return { kind: "lightgg", url: `https://www.light.gg/loadouts/${id}/export` };
  }
  if (host.endsWith("destinyitemmanager.com")) return { error: "This DIM link doesn't carry a loadout. In DIM, use Share on the loadout to get a dim.gg link." };
  return { error: `Loadout Forge can't read links from ${host} yet. Supported: dim.gg, DIM loadout links, light.gg loadouts, or DIM loadout JSON.` };
}

/** Accepts {loadout: {...}} wrappers as well as a bare loadout, and checks the shape. */
export function unwrap(obj) {
  const l = obj && obj.loadout && typeof obj.loadout === "object" ? obj.loadout : obj;
  if (!l || !Array.isArray(l.equipped)) throw new Error("No equipped items found in the loadout.");
  return l;
}

/** Finds the DIM loadout link inside a light.gg export page. Pure. */
export function findDimLinkInHtml(html) {
  const decoded = String(html).replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#39;/g, "'");
  const m = decoded.match(/https:\/\/app\.destinyitemmanager\.com\/[^"'\s<>]*[?&]loadout=[^"'\s<>]+/);
  return m ? m[0] : null;
}

/** Resolves any supported input into { loadout, source }. Throws with a readable message. */
export async function resolveLoadout(raw, settings) {
  const p = parseLoadoutInput(raw);
  if (p.error) throw new Error(p.error);
  if (p.kind === "json") return { loadout: p.loadout, source: "Pasted JSON" };
  if (p.kind === "dimUrl") return { loadout: p.loadout, source: "DIM link" };
  if (p.kind === "dimShare") {
    if (!settings.dimApiKey) throw new Error("dim.gg links need a DIM API key. Get one in Settings (it's automatic once your Bungie key is saved).");
    const res = await fetch(`${DIM_API}/loadout_share?shareId=${encodeURIComponent(p.shareId)}`, { headers: { "X-API-Key": settings.dimApiKey, "Origin": ORIGIN } });
    if (res.status === 404) throw new Error("DIM couldn't find that shared loadout. Check the link.");
    if (!res.ok) throw new Error(`DIM's API returned ${res.status}. ${res.status === 401 || res.status === 403 ? "Your DIM API key may be wrong; get a new one in Settings." : ""}`.trim());
    return { loadout: unwrap(await res.json()), source: "dim.gg share" };
  }
  if (p.kind === "lightgg") {
    const res = await fetch(p.url, { headers: { "User-Agent": "LoadoutForge/2 (local app)" } });
    if (!res.ok) throw new Error(`light.gg returned ${res.status}.`);
    const link = findDimLinkInHtml(await res.text());
    if (!link) throw new Error("Couldn't find the loadout on that light.gg page. Use its Export to DIM button, then paste the DIM link it opens.");
    const inner = parseLoadoutInput(link);
    if (inner.error) throw new Error(inner.error);
    return { loadout: inner.loadout, source: "light.gg" };
  }
  throw new Error("Unsupported input.");
}

/**
 * Gets a DIM API key for this local app. DIM hands out development keys to anyone with a Bungie key.
 * Asking again with the same id returns the same key.
 */
export async function registerDimApp(bungieApiKey, appId) {
  if (!bungieApiKey) throw new Error("Save your Bungie API key first.");
  const res = await fetch(`${DIM_API}/new_app`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "Origin": ORIGIN },
    body: JSON.stringify({ id: appId, bungieApiKey, origin: ORIGIN })
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.message || body.error || `DIM's API returned ${res.status}.`);
  const key = findDimKey(body);
  if (!key) throw new Error(`DIM answered but sent no key (reply had: ${Object.keys(body).join(", ") || "nothing"}). You can paste a key under "Paste a key instead".`);
  return key;
}

/** DIM wraps the key as { app: { dimApiKey } }; accept it at any depth in case that changes. */
export function findDimKey(obj, depth = 0) {
  if (!obj || typeof obj !== "object" || depth > 4) return null;
  if (typeof obj.dimApiKey === "string" && obj.dimApiKey) return obj.dimApiKey;
  for (const v of Object.values(obj)) { const k = findDimKey(v, depth + 1); if (k) return k; }
  return null;
}
