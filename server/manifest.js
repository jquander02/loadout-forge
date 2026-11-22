// Bungie's game database ("the manifest"): downloaded once, cut down to what Loadout Forge needs, cached in data/.
import { readJSON, writeJSON, ORIGIN } from "./config.js";

const BUNGIE = "https://www.bungie.net";
const TABLES = {
  items: "DestinyInventoryItemDefinition",
  collectibles: "DestinyCollectibleDefinition",
  buckets: "DestinyInventoryBucketDefinition",
  damageTypes: "DestinyDamageTypeDefinition",
  stats: "DestinyStatDefinition",
  sets: "DestinyEquipableItemSetDefinition" // armor set bonuses; absent in older manifests
};
const CLASS_NAMES = { 0: "Titan", 1: "Hunter", 2: "Warlock", 3: "Any" };
const SLOT_FROM_BUCKET = {
  "Helmet": "Helmet", "Gauntlets": "Gauntlets", "Chest Armor": "Chest Armor", "Leg Armor": "Leg Armor", "Class Armor": "Class Item",
  "Kinetic Weapons": "Kinetic", "Energy Weapons": "Energy", "Power Weapons": "Power", "Subclass": "Subclass"
};
// Plugs nobody needs for loadout planning; dropping them keeps the cache small.
const SKIP_PLUGS = /shader|skins|ornament|emote|transmat|ghost|ship|sparrow|memento|tracker|crafting\.recipes|v400\.empty/i;

/** Cuts the full manifest tables down to a compact lookup. Pure, so it can be tested on fixtures. */
export function slimManifest(t, version = "") {
  const name = d => d?.displayProperties?.name || "";
  const items = {};
  for (const [hash, d] of Object.entries(t.items || {})) {
    if (!d || d.redacted || !name(d)) continue;
    const plugCat = d.plug?.plugCategoryIdentifier || "";
    const isGear = d.itemType === 2 || d.itemType === 3 || d.itemType === 16;
    if (!isGear && !(plugCat && !SKIP_PLUGS.test(plugCat))) continue;
    const bucket = name(t.buckets?.[d.inventory?.bucketTypeHash]);
    const dmg = d.defaultDamageTypeHash ?? d.damageTypeHashes?.[0];
    const coll = d.collectibleHash ? t.collectibles?.[d.collectibleHash] : null;
    const setHash = d.equippingBlock?.equipableItemSetHash;
    const it = { n: name(d), k: d.itemType };
    if (d.itemTypeDisplayName) it.t = d.itemTypeDisplayName;
    if (d.inventory?.tierTypeName) it.r = d.inventory.tierTypeName;
    if (d.classType !== undefined && d.classType !== 3) it.c = CLASS_NAMES[d.classType];
    if (SLOT_FROM_BUCKET[bucket]) it.s = SLOT_FROM_BUCKET[bucket];
    if (dmg && t.damageTypes?.[dmg]) it.e = name(t.damageTypes[dmg]);
    if (coll?.sourceString) it.src = coll.sourceString;
    if (d.collectibleHash) it.col = 1;
    if (setHash && t.sets?.[setHash]) it.set = name(t.sets[setHash]);
    if (plugCat) it.p = plugCat;
    if (d.displayProperties?.description && (plugCat || d.itemType === 16)) it.d = d.displayProperties.description.slice(0, 220);
    if (d.displayProperties?.icon) it.i = d.displayProperties.icon;
    items[hash] = it;
  }
  const stats = {};
  for (const [hash, d] of Object.entries(t.stats || {})) if (name(d)) stats[hash] = name(d);
  return { version, builtAt: new Date().toISOString(), items, stats };
}

async function bungieGet(path, apiKey) {
  const res = await fetch(BUNGIE + path, { headers: { "X-API-Key": apiKey, "Origin": ORIGIN } });
  if (!res.ok) throw new Error(`Bungie returned ${res.status} for ${path.split("?")[0]}`);
  return res.json();
}

/** Downloads the current manifest tables and stores the slim version. onStep(message) reports progress. */
export async function downloadManifest(apiKey, onStep = () => {}) {
  if (!apiKey) throw new Error("Add your Bungie API key in Settings first.");
  onStep("Checking Bungie's current version");
  const meta = await bungieGet("/Platform/Destiny2/Manifest/", apiKey);
  if (meta.ErrorCode && meta.ErrorCode !== 1) throw new Error(`Bungie said: ${meta.Message || meta.ErrorStatus}`);
  const r = meta.Response, paths = r.jsonWorldComponentContentPaths?.en || {};
  const tables = {};
  for (const [key, table] of Object.entries(TABLES)) {
    if (!paths[table]) { if (key === "sets") continue; throw new Error(`The manifest has no ${table} table.`); }
    onStep(`Downloading ${table.replace(/^Destiny|Definition$/g, "")}`);
    const res = await fetch(BUNGIE + paths[table]);
    if (!res.ok) throw new Error(`Couldn't download ${table} (${res.status}).`);
    tables[key] = await res.json();
  }
  onStep("Building the item index");
  const slim = slimManifest(tables, r.version);
  await writeJSON("manifest", slim);
  cache = slim;
  return { version: slim.version, items: Object.keys(slim.items).length };
}

let cache = null;
export async function getManifest() {
  if (!cache) cache = await readJSON("manifest", null);
  return cache;
}
export async function manifestStatus() {
  const m = await getManifest();
  return m ? { ready: true, version: m.version, builtAt: m.builtAt, items: Object.keys(m.items).length } : { ready: false };
}
