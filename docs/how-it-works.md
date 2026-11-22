# How Loadout Forge works

## 1. Reading DIM exports (`js/csv.js`)

DIM's spreadsheet headers have changed over the years, so columns are matched **by name, with fallbacks**, not by position:

- **Stats.** Each Armor 3.0 stat is looked up under its current name (`Grenade (Base)`) and its legacy name (`Discipline (Base)`). Base columns (without mods) are preferred. If any base column is missing, the current values are used instead and the masterwork assumption is switched off.
- **`Class` is ambiguous.** It's both a stat and a character class. A column is only treated as the character class if its values look like `Hunter`/`Titan`/`Warlock`. DIM's `Equippable` column is preferred.
- **`Tier` is ambiguous.** Older exports used it for rarity (Legendary/Exotic); Armor 3.0 uses it for gear tier (1–5). The values decide which it is.
- **Legacy armor.** A piece with five or six non-zero stats is treated as Armor 2.0, because Armor 3.0 pieces roll exactly three.

## 2. Verdicts (`js/evaluate.js`)

Within each class + slot, piece **B outclasses piece A** when all of these hold:

- B has every stat ≥ A's, and at least one stat higher. With exact copies, one is kept.
- Same exotic (by name). A legendary can only be outclassed by another legendary.
- If A belongs to a set, B is in the same set, so set bonuses are never lost.
- B's gear tier is not lower. Tier 5 carries extra features, so it is never replaced by a lower tier.

Anything not outclassed is **Keep**, or **Legacy** if it uses the old stat spread.

## 3. The builder (`js/optimizer.js`)

### Scoring

For each stat *i*, with priority weight *wᵢ* and minimum *Tᵢ*:

```
value(i, v) = wᵢ · min(v, 200) − 6 · max(0, Tᵢ − v)
score       = Σ value(i, vᵢ) + 0.01 · Σ min(vᵢ, 200)
```

Each point short of a minimum costs more than any priority can earn, so builds that meet your minimums come first. The small last term breaks ties toward higher total stats.

### Mods

Each stat mod adds +10 to one stat. Because `value` is concave (its gain per point only goes down as *v* rises), placing mods **greedily, one at a time, where they gain the most** gives the best possible placement. The tests check this against a brute-force search.

### Search

1. Gather the class's armor per slot and apply the exotic rule: any exotic (exactly one), no exotic, or a specific exotic locked into its slot.
2. **Pareto-prune** each slot: drop pieces another piece beats or ties on every stat, keeping exotics and set pieces in separate groups.
3. If the search would still be over 2.5 million combinations, trim the lowest-scoring pieces from the largest slot. The top 3 exotics and top 5 set pieces in each slot are always kept.
4. Check every remaining combination in a Web Worker, skipping branches that can no longer meet the exotic or set requirement. Keep the top 8.

## 4. Storage (`js/storage.js`)

Imported gear and loadouts are saved in your browser's `localStorage`. **Download backup** writes everything to a JSON file. **Restore** merges its loadouts into what's there and fills in gear if you only have the sample data loaded.
