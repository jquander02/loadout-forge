// Browser storage with graceful failure (private mode, full quota, blocked storage).
const PREFIX = "lf_";
export const BACKUP_VERSION = 1;

export function load(key) {
  try { const v = localStorage.getItem(PREFIX + key); return v ? JSON.parse(v) : null; }
  catch (e) { return null; }
}

/** Returns false when the browser refused to store the value. */
export function save(key, value) {
  try { localStorage.setItem(PREFIX + key, JSON.stringify(value)); return true; }
  catch (e) { return false; }
}

export function makeBackup(state) {
  return {
    app: "loadout-forge", version: BACKUP_VERSION, exportedAt: new Date().toISOString(),
    loadouts: state.loadouts,
    armor: { items: state.armor, meta: state.armorMeta },
    weapons: { items: state.weapons, meta: state.weaponMeta }
  };
}

/** Validates a parsed backup file. Throws with a readable message when it isn't one. */
export function readBackup(obj) {
  if (!obj || obj.app !== "loadout-forge") throw new Error("That file isn't a Loadout Forge backup.");
  if (!Array.isArray(obj.loadouts)) throw new Error("The backup has no loadouts list.");
  return obj;
}

/** Offers a file to the viewer through a temporary link. */
export function downloadFile(filename, text, type = "text/plain") {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = Object.assign(document.createElement("a"), { href: url, download: filename });
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
