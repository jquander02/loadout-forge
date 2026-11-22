// UI: rendering, events and routing. Logic lives in csv.js, evaluate.js and optimizer.js.
import { STATS, STAT_DESC, SLOTS, CLASSES, PRI, PRESETS } from "./constants.js";
import { parseCSV, detectArmor, detectWeapons, looksLikeArmor, normalizeArmor, normalizeWeapons, num, sum } from "./csv.js";
import { computeVerdicts, computeRanks, computeWeaponDups } from "./evaluate.js";
import { prepareSearch, optimize, hydrate } from "./optimizer.js";
import * as storage from "./storage.js";
import { sampleCSVs } from "./sample.js";
import { buildTagsCSV, dimSearch } from "./dim.js";

const state = {
  armor: [], weapons: [], loadouts: [],
  armorMeta: null, weaponMeta: null,
  armorClass: "", armorSort: { key: "rank", dir: -1 }, weaponSort: { key: "name", dir: 1 },
  results: null
};

/* ---------- Helpers ---------- */
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
function toast(msg) { const t = $("#toast"); t.textContent = msg; t.classList.add("show"); clearTimeout(toast._t); toast._t = setTimeout(() => t.classList.remove("show"), 2600); }
function copyText(text, msg) {
  const fallback = () => {
    const ta = document.createElement("textarea"); ta.value = text; document.body.appendChild(ta); ta.select();
    try { document.execCommand("copy"); toast(msg); } catch (e) { toast("Couldn't copy. Select the text and copy it yourself."); }
    ta.remove();
  };
  try { navigator.clipboard.writeText(text).then(() => toast(msg), fallback); } catch (e) { fallback(); }
}

/* ---------- Import ---------- */
async function handleFiles(files) {
  const msgs = [];
  for (const f of files) {
    const rows = parseCSV(await f.text());
    if (rows.length < 2) { msgs.push(`<span class="status-bad">${esc(f.name)}: no rows found.</span>`); continue; }
    if (looksLikeArmor(rows)) {
      const m = detectArmor(rows);
      if (!m.ok) { msgs.push(`<span class="status-bad">${esc(f.name)}: couldn't find the six stat columns. Is this DIM's Armor export?</span>`); continue; }
      const items = normalizeArmor(rows, m);
      setArmor(items, metaArmor(m, f.name));
      msgs.push(`<span class="status-ok">${esc(f.name)}: ${items.length} armor pieces.</span>`);
    } else {
      const m = detectWeapons(rows);
      if (!m.ok) { msgs.push(`<span class="status-bad">${esc(f.name)}: not recognized as a DIM armor or weapons export.</span>`); continue; }
      const items = normalizeWeapons(rows, m);
      setWeapons(items, metaWeapons(m, f.name));
      msgs.push(`<span class="status-ok">${esc(f.name)}: ${items.length} weapons.</span>`);
    }
  }
  $("#importMsg").innerHTML = msgs.join("<br>");
  persistGear();
}
function metaArmor(m, file) {
  const n = i => (i >= 0 ? m.headers[i] : null);
  return {
    file, at: Date.now(), sample: false, statsAreBase: m.statsAreBase,
    found: {
      "Stats": m.stats.map(n).join(", "),
      "Stat source": m.statsAreBase ? "Base stats (mods excluded)" : "Current stats (includes mods/masterwork)",
      "Class": n(m.cls) || "from item type", "Rarity": n(m.rarity), "Gear tier": n(m.gear) || "estimated from stat total",
      "Archetype": n(m.archetype) || "worked out from top two stats", "Armor set": n(m.set) || "not in this export",
      "Owner": n(m.owner), "Tag / Notes": [n(m.tag), n(m.notes)].filter(Boolean).join(" / ") || null
    }
  };
}
function metaWeapons(m, file) {
  const n = i => (i >= 0 ? m.headers[i] : null);
  return {
    file, at: Date.now(), sample: false,
    found: { "Type": n(m.type), "Element": n(m.element), "Gear tier": n(m.gear), "Rarity": n(m.rarity), "Crafted": n(m.crafted), "Perk columns": m.perks.length ? m.perks.length + " columns" : null }
  };
}
function setArmor(items, meta) { state.armor = items; state.armorMeta = meta; computeVerdicts(state.armor); computeRanks(state.armor, focusWeights()); }
function setWeapons(items, meta) { state.weapons = items; state.weaponMeta = meta; computeWeaponDups(state.weapons); }
async function persistGear() {
  renderAll();
  try {
    await storage.save("armor", { items: state.armor, meta: state.armorMeta });
    await storage.save("weapons", { items: state.weapons, meta: state.weaponMeta });
  } catch (e) { toast("Couldn't save your gear: " + e.message); }
}
function loadSample(persist = true) {
  const { armorCSV, weaponCSV } = sampleCSVs();
  const ar = parseCSV(armorCSV), am = detectArmor(ar);
  setArmor(normalizeArmor(ar, am), { ...metaArmor(am, "Sample armor"), sample: true });
  const wr = parseCSV(weaponCSV), wm = detectWeapons(wr);
  setWeapons(normalizeWeapons(wr, wm), { ...metaWeapons(wm, "Sample weapons"), sample: true });
  $("#importMsg").innerHTML = persist ? `<span class="status-ok">Sample gear loaded. Replace it with your own DIM exports any time.</span>` : `<span class="muted">Showing sample gear until you import your own.</span>`;
  if (persist) persistGear(); else renderAll();
}

/* ---------- Render: shared ---------- */
const rarClass = r => (r === "Exotic" ? "exotic" : r === "Legendary" ? "legendary" : "other");
function statCell(v, max = 45) { return `<div class="stat ${v ? "" : "zero"}"><span class="v">${v}</span><span class="bar"><i style="width:${Math.min(100, (v / max) * 100)}%"></i></span></div>`; }
function tierChip(it) {
  if (!it.tier) return `<span class="tierchip">—</span>`;
  return `<span class="tierchip ${it.tier >= 5 ? "t5" : ""}" title="${it.tierInferred ? "Estimated from stat total" : "Gear tier"}">${it.tierInferred ? "~" : ""}T${it.tier}</span>`;
}
const sampleBanner = meta => (meta && meta.sample ? `<div class="banner">You're looking at <b>sample gear</b>. Import your DIM CSVs on the Import tab to see your own.</div>` : "");
const emptyState = what => `<div class="empty"><b>No ${what} loaded yet.</b><span>Import your DIM CSVs, or load the sample gear to try things out.</span><div><a class="btn" href="#import">Go to Import</a></div></div>`;
const tile = (n, l, c = "") => `<div class="tile ${c}"><span class="n">${n}</span><span class="l">${l}</span></div>`;

function renderAll() {
  $("#cArmor").textContent = state.armor.length || "";
  $("#cWeapons").textContent = state.weapons.length || "";
  $("#cLoadouts").textContent = state.loadouts.length || "";
  renderImport(); renderArmor(); renderWeapons(); renderBuilderOptions(); renderLoadouts();
}

