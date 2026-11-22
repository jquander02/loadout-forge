import { test } from "node:test";
import assert from "node:assert/strict";
import { runOptimizer, prepareSearch, hydrate, pareto } from "../js/optimizer.js";
import { parseCSV, detectArmor, normalizeArmor } from "../js/csv.js";
import { sampleCSVs } from "../js/sample.js";

const cand = (s, extra = {}) => ({ s, ex: false, inSet: false, ...extra });

/** Brute-force reference: every combination, best mod placement by trying all allocations. */
function bruteBest(slots, w, T, K, exReq) {
  const g = (i, v) => w[i] * Math.min(v, 200) - 6 * Math.max(0, T[i] - v);
  const allocs = [];
  (function gen(prefix, left, k) {
    if (k === 5) { allocs.push([...prefix, left]); return; }
    for (let x = 0; x <= left; x++) gen([...prefix, x], left - x, k + 1);
  })([], K, 0);
  let best = -Infinity;
  const rec = (l, acc, exc) => {
    if (l === 5) {
      if (exc !== exReq) return;
      for (const a of allocs) {
        let sc = 0, tot = 0;
        for (let k = 0; k < 6; k++) { const v = acc[k] + a[k] * 10; sc += g(k, v); tot += Math.min(v, 200); }
        best = Math.max(best, sc + tot * 0.01);
      }
      return;
    }
    for (const it of slots[l]) rec(l + 1, acc.map((v, k) => v + it.s[k]), exc + (it.ex ? 1 : 0));
  };
  rec(0, [0, 0, 0, 0, 0, 0], 0);
  return best;
}

test("greedy mod placement matches brute force on random small inventories", () => {
  let seed = 7; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  for (let trial = 0; trial < 15; trial++) {
    const slots = Array.from({ length: 5 }, () => Array.from({ length: 3 }, () => cand(Array.from({ length: 6 }, () => Math.floor(rnd() * 32)))));
    const w = Array.from({ length: 6 }, () => [0, 1, 2, 4][Math.floor(rnd() * 4)]);
    const T = Array.from({ length: 6 }, () => (rnd() < 0.3 ? 100 : 0));
    const K = Math.floor(rnd() * 4);
    const { best } = runOptimizer({ slots, w, T, K, setReq: 0, exReq: 0, top: 1 });
    assert.ok(Math.abs(best[0].sc - bruteBest(slots, w, T, K, 0)) < 1e-6, `trial ${trial}`);
  }
});

test("exactly one exotic when required, none when not", () => {
  const slots = Array.from({ length: 5 }, () => [cand([0, 0, 0, 40, 0, 0], { ex: true }), cand([0, 0, 0, 20, 0, 0])]);
  const one = runOptimizer({ slots, w: [0, 0, 0, 4, 0, 0], T: [0, 0, 0, 0, 0, 0], K: 0, setReq: 0, exReq: 1, top: 3 });
  for (const b of one.best) assert.equal(b.idx.filter((i, l) => slots[l][i].ex).length, 1);
  assert.equal(one.best[0].final[3], 40 + 4 * 20);
  const none = runOptimizer({ slots, w: [0, 0, 0, 4, 0, 0], T: [0, 0, 0, 0, 0, 0], K: 0, setReq: 0, exReq: 0, top: 1 });
  assert.equal(none.best[0].final[3], 100);
});

test("set requirement is honored even when set pieces are weaker", () => {
  const slots = Array.from({ length: 5 }, () => [cand([0, 0, 0, 30, 0, 0]), cand([0, 0, 0, 10, 0, 0], { inSet: true })]);
  const r = runOptimizer({ slots, w: [0, 0, 0, 4, 0, 0], T: [0, 0, 0, 0, 0, 0], K: 0, setReq: 4, exReq: 0, top: 1 });
  assert.equal(r.best[0].idx.filter((i, l) => slots[l][i].inSet).length, 4);
});

test("mods go to unmet minimums first and nothing is spent past 200", () => {
  const slots = Array.from({ length: 5 }, () => [cand([0, 0, 0, 45, 0, 0])]);
  const r = runOptimizer({ slots, w: [0, 0, 0, 4, 0, 0], T: [0, 30, 0, 0, 0, 0], K: 5, setReq: 0, exReq: 0, top: 1 });
  const b = r.best[0];
  assert.equal(b.final[1], 30, "Health minimum met");
  assert.equal(b.final[3], 225);
  assert.equal(b.mods[3], 0, "Grenade already at 225 gets no mods");
  assert.equal(b.def, 0);
});

test("pareto drops dominated candidates but keeps exotics separate", () => {
  const ref = id => ({ id });
  const a = { ...cand([10, 10, 0, 0, 0, 0]), ref: ref("a"), exName: "" };
  const b = { ...cand([12, 10, 0, 0, 0, 0]), ref: ref("b"), exName: "" };
  const e = { ...cand([5, 5, 0, 0, 0, 0], { ex: true }), ref: ref("e"), exName: "X" };
  assert.deepEqual(pareto([a, b, e]).map(x => x.ref.id), ["b", "e"]);
});

test("end to end on the sample inventory", () => {
  const { armorCSV } = sampleCSVs();
  const rows = parseCSV(armorCSV);
  const armor = normalizeArmor(rows, detectArmor(rows));
  const opts = { cls: "Hunter", exotic: "__any", K: 5, mw: true, setName: "", setN: 2, includeVault: true, w: [0, 1, 1, 4, 2, 0], t: [0, 0, 0, 100, 0, 0] };
  const prep = prepareSearch(armor, opts);
  assert.equal(prep.error, undefined);
  const res = runOptimizer(prep.payload);
  const builds = hydrate(res.best, prep.pruned);
  assert.ok(builds.length > 0);
  const top = builds[0];
  assert.equal(top.items.length, 5);
  assert.equal(top.items.filter(i => i.rarity === "Exotic").length, 1);
  assert.ok(top.final[3] >= 100, "meets the Grenade minimum");
  assert.deepEqual(top.items.map(i => i.slot), ["Helmet", "Gauntlets", "Chest Armor", "Leg Armor", "Class Item"]);
  // A specific exotic is respected
  const fixed = prepareSearch(armor, { ...opts, exotic: "Wormhusk Crown" });
  const fr = hydrate(runOptimizer(fixed.payload).best, fixed.pruned);
  assert.equal(fr[0].items[0].name, "Wormhusk Crown");
  // Unknown exotic gives a readable error
  assert.match(prepareSearch(armor, { ...opts, exotic: "Nope" }).error, /No Nope/);
});
