// Deterministic example gear in DIM's CSV format, so the app can be tried without an export.
// Set names are invented; exotic names are real items. IDs are fake and won't match anything in DIM.
import { STATS, CLASSES, SLOTS, ARCHETYPES } from "./constants.js";
import { sum } from "./csv.js";

export function sampleCSVs(seedValue = 42) {
  let seed = seedValue;
  const rnd = () => (seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296;
  const pick = a => a[Math.floor(rnd() * a.length)];
  const q = v => '"' + String(v).replace(/"/g, '""') + '"';
  const sets = ["Ironwake", "Driftline", "Emberfall", "Hollowpoint"];
  const exotics = {
    Hunter: [["Wormhusk Crown", "Helmet"], ["Liar's Handshake", "Gauntlets"], ["Gyrfalcon's Hauberk", "Chest Armor"], ["St0mp-EE5", "Leg Armor"]],
    Titan: [["Helm of Saint-14", "Helmet"], ["Synthoceps", "Gauntlets"], ["Heart of Inmost Light", "Chest Armor"], ["Peregrine Greaves", "Leg Armor"]],
    Warlock: [["Necrotic Grip", "Gauntlets"], ["Getaway Artist", "Gauntlets"], ["Starfire Protocol", "Chest Armor"], ["Transversive Steps", "Leg Armor"]]
  };
  const classItem = { Hunter: "Hunter Cloak", Titan: "Titan Mark", Warlock: "Warlock Bond" };
  const owners = ["Vault", "Vault", "Vault", "Hunter", "Titan", "Warlock"];
  const totals = { 1: 50, 2: 56, 3: 62, 4: 69, 5: 75 };
  let id = 6917529900000000000n;

  const roll = tier => {
    const [p, s] = pick(Object.values(ARCHETYPES));
    const t = pick([0, 1, 2, 3, 4, 5].filter(x => x !== p && x !== s));
    const scale = totals[tier] / 75, st = [0, 0, 0, 0, 0, 0];
    st[p] = Math.round(30 * scale);
    st[s] = Math.round((22 + rnd() * 6) * scale);
    st[t] = Math.round(totals[tier] - st[p] - st[s]);
    return st;
  };

  const head = ["Name", "Hash", "Id", "Tag", "Rarity", "Tier", "Type", "Equippable", "Power", "Owner", "Armor Set", ...STATS.map(s => s + " (Base)"), "Total (Base)", "Notes"];
  const lines = [head.join(",")];
  const push = (name, rarity, tier, type, cls, st, set) => {
    id += BigInt(Math.floor(rnd() * 99999) + 1);
    lines.push([q(name), Math.floor(rnd() * 4e9), q(id), "", rarity, tier ? "Tier " + tier : "", q(type), cls, 550 + Math.floor(rnd() * 10), pick(["Vault", "Vault", "Vault", cls]), set, ...st, sum(st), ""].join(","));
  };
  for (const cls of CLASSES) {
    for (const slot of SLOTS) {
      const type = slot === "Class Item" ? classItem[cls] : slot;
      for (let i = 0; i < 9; i++) {
        const set = pick(sets), tier = 2 + Math.floor(rnd() * 4);
        push(set + " " + (slot === "Class Item" ? type.split(" ")[1] : slot.split(" ")[0]), "Legendary", tier, type, cls, roll(tier), set);
      }
      push("Old Reliable " + slot.split(" ")[0], "Legendary", 0, type, cls, [0, 0, 0, 0, 0, 0].map(() => 2 + Math.floor(rnd() * 20)), "");
    }
    for (const [name, slot] of exotics[cls]) for (let c = 0; c < 2; c++) {
      const tier = 3 + Math.floor(rnd() * 3);
      push(name, "Exotic", tier, slot, cls, roll(tier), "");
    }
  }

  const W = [
    ["Fatebringer", "Hand Cannon", "Kinetic", ["Explosive Payload*", "Firefly"], ["Opening Shot*", "Kill Clip"]],
    ["Fatebringer", "Hand Cannon", "Kinetic", ["Explosive Payload*"], ["Rampage*", "Kill Clip"]],
    ["Funnelweb", "Submachine Gun", "Void", ["Subsistence*"], ["Frenzy*"]],
    ["Funnelweb", "Submachine Gun", "Void", ["Threat Detector*"], ["Kill Clip*"]],
    ["Funnelweb", "Submachine Gun", "Void", ["Subsistence*"], ["Repulsor Brace*"]],
    ["Calus Mini-Tool", "Submachine Gun", "Solar", ["Grave Robber*"], ["Incandescent*"]],
    ["Edge Transit", "Grenade Launcher", "Void", ["Envious Assassin*"], ["Bait and Switch*"]],
    ["Apex Predator", "Rocket Launcher", "Solar", ["Reconstruction*"], ["Bait and Switch*"]],
    ["Apex Predator", "Rocket Launcher", "Solar", ["Auto-Loading Holster*"], ["Explosive Light*"]],
    ["Mountaintop", "Grenade Launcher", "Kinetic", ["Clown Cartridge*"], ["Recombination*"]],
    ["Rose", "Hand Cannon", "Arc", ["Rapid Hit*"], ["Kill Clip*"]],
    ["Riskrunner", "Submachine Gun", "Arc", ["Arc Conductor*"], ["Superconductor*"]],
    ["Gjallarhorn", "Rocket Launcher", "Solar", ["Wolfpack Rounds*"], ["Pack Hunter*"]],
    ["Cataclysmic", "Linear Fusion Rifle", "Solar", ["Fourth Time's the Charm*"], ["Bait and Switch*"]],
    ["Cataclysmic", "Linear Fusion Rifle", "Solar", ["Envious Assassin*"], ["Firing Line*"]]
  ];
  const wHead = ["Name", "Hash", "Id", "Tag", "Rarity", "Tier", "Type", "Element", "Power", "Owner", "Crafted", "Perks 0", "Perks 1", "Perks 2", "Perks 3", "Notes"];
  const wl = [wHead.join(",")];
  W.forEach(([n, t, e, p3, p4], i) => {
    id += 7777n;
    const ex = ["Riskrunner", "Gjallarhorn"].includes(n);
    wl.push([q(n), 1000 + i, q(id), i === 4 ? "junk" : "", ex ? "Exotic" : "Legendary", ex ? "" : "Tier " + (2 + (i % 4)), q(t), e, 555, pick(owners),
      i % 5 === 0 ? "true" : "false", q("Barrel*"), q("Magazine*"), q(p3.join(", ")), q(p4.join(", ")), ""].join(","));
  });
  return { armorCSV: lines.join("\n"), weaponCSV: wl.join("\n") };
}