function renderImport() {
  const a = state.armorMeta, w = state.weaponMeta;
  const when = m => new Date(m.at).toLocaleString([], { dateStyle: "medium", timeStyle: "short" });
  $("#loadedSummary").innerHTML = [
    a ? `<div><b>${state.armor.length}</b> armor pieces from ${esc(a.file)} · ${when(a)}</div>` : `<div class="muted">No armor yet.</div>`,
    w ? `<div><b>${state.weapons.length}</b> weapons from ${esc(w.file)} · ${when(w)}</div>` : `<div class="muted">No weapons yet.</div>`
  ].join("");
  const rep = (title, m) => m ? `<div style="margin-bottom:8px"><b style="color:var(--text)">${title}</b><div class="kv" style="margin-top:4px">${Object.entries(m.found).map(([k, v]) => `<span class="k">${esc(k)}</span><span>${v ? esc(v) : '<span class="status-bad">not found</span>'}</span>`).join("")}</div></div>` : "";
  $("#colReport").innerHTML = (rep("Armor", a) + rep("Weapons", w)) || "Import a file to see which columns were recognized.";
}

/* ---------- Armor ---------- */
function focusWeights() { const v = $("#armorFocus")?.value || "Balanced"; return (PRESETS[v] || PRESETS.Balanced).w; }

function renderArmor() {
  if (!state.armor.length) { $("#armorTable").innerHTML = ""; $("#armorTiles").innerHTML = emptyState("armor"); return; }
  const classes = CLASSES.filter(c => state.armor.some(a => a.cls === c));
  if (!classes.includes(state.armorClass)) state.armorClass = classes[0];
  $("#armorClass").innerHTML = classes.map(c => `<button type="button" aria-pressed="${c === state.armorClass}" data-c="${c}">${c}</button>`).join("");
  const slot = $("#armorSlot").value, verdict = $("#armorVerdict").value, rar = $("#armorRarity").value, q = $("#armorSearch").value.trim().toLowerCase();
  const mine = state.armor.filter(a => a.cls === state.armorClass);
  $("#armorTiles").innerHTML = sampleBanner(state.armorMeta) + [
    tile(mine.length, "pieces for " + state.armorClass),
    tile(mine.filter(a => a.verdict === "junk").length, "outclassed, safe to clear", "bad"),
    tile(mine.filter(a => a.verdict === "legacy").length, "on the old stat system", "warn"),
    tile(mine.filter(a => a.tier >= 5).length, "Tier 5 pieces", "good"),
    tile(new Set(mine.filter(a => a.rarity === "Exotic").map(a => a.name)).size, "distinct exotics", "ex")
  ].join("");
  const rows = mine.filter(a => (!slot || a.slot === slot) && (!verdict || a.verdict === verdict) && (!rar || a.rarity === rar) &&
    (!q || (a.name + " " + a.set + " " + a.owner + " " + a.archetype).toLowerCase().includes(q)));
  const { key, dir } = state.armorSort;
  const val = a => key === "rank" ? a.fit : key === "name" ? a.name.toLowerCase() : key === "slot" ? SLOTS.indexOf(a.slot) : key === "tier" ? a.tier :
    key === "total" ? a.total : key === "verdict" ? ({ junk: 0, legacy: 1, keep: 2 }[a.verdict]) : key === "arch" ? a.archetype : key.startsWith("s") ? a.stats[+key.slice(1)] : 0;
  rows.sort((a, b) => { const x = val(a), y = val(b); return (x > y ? 1 : x < y ? -1 : 0) * dir || SLOTS.indexOf(a.slot) - SLOTS.indexOf(b.slot); });
  const th = (k, label) => `<th data-k="${k}" aria-sort="${key === k ? (dir > 0 ? "ascending" : "descending") : "none"}">${label}</th>`;
  const head = `<thead><tr>${th("name", "Item")}${th("slot", "Slot")}${th("tier", "Tier")}${th("arch", "Archetype")}${STATS.map((s, k) => th("s" + k, s)).join("")}${th("total", "Total")}${th("rank", "Fit")}${th("verdict", "Verdict")}</tr></thead>`;
  const body = rows.slice(0, 600).map(a => `<tr>
    <td class="name"><span class="rar ${rarClass(a.rarity)}"></span><span style="display:inline-grid;vertical-align:middle"><span class="iname ${rarClass(a.rarity)}">${esc(a.name)}</span><span class="sub">${[a.set, a.owner, a.equipped ? "equipped" : "", a.tag ? "DIM: " + a.tag : ""].filter(Boolean).map(esc).join(" · ")}</span></span></td>
    <td>${esc(a.slot)}</td><td>${tierChip(a)}</td>
    <td>${a.legacy ? '<span class="muted">—</span>' : esc(a.archetype || "?") + (a.tert >= 0 ? `<div class="sub">+ ${STATS[a.tert]}</div>` : "")}</td>
    ${a.stats.map(v => `<td>${statCell(v)}</td>`).join("")}
    <td class="num"><b>${a.total}</b></td>
    <td><div class="rank" title="Rank in slot for this focus"><span class="mono small">#${a.rank} of ${a.rankOf}</span><span class="bar"><i style="width:${Math.round(a.rankPct * 100)}%"></i></span></div></td>
    <td><span class="pill ${a.verdict}">${{ keep: "Keep", junk: "Outclassed", legacy: "Legacy" }[a.verdict]}</span>${a.reason ? `<div class="sub" style="white-space:normal;max-width:220px">${esc(a.reason)}</div>` : ""}</td>
  </tr>`).join("");
  $("#armorTable").innerHTML = head + `<tbody>${body || `<tr><td colspan="14" class="muted">Nothing matches these filters.</td></tr>`}</tbody>`;
}

function showTags() {
  const out = $("#tagsOut");
  if (!state.armor.length) { toast("Import armor first."); return; }
  const { count, csv } = buildTagsCSV(state.armor);
  if (!count) { out.innerHTML = `<div class="panel small">No untagged outclassed armor to tag. Nice vault.</div>`; return; }
  out.innerHTML = `<div class="panel">
    <h3>DIM tags file · ${count} pieces marked junk</h3>
    <p class="small muted">Only untagged, outclassed armor is included, so your existing tags stay as they are. Any notes already on these pieces are kept. In DIM, go to Settings → Spreadsheets → <b>Import tags/notes from CSV</b>.${state.armorMeta?.sample ? " This is sample data, so the IDs won't match real items." : ""}</p>
    <div class="row"><button class="btn primary" id="dlTags">Download CSV</button><button class="btn" id="cpTags">Copy CSV text</button></div>
    <textarea class="out" readonly aria-label="Tags CSV">${esc(csv)}</textarea></div>`;
  $("#cpTags").onclick = () => copyText(csv, "Copied. Paste into a file named dim-tags.csv.");
  $("#dlTags").onclick = () => storage.downloadFile("loadout-forge-dim-tags.csv", csv, "text/csv");
}

