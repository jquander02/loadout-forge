// Talks to the local Loadout Forge server, which keeps everything in the data/ folder on this PC.
export const BACKUP_VERSION = 1;

/** JSON request to the local server. Throws Error(message) on failure. */
export async function api(path, { method = "GET", body } = {}) {
  let res;
  try {
    res = await fetch(path, { method, headers: body !== undefined ? { "Content-Type": "application/json" } : {}, body: body !== undefined ? JSON.stringify(body) : undefined });
  } catch (e) {
    throw new Error("Can't reach the Loadout Forge server. Is its window still open?");
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok && res.status !== 202) throw new Error(data.error || `The server returned ${res.status}.`);
  return data;
}

export async function load(key) { return (await api(`/api/store/${key}`)).value; }
export async function save(key, value) { await api(`/api/store/${key}`, { method: "PUT", body: { value } }); }

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

/** Offers a file to download through a temporary link. */
export function downloadFile(filename, text, type = "text/plain") {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = Object.assign(document.createElement("a"), { href: url, download: filename });
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
