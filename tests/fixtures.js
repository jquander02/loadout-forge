// A tiny fake slice of Bungie's manifest and a shared loadout that uses it.
export const RAW_TABLES = {
  buckets: {
    10: { displayProperties: { name: "Helmet" } }, 11: { displayProperties: { name: "Gauntlets" } }, 12: { displayProperties: { name: "Chest Armor" } },
    13: { displayProperties: { name: "Leg Armor" } }, 14: { displayProperties: { name: "Class Armor" } },
    20: { displayProperties: { name: "Kinetic Weapons" } }, 21: { displayProperties: { name: "Energy Weapons" } }, 22: { displayProperties: { name: "Power Weapons" } },
    30: { displayProperties: { name: "Subclass" } }
  },
  damageTypes: { 1: { displayProperties: { name: "Kinetic" } }, 2: { displayProperties: { name: "Void" } }, 3: { displayProperties: { name: "Solar" } } },
  collectibles: { 500: { sourceString: "Source: Exotic mission \"Example\"" }, 501: { sourceString: "Source: Raid: Example Raid" } },
  sets: { 900: { displayProperties: { name: "Emberfall" } } },
  stats: { 7001: { displayProperties: { name: "Grenade" } }, 7002: { displayProperties: { name: "Class" } }, 7003: { displayProperties: { name: "Discipline" } } },
  items: {
    // subclass + plugs
    100: { displayProperties: { name: "Prismatic" }, itemType: 16, inventory: { bucketTypeHash: 30 } },
    101: { displayProperties: { name: "Stylish Executioner", description: "Defeat a debuffed target..." }, plug: { plugCategoryIdentifier: "hunter.prism.aspects" } },
    102: { displayProperties: { name: "Facet of Protection" }, plug: { plugCategoryIdentifier: "shared.prism.fragments" } },
    103: { displayProperties: { name: "Grapple" }, plug: { plugCategoryIdentifier: "hunter.prism.grenades" } },
    // weapons
    200: { displayProperties: { name: "Fatebringer" }, itemType: 3, itemTypeDisplayName: "Hand Cannon", inventory: { tierTypeName: "Legendary", bucketTypeHash: 20 }, defaultDamageTypeHash: 1, collectibleHash: 501 },
    201: { displayProperties: { name: "Funnelweb" }, itemType: 3, itemTypeDisplayName: "Submachine Gun", inventory: { tierTypeName: "Legendary", bucketTypeHash: 21 }, defaultDamageTypeHash: 2 },
    202: { displayProperties: { name: "Ice Breaker" }, itemType: 3, itemTypeDisplayName: "Sniper Rifle", inventory: { tierTypeName: "Exotic", bucketTypeHash: 22 }, defaultDamageTypeHash: 3, collectibleHash: 500 },
    210: { displayProperties: { name: "Explosive Payload" }, plug: { plugCategoryIdentifier: "frames" } },
    211: { displayProperties: { name: "Opening Shot" }, plug: { plugCategoryIdentifier: "frames" } },
    // armor
    300: { displayProperties: { name: "Wormhusk Crown" }, itemType: 2, classType: 1, inventory: { tierTypeName: "Exotic", bucketTypeHash: 10 }, collectibleHash: 500 },
    301: { displayProperties: { name: "Emberfall Gauntlets" }, itemType: 2, classType: 1, inventory: { tierTypeName: "Legendary", bucketTypeHash: 11 }, equippingBlock: { equipableItemSetHash: 900 } },
    302: { displayProperties: { name: "Emberfall Chest" }, itemType: 2, classType: 1, inventory: { tierTypeName: "Legendary", bucketTypeHash: 12 }, equippingBlock: { equipableItemSetHash: 900 } },
    // mods
    400: { displayProperties: { name: "Grenade Font" }, itemType: 19, plug: { plugCategoryIdentifier: "enhancements.v2_general" } },
    401: { displayProperties: { name: "Grenade Mod" }, itemType: 19, plug: { plugCategoryIdentifier: "enhancements.v2_general" } },
    // noise that should be dropped
    600: { displayProperties: { name: "Some Shader" }, plug: { plugCategoryIdentifier: "shader" } },
    601: { displayProperties: { name: "" }, itemType: 3 },
    602: { displayProperties: { name: "Classified" }, itemType: 2, redacted: true }
  }
};

export const SHARED_LOADOUT = {
  name: "Grenade Hunter",
  classType: 1,
  notes: "Spam grenades.",
  equipped: [
    { hash: 100, socketOverrides: { 0: 101, 1: 102, 2: 103 } },
    { hash: 200, socketOverrides: { 3: 210, 4: 211 } },
    { hash: 201 },
    { hash: 202 },
    { hash: 300 },
    { hash: 301 },
    { hash: 302 },
    { hash: 999999 }
  ],
  unequipped: [],
  parameters: { mods: [400, 400, 401], statConstraints: [{ statHash: 7001, minStat: 120 }, { statHash: 7003, minTier: 5 }] }
};