/* ---------- Weapons ---------- */
function renderWeapons() {
  if (!state.weapons.length) { $("#weaponTiles").innerHTML = emptyState("weapons"); $("#weaponTable").innerHTML = ""; return; }
  const fill = (sel, vals, label) => { const cur = sel.value; sel.innerHTML = `<option value="">${label}</option>` + vals.map(v => `<option ${v === cur ? "selected" : ""}>${esc(v)}</option>`).join(""); };
  fill($("#wType"), [...new Set(state.weapons.map(w => w.type))].sort(), "All types");
  fill($("#wElem"), [...new Set(state.weapons.map(w => w.element).filter(Boolean))].sort(), "All elements");
  $("#weaponTiles").innerHTML = sampleBanner(state.weaponMeta) + [
    tile(state.weapons.length, "weapons"),
    tile(new Set(state.weapons.filter(w => w.copies > 1).map(w => w.name)).size, "weapons you hold more than one of", "warn"),
    tile(state.weapons.filter(w => w.copyRank > 1).length, "extra copies to compare", "bad"),
    tile(state.weapons.filter(w => w.tier >= 5).length, "Tier 5 weapons", "good"),
    tile(state.weapons.filter(w => w.crafted).length, "crafted", "ex")
  ].join("");
  const t = $("#wType").value, e = $("#wElem").value, d = $("#wDup").checked, q = $("#wSearch").value.trim().toLowerCase();
  const rows = state.weapons.filter(w => (!t || w.type === t) && (!e || w.element === e) && (!d || w.copies > 1) &&
    (!q || (w.name + " " + w.perks.map(p => p.n).join(" ")).toLowerCase().includes(q)));
  const { key, dir } = state.weaponSort;
  const val = w => key === "name" ? w.name.toLowerCase() + String(w.copyRank).padStart(3, "0") : key === "type" ? w.type : key === "element" ? w.element : key === "tier" ? w.tier : key === "power" ? w.power : key === "copies" ? w.copies : "";
  rows.sort((a, b) => { const x = val(a), y = val(b); return (x > y ? 1 : x < y ? -1 : 0) * dir; });
  const th = (k, label) => `<th data-k="${k}" aria-sort="${key === k ? (dir > 0 ? "ascending" : "descending") : "none"}">${label}</th>`;
  $("#weaponTable").innerHTML = `<thead><tr>${th("name", "Weapon")}${th("type", "Type")}${th("element", "Element")}${th("tier", "Tier")}${th("power", "Power")}<th class="nosort">Perks</th>${th("copies", "Copies")}</tr></thead><tbody>` +
    rows.slice(0, 800).map(w => `<tr>
      <td class="name"><span class="rar ${rarClass(w.rarity)}"></span><span style="display:inline-grid;vertical-align:middle"><span class="iname ${rarClass(w.rarity)}">${esc(w.name)}</span><span class="sub">${[w.slot, w.owner, w.crafted ? "crafted" : "", w.tag ? "DIM: " + w.tag : ""].filter(Boolean).map(esc).join(" · ")}</span></span></td>
      <td>${esc(w.type)}</td><td>${esc(w.element)}</td><td>${tierChip(w)}</td><td class="num">${w.power || ""}</td>
      <td style="white-space:normal;min-width:240px">${w.perks.map(p => `<span class="perk ${p.on ? "on" : ""}">${esc(p.n)}</span>`).join("")}</td>
      <td>${w.copies > 1 ? (w.copyRank === 1 ? `<span class="pill best">Best of ${w.copies}</span>` : `<span class="pill dup">Copy ${w.copyRank} of ${w.copies}</span>`) : '<span class="muted small">Only copy</span>'}</td>
    </tr>`).join("") + (rows.length ? "" : `<tr><td colspan="7" class="muted">Nothing matches these filters.</td></tr>`) + `</tbody>`;
}

/* ---------- Builder ---------- */
function renderBuilderOptions() {
  const cSel = $("#bClass"), cur = cSel.value;
  const classes = CLASSES.filter(c => state.armor.some(a => a.cls === c));
  cSel.innerHTML = (classes.length ? classes : CLASSES).map(c => `<option ${c === cur ? "selected" : ""}>${c}</option>`).join("");
  renderExoticOptions();
  const sets = [...new Set(state.armor.filter(a => a.set && a.cls === cSel.value).map(a => a.set))].sort();
  const sCur = $("#bSet").value;
  $("#bSet").innerHTML = `<option value="">No set required</option>` + sets.map(s => `<option ${s === sCur ? "selected" : ""}>${esc(s)}</option>`).join("");
  $("#bSet").disabled = !sets.length; $("#bSetN").disabled = !sets.length;
  if (!state.results) $("#results").innerHTML = state.armor.length
    ? `<div class="empty"><b>Set your priorities and press Find best builds.</b><span>The builder tries every combination of your armor for that class, adds your stat mods where they help most, and ranks the results.</span></div>`
    : emptyState("armor");
}
function renderExoticOptions() {
  const cls = $("#bClass").value, cur = $("#bExotic").value;
  const ex = [...new Set(state.armor.filter(a => a.cls === cls && a.rarity === "Exotic").map(a => a.name))].sort();
  $("#bExotic").innerHTML = `<option value="__any">Best exotic for these stats</option><option value="__none">No exotic</option>` + ex.map(n => `<option value="${esc(n)}">${esc(n)}</option>`).join("");
  if (cur && [...$("#bExotic").options].some(o => o.value === cur)) $("#bExotic").value = cur;
}
function renderStatRows(w, t) {
  $("#statRows").innerHTML = STATS.map((s, k) => `<div class="statrow">
    <div><div class="sn">${s}</div><div class="sd">${STAT_DESC[s]}</div></div>
    <select id="w${k}" aria-label="${s} priority">${Object.entries(PRI).map(([v, l]) => `<option value="${v}" ${+v === w[k] ? "selected" : ""}>${l}</option>`).join("")}</select>
    <input type="number" id="t${k}" min="0" max="200" step="10" value="${t[k]}" aria-label="${s} minimum">
  </div>`).join("");
}
const readPriorities = () => ({ w: STATS.map((_, k) => +$("#w" + k).value), t: STATS.map((_, k) => Math.max(0, Math.min(200, num($("#t" + k).value)))) });

async function runBuilder() {
  if (!state.armor.length) { toast("Import armor first."); return; }
  const { w, t } = readPriorities();
  if (!sum(w) && !sum(t)) { toast("Give at least one stat a priority or minimum."); return; }
  const opts = {
    cls: $("#bClass").value, exotic: $("#bExotic").value, K: +$("#bMods").value,
    mw: $("#bMW").checked && state.armorMeta?.statsAreBase !== false,
    setName: $("#bSet").value, setN: +$("#bSetN").value, includeVault: $("#bVault").checked, w, t
  };
  const prep = prepareSearch(state.armor, opts);
  if (prep.error) { $("#runMsg").innerHTML = `<span class="status-bad">${esc(prep.error)}</span>`; return; }
  $("#btnRun").disabled = true;
  $("#runMsg").innerHTML = `<span class="spinner"></span> Checking ${prep.size.toLocaleString()} combinations…`;
  const t0 = performance.now();
  const res = await optimize(prep.payload);
  const ms = Math.round(performance.now() - t0);
  $("#btnRun").disabled = false;
  state.results = { ...opts, builds: hydrate(res.best, prep.pruned) };
  $("#runMsg").textContent = `Checked ${res.count.toLocaleString()} valid combinations in ${ms} ms` + (prep.before > prep.size ? ` (narrowed from ${prep.before.toLocaleString()} by dropping outclassed pieces).` : ".");
  renderResults();
}

