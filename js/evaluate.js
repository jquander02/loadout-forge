// Judging gear: keep / outclassed / legacy verdicts, slot rankings, weapon duplicates.
import { MASTERWORK_BONUS, LEGACY_MW_BONUS } from "./constants.js";
import { sum } from "./csv.js";

/** Stats a piece will have in game, optionally assuming it is fully masterworked. */
export function effStats(it, mw) {
  const s = it.stats.slice();
  if (mw) {
    if (it.legacy) for (let k = 0; k < 6; k++) s[k] += LEGACY_MW_BONUS;
    else for (let k = 0; k < 6; k++) if (s[k] === 0) s[k] += MASTERWORK_BONUS;
  }
  return s;
}

/** Does piece b make piece a redundant? Same class, slot, exotic (or both legendary), set and no lower tier. */
export function dominates(b, a) {
  if (b === a || b.cls !== a.cls || b.slot !== a.slot) return false;
  if (a.rarity === "Exotic" ? b.name !== a.name : b.rarity !== "Legendary") return false;
  if (a.set && b.set !== a.set) return false;
  if (a.tier && b.tier && b.tier < a.tier) return false;
  let strict = false;
  for (let k = 0; k < 6; k++) { if (b.stats[k] < a.stats[k]) return false; if (b.stats[k] > a.stats[k]) strict = true; }
  return strict || b.id < a.id; // exact copies: keep exactly one
}

export function groupBy(list, keyFn) {
  const g = {};
  for (const x of list) (g[keyFn(x)] ||= []).push(x);
  return g;
}

/** Sets verdict ("keep" | "junk" | "legacy") and reason on each armor piece. Mutates. */
export function computeVerdicts(list) {
  for (const g of Object.values(groupBy(list, a => a.cls + "|" + a.slot))) {
    for (const a of g) {
      const b = g.find(x => dominates(x, a));
      if (b) { a.verdict = "junk"; a.reason = "Outclassed by " + b.name + (b.owner ? " (" + b.owner + ")" : ""); }
      else if (a.legacy) { a.verdict = "legacy"; a.reason = "Pre–Armor 3.0 stat spread"; }
      else { a.verdict = "keep"; a.reason = ""; }
    }
  }
  return list;
}

/** Ranks each piece within its class + slot for a set of stat weights. Mutates. */
export function computeRanks(list, w) {
  const ws = sum(w) || 1;
  for (const g of Object.values(groupBy(list, a => a.cls + "|" + a.slot))) {
    g.forEach(a => { a.fit = sum(a.stats.map((v, k) => v * w[k])) / ws + a.total * 0.001; });
    g.slice().sort((x, y) => y.fit - x.fit).forEach((a, i) => {
      a.rank = i + 1; a.rankOf = g.length; a.rankPct = g.length > 1 ? 1 - i / (g.length - 1) : 1;
    });
  }
  return list;
}

const TAG_SCORE = { favorite: 3, keep: 2, "": 1, archive: 0, infuse: -1, junk: -2 };

/** Ranks copies of the same weapon: gear tier, crafted, DIM tag, power. Mutates. */
export function computeWeaponDups(list) {
  for (const g of Object.values(groupBy(list, w => w.name))) {
    g.sort((a, b) => (b.tier - a.tier) || (b.crafted - a.crafted) || ((TAG_SCORE[b.tag] ?? 1) - (TAG_SCORE[a.tag] ?? 1)) || (b.power - a.power));
    g.forEach((w, i) => { w.copies = g.length; w.copyRank = i + 1; });
  }
  return list;
}
