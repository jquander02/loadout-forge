import { test } from "node:test";
import assert from "node:assert/strict";
import { effStats, dominates, computeVerdicts, computeRanks, computeWeaponDups } from "../js/evaluate.js";
import { buildTagsCSV, dimSearch } from "../js/dim.js";

const piece = (id, stats, extra = {}) => ({
  id, name: "Piece " + id, cls: "Hunter", slot: "Helmet", rarity: "Legendary", tier: 4, set: "", owner: "Vault",
  stats, total: stats.reduce((a, b) => a + b, 0), legacy: stats.filter(v => v > 0).length >= 5, tag: "", notes: "", hash: "h" + id, ...extra
});

test("effStats adds masterwork to unrolled stats on new armor, +2 everywhere on legacy", () => {
  assert.deepEqual(effStats(piece("a", [0, 0, 28, 30, 17, 0]), true), [5, 5, 28, 30, 17, 5]);
  assert.deepEqual(effStats(piece("b", [10, 10, 10, 10, 10, 10]), true), [12, 12, 12, 12, 12, 12]);
  assert.deepEqual(effStats(piece("c", [0, 0, 28, 30, 17, 0]), false), [0, 0, 28, 30, 17, 0]);
});

test("dominates respects slot, exotic identity, set and tier", () => {
  const weak = piece("1", [0, 0, 20, 25, 15, 0]);
  const strong = piece("2", [0, 0, 22, 25, 16, 0]);
  assert.ok(dominates(strong, weak));
  assert.ok(!dominates(weak, strong));
  assert.ok(!dominates({ ...strong, slot: "Gauntlets" }, weak));
  assert.ok(!dominates({ ...strong, tier: 3 }, weak), "lower tier never outclasses");
  assert.ok(!dominates({ ...strong, set: "Other" }, { ...weak, set: "Mine" }), "different set can't replace a set piece");
  const exA = piece("3", [0, 0, 20, 25, 15, 0], { rarity: "Exotic", name: "Wormhusk Crown" });
  const exB = piece("4", [0, 0, 30, 30, 20, 0], { rarity: "Exotic", name: "Other Exotic" });
  assert.ok(!dominates(exB, exA), "a different exotic doesn't replace this one");
  assert.ok(!dominates(strong, exA), "a legendary doesn't replace an exotic");
});

test("exact duplicates: one kept, one outclassed", () => {
  const list = computeVerdicts([piece("10", [0, 0, 20, 25, 15, 0]), piece("11", [0, 0, 20, 25, 15, 0])]);
  assert.deepEqual(list.map(a => a.verdict).sort(), ["junk", "keep"]);
});

test("computeVerdicts labels legacy armor", () => {
  const [a] = computeVerdicts([piece("x", [10, 12, 9, 11, 14, 8])]);
  assert.equal(a.verdict, "legacy");
});

test("computeRanks orders by weighted stats within a slot", () => {
  const list = [piece("1", [0, 0, 30, 0, 0, 0]), piece("2", [0, 0, 0, 30, 0, 0])];
  computeRanks(list, [0, 0, 0, 4, 0, 0]);
  assert.equal(list[1].rank, 1);
  assert.equal(list[0].rank, 2);
});

test("computeWeaponDups ranks copies by tier, crafted, tag, power", () => {
  const w = (id, extra) => ({ id, name: "Funnelweb", tier: 3, crafted: false, tag: "", power: 550, ...extra });
  const list = computeWeaponDups([w("a", {}), w("b", { tier: 5 }), w("c", { tag: "junk" })]);
  const byId = Object.fromEntries(list.map(x => [x.id, x]));
  assert.equal(byId.b.copyRank, 1);
  assert.equal(byId.a.copyRank, 2);
  assert.equal(byId.c.copyRank, 3);
  assert.ok(list.every(x => x.copies === 3));
});

test("DIM tags CSV includes only untagged outclassed armor and keeps notes", () => {
  const list = computeVerdicts([
    piece("1", [0, 0, 20, 25, 15, 0], { notes: "raid, piece" }),
    piece("2", [0, 0, 22, 26, 16, 0]),
    piece("3", [0, 0, 10, 10, 10, 0], { tag: "favorite" })
  ]);
  const { count, csv } = buildTagsCSV(list);
  assert.equal(count, 1);
  const lines = csv.split("\n");
  assert.equal(lines[0], "Id,Hash,Tag,Notes");
  assert.match(lines[1], /^1,h1,junk,"raid, piece \| Loadout Forge: Outclassed by Piece 2/);
});

test("dimSearch joins item ids", () => {
  assert.equal(dimSearch({ armor: [{ id: "1" }, { id: "row5" }], weapons: [{ id: "9" }] }), "id:1 or id:9");
});