function finalBars(base, final, T) {
  return STATS.map((s, k) => {
    const b = Math.min(base[k], 200), f = Math.min(final[k], 200);
    const short = T && final[k] < T[k];
    return `<div class="fs ${short ? "short" : ""}"><span>${s}</span><span class="track"><span class="mid"></span><span class="b" style="width:${b / 2}%"></span><span class="m" style="left:${b / 2}%;width:${(f - b) / 2}%"></span>${T && T[k] ? `<span class="t" style="left:calc(${T[k] / 2}% - 1px)" title="Minimum ${T[k]}"></span>` : ""}</span><span class="val">${final[k]}</span></div>`;
  }).join("");
}
const setCounts = items => { const c = {}; items.forEach(i => { if (i.set) c[i.set] = (c[i.set] || 0) + 1; }); return Object.entries(c).filter(([, n]) => n >= 2).map(([s, n]) => `${s} ×${n}`); };
const modText = mods => mods.map((v, k) => (v ? `+${v} ${STATS[k]}` : "")).filter(Boolean).join(", ") || "No mods needed";

function renderResults() {
  const r = state.results; if (!r) return;
  if (!r.builds.length) { $("#results").innerHTML = `<div class="empty"><b>No build fits those rules.</b><span>Try a lower set requirement, a different exotic, or include the vault.</span></div>`; return; }
  const legend = `<div class="legend"><span><i style="background:var(--accent)"></i>From armor${r.mw ? " (incl. masterwork)" : ""}</span><span><i style="background:var(--exotic)"></i>From stat mods</span><span><i style="background:var(--text);width:2px"></i>Your minimum</span><span>Bar midpoint = 100</span></div>`;
  $("#results").innerHTML = legend + r.builds.map((b, i) => buildCard(b, i, r.t, "save")).join("");
}
const buildLegend = mw => `<div class="legend"><span><i style="background:var(--accent)"></i>From armor${mw ? " (incl. masterwork)" : ""}</span><span><i style="background:var(--exotic)"></i>From stat mods</span><span><i style="background:var(--text);width:2px"></i>Minimum</span><span>Bar midpoint = 100</span></div>`;
function buildCard(b, i, T, saveAttr, label = "#" + (i + 1)) {
  return `<article class="build ${i === 0 ? "top1" : ""}">
    <div class="bhead"><span class="rk">${label}</span>
      <span><b class="mono">${b.tot}</b> <span class="muted small">total stats</span></span>
      ${b.def ? `<span class="status-bad small">${b.def} short of your minimums</span>` : `<span class="status-ok small">Meets every minimum</span>`}
      ${b.waste ? `<span class="small" style="color:var(--warn)">${b.waste} over the 200 cap</span>` : ""}
      <span class="small muted">Mods: ${esc(modText(b.mods))}</span>
      ${setCounts(b.items).length ? `<span class="small">Sets: ${esc(setCounts(b.items).join(", "))}</span>` : ""}
      <span style="margin-left:auto"><button class="btn" data-${saveAttr}="${i}">Save loadout</button></span>
    </div>
    <div class="bbody">
      <div class="pieces">${b.items.map(it => `<div class="piece"><span class="slot">${esc(it.slot)}</span><span><span class="iname ${rarClass(it.rarity)}">${esc(it.name)}</span> ${tierChip(it)}<div class="sub">${[it.archetype, it.set, it.owner].filter(Boolean).map(esc).join(" · ")} · <span class="mono">${it.stats.map((v, k) => (v ? STATS[k].slice(0, 3) + " " + v : "")).filter(Boolean).join(" / ")}</span></div></span></div>`).join("")}</div>
      <div class="finals">${finalBars(b.base, b.final, T)}</div>
    </div>
    <div class="savebox" id="${saveAttr === "save" ? "sb" : "psb"}${i}" hidden></div>
  </article>`;
}
const topStats = w => w.map((v, k) => [v, k]).filter(x => x[0] >= 2).sort((a, b) => b[0] - a[0]).slice(0, 2).map(x => STATS[x[1]]).join("/") || "Balanced";
function openSave(i) {
  const box = $("#sb" + i); if (!box.hidden) { box.hidden = true; return; }
  const r = state.results, b = r.builds[i], ws = state.weapons;
  const opts = slot => `<option value="">— none —</option>` + ws.filter(w => w.slot === slot).sort((a, c) => a.name.localeCompare(c.name) || a.copyRank - c.copyRank)
    .map(w => `<option value="${esc(w.id)}">${esc(w.name)}${w.copies > 1 ? " (copy " + w.copyRank + ")" : ""} · ${esc(w.type)}</option>`).join("");
  const exName = b.items.find(x => x.rarity === "Exotic")?.name;
  box.innerHTML = `<div class="row"><label class="field" style="flex:1;min-width:200px">Loadout name<input type="text" id="ln${i}" value="${esc(r.cls + " · " + (exName || "Legendary") + " · " + topStats(r.w))}"></label></div>
    ${ws.length ? `<div class="row">
      <label class="field">Kinetic<select id="lk${i}">${opts("Kinetic")}</select></label>
      <label class="field">Energy<select id="le${i}">${opts("Energy")}</select></label>
      <label class="field">Power<select id="lp${i}">${opts("Power")}</select></label>
    </div><p class="small muted">Weapon slots are worked out from type and element, so double-check them.</p>` : `<p class="small muted">Import your weapons CSV to add weapons to loadouts.</p>`}
    <label class="field">Notes (subclass, aspects, fragments, mods)<textarea id="lnotes${i}" rows="2"></textarea></label>
    <div class="row"><button class="btn primary" data-dosave="${i}">Save</button><button class="btn ghost" data-cancel="${i}">Cancel</button></div>`;
  box.hidden = false; $("#ln" + i).focus();
}
function doSave(i) {
  const r = state.results, b = r.builds[i];
  const wpn = id => { const w = state.weapons.find(x => x.id === id); return w ? { id: w.id, name: w.name, type: w.type, element: w.element, rarity: w.rarity, perks: w.perks.filter(p => p.on).map(p => p.n) } : null; };
  const lo = {
    id: "lo" + Date.now().toString(36), name: $("#ln" + i).value.trim() || "Untitled loadout", cls: r.cls, created: Date.now(),
    armor: b.items.map(it => ({ id: it.id, name: it.name, slot: it.slot, rarity: it.rarity, tier: it.tier, set: it.set, owner: it.owner, stats: it.stats })),
    weapons: ["lk", "le", "lp"].map(p => wpn($("#" + p + i)?.value)).filter(Boolean),
    mods: b.mods, final: b.final, base: b.base, targets: r.t, priorities: r.w, notes: $("#lnotes" + i).value.trim()
  };
  state.loadouts.unshift(lo);
  saveLoadouts();
  $("#sb" + i).innerHTML = `<div class="row"><span class="status-ok">Saved “${esc(lo.name)}”.</span><a class="btn" href="#loadouts">View loadouts</a></div>`;
}

