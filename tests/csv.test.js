import { test } from "node:test";
import assert from "node:assert/strict";
import { parseCSV, detectArmor, detectWeapons, looksLikeArmor, normalizeArmor, normalizeWeapons, archetypeOf, inferTier, slotOf } from "../js/csv.js";

test("parseCSV handles quotes, escaped quotes, CRLF and a BOM", () => {
  const rows = parseCSV('﻿Name,Notes\r\n"Liar\'s Handshake","said ""hi"", twice"\r\nPlain,\n');
  assert.deepEqual(rows, [["Name", "Notes"], ["Liar's Handshake", 'said "hi", twice'], ["Plain", ""]]);
});

const ARMOR_3 = [
  "Name,Hash,Id,Tag,Rarity,Tier,Type,Equippable,Owner,Armor Set,Weapons (Base),Health (Base),Class (Base),Grenade (Base),Super (Base),Melee (Base),Notes",
  'Emberfall Helmet,1,"6917529001",,Legendary,Tier 5,Helmet,Hunter,Vault,Emberfall,0,0,28,30,17,0,',
  'Wormhusk Crown,2,"6917529002",keep,Exotic,Tier 4,Helmet,Hunter,Hunter,,0,0,30,0,21,18,',
  'Old Helm,3,"6917529003",,Legendary,,Helmet,Hunter,Vault,,10,12,9,11,14,8,',
  'Some Bond,4,"6917529004",,Legendary,Tier 3,Warlock Bond,Warlock,Vault,,24,0,0,0,18,20,'
].join("\n");

test("detects Armor 3.0 columns, gear tier and set", () => {
  const rows = parseCSV(ARMOR_3);
  assert.ok(looksLikeArmor(rows));
  const m = detectArmor(rows);
  assert.ok(m.ok);
  assert.ok(m.statsAreBase);
  assert.equal(rows[0][m.gear], "Tier");
  assert.equal(rows[0][m.rarity], "Rarity");
  assert.equal(rows[0][m.set], "Armor Set");
  const items = normalizeArmor(rows, m);
  assert.equal(items.length, 4);
  const [ember, worm, old, bond] = items;
  assert.equal(ember.id, "6917529001");
  assert.equal(ember.tier, 5);
  assert.equal(ember.archetype, "Demolitionist"); // Grenade primary, Class secondary
  assert.equal(worm.rarity, "Exotic");
  assert.equal(worm.archetype, ""); // Class + Super is not a known archetype pairing
  assert.equal(old.legacy, true);
  assert.equal(bond.slot, "Class Item");
  assert.equal(bond.cls, "Warlock");
});

test("legacy stat names and rarity-in-Tier column still work", () => {
  const csv = [
    "Name,Id,Tier,Type,Equippable,Mobility (Base),Resilience (Base),Recovery (Base),Discipline (Base),Intellect (Base),Strength (Base)",
    'Helm,"1",Legendary,Helmet,Titan,10,20,10,10,6,8'
  ].join("\n");
  const rows = parseCSV(csv);
  const m = detectArmor(rows);
  assert.ok(m.ok);
  assert.equal(rows[0][m.rarity], "Tier");
  assert.equal(m.gear, -1);
  const [h] = normalizeArmor(rows, m);
  assert.deepEqual(h.stats, [10, 20, 10, 10, 6, 8]);
  assert.equal(h.legacy, true);
});

test("a numeric 'Class' stat column is not mistaken for the character class", () => {
  const csv = [
    "Name,Id,Rarity,Type,Equippable,Weapons,Health,Class,Grenade,Super,Melee",
    'Gloves,"1",Legendary,Gauntlets,Hunter,30,0,25,0,0,20'
  ].join("\n");
  const rows = parseCSV(csv);
  const m = detectArmor(rows);
  assert.ok(m.ok);
  assert.equal(m.statsAreBase, false);
  const [g] = normalizeArmor(rows, m);
  assert.equal(g.cls, "Hunter");
  assert.deepEqual(g.stats, [30, 0, 25, 0, 0, 20]);
});

test("archetypeOf maps top two stats to the right archetype", () => {
  assert.deepEqual(archetypeOf([0, 0, 0, 30, 25, 20]), { name: "Grenadier", tert: 5 });
  assert.deepEqual(archetypeOf([0, 30, 25, 0, 0, 20]), { name: "Bulwark", tert: 5 });
  assert.deepEqual(archetypeOf([0, 0, 0, 0, 0, 0]), { name: "", tert: -1 });
});

test("inferTier and slotOf", () => {
  assert.equal(inferTier(75), 5);
  assert.equal(inferTier(66), 4);
  assert.equal(inferTier(50), 1);
  assert.equal(slotOf("Hunter Cloak"), "Class Item");
  assert.equal(slotOf("Chest Armor"), "Chest Armor");
  assert.equal(slotOf("Hand Cannon"), null);
});

test("weapons: perks with selected markers, slot guesses, crafted", () => {
  const csv = [
    "Name,Id,Rarity,Tier,Type,Element,Power,Crafted,Perks 0,Perks 1",
    '"Fatebringer","11",Legendary,Tier 5,Hand Cannon,Kinetic,550,true,"Explosive Payload*, Firefly","Opening Shot*"',
    '"Apex Predator","12",Legendary,Tier 3,Rocket Launcher,Solar,550,false,"Reconstruction*",""',
    '"Rose","13",Legendary,,Hand Cannon,Arc,550,false,"",""'
  ].join("\n");
  const rows = parseCSV(csv);
  assert.equal(looksLikeArmor(rows), false);
  const m = detectWeapons(rows);
  assert.ok(m.ok);
  const [fb, apex, rose] = normalizeWeapons(rows, m);
  assert.equal(fb.slot, "Kinetic");
  assert.equal(apex.slot, "Power");
  assert.equal(rose.slot, "Energy");
  assert.equal(fb.tier, 5);
  assert.equal(fb.crafted, true);
  assert.deepEqual(fb.perks, [{ n: "Explosive Payload", on: true }, { n: "Firefly", on: false }, { n: "Opening Shot", on: true }]);
});
