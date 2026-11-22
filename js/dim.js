// Output DIM understands: its tags/notes CSV import, and its item search syntax.

/** DIM's "Import tags/notes from CSV" reads Id, Hash, Tag, Notes. Only untagged outclassed pieces are included. */
export function buildTagsCSV(armor) {
  const junk = armor.filter(a => a.verdict === "junk" && !a.tag && !/^row/.test(a.id));
  const q = v => (/[",\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v);
  const rows = junk.map(a => [a.id, a.hash, "junk", q((a.notes ? a.notes + " | " : "") + "Loadout Forge: " + a.reason)].join(","));
  return { count: junk.length, csv: ["Id,Hash,Tag,Notes", ...rows].join("\n") };
}

/** A DIM search that selects every item in a saved loadout, e.g. `id:123 or id:456`. */
export function dimSearch(loadout) {
  return loadout.armor.concat(loadout.weapons).map(x => x.id).filter(id => id && !/^row/.test(id)).map(id => "id:" + id).join(" or ");
}