/* ---------- Loadouts ---------- */
function saveLoadouts() {
  storage.save("loadouts", state.loadouts).catch(e => toast("Couldn't save loadouts: " + e.message));
  $("#cLoadouts").textContent = state.loadouts.length || "";
  renderLoadouts();
}
function loadoutText(lo) {
  return [lo.name + " (" + lo.cls + ")", ...lo.armor.map(a => `${a.slot}: ${a.name}`), ...lo.weapons.map(w => `${w.type}: ${w.name}`), "Mods: " + modText(lo.mods),
    "Stats: " + STATS.map((s, k) => `${s} ${lo.final[k]}`).join(", "), lo.notes ? "Notes: " + lo.notes : ""].filter(Boolean).join("\n");
}
function renderLoadouts() {
  const el = $("#loadoutList");
  if (!state.loadouts.length) { el.innerHTML = `<div class="empty"><b>No saved loadouts yet.</b><span>Run the Builder and press Save loadout on a build you like.</span><div><a class="btn" href="#builder">Open Builder</a></div></div>`; return; }
  el.innerHTML = `<div class="lgrid">` + state.loadouts.map(lo => {
    const stale = lo.armor.filter(a => state.armor.length && !state.armor.some(x => x.id === a.id));
    return `<article class="lcard">
    <div class="lh"><h3>${esc(lo.name)}</h3><span class="small muted">${esc(lo.cls)} · saved ${new Date(lo.created).toLocaleDateString()}</span></div>
    <div class="lb">
      <div class="kv">${lo.armor.map(a => `<span class="k">${esc(a.slot)}</span><span class="iname ${rarClass(a.rarity)}" style="font-weight:500">${esc(a.name)} <span class="sub">${esc(a.owner || "")}</span></span>`).join("")}
      ${lo.weapons.map(w => `<span class="k">${esc(w.type)}</span><span class="iname ${rarClass(w.rarity)}" style="font-weight:500">${esc(w.name)} ${w.perks.length ? `<span class="sub">${esc(w.perks.slice(-2).join(", "))}</span>` : ""}</span>`).join("")}</div>
      <div class="small muted">Mods: ${esc(modText(lo.mods))}</div>
      <div style="display:grid;gap:4px">${finalBars(lo.base, lo.final, lo.targets)}</div>
      ${lo.notes ? `<p class="small" style="white-space:pre-wrap">${esc(lo.notes)}</p>` : ""}
      ${stale.length ? `<div class="banner small">${stale.length} piece${stale.length > 1 ? "s" : ""} no longer in your latest import (dismantled or swapped).</div>` : ""}
    </div>
    <div class="lf"><button class="btn primary" data-dim="${lo.id}">Copy DIM search</button><button class="btn" data-text="${lo.id}">Copy as text</button><button class="btn ghost danger" data-del="${lo.id}">Delete</button></div>
  </article>`;
  }).join("") + `</div><p class="small muted" style="margin-top:12px">Paste the DIM search into DIM's search bar to highlight every piece, then use Loadouts → Create to save it as a DIM loadout.</p>`;
}

/* ---------- Loadout link ---------- */
const STATUS_LABEL = { have: "You have it", substitute: "Use a stand-in", missing: "Missing" };
const STATUS_PILL = { have: "keep", substitute: "dup", missing: "junk" };
const statusPill = s => `<span class="pill ${STATUS_PILL[s]}">${STATUS_LABEL[s]}</span>`;
const howList = tips => (tips && tips.length ? `<ul class="how">${tips.map(t => `<li>${esc(t)}</li>`).join("")}</ul>` : "");

async function analyzeLink() {
  const input = $("#linkInput").value.trim();
  if (!input) { toast("Paste a loadout link first."); return; }
  $("#btnAnalyze").disabled = true;
  $("#linkMsg").innerHTML = `<span class="spinner"></span> Reading the loadout…`;
  try {
    const { plan, source, inventory } = await storage.api("/api/plan", { method: "POST", body: { input } });
    state.plan = { plan, source, inventory, build: null };
    $("#linkMsg").textContent = `Read from ${source}.`;
    renderPlan();
    await runPlanBuild();
  } catch (e) {
    $("#linkMsg").innerHTML = `<span class="status-bad">${esc(e.message)}</span>`;
  } finally { $("#btnAnalyze").disabled = false; }
}

async function runPlanBuild() {
  const p = state.plan?.plan; if (!p) return;
  const box = $("#planBuild"); if (!box) return;
  const cls = p.search.cls || state.armorClass || "Hunter";
  if (!state.armor.some(a => a.cls === cls)) { box.innerHTML = `<div class="empty"><b>No ${esc(cls)} armor imported.</b><span>Import your DIM armor export to see which of your pieces fit this build.</span></div>`; return; }
  const opts = { cls, exotic: p.search.exotic, K: 5, mw: state.armorMeta?.statsAreBase !== false, setName: p.search.setName, setN: p.search.setN, includeVault: true, w: p.search.w, t: p.search.t };
  let prep = prepareSearch(state.armor, opts);
  if (prep.error && opts.setName) prep = prepareSearch(state.armor, { ...opts, setName: "" });
  if (prep.error) { box.innerHTML = `<div class="empty"><b>Couldn't build armor for this.</b><span>${esc(prep.error)}</span></div>`; return; }
  box.innerHTML = `<p class="small muted"><span class="spinner"></span> Finding your best armor for this build…</p>`;
  const res = await optimize({ ...prep.payload, top: 3 });
  const builds = hydrate(res.best, prep.pruned);
  state.plan.build = { builds, opts };
  if (!builds.length) { box.innerHTML = `<div class="empty"><b>No armor combination fits.</b><span>Try the Builder tab with fewer requirements.</span></div>`; return; }
  const notes = [];
  if (p.search.exoticMissing) notes.push(`You don't have ${p.search.exoticMissing}, so this uses the best exotic you do have. Swap it in once you get it.`);
  if (p.sets.length && !opts.setName) notes.push(`You don't own pieces of ${p.sets.map(x => x.name).join(" or ")}, so the set bonus isn't included.`);
  if (!p.targets.some(Boolean)) notes.push("The loadout doesn't set stat minimums, so stats are weighted from its mods.");
  box.innerHTML = (notes.length ? `<div class="banner small">${notes.map(esc).join("<br>")}</div>` : "") + buildLegend(opts.mw) +
    builds.map((b, i) => buildCard(b, i, p.targets, "plansave", i === 0 ? "Best" : "Alt " + i)).join("");
}

