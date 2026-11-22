// Reading DIM spreadsheet exports into normalized item objects.
import { STATS, LEGACY, CLASSES, ARCHETYPES } from "./constants.js";

export const sum = a => a.reduce((x, y) => x + y, 0);
export const num = v => { const n = parseFloat(String(v ?? "").replace(/[^0-9.\-]/g, "")); return Number.isFinite(n) ? n : 0; };
export const cleanId = v => String(v ?? "").replace(/["'\s]/g, "");

/** RFC 4180-style CSV parser: quoted fields, doubled quotes, CRLF/LF, BOM. Returns an array of rows. */
export function parseCSV(text) {
  const rows = []; let row = [], f = "", q = false;
  text = String(text).replace(/^﻿/, "");
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) {
      if (c === '"') { if (text[i + 1] === '"') { f += '"'; i++; } else q = false; }
      else f += c;
    } else if (c === '"') q = true;
    else if (c === ",") { row.push(f); f = ""; }
    else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(f); f = "";
      if (row.length > 1 || row[0] !== "") rows.push(row);
      row = [];
    } else f += c;
  }
  if (f !== "" || row.length) { row.push(f); rows.push(row); }
  return rows;
}

function headerIndex(headers) {
  const h = headers.map(x => x.trim().toLowerCase());
  const find = (...names) => { for (const n of names) { const i = h.indexOf(n); if (i >= 0) return i; } return -1; };
  return { h, find };
}
function colValues(rows, i, n = 40) {
  const out = [];
  if (i < 0) return out;
  for (let r = 1; r < rows.length && out.length < n; r++) if (rows[r][i]) out.push(rows[r][i].trim());
  return out;
}
const isClassName = v => /^(hunter|titan|warlock|any)$/i.test(v);
const isRarity = v => /^(exotic|legendary|rare|uncommon|common|basic)$/i.test(v);

/** True when the file looks like DIM's armor export rather than weapons. */
export function looksLikeArmor(rows) {
  const h = rows[0].map(x => x.trim().toLowerCase());
  const hasStats = STATS.concat(LEGACY).some(s => h.includes(s.toLowerCase() + " (base)") || h.includes(s.toLowerCase()));
  const types = new Set(colValues(rows, h.indexOf("type"), 80).map(v => v.toLowerCase()));
  return hasStats && ["helmet", "gauntlets", "chest armor", "leg armor"].some(t => types.has(t));
}

/**
 * Work out which column holds what. DIM's headers have changed over the years
 * (Armor 2.0 → 3.0), so matching is by name with fallbacks rather than position.
 */
export function detectArmor(rows) {
  const { h, find } = headerIndex(rows[0]);
  const m = {
    name: find("name"), id: find("id"), hash: find("hash"), tag: find("tag"), notes: find("notes"),
    type: find("type"), owner: find("owner"), power: find("power"), equipped: find("equipped")
  };
  // Character class. Careful: in Armor 3.0 "Class" is also a stat name.
  m.cls = find("equippable");
  if (m.cls < 0) { const i = find("class"); if (i >= 0 && colValues(rows, i).some(isClassName)) m.cls = i; }
  // "Tier" has meant rarity in older exports; gear tier (1–5) in newer ones.
  m.rarity = find("rarity");
  m.gear = find("gear tier");
  const ti = find("tier");
  if (ti >= 0) {
    const vals = colValues(rows, ti);
    if (vals.some(isRarity)) { if (m.rarity < 0) m.rarity = ti; }
    else if (m.gear < 0 && vals.some(v => /\d/.test(v))) m.gear = ti;
  }
  m.archetype = h.findIndex(x => x.includes("archetype"));
  m.set = h.findIndex(x => /(^|\s)set(\s|$)|armor set|set name|set bonus/.test(x) && !x.includes("seasonal"));
  m.base = []; m.cur = [];
  STATS.forEach((s, k) => {
    let b = -1, c = -1;
    for (const n of [s.toLowerCase(), LEGACY[k].toLowerCase()]) {
      if (b < 0) b = find(n + " (base)", "base " + n);
      if (c < 0) { const i = find(n); if (i >= 0 && i !== m.cls && !colValues(rows, i).some(isClassName)) c = i; }
    }
    m.base.push(b); m.cur.push(c);
  });
  m.statsAreBase = m.base.every(i => i >= 0);
  m.stats = m.statsAreBase ? m.base : m.cur;
  m.ok = m.name >= 0 && m.type >= 0 && m.stats.every(i => i >= 0);
  m.headers = rows[0];
  return m;
}

export function detectWeapons(rows) {
  const { h, find } = headerIndex(rows[0]);
  const m = {
    name: find("name"), id: find("id"), hash: find("hash"), tag: find("tag"), notes: find("notes"),
    type: find("type"), owner: find("owner"), power: find("power"), element: find("element", "damage type", "dmg"),
    crafted: find("crafted"), craftedLvl: find("crafted level"), category: find("category", "slot", "bucket"), equipped: find("equipped")
  };
  m.rarity = find("rarity"); m.gear = find("gear tier");
  const ti = find("tier");
  if (ti >= 0) { const vals = colValues(rows, ti); if (vals.some(isRarity)) { if (m.rarity < 0) m.rarity = ti; } else if (m.gear < 0) m.gear = ti; }
  m.perks = h.map((x, i) => (/^perks?\s*\d+$/.test(x) ? i : -1)).filter(i => i >= 0);
  m.ok = m.name >= 0 && m.type >= 0;
  m.headers = rows[0];
  return m;
}

