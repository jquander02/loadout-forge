// Loadout search: picks one armor piece per slot and spends stat mods to best meet the player's priorities.
import { SLOTS, STAT_CAP, MOD_VALUE } from "./constants.js";
import { effStats } from "./evaluate.js";
import { sum } from "./csv.js";

export const SHORTFALL_PENALTY = 6; // score lost per stat point below a minimum
export const SEARCH_LIMIT = 2_500_000;

/**
 * Exhaustive search over prepared slots. Pure: safe to run in a Web Worker.
 * @param {object} d
 * @param {{s:number[], ex:boolean, inSet:boolean}[][]} d.slots five arrays of candidates
 * @param {number[]} d.w   weight per stat
 * @param {number[]} d.T   minimum per stat
 * @param {number}   d.K   number of +10 stat mods
 * @param {number}   d.setReq pieces of the chosen set required (0 = none)
 * @param {number}   d.exReq exotics required (0 or 1)
 * @param {number}   d.top how many builds to return
 */
export function runOptimizer(d) {
  const { slots, w, T, K, setReq, exReq, top } = d;
  const cap = STAT_CAP, step = MOD_VALUE, P = SHORTFALL_PENALTY;
  const n = slots.map(s => s.length);
  const st = slots.map(s => { const a = new Float64Array(s.length * 6); s.forEach((it, i) => { for (let k = 0; k < 6; k++) a[i * 6 + k] = it.s[k]; }); return a; });
  const ex = slots.map(s => Uint8Array.from(s.map(it => (it.ex ? 1 : 0))));
  const sm = slots.map(s => Uint8Array.from(s.map(it => (setReq && it.inSet ? 1 : 0))));
  const need = setReq || 0;
  const acc = new Float64Array(36), idx = [0, 0, 0, 0, 0], t = new Float64Array(6);
  let best = [], minScore = -Infinity, count = 0;
  // Per-stat value: weighted points up to the cap, minus a penalty for falling short of the minimum.
  // It is concave in v, so placing mods greedily one at a time is optimal.
  const g = (i, v) => w[i] * Math.min(v, cap) - P * Math.max(0, T[i] - v);
  function evaluate() {
    for (let k = 0; k < 6; k++) t[k] = acc[30 + k];
    const mods = [0, 0, 0, 0, 0, 0];
    for (let m = 0; m < K; m++) {
      let bi = -1, bg = 0;
      for (let k = 0; k < 6; k++) { const gg = g(k, t[k] + step) - g(k, t[k]); if (gg > bg + 1e-9) { bg = gg; bi = k; } }
      if (bi < 0) break;
      t[bi] += step; mods[bi] += step;
    }
    let sc = 0, tot = 0, def = 0, waste = 0;
    for (let k = 0; k < 6; k++) { sc += g(k, t[k]); tot += Math.min(t[k], cap); def += Math.max(0, T[k] - t[k]); waste += Math.max(0, t[k] - cap); }
    return { sc: sc + tot * 0.01, tot, def, waste, mods };
  }
  function rec(l, exc, setc) {
    if (l === 5) {
      if (setc < need || exc !== exReq) return;
      count++;
      const r = evaluate();
      if (best.length < top || r.sc > minScore) {
        r.idx = idx.slice(); r.final = Array.from(t);
        best.push(r); best.sort((a, b) => b.sc - a.sc);
        if (best.length > top) best.length = top;
        minScore = best.length === top ? best[top - 1].sc : -Infinity;
      }
      return;
    }
    const a = st[l], e = ex[l], s = sm[l], base = l * 6, nb = (l + 1) * 6, remaining = 4 - l;
    for (let i = 0; i < n[l]; i++) {
      const ne = exc + e[i];
      if (ne > exReq || ne + remaining < exReq) continue;
      if (setc + s[i] + remaining < need) continue;
      for (let k = 0; k < 6; k++) acc[nb + k] = acc[base + k] + a[i * 6 + k];
      idx[l] = i; rec(l + 1, ne, setc + s[i]);
    }
  }
  rec(0, 0, 0);
  return { best, count };
}

/** Drops candidates that another candidate in the same group beats or ties on every stat. */
export function pareto(items) {
  const keep = [];
  for (const a of items) {
    let dom = false;
    for (const b of items) {
      if (a === b || a.ex !== b.ex || a.inSet !== b.inSet || a.exName !== b.exName) continue;
      let ge = true, gt = false;
      for (let k = 0; k < 6; k++) { if (b.s[k] < a.s[k]) { ge = false; break; } if (b.s[k] > a.s[k]) gt = true; }
      if (ge && (gt || b.ref.id < a.ref.id)) { dom = true; break; }
    }
    if (!dom) keep.push(a);
  }
  return keep;
}