function renderPlan() {
  const { plan: p, inventory } = state.plan;
  const s = p.summary, total = s.have + s.substitute + s.missing;
  const ready = s.missing === 0 ? (s.substitute === 0 ? "You can run this exactly as shared." : "You can run this today with stand-ins.") : `You're missing ${s.missing} item${s.missing === 1 ? "" : "s"}.`;
  const weaponRow = w => {
    let mine = "";
    if (w.status === "have") {
      const best = w.have[0];
      mine = `<b>${esc(best.name)}</b> <span class="sub">${esc(best.owner || "")}${w.have.length > 1 ? ` · ${w.have.length} copies` : ""}</span>` +
        (w.wantPerks.length ? `<div class="sub">${best.perksMatched.length} of ${w.wantPerks.length} listed perks on your best copy${best.perksMatched.length ? ": " + esc(best.perksMatched.join(", ")) : ""}</div>` : "");
    } else if (w.status === "substitute") {
      mine = w.alternatives.map((a, i) => `<div>${i === 0 ? "<b>" : ""}${esc(a.name)}${i === 0 ? "</b>" : ""} <span class="sub">${esc([a.element, a.tier ? "T" + a.tier : "", a.owner].filter(Boolean).join(" · "))}</span></div>`).join("");
    } else mine = `<span class="muted">Nothing similar in your weapons.</span>`;
    return `<tr><td class="name"><span class="rar ${rarClass(w.rarity)}"></span><span style="display:inline-grid;vertical-align:middle"><span class="iname ${rarClass(w.rarity)}">${esc(w.name)}</span><span class="sub">${esc([w.slot, w.type, w.element].filter(Boolean).join(" · "))}</span>${w.wantPerks.length ? `<span class="sub">Perks: ${esc(w.wantPerks.join(", "))}</span>` : ""}</span></td>
      <td>${statusPill(w.status)}</td><td style="white-space:normal;min-width:220px">${mine}</td><td style="white-space:normal;min-width:220px">${howList(w.howToGet)}</td></tr>`;
  };
  const armorRow = a => {
    let mine;
    if (a.status === "have") mine = `<b>${esc(a.have[0].name)}</b> <span class="sub">${esc(a.have[0].owner || "")}${a.have.length > 1 ? ` · ${a.have.length} copies` : ""}</span>`;
    else if (a.exotic) mine = `<span class="muted">The armor below uses your best other exotic.</span>`;
    else mine = `<span class="muted">Any ${esc(a.slot.toLowerCase())} works; the armor below picks yours.</span>` + (a.set ? `<div class="sub">${a.sameSetOwned ? `You own ${a.sameSetOwned} ${esc(a.set)} ${esc(a.slot.toLowerCase())}${a.sameSetOwned > 1 ? "s" : ""}.` : `You have no ${esc(a.set)} piece for this slot.`}</div>` : "");
    return `<tr><td>${esc(a.slot)}</td><td class="name"><span class="rar ${rarClass(a.rarity)}"></span><span style="display:inline-grid;vertical-align:middle"><span class="iname ${rarClass(a.rarity)}">${esc(a.name)}</span>${a.set ? `<span class="sub">Set: ${esc(a.set)}</span>` : ""}</span></td>
      <td>${statusPill(a.status)}</td><td style="white-space:normal;min-width:200px">${mine}</td><td style="white-space:normal;min-width:220px">${a.exotic || a.status === "have" ? howList(a.howToGet) : ""}</td></tr>`;
  };
  const missing = [...p.armor.filter(a => a.status === "missing" || (a.exotic && a.status !== "have")), ...p.weapons.filter(w => w.status !== "have")];
  const parts = p.subclass ? Object.entries(p.subclass.parts.reduce((g, x) => ((g[x.kind] ||= []).push(x), g), {})) : [];
  $("#planOut").innerHTML = `
  <div class="panel">
    <div class="row" style="justify-content:space-between">
      <div><h2>${esc(p.name)}</h2><span class="small muted">${esc(p.cls)}${p.subclass ? " · " + esc(p.subclass.name) : ""} · from ${esc(state.plan.source)}</span></div>
      <span class="${s.missing ? "status-bad" : "status-ok"}"><b>${ready}</b></span>
    </div>
    ${inventory.sample ? `<div class="banner small">These results use <b>sample gear</b>. Import your DIM exports to check against your own.</div>` : ""}
    ${p.notes ? `<p class="small" style="white-space:pre-wrap">${esc(p.notes)}</p>` : ""}
    <div class="tiles">${tile(s.have, "items you have", "good")}${tile(s.substitute, "with stand-ins from your gear", "warn")}${tile(s.missing, "missing", "bad")}${tile(total ? Math.round((s.have / total) * 100) + "%" : "—", "exact match")}</div>
  </div>
  <h3>Weapons</h3>
  <div class="tablewrap"><table><thead><tr><th class="nosort">Loadout weapon</th><th class="nosort">Status</th><th class="nosort">Your best option</th><th class="nosort">How to get it</th></tr></thead><tbody>${p.weapons.map(weaponRow).join("") || `<tr><td colspan="4" class="muted">No weapons in this loadout.</td></tr>`}</tbody></table></div>
  <h3>Armor</h3>
  <div class="tablewrap"><table><thead><tr><th class="nosort">Slot</th><th class="nosort">Loadout piece</th><th class="nosort">Status</th><th class="nosort">Your option</th><th class="nosort">How to get it</th></tr></thead><tbody>${p.armor.map(armorRow).join("") || `<tr><td colspan="5" class="muted">No armor in this loadout.</td></tr>`}</tbody></table></div>
  <div class="panel">
    <h3>Your best armor for this build</h3>
    <p class="small muted">${p.targets.some(Boolean) ? "Aiming for the loadout's stat minimums: " + esc(STATS.map((n, k) => (p.targets[k] ? `${n} ${p.targets[k]}` : "")).filter(Boolean).join(", ")) + "." : "Weighted toward the stats this loadout's mods support."}${p.sets.length ? " Set bonus in the loadout: " + esc(p.sets.map(x => `${x.name} (${x.pieces}-piece)`).join(", ")) + "." : ""}</p>
    <div id="planBuild" class="results"></div>
  </div>
  <div class="grid2">
    <div class="panel"><h3>Subclass</h3>${p.subclass ? `<p><b>${esc(p.subclass.name)}</b></p>${parts.map(([k, xs]) => `<div class="kv"><span class="k">${esc(k)}</span><span>${xs.map(x => `<span title="${esc(x.description)}">${esc(x.name)}</span>`).join(", ")}</span></div>`).join("")}<p class="small muted">Set these in game. Whether you've unlocked each aspect and fragment isn't in DIM's export, so it isn't checked here.</p>` : `<p class="muted small">No subclass in this loadout.</p>`}</div>
    <div class="panel"><h3>Armor mods</h3>${p.mods.length ? `<div class="kv">${p.mods.map(x => `<span class="k mono">${x.count}×</span><span>${esc(x.name)}</span>`).join("")}</div>` : `<p class="muted small">No mods listed.</p>`}</div>
  </div>
  ${missing.length ? `<div class="panel"><h3>Shopping list</h3>${missing.map(x => `<div><b class="iname ${rarClass(x.rarity)}">${esc(x.name)}</b>${x.status === "substitute" ? ` <span class="sub">(stand-in available)</span>` : ""}${howList(x.howToGet)}</div>`).join("")}</div>` : ""}
  ${p.unknown.length ? `<p class="small muted">${p.unknown.length === 1 ? "1 item wasn't" : p.unknown.length + " items weren't"} in your item database. Update it in Settings if a game patch just landed.</p>` : ""}`;
}