export function slotOf(type) {
  const t = String(type).toLowerCase();
  if (t.includes("helmet")) return "Helmet";
  if (t.includes("gauntlet")) return "Gauntlets";
  if (t.includes("chest")) return "Chest Armor";
  if (t.includes("leg")) return "Leg Armor";
  if (/cloak|mark|bond|class/.test(t)) return "Class Item";
  return null;
}
export function classFromType(type) {
  const t = String(type).toLowerCase();
  return t.includes("cloak") ? "Hunter" : t.includes("mark") ? "Titan" : t.includes("bond") ? "Warlock" : "";
}
export function parseTier(v) { const m = String(v || "").match(/(\d)/); return m ? +m[1] : 0; }
/** Approximate Armor 3.0 gear tier from a piece's base stat total. */
export function inferTier(total) { return total >= 73 ? 5 : total >= 65 ? 4 : total >= 59 ? 3 : total >= 53 ? 2 : 1; }

/** Archetype from the two highest stats, plus the tertiary (third) stat index. */
export function archetypeOf(stats) {
  const order = stats.map((v, i) => [v, i]).filter(x => x[0] > 0).sort((a, b) => b[0] - a[0]);
  if (order.length < 2) return { name: "", tert: -1 };
  const p = order[0][1], s = order[1][1];
  let name = "";
  for (const [n, [a, b]] of Object.entries(ARCHETYPES)) if (a === p && b === s) name = n;
  return { name, tert: order[2] ? order[2][1] : -1 };
}

export function normalizeArmor(rows, m) {
  const out = [];
  for (let r = 1; r < rows.length; r++) {
    const row = rows[r]; const g = i => (i >= 0 ? (row[i] ?? "").trim() : "");
    const type = g(m.type); const slot = slotOf(type);
    if (!slot) continue;
    let cls = g(m.cls) || classFromType(type);
    cls = CLASSES.find(c => c.toLowerCase() === cls.toLowerCase()) || cls;
    if (!CLASSES.includes(cls)) continue;
    const rarity = g(m.rarity) || "Legendary";
    if (!/exotic|legendary/i.test(rarity)) continue;
    const stats = m.stats.map(i => num(g(i)));
    const total = sum(stats);
    if (total <= 0) continue;
    const legacy = stats.filter(v => v > 0).length >= 5; // Armor 3.0 rolls three stats; 2.0 rolled all six
    const gearRaw = parseTier(g(m.gear));
    const arch = archetypeOf(stats);
    out.push({
      id: cleanId(g(m.id)) || ("row" + r), hash: cleanId(g(m.hash)), name: g(m.name), slot, cls,
      rarity: /exotic/i.test(rarity) ? "Exotic" : "Legendary", stats, total, legacy,
      tier: gearRaw || (legacy ? 0 : inferTier(total)), tierInferred: !gearRaw,
      archetype: g(m.archetype) || (legacy ? "" : arch.name), tert: legacy ? -1 : arch.tert,
      set: g(m.set), owner: g(m.owner), power: num(g(m.power)), tag: g(m.tag).toLowerCase(), notes: g(m.notes),
      equipped: /true|yes/i.test(g(m.equipped))
    });
  }
  return out;
}

const HEAVY = /rocket|machine gun|sword|glaive?|linear fusion|heavy grenade/i;

export function normalizeWeapons(rows, m) {
  const out = [];
  for (let r = 1; r < rows.length; r++) {
    const row = rows[r]; const g = i => (i >= 0 ? (row[i] ?? "").trim() : "");
    const name = g(m.name); if (!name) continue;
    const type = g(m.type); const el = g(m.element);
    const cat = g(m.category).toLowerCase();
    // Best guess at the slot when DIM doesn't say.
    let slot = cat.includes("kinetic") ? "Kinetic" : cat.includes("energy") ? "Energy" : cat.includes("power") || cat.includes("heavy") ? "Power" : "";
    if (!slot) slot = HEAVY.test(type) ? "Power" : /kinetic/i.test(el) ? "Kinetic" : "Energy";
    const perks = [];
    m.perks.forEach(i => {
      const v = g(i);
      if (v) v.split(/\s*,\s*|\s*\|\s*/).forEach(p => { if (p) perks.push({ n: p.replace(/\*+$/, ""), on: /\*$/.test(p) }); });
    });
    out.push({
      id: cleanId(g(m.id)) || ("row" + r), hash: cleanId(g(m.hash)), name, type, element: el, slot,
      rarity: /exotic/i.test(g(m.rarity)) ? "Exotic" : (g(m.rarity) || "Legendary"),
      tier: parseTier(g(m.gear)), power: num(g(m.power)), owner: g(m.owner), tag: g(m.tag).toLowerCase(), notes: g(m.notes),
      crafted: /true|yes|crafted/i.test(g(m.crafted)) || num(g(m.craftedLvl)) > 0, perks
    });
  }
  return out;
}
