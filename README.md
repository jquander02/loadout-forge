# Loadout Forge

Evaluate your Destiny 2 armor and weapons, and build optimized loadouts for the Armor 3.0 stat system (Weapons, Health, Class, Grenade, Super, Melee).

Loadout Forge reads the spreadsheets that [Destiny Item Manager](https://destinyitemmanager.com) exports. It runs entirely in your browser: there's no server and no sign-in, and your files never leave your machine.

## What it does

| Tab | What you get |
| --- | --- |
| **Import** | Drop in DIM's Armor and Weapons CSVs. Shows which columns were recognized. |
| **Armor** | Every piece is marked **Keep**, **Outclassed** (another piece of the same slot, class, set and exotic is equal or better on every stat and at least the same gear tier) or **Legacy** (pre–Armor 3.0 stat spread). Pieces are also ranked within their slot for a chosen build focus. |
| **Weapons** | Flags weapons you hold several copies of and ranks the copies by gear tier, crafted status, DIM tag and power. Shows each copy's perks so you can compare rolls. |
| **Builder** | Choose class, exotic, a priority and minimum for each stat, how many +10 stat mods you'll use, and optionally a 2- or 4-piece set bonus. It checks every armor combination, places mods where they help most and ranks the builds. |
| **Loadouts** | Saved builds with weapons and notes. Copy a DIM search to pull the whole loadout up in DIM. Back up and restore as a JSON file. |

### Round trip with DIM

- **Into Loadout Forge:** DIM → Settings → Spreadsheets → Armor / Weapons.
- **Back into DIM:** the Armor tab's **Build DIM tags file** creates an `Id, Hash, Tag, Notes` CSV that marks outclassed pieces as junk. Import it with DIM's **Import tags/notes from CSV** button. Only untagged pieces are included, and existing notes are kept.
- **Loadouts into DIM:** **Copy DIM search** creates `id:… or id:…`. Paste it into DIM's search bar, then save the highlighted items as a DIM loadout.

## Use it

**Online:** once GitHub Pages is turned on (see below), the app is at `https://jquander02.github.io/loadout-forge/`.

**Locally:**

```bash
git clone https://github.com/jquander02/loadout-forge.git
cd loadout-forge
npm start          # serves on http://localhost:8080
```

Node 20 or newer is all you need: there are no dependencies to install. Opening `index.html` straight from disk won't work, because browsers block ES modules on `file://` URLs.

## Turning on GitHub Pages

1. Repo **Settings → Pages**.
2. Under **Build and deployment**, set **Source** to **GitHub Actions**.
3. Push to `main` (or run the *Deploy to GitHub Pages* workflow from the Actions tab). The workflow runs the tests, then publishes the site.

## Development

```bash
npm test           # node:test suites for parsing, evaluation and the optimizer
```

```
index.html              page markup
css/styles.css          styles
js/
  app.js                UI: rendering, events, routing
  constants.js          stats, slots, archetypes, presets
  csv.js                DIM CSV parsing and column detection
  evaluate.js           keep/outclassed verdicts, slot ranks, weapon duplicates
  optimizer.js          loadout search, pruning, mod placement
  optimizer.worker.js   runs the search off the main thread
  dim.js                DIM tags CSV and search strings
  storage.js            browser storage and backups
  sample.js             example gear for trying the app
tests/                  unit tests
scripts/serve.mjs       local dev server
docs/how-it-works.md    the scoring and search, in detail
```

See [docs/how-it-works.md](docs/how-it-works.md) for how verdicts, scoring and the search work.

## Assumptions to check

- **Masterwork:** the builder can assume armor is masterworked: +5 to each stat a 3.0 piece didn't roll, or +2 to every stat on legacy armor. You can turn this off.
- **Archetypes:** inferred from each piece's two highest stats when the export has no archetype column. The *Powerhouse* secondary (Super) is inferred as the one pairing left unused.
- **Gear tier:** read from the export when present, otherwise estimated from the stat total (shown as `~T4`).
- **Set bonuses:** need a set column in the export. Without one, the set filter is turned off.
- **Weapon slots:** guessed from weapon type and element unless the export includes a slot column.
- **Stat mods:** treated as +10 each, capped at 200 per stat.

If DIM's column names change, update `detectArmor` / `detectWeapons` in `js/csv.js`. The Import tab's **Columns found** panel shows what was matched.

## Roadmap

- Live inventory through the Bungie.net API (OAuth with your own API key), instead of CSV exports
- Set-bonus perk descriptions and Tier 5 tuning stats in the builder
- Weapon roll grading against community wishlists
- Pushing loadouts straight into DIM

## Disclaimer

Not affiliated with Bungie or Destiny Item Manager. Destiny is a trademark of Bungie, Inc.

## License

[MIT](LICENSE)
