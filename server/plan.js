// Compares a shared loadout with the user's gear: what they have, what can stand in, and where to get the rest.
import { STATS, LEGACY, SLOTS } from "../js/constants.js";

const CLASS = { 0: "Titan", 1: "Hunter", 2: "Warlock", 3: "Any" };
const SUBCLASS_PARTS = [
  [/aspects/i, "Aspect"], [/fragments/i, "Fragment"], [/supers/i, "Super"], [/grenades/i, "Grenade"],
  [/melee/i, "Melee"], [/class_abilities/i, "Class ability"], [/movement/i, "Jump"]
];
const WEAPON_ORDER = ["Kinetic", "Energy", "Power"];

/** Stat index (0–5) for a manifest stat name, accepting Armor 2.0 names too. */
export function statIndex(name) {
  const n = String(name || "").toLowerCase();
  let i = STATS.findIndex(s => s.toLowerCase() === n);
  if (i < 0) i = LEGACY.findIndex(s => s.toLowerCase() === n);
  return i;
}

/** Minimum per stat from DIM's statConstraints (minStat in Armor 3.0, minTier×10 before). */
export function targetsFrom(params, m) {
  const t = [0, 0, 0, 0, 0, 0];
  for (const c of params?.statConstraints || []) {
    const i = statIndex(m.stats?.[c.statHash]);
    if (i < 0 || c.ignored) continue;
    const v = c.minStat ?? (c.minTier != null ? c.minTier * 10 : 0);
    t[i] = Math.max(t[i], Math.min(200, v)); // if a stat appears twice (old and new name), keep the higher minimum
  }
  return t;
}

/** Builder weights: stats the loadout sets minimums for, then stats its mods mention. */
export function weightsFrom(targets, modNames) {
  const w = targets.map(v => (v > 0 ? 4 : 0));
  STATS.forEach((s, i) => {
    const hits = modNames.filter(n => new RegExp(`\\b(${s}|${LEGACY[i]})\\b`, "i").test(n)).length;
    if (hits && !w[i]) w[i] = hits >= 2 ? 2 : 1;
  });
  return w.some(Boolean) ? w : [2, 2, 2, 2, 2, 2];
}

function howToGet(def) {
  const tips = [];
  if (def.src) tips.push(def.src.replace(/^Source:\s*/i, ""));
  else tips.push("Bungie's data lists no source. It may come from a vendor, Eververse or an activity that's no longer available.");
  if (def.col) tips.push("If you've had it before, pull it from Collections.");
  return tips;
}

const perkNames = (overrides, m) => Object.values(overrides || {}).map(h => m.items[h]?.n).filter(Boolean);

/**
 * Builds the plan. Pure: manifest and inventory are passed in.
 * inventory = { armor: [...normalized armor], weapons: [...normalized weapons] }
 */
