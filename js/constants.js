// Armor 3.0 stat order used everywhere in the app.
export const STATS = ["Weapons", "Health", "Class", "Grenade", "Super", "Melee"];

// Pre-Edge of Fate names, mapped 1:1 onto STATS (Mobility became Weapons, and so on).
export const LEGACY = ["Mobility", "Resilience", "Recovery", "Discipline", "Intellect", "Strength"];

export const STAT_DESC = {
  Weapons: "Reload and handling · 101–200 adds weapon damage",
  Health: "Orb healing, flinch · 101–200 faster shields",
  Class: "Class ability regen · 101–200 overshield",
  Grenade: "Grenade regen · 101–200 grenade damage",
  Super: "Super energy gain · 101–200 Super damage",
  Melee: "Melee regen · 101–200 melee damage"
};

export const STAT_CAP = 200;
export const SLOTS = ["Helmet", "Gauntlets", "Chest Armor", "Leg Armor", "Class Item"];
export const CLASSES = ["Hunter", "Titan", "Warlock"];

// Archetype → [primary, secondary] as indexes into STATS.
// The first six shipped with Armor 3.0 (Edge of Fate); the rest arrived with Monument of Triumph.
// Powerhouse's secondary (Super) is inferred: it is the only pairing left unused.
export const ARCHETYPES = {
  Paragon: [4, 5], Grenadier: [3, 4], Specialist: [2, 0], Brawler: [5, 1], Bulwark: [1, 2], Gunner: [0, 3],
  Siegebreaker: [1, 3], Skirmisher: [5, 0], Demolitionist: [3, 2], Colossus: [4, 1], Reaver: [2, 5], Powerhouse: [0, 4]
};

// Priority labels → optimizer weight.
export const PRI = { 0: "Ignore", 1: "Low", 2: "Medium", 4: "High" };

// w = weights per stat, t = minimum targets per stat.
export const PRESETS = {
  "Custom": null,
  "Grenade spam": { w: [0, 1, 1, 4, 2, 0], t: [0, 0, 0, 100, 0, 0] },
  "Melee brawler": { w: [0, 2, 1, 0, 0, 4], t: [0, 0, 0, 0, 0, 100] },
  "Super uptime": { w: [0, 1, 1, 2, 4, 0], t: [0, 0, 0, 0, 100, 0] },
  "Endgame survival": { w: [2, 2, 4, 0, 0, 0], t: [0, 0, 100, 0, 0, 0] },
  "Gunslinger": { w: [4, 1, 2, 1, 0, 0], t: [100, 0, 0, 0, 0, 0] },
  "Balanced": { w: [2, 2, 2, 2, 2, 2], t: [0, 0, 0, 0, 0, 0] }
};

export const MOD_VALUE = 10;     // a major stat mod
export const MASTERWORK_BONUS = 5; // Armor 3.0: added to each stat the piece did not roll
export const LEGACY_MW_BONUS = 2;  // Armor 2.0: added to every stat