function openPlanSave(i) {
  const box = $("#psb" + i); if (!box.hidden) { box.hidden = true; return; }
  const p = state.plan.plan;
  box.innerHTML = `<div class="row"><label class="field" style="flex:1;min-width:200px">Loadout name<input type="text" id="pln${i}" value="${esc(p.name)}"></label></div>
    <p class="small muted">Saves this armor, your best copy of each loadout weapon (or the top stand-in), and the subclass and mods as notes.</p>
    <div class="row"><button class="btn primary" data-doplansave="${i}">Save</button></div>`;
  box.hidden = false;
}
function doPlanSave(i) {
  const { plan: p, build } = state.plan, b = build.builds[i];
  const pickWeapon = w => {
    const id = w.status === "have" ? w.have[0].id : w.alternatives[0]?.id;
    const x = id && state.weapons.find(y => y.id === id);
    return x ? { id: x.id, name: x.name, type: x.type, element: x.element, rarity: x.rarity, perks: x.perks.filter(q => q.on).map(q => q.n) } : null;
  };
  const notes = [p.subclass ? `${p.subclass.name}: ${p.subclass.parts.map(x => x.name).join(", ")}` : "", p.mods.length ? "Mods: " + p.mods.map(x => `${x.count}× ${x.name}`).join(", ") : "", `From ${state.plan.source}`].filter(Boolean).join("\n");
  const lo = {
    id: "lo" + Date.now().toString(36), name: $("#pln" + i).value.trim() || p.name, cls: build.opts.cls, created: Date.now(),
    armor: b.items.map(it => ({ id: it.id, name: it.name, slot: it.slot, rarity: it.rarity, tier: it.tier, set: it.set, owner: it.owner, stats: it.stats })),
    weapons: p.weapons.map(pickWeapon).filter(Boolean),
    mods: b.mods, final: b.final, base: b.base, targets: p.targets, priorities: p.weights, notes
  };
  state.loadouts.unshift(lo);
  saveLoadouts();
  $("#psb" + i).innerHTML = `<div class="row"><span class="status-ok">Saved “${esc(lo.name)}”.</span><a class="btn" href="#loadouts">View loadouts</a></div>`;
}

/* ---------- Settings ---------- */
let pollTimer = null;
async function refreshStatus() {
  let st;
  try { st = await storage.api("/api/status"); } catch (e) { $("#setupBanner").innerHTML = `<div class="banner">${esc(e.message)}</div>`; return; }
  state.status = st;
  const s = st.settings, m = st.manifest;
  $$(".originText").forEach(el => (el.textContent = s.origin));
  $("#dataDir").textContent = st.dataDir;
  $("#bungieState").innerHTML = s.hasBungieKey ? `<span class="status-ok">Saved (${esc(s.bungieApiKey)})</span>` : `<span class="muted">Not set yet.</span>`;
  $("#dimState").innerHTML = s.hasDimKey ? `<span class="status-ok">Saved (${esc(s.dimApiKey)})</span>` : `<span class="muted">Not set yet.</span>`;
  $("#btnDimKey").disabled = !s.hasBungieKey;
  $("#btnManifest").disabled = !s.hasBungieKey || m.job.running;
  $("#btnManifest").textContent = m.ready ? "Update item database" : "Download item database";
  $("#manifestState").innerHTML = m.job.running ? `<span class="spinner"></span> ${esc(m.job.step)}…`
    : m.job.error ? `<span class="status-bad">${esc(m.job.error)}</span>`
    : m.ready ? `<span class="status-ok">Ready · ${m.items.toLocaleString()} items · version ${esc(m.version)} · ${new Date(m.builtAt).toLocaleDateString()}</span>` : `<span class="muted">Not downloaded yet.</span>`;
  const todo = [!s.hasBungieKey && "add your Bungie API key", s.hasBungieKey && !m.ready && "download the item database"].filter(Boolean);
  $("#setupBanner").innerHTML = todo.length && location.hash !== "#settings" ? `<div class="banner" style="margin-bottom:16px">To check shared loadouts, ${todo.join(" and ")} in <a href="#settings">Settings</a>.</div>` : "";
  clearTimeout(pollTimer);
  if (m.job.running) pollTimer = setTimeout(refreshStatus, 1500);
}
function wireLinkAndSettings() {
  $("#btnAnalyze").onclick = analyzeLink;
  $("#linkInput").addEventListener("keydown", e => { if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) analyzeLink(); });
  $("#planOut").addEventListener("click", e => {
    const s = e.target.closest("[data-plansave]"); if (s) return openPlanSave(+s.dataset.plansave);
    const d = e.target.closest("[data-doplansave]"); if (d) return doPlanSave(+d.dataset.doplansave);
  });
  const guard = fn => async () => { try { await fn(); } catch (e) { toast(e.message); } await refreshStatus(); };
  $("#btnSaveBungie").onclick = guard(async () => {
    const v = $("#bungieKey").value.trim(); if (!v) { toast("Paste your Bungie API key first."); return; }
    await storage.api("/api/settings", { method: "POST", body: { bungieApiKey: v } });
    $("#bungieKey").value = ""; toast("Bungie key saved.");
  });
  $("#btnSaveDim").onclick = guard(async () => {
    const v = $("#dimKey").value.trim(); if (!v) { toast("Paste a DIM API key first."); return; }
    await storage.api("/api/settings", { method: "POST", body: { dimApiKey: v } });
    $("#dimKey").value = ""; toast("DIM key saved.");
  });
  $("#btnDimKey").onclick = guard(async () => { $("#dimState").innerHTML = `<span class="spinner"></span> Asking DIM…`; await storage.api("/api/dim/register", { method: "POST", body: {} }); toast("DIM key saved."); });
  $("#btnManifest").onclick = guard(async () => { await storage.api("/api/manifest/update", { method: "POST", body: {} }); });
  window.addEventListener("hashchange", () => { if (state.status) refreshStatus(); });
}

