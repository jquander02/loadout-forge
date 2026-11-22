import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawn } from "node:child_process";
import { slimManifest } from "../server/manifest.js";
import { parseLoadoutInput, findDimLinkInHtml } from "../server/dim.js";
import { planLoadout, targetsFrom, weightsFrom, statIndex } from "../server/plan.js";
import { RAW_TABLES, SHARED_LOADOUT } from "./fixtures.js";

const M = slimManifest(RAW_TABLES, "test-1");

test("slimManifest keeps gear and useful plugs, drops shaders, blanks and redacted items", () => {
  assert.equal(M.items[200].n, "Fatebringer");
  assert.equal(M.items[200].s, "Kinetic");
  assert.equal(M.items[200].e, "Kinetic");
  assert.equal(M.items[200].src, "Source: Raid: Example Raid");
  assert.equal(M.items[300].c, "Hunter");
  assert.equal(M.items[300].s, "Helmet");
  assert.equal(M.items[301].set, "Emberfall");
  assert.equal(M.items[101].p, "hunter.prism.aspects");
  assert.equal(M.items[600], undefined);
  assert.equal(M.items[601], undefined);
  assert.equal(M.items[602], undefined);
  assert.equal(M.stats[7001], "Grenade");
});

test("parseLoadoutInput recognizes every supported input", () => {
  const share = parseLoadoutInput("https://dim.gg/3hds4wy/Equipped");
  assert.deepEqual([share.kind, share.shareId], ["dimShare", "3hds4wy"]);
  assert.equal(parseLoadoutInput("dim.gg/abc123").shareId, "abc123");
  const enc = encodeURIComponent(JSON.stringify(SHARED_LOADOUT));
  const dimUrl = parseLoadoutInput(`https://app.destinyitemmanager.com/loadouts?loadout=${enc}`);
  assert.equal(dimUrl.kind, "dimUrl");
  assert.equal(dimUrl.loadout.name, "Grenade Hunter");
  assert.equal(parseLoadoutInput(JSON.stringify({ loadout: SHARED_LOADOUT })).loadout.classType, 1);
  assert.equal(parseLoadoutInput("https://www.light.gg/loadouts/2733505/").url, "https://www.light.gg/loadouts/2733505/export");
  assert.match(parseLoadoutInput("https://example.com/x").error, /can't read links from example\.com/);
  assert.match(parseLoadoutInput("").error, /Paste/);
  assert.match(parseLoadoutInput("{bad json").error, /couldn't be read/);
  assert.match(parseLoadoutInput('{"name":"x"}').error, /No equipped items/);
});

test("findDimLinkInHtml pulls the DIM link out of a light.gg export page", () => {
  const html = `<a class="btn" href="https://app.destinyitemmanager.com/loadouts?class=1&amp;loadout=%7B%22equipped%22%3A%5B%5D%7D">Continue to DIM</a>`;
  const link = findDimLinkInHtml(html);
  assert.equal(parseLoadoutInput(link).loadout.equipped.length, 0);
  assert.equal(findDimLinkInHtml("<html>nothing</html>"), null);
});

test("stat helpers read Armor 3.0 and legacy constraints", () => {
  assert.equal(statIndex("Grenade"), 3);
  assert.equal(statIndex("discipline"), 3);
  assert.deepEqual(targetsFrom({ statConstraints: [{ statHash: 7002, minTier: 8 }, { statHash: 7001, minStat: 150 }] }, M), [0, 0, 80, 150, 0, 0]);
  assert.deepEqual(weightsFrom([0, 0, 0, 0, 0, 0], ["Grenade Font", "Grenade Font"]), [0, 0, 0, 2, 0, 0]);
  assert.deepEqual(weightsFrom([0, 0, 0, 0, 0, 0], []), [2, 2, 2, 2, 2, 2]);
});

const INVENTORY = {
  armor: [
    { id: "a1", hash: "300", name: "Wormhusk Crown", cls: "Hunter", slot: "Helmet", rarity: "Exotic", set: "", owner: "Vault", tier: 4, total: 69 },
    { id: "a2", hash: "777", name: "Other Gauntlets", cls: "Hunter", slot: "Gauntlets", rarity: "Legendary", set: "Emberfall", owner: "Vault", tier: 5, total: 75 },
    { id: "a3", hash: "778", name: "Emberfall Chest", cls: "Hunter", slot: "Chest Armor", rarity: "Legendary", set: "Emberfall", owner: "Hunter", tier: 5, total: 75 }
  ],
  weapons: [
    { id: "w1", hash: "200", name: "Fatebringer", type: "Hand Cannon", element: "Kinetic", tier: 5, rarity: "Legendary", owner: "Vault", copyRank: 1, perks: [{ n: "Explosive Payload", on: true }, { n: "Rampage", on: true }] },
    { id: "w2", hash: "888", name: "Calus Mini-Tool", type: "Submachine Gun", element: "Solar", tier: 3, rarity: "Legendary", owner: "Vault", copyRank: 1, perks: [] },
    { id: "w3", hash: "889", name: "Riptide-ish", type: "Submachine Gun", element: "Void", tier: 2, rarity: "Legendary", owner: "Vault", copyRank: 1, perks: [] }
  ]
};

test("planLoadout sorts items into have / stand-in / missing with sources", () => {
  const p = planLoadout(SHARED_LOADOUT, M, INVENTORY);
  assert.equal(p.cls, "Hunter");
  assert.equal(p.subclass.name, "Prismatic");
  assert.deepEqual(p.subclass.parts.map(x => x.kind), ["Aspect", "Fragment", "Grenade"]);
  const [fate, funnel, ice] = p.weapons;
  assert.equal(fate.status, "have");
  assert.deepEqual(fate.have[0].perksMatched, ["Explosive Payload"]);
  assert.equal(funnel.status, "substitute");
  assert.equal(funnel.alternatives[0].name, "Riptide-ish", "same element ranks first");
  assert.equal(ice.status, "missing");
  assert.deepEqual(ice.howToGet, ['Exotic mission "Example"', "If you've had it before, pull it from Collections."]);
  const helm = p.armor.find(a => a.slot === "Helmet");
  assert.equal(helm.status, "have");
  const gloves = p.armor.find(a => a.slot === "Gauntlets");
  assert.equal(gloves.status, "substitute");
  assert.equal(gloves.sameSetOwned, 1);
  assert.equal(p.armor.find(a => a.slot === "Chest Armor").status, "have");
  assert.deepEqual(p.sets, [{ name: "Emberfall", pieces: 2, owned: true }]);
  assert.deepEqual(p.mods, [{ name: "Grenade Font", count: 2 }, { name: "Grenade Mod", count: 1 }]);
  assert.deepEqual(p.targets, [0, 0, 0, 120, 0, 0]);
  assert.deepEqual(p.search, { cls: "Hunter", exotic: "Wormhusk Crown", exoticMissing: null, setName: "Emberfall", setN: 2, w: [0, 0, 0, 4, 0, 0], t: [0, 0, 0, 120, 0, 0] });
  assert.deepEqual(p.unknown, [999999]);
  assert.deepEqual(p.summary, { have: 3, substitute: 2, missing: 1 });
});

test("a missing exotic falls back to the best owned exotic", () => {
  const p = planLoadout(SHARED_LOADOUT, M, { armor: INVENTORY.armor.slice(1), weapons: [] });
  assert.equal(p.search.exotic, "__any");
  assert.equal(p.search.exoticMissing, "Wormhusk Crown");
  assert.equal(p.armor.find(a => a.exotic).howToGet[0], 'Exotic mission "Example"');
});

// ---- The real server, run against a temporary data folder (no internet needed) ----
let proc, dir;
const PORT = 7790, BASE = `http://localhost:${PORT}`;
before(async () => {
  dir = await mkdtemp(join(tmpdir(), "lf-"));
  await writeFile(join(dir, "manifest.json"), JSON.stringify(M));
  proc = spawn(process.execPath, ["server/index.js"], { env: { ...process.env, PORT: String(PORT), LOADOUT_FORGE_DATA: dir }, stdio: "pipe" });
  await new Promise((resolve, reject) => {
    proc.stdout.on("data", d => { if (String(d).includes("running at")) resolve(); });
    proc.on("exit", c => reject(new Error("server exited " + c)));
    setTimeout(() => reject(new Error("server didn't start")), 5000);
  });
});
after(async () => { proc?.kill(); await rm(dir, { recursive: true, force: true }); });

test("server: storage, settings masking, plan endpoint, and request guards", async () => {
  const j = (path, opts = {}) => fetch(BASE + path, { ...opts, headers: { "Content-Type": "application/json", ...(opts.headers || {}) } });
  assert.equal((await j("/api/store/armor", { method: "PUT", body: JSON.stringify({ value: { items: INVENTORY.armor, meta: {} } }) })).status, 200);
  assert.equal((await j("/api/store/weapons", { method: "PUT", body: JSON.stringify({ value: { items: INVENTORY.weapons, meta: {} } }) })).status, 200);
  assert.equal((await (await j("/api/store/armor")).json()).value.items.length, 3);

  const st = await (await j("/api/settings", { method: "POST", body: JSON.stringify({ bungieApiKey: "abcdef123456" }) })).json();
  assert.equal(st.bungieApiKey, "••••3456");
  assert.equal(st.hasBungieKey, true);
  const status = await (await j("/api/status")).json();
  assert.equal(status.manifest.ready, true);
  assert.ok(!JSON.stringify(status).includes("abcdef123456"), "the key itself never reaches the page");

  const plan = await (await j("/api/plan", { method: "POST", body: JSON.stringify({ input: JSON.stringify(SHARED_LOADOUT) }) })).json();
  assert.equal(plan.source, "Pasted JSON");
  assert.equal(plan.plan.weapons[0].status, "have");
  const bad = await j("/api/plan", { method: "POST", body: JSON.stringify({ input: "https://dim.gg/abc" }) });
  assert.equal(bad.status, 500);
  assert.match((await bad.json()).error, /DIM API key/);

  assert.equal((await j("/api/settings", { method: "POST", headers: { Origin: "https://evil.example" }, body: "{}" })).status, 403, "cross-site writes are refused");
  assert.equal((await fetch(`http://127.0.0.1:${PORT}/data/settings.json`)).status, 404, "data folder isn't served");
  assert.equal((await fetch(`http://127.0.0.1:${PORT}/server/index.js`)).status, 404);
  assert.equal((await fetch(`http://127.0.0.1:${PORT}/`)).status, 200);
});