export function planLoadout(loadout, m, inventory) {
  const cls = CLASS[loadout.classType] || "Any";
  const armorInv = inventory.armor || [], weaponInv = inventory.weapons || [];
  const unknown = [];
  const plan = {
    name: loadout.name || "Shared loadout", cls, notes: loadout.notes || "",
    subclass: null, weapons: [], armor: [], mods: [], sets: [], targets: [0, 0, 0, 0, 0, 0], weights: null, unknown, search: null,
    summary: { have: 0, substitute: 0, missing: 0 }
  };
  const entries = (loadout.equipped || []).map(x => ({ ...x, equipped: true })).concat((loadout.unequipped || []).map(x => ({ ...x, equipped: false })));

  for (const e of entries) {
    const def = m.items[e.hash];
    if (!def) { unknown.push(e.hash); continue; }

    if (def.k === 16) {
      const parts = Object.values(e.socketOverrides || {}).map(h => m.items[h]).filter(Boolean).map(p => {
        const kind = SUBCLASS_PARTS.find(([re]) => re.test(p.p || ""))?.[1] || "Other";
        return { name: p.n, kind, description: p.d || "" };
      });
      if (e.equipped) plan.subclass = { name: def.n, element: def.e || "", parts };
      continue;
    }

    if (def.k === 3) {
      if (!e.equipped) continue; // spare weapons in a loadout are rarely part of the build
      const want = perkNames(e.socketOverrides, m);
      const have = weaponInv.filter(w => w.hash === String(e.hash) || w.name === def.n).sort((a, b) => (a.copyRank || 1) - (b.copyRank || 1));
      const scored = have.map(w => {
        const mine = new Set(w.perks.map(p => p.n.toLowerCase()));
        return { id: w.id, name: w.name, owner: w.owner, tier: w.tier, perksMatched: want.filter(p => mine.has(p.toLowerCase())), perks: w.perks.filter(p => p.on).map(p => p.n) };
      }).sort((a, b) => b.perksMatched.length - a.perksMatched.length);
      const alts = have.length ? [] : weaponInv
        .filter(w => w.type === def.t && w.name !== def.n)
        .map(w => ({ id: w.id, name: w.name, element: w.element, tier: w.tier, owner: w.owner, score: (w.element === def.e ? 100 : 0) + (w.tier || 0) * 10 + (w.rarity === def.r ? 5 : 0) }))
        .sort((a, b) => b.score - a.score).filter((w, i, arr) => arr.findIndex(x => x.name === w.name) === i).slice(0, 3);
      const status = have.length ? "have" : alts.length ? "substitute" : "missing";
      plan.summary[status]++;
      plan.weapons.push({ hash: e.hash, name: def.n, type: def.t || "", element: def.e || "", rarity: def.r || "", slot: def.s || "", icon: def.i || "",
        wantPerks: want, status, have: scored, alternatives: alts, howToGet: have.length ? [] : howToGet(def) });
      continue;
    }

    if (def.k === 2) {
      if (!e.equipped) continue;
      const exotic = def.r === "Exotic";
      const have = armorInv.filter(a => (a.hash === String(e.hash) || a.name === def.n) && (cls === "Any" || a.cls === cls));
      // Legendary armor is interchangeable apart from its set; the builder picks replacements from your gear.
      const sameSet = !exotic && def.set ? armorInv.filter(a => a.set === def.set && a.slot === def.s && (cls === "Any" || a.cls === cls)) : [];
      const status = have.length ? "have" : exotic ? "missing" : "substitute";
      plan.summary[status]++;
      plan.armor.push({ hash: e.hash, name: def.n, slot: def.s || "", rarity: def.r || "", set: def.set || "", exotic, icon: def.i || "",
        status, have: have.map(a => ({ id: a.id, name: a.name, owner: a.owner, tier: a.tier, total: a.total })), sameSetOwned: sameSet.length,
        howToGet: have.length ? [] : howToGet(def) });
    }
  }

  // Mods: DIM keeps them in parameters.mods (and sometimes modsByBucket).
  const modHashes = [...(loadout.parameters?.mods || []), ...Object.values(loadout.parameters?.modsByBucket || {}).flat()];
  const counts = {};
  for (const h of modHashes) { const d = m.items[h]; if (d) counts[d.n] = (counts[d.n] || 0) + 1; else unknown.push(h); }
  plan.mods = Object.entries(counts).map(([name, count]) => ({ name, count })).sort((a, b) => a.name.localeCompare(b.name));

  // Exotic from parameters when the armor itself isn't listed.
  const exHash = loadout.parameters?.exoticArmorHash;
  if (exHash > 0 && !plan.armor.some(a => a.exotic) && m.items[exHash]) {
    const def = m.items[exHash];
    const have = armorInv.filter(a => a.name === def.n && (cls === "Any" || a.cls === cls));
    const status = have.length ? "have" : "missing";
    plan.summary[status]++;
    plan.armor.push({ hash: exHash, name: def.n, slot: def.s || "", rarity: "Exotic", set: "", exotic: true, icon: def.i || "", status,
      have: have.map(a => ({ id: a.id, name: a.name, owner: a.owner, tier: a.tier, total: a.total })), sameSetOwned: 0, howToGet: have.length ? [] : howToGet(def) });
  }

  plan.armor.sort((a, b) => SLOTS.indexOf(a.slot) - SLOTS.indexOf(b.slot));
  plan.weapons.sort((a, b) => WEAPON_ORDER.indexOf(a.slot) - WEAPON_ORDER.indexOf(b.slot));

  // Set bonuses the loadout relies on (2+ pieces of one set).
  const setCount = {};
  plan.armor.forEach(a => { if (a.set) setCount[a.set] = (setCount[a.set] || 0) + 1; });
  plan.sets = Object.entries(setCount).filter(([, n]) => n >= 2).map(([name, pieces]) => ({ name, pieces: pieces >= 4 ? 4 : 2, owned: armorInv.some(a => a.set === name && a.cls === cls) }));

  plan.targets = targetsFrom(loadout.parameters, m);
  plan.weights = weightsFrom(plan.targets, plan.mods.flatMap(x => Array(x.count).fill(x.name)));

  // Settings for the armor builder: lock the exotic if you own it, ask for the set if you have its pieces.
  const ex = plan.armor.find(a => a.exotic);
  const set = plan.sets.find(s => s.owned);
  plan.search = {
    cls: cls === "Any" ? null : cls,
    exotic: ex && ex.status === "have" ? ex.name : "__any",
    exoticMissing: ex && ex.status !== "have" ? ex.name : null,
    setName: set ? set.name : "", setN: set ? set.pieces : 2,
    w: plan.weights, t: plan.targets
  };
  return plan;
}