/* ---------- Routing & events ---------- */
const TABS = ["link", "import", "armor", "weapons", "builder", "loadouts", "settings"];
function route() {
  let tab = location.hash.replace("#", "");
  if (!TABS.includes(tab)) tab = "link";
  TABS.forEach(t => $("#v-" + t).classList.toggle("active", t === tab));
  $$("nav.tabs a").forEach(a => a.setAttribute("aria-current", a.dataset.tab === tab ? "page" : "false"));
}
function armTwice(btn, label, armedLabel, action) {
  let armed = false;
  btn.addEventListener("click", () => {
    if (!armed) { armed = true; btn.textContent = armedLabel; setTimeout(() => { armed = false; if (btn.isConnected) btn.textContent = label; }, 3000); return; }
    armed = false; btn.textContent = label; action();
  });
}
function wire() {
  window.addEventListener("hashchange", route);
  const drop = $("#drop"), file = $("#file");
  drop.addEventListener("click", () => file.click());
  drop.addEventListener("keydown", e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); file.click(); } });
  file.addEventListener("change", () => { if (file.files.length) handleFiles([...file.files]); file.value = ""; });
  ["dragenter", "dragover"].forEach(ev => drop.addEventListener(ev, e => { e.preventDefault(); drop.classList.add("over"); }));
  ["dragleave", "drop"].forEach(ev => drop.addEventListener(ev, e => { e.preventDefault(); drop.classList.remove("over"); }));
  drop.addEventListener("drop", e => {
    const fs = [...e.dataTransfer.files].filter(f => /\.csv$/i.test(f.name) || f.type.includes("csv"));
    if (fs.length) handleFiles(fs); else toast("Drop .csv files from DIM.");
  });
  $("#btnSample").onclick = () => loadSample(true);
  armTwice($("#btnClear"), "Clear imported gear", "Click again to clear", () => {
    state.armor = []; state.weapons = []; state.armorMeta = null; state.weaponMeta = null; state.results = null;
    $("#importMsg").textContent = "Gear cleared. Saved loadouts are untouched.";
    persistGear();
  });

  // Armor
  $("#armorFocus").innerHTML = Object.keys(PRESETS).filter(k => PRESETS[k]).map(k => `<option ${k === "Balanced" ? "selected" : ""}>${k}</option>`).join("");
  SLOTS.forEach(s => $("#armorSlot").insertAdjacentHTML("beforeend", `<option>${s}</option>`));
  ["armorSlot", "armorVerdict", "armorRarity"].forEach(id => $("#" + id).addEventListener("change", renderArmor));
  $("#armorFocus").addEventListener("change", () => { computeRanks(state.armor, focusWeights()); renderArmor(); });
  $("#armorSearch").addEventListener("input", renderArmor);
  $("#armorClass").addEventListener("click", e => { const b = e.target.closest("button[data-c]"); if (b) { state.armorClass = b.dataset.c; renderArmor(); } });
  $("#armorTable").addEventListener("click", e => {
    const th = e.target.closest("th[data-k]"); if (!th) return;
    const k = th.dataset.k;
    state.armorSort = { key: k, dir: state.armorSort.key === k ? -state.armorSort.dir : (k === "name" || k === "slot" ? 1 : -1) };
    renderArmor();
  });
  $("#btnTags").onclick = showTags;

  // Weapons
  ["wType", "wElem", "wDup"].forEach(id => $("#" + id).addEventListener("change", renderWeapons));
  $("#wSearch").addEventListener("input", renderWeapons);
  $("#weaponTable").addEventListener("click", e => {
    const th = e.target.closest("th[data-k]"); if (!th) return;
    const k = th.dataset.k;
    state.weaponSort = { key: k, dir: state.weaponSort.key === k ? -state.weaponSort.dir : (["name", "type", "element"].includes(k) ? 1 : -1) };
    renderWeapons();
  });

  // Builder
  $("#bPreset").innerHTML = Object.keys(PRESETS).map(k => `<option ${k === "Grenade spam" ? "selected" : ""}>${k}</option>`).join("");
  renderStatRows(PRESETS["Grenade spam"].w, PRESETS["Grenade spam"].t);
  $("#bPreset").addEventListener("change", () => { const p = PRESETS[$("#bPreset").value]; if (p) renderStatRows(p.w, p.t); });
  $("#statRows").addEventListener("change", () => { $("#bPreset").value = "Custom"; });
  $("#bClass").addEventListener("change", renderBuilderOptions);
  $("#btnRun").onclick = runBuilder;
  $("#results").addEventListener("click", e => {
    const s = e.target.closest("[data-save]"); if (s) return openSave(+s.dataset.save);
    const d = e.target.closest("[data-dosave]"); if (d) return doSave(+d.dataset.dosave);
    const c = e.target.closest("[data-cancel]"); if (c) $("#sb" + c.dataset.cancel).hidden = true;
  });

  // Loadouts
  const delArmed = {};
  $("#loadoutList").addEventListener("click", e => {
    const b = e.target.closest("button"); if (!b) return;
    const find = id => state.loadouts.find(l => l.id === id);
    if (b.dataset.dim) { const q = dimSearch(find(b.dataset.dim)); if (!q) return toast("These are sample items, so there are no real DIM IDs to search."); copyText(q, "DIM search copied. Paste it into DIM's search bar."); }
    if (b.dataset.text) copyText(loadoutText(find(b.dataset.text)), "Loadout copied as text.");
    if (b.dataset.del) {
      const id = b.dataset.del;
      if (!delArmed[id]) { delArmed[id] = true; b.textContent = "Click again to delete"; setTimeout(() => { delArmed[id] = false; if (b.isConnected) b.textContent = "Delete"; }, 3000); return; }
      state.loadouts = state.loadouts.filter(l => l.id !== id); saveLoadouts();
    }
  });
  $("#btnBackup").onclick = () => storage.downloadFile(`loadout-forge-backup-${new Date().toISOString().slice(0, 10)}.json`, JSON.stringify(storage.makeBackup(state), null, 1), "application/json");
  $("#btnRestore").onclick = () => $("#restoreFile").click();
  $("#restoreFile").addEventListener("change", async e => {
    const f = e.target.files[0]; e.target.value = ""; if (!f) return;
    try {
      const b = storage.readBackup(JSON.parse(await f.text()));
      const known = new Set(state.loadouts.map(l => l.id));
      const added = b.loadouts.filter(l => !known.has(l.id));
      state.loadouts = added.concat(state.loadouts);
      if (b.armor?.items?.length && (!state.armorMeta || state.armorMeta.sample)) setArmor(b.armor.items, b.armor.meta);
      if (b.weapons?.items?.length && (!state.weaponMeta || state.weaponMeta.sample)) setWeapons(b.weapons.items, b.weapons.meta);
      saveLoadouts(); persistGear();
      toast(`Restored ${added.length} loadout${added.length === 1 ? "" : "s"}.`);
    } catch (err) { toast(err.message || "Couldn't read that backup file."); }
  });
}

/* ---------- Boot ---------- */
async function boot() {
  wire();
  wireLinkAndSettings();
  try {
    const [savedArmor, savedWeapons, savedLoadouts] = await Promise.all([storage.load("armor"), storage.load("weapons"), storage.load("loadouts")]);
    if (Array.isArray(savedLoadouts)) state.loadouts = savedLoadouts;
    if (savedArmor?.items?.length || savedWeapons?.items?.length) {
      if (savedArmor?.items?.length) setArmor(savedArmor.items, savedArmor.meta);
      if (savedWeapons?.items?.length) setWeapons(savedWeapons.items, savedWeapons.meta);
      renderAll();
    } else loadSample(false); // open in a working state with clearly marked example gear
  } catch (e) {
    loadSample(false);
    toast(e.message);
  }
  route();
  await refreshStatus();
}
boot();