/**
 * Turns the player's armor and builder settings into an optimizer payload.
 * opts: { cls, exotic: "__any" | "__none" | exotic name, K, mw, setName, setN, includeVault, w, t, top }
 * Returns { error } or { payload, pruned, before }.
 */
export function prepareSearch(armor, opts) {
  const { cls, exotic, K, mw, setName, setN, includeVault, w, t, top = 8 } = opts;
  const pool = armor.filter(a => a.cls === cls && (includeVault || !a.owner || a.owner.toLowerCase() === cls.toLowerCase()));
  const exReq = exotic === "__none" ? 0 : 1;
  const slots = SLOTS.map(slot => {
    let items = pool.filter(a => a.slot === slot);
    if (exotic === "__none") items = items.filter(a => a.rarity !== "Exotic");
    else if (exotic !== "__any") items = items.filter(a => a.name === exotic || a.rarity !== "Exotic");
    return items.map(a => ({ ref: a, s: effStats(a, mw), ex: a.rarity === "Exotic", exName: a.rarity === "Exotic" ? a.name : "", inSet: !!setName && a.set === setName }));
  });
  if (exotic !== "__any" && exotic !== "__none") {
    // The chosen exotic's slot holds only that exotic.
    slots.forEach((s, i) => { if (s.some(x => x.exName === exotic)) slots[i] = s.filter(x => x.exName === exotic); });
    if (!slots.some(s => s.some(x => x.exName === exotic))) return { error: `No ${exotic} found for ${cls}.` };
  }
  const missing = SLOTS.filter((_, i) => !slots[i].length);
  if (missing.length) return { error: `No ${missing.join(", ")} found for ${cls}${includeVault ? "" : " on that character"}.` };

  const ws = w.map(x => x || 0.05);
  const fitOf = x => sum(x.s.map((v, k) => v * ws[k])) + (setName && x.inSet ? 40 : 0);
  const pruned = slots.map(s => pareto(s).map(x => ({ ...x, fit: fitOf(x) })).sort((a, b) => b.fit - a.fit));
  const before = slots.reduce((p, s) => p * s.length, 1);
  const product = () => pruned.reduce((p, s) => p * s.length, 1);
  // Cap the search size: trim the weakest pieces from the largest slot, but keep the top exotics and set pieces.
  while (product() > SEARCH_LIMIT) {
    let li = 0; pruned.forEach((s, i) => { if (s.length > pruned[li].length) li = i; });
    const s = pruned[li];
    let cut = -1;
    for (let j = s.length - 1; j >= 0; j--) {
      const x = s[j];
      const exRank = x.ex ? s.filter(y => y.ex && y.fit > x.fit).length : 99;
      const setRank = x.inSet ? s.filter(y => y.inSet && y.fit > x.fit).length : 99;
      if (exRank >= 3 && setRank >= 5) { cut = j; break; }
    }
    s.splice(cut < 0 ? s.length - 1 : cut, 1);
  }
  const payload = { slots: pruned.map(s => s.map(x => ({ s: x.s, ex: x.ex, inSet: x.inSet }))), w, T: t, K, setReq: setName ? setN : 0, exReq, top };
  return { payload, pruned, before, size: product() };
}

/** Attaches the actual items and pre-mod stat totals to optimizer results. */
export function hydrate(best, pruned) {
  return best.map(b => {
    const picks = b.idx.map((i, l) => pruned[l][i]);
    const base = [0, 0, 0, 0, 0, 0];
    picks.forEach(p => p.s.forEach((v, k) => (base[k] += v)));
    return { ...b, items: picks.map(p => p.ref), base };
  });
}

let worker = null;
/** Runs the search in a Web Worker when the browser allows it, on the main thread otherwise. */
export function optimize(payload) {
  return new Promise(resolve => {
    if (worker === null) {
      try { worker = new Worker(new URL("./optimizer.worker.js", import.meta.url), { type: "module" }); }
      catch (e) { worker = false; }
    }
    if (!worker) { setTimeout(() => resolve(runOptimizer(payload)), 20); return; }
    const done = e => { cleanup(); resolve(e.data); };
    const fail = () => { cleanup(); worker = false; resolve(runOptimizer(payload)); };
    const cleanup = () => { worker.removeEventListener("message", done); worker.removeEventListener("error", fail); };
    worker.addEventListener("message", done);
    worker.addEventListener("error", fail);
    worker.postMessage(payload);
  });
}
