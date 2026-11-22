# Loadout Forge

A Destiny 2 gear tool that runs on your PC. Evaluate your armor and weapons, build optimized Armor 3.0 loadouts, and paste in someone else's loadout link to see how close you can get with your own gear and where to find what you're missing.

It reads the spreadsheets [Destiny Item Manager](https://destinyitemmanager.com) exports, and it uses Bungie's and DIM's APIs with your own keys. Everything is stored on your PC.

## What it does

| Tab | What you get |
| --- | --- |
| **Loadout link** | Paste a dim.gg link, a DIM loadout link, a light.gg loadout page or DIM loadout JSON. For each weapon and armor piece you see whether you **have it**, can use a **stand-in** from your gear, or it's **missing**, plus where to get missing items. It then finds your best armor for the build's stat minimums and set bonus, lists the subclass setup and mods, and lets you save the result as a loadout. |
| **Import** | Drop in DIM's Armor and Weapons CSVs. Shows which columns were recognized. |
| **Armor** | Every piece is marked **Keep**, **Outclassed** or **Legacy**, and ranked within its slot for a build focus. Builds a DIM tags file that marks outclassed pieces as junk. |
| **Weapons** | Flags weapons you have several copies of, ranks the copies, and shows their perks. |
| **Builder** | Choose class, exotic, a priority and minimum for each stat, stat mods and set bonus. It checks every armor combination and ranks the builds. |
| **Loadouts** | Saved builds. Copy a DIM search string to pull a loadout up in DIM. Back up and restore as a JSON file. |
| **Settings** | Your Bungie and DIM API keys, and the item database download. |

## Install (Windows)

1. Install **Node.js LTS** from [nodejs.org](https://nodejs.org) (version 20 or newer).
2. Download this repo: **Code → Download ZIP** on GitHub and unzip it, or `git clone https://github.com/jquander02/loadout-forge.git`.
3. Double-click **`Start Loadout Forge.bat`**. A console window opens and your browser goes to `http://localhost:7777`.
   Keep that window open while you use the app; close it to stop.

On macOS or Linux, run `npm start` in the folder.

To update, run `git pull`, or download the ZIP again and copy your `data` folder across.

## First-time setup (Settings tab)

1. **Bungie API key.** At [bungie.net/en/Application](https://www.bungie.net/en/Application), choose **Create New App**:
   - **OAuth Client Type:** *Not Applicable*
   - **Origin Header:** `http://localhost:7777`

   Copy the **API Key** into Settings.
2. **DIM API key.** Click **Get a DIM API key**. DIM gives development keys to anyone with a Bungie key, so this is automatic. You only need it for dim.gg links.
3. **Item database.** Click **Download item database**. This saves a cut-down copy of Bungie's item list on your PC. Update it after big game patches.
4. **Import your gear.** On the Import tab, drop in DIM's Armor and Weapons CSVs (DIM → Settings → Spreadsheets).

## Your data

Everything is in the `data` folder next to the app, and none of it is committed to git:

| File | Contents |
| --- | --- |
| `settings.json` | Your API keys |
| `manifest.json` | The cut-down item database |
| `armor.json`, `weapons.json` | Your last import |
| `loadouts.json` | Saved loadouts |

To keep the data somewhere else, set `LOADOUT_FORGE_DATA` to a folder path. You can also set `BUNGIE_API_KEY` and `DIM_API_KEY` as environment variables instead of saving the keys in a file. `PORT` changes the port, but then the Origin Header on your Bungie app must match it.

The server only listens on this computer (`127.0.0.1`) and refuses requests from other websites.

## What the loadout check can and can't tell you

- **Weapons:** "you have it" matches by item or name, so reissues count. Your copies are ranked by how many of the loadout's listed perks they have. Stand-ins are your weapons of the same type, same element first.
- **Exotic armor:** has to be the exact exotic. If you don't have it, the armor suggestion uses your best other exotic, and the shopping list says where to get the real one.
- **Legendary armor:** treated as interchangeable apart from its set bonus. The armor search replaces it with your best pieces for the build's stats.
- **Where to get it:** comes from Bungie's collection source text. Some items, like vendor or Eververse gear and items from retired activities, have none.
- **Not checked:** whether you've unlocked the aspects, fragments and mods, or what's in your Collections. DIM's CSV export doesn't include that, and it would need a Bungie sign-in.
- **light.gg:** read by finding the page's "Export to DIM" link. If light.gg changes its pages, paste the DIM link that button opens instead.

## Development

```bash
npm run serve      # start without opening a browser
npm test           # unit tests, plus a test that starts the real server on a temp folder
```

```
server/
  index.js          local HTTP server: static files, JSON API, request guards
  config.js         data folder, settings, atomic file writes
  manifest.js       Bungie manifest download and slimming
  dim.js            loadout input parsing, dim.gg / light.gg resolution, DIM key registration
  plan.js           compares a loadout with your gear
js/                 browser app (UI, CSV parsing, verdicts, optimizer + Web Worker)
css/styles.css
tests/              node:test suites and fixtures
docs/how-it-works.md
Start Loadout Forge.bat
```

See [docs/how-it-works.md](docs/how-it-works.md) for how scoring, the armor search and the loadout check work.

## Roadmap

- Bungie sign-in for live inventory: no CSV exports, plus checking unlocked mods, fragments and Collections
- Tier 5 tuning stats and set-bonus perk descriptions
- Weapon roll grading against community wishlists

## Disclaimer

Not affiliated with Bungie or Destiny Item Manager. Destiny is a trademark of Bungie, Inc.

## License

[MIT](LICENSE)
