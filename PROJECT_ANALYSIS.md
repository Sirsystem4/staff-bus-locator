# Staff Bus Tracker — Project Analysis

Analysis date: 2026-09-26 (revised after the persistence, super-admin and location-model changes)
Path: `C:\Users\Admin\Documents\Coding\staff-bus-tracker`

---

## 1. Executive summary

A small internal web app for a staff shuttle-bus car park. Staff search for their bus and see
**which zone and position it is parked in**; a transport admin records that location daily; a
super admin maintains the bus register itself.

- **Next.js 16.3.3** (App Router, React 19, Turbopack), **TypeScript 5.7.3**, **Tailwind v4**,
  Base UI + shadcn/ui (`base-nova`), lucide-react, Vercel Analytics. Scaffolded by v0.
- **Two roles, two independent 4-digit codes**, both compared **server-side** so neither is in the
  browser bundle.
- **Buses persist to `data/buses.json`.** Nothing lives only in React state any more.
- Still **no real session** — see §7 Limitations.

---

## 2. The car park model (important)

Both the **buses** and the **car park layout** are data, not code. A super admin maintains the
register and the layout; a transport admin records where each bus is parked today.

```
Layout { zones: Zone[] }        data/layout.json
Zone  { name: string, positions: number }     name is unique, positions is 01..positions

Bus { number, route, zone: string | null, position: number | null }
                  ^^^^^^  ^^^^^   ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^
                  |       |       null until a transport admin parks it
                  |       super admin owns this
                  super admin owns this
```

There is deliberately **no `row` field**; an earlier three-tier `zone/row/position` model was
removed because zone and row served the same purpose.

| Concept | Range | Owned by |
|---|---|---|
| Bus number | 1–9999, unique | super admin (immutable once created) |
| Route name | ≤ 40 chars | super admin |
| Zone | up to 24, ≤ 12 chars, unique | super admin |
| Positions per zone | 1–60 | super admin |
| Where a bus is parked | zone + position | transport admin, daily |

`zone` and `position` on a bus are **nullable**: a bus created by the super admin starts unparked,
because registration and parking are separate daily jobs. `isParked(bus)` narrows the type.

**Zone names are free text** (e.g. `A`, `NORTH`, `Block 2`) and are the value stored on each bus, so
renaming a zone cascades to the buses parked there.

### 2.1 Layout changes keep bus data consistent

| Super admin action | Effect on buses |
|---|---|
| Add a zone | none; the zone is immediately selectable by admins |
| Rename a zone | every bus in it follows the rename, positions preserved |
| Reduce a zone's positions | any bus beyond the new last position is **un-parked** (zone *and* position cleared) |
| Increase positions | nothing changes; un-parked buses are **not** resurrected |
| Delete a zone | every bus in it is un-parked |

Actions report an `affected` count so the UI can state what changed. The last remaining zone cannot
be deleted. Buses are written before the layout so the layout file is the commit point.

---

## 3. Roles and access

| Role | Route | Code (env var) | Can do |
|---|---|---|---|
| Staff | `/` | — | Search, browse zones, see locations |
| Transport admin | `/` → "Update locations" | `ADMIN_ACCESS_CODE` (4821) | Set/clear a bus's zone + position |
| Super admin | `/super-admin` | `SUPER_ADMIN_ACCESS_CODE` (9021) | Add/rename/delete buses **and** zones/positions |

`lib`-level fallbacks match the env defaults, so the app works without `.env.local`.

**Codes are separate and cross-rejected:** the super admin code does not unlock the transport admin
form, and vice versa (asserted in tests). Both are checked in `app/actions/auth.ts` with a
constant-time comparison and a `/^\d{4}$/` shape guard.

---

## 4. How it works

### 4.1 Layers

```
app/page.tsx                 server component -> reads store + layout, renders <BusFinder>
app/super-admin/page.tsx     server component -> renders <SuperAdminPanel>
components/bus-finder.tsx    client: staff search + transport admin panel
components/super-admin-panel.tsx  client: bus register + layout management

app/actions/auth.ts          'use server' code verification (never bundled to client)
app/actions/buses.ts         'use server' createBus / updateBusRoute / moveBus / deleteBus
app/actions/zones.ts         'use server' addZone / updateZone / deleteZone

lib/buses.ts                 PURE domain: bus types, validators, search engine
lib/layout.ts                PURE domain: zone types, bounds, zone helpers
lib/bus-store.ts             server-only: bus JSON persistence + legacy migration
lib/layout-store.ts          server-only: layout JSON persistence
```

`lib/buses.ts` and `lib/layout.ts` are pure and importable by both client forms and server actions,
so **one validator guards every write path**. The two store modules are server-only.

> Naming note: the action module is `app/actions/zones.ts`, **not** `layout.ts` — a file called
> `app/actions/layout.ts` is interpreted by the App Router as the layout for a `/actions` route.

`lib/buses.ts` is pure and importable by both client forms and server actions, so **one validator
guards every write path**. `lib/bus-store.ts` is server-only.

### 4.2 Persistence — `lib/bus-store.ts` and `lib/layout-store.ts`

- `readBuses()` / `writeBuses()` over `data/buses.json`, seeded from `SEED_BUSES` on first run.
- `readLayout()` / `writeLayout()` over `data/layout.json`, seeded from `SEED_LAYOUT` (A–F, 20 each).
- Writes go to `<file>.<pid>.tmp` then replace, so a crash mid-write cannot corrupt the data.
- `replaceFile()` retries on `EPERM`/`EACCES`/`EBUSY` and finally falls back to an in-place copy —
  **necessary on Windows**, where `rename` over an open file fails. The running dev server holds
  these files open, so this is a real path, not a theoretical one.
- **Bus migration:** `normalise()` accepts legacy records, drops the retired `row`, and coerces a
  missing/invalid location to `null`. The file is rewritten when it isn't already current, so an
  existing register upgrades itself without losing zones or positions.
- The bus store deliberately does **not** validate zones against the layout: the zone list is
  super-admin-editable data, and `readLayout` is the authority.
- Malformed JSON throws loudly rather than silently overwriting. A layout with zero zones is
  rejected, since a car park needs at least one.

### 4.3 Actions — `app/actions/buses.ts`

| Action | Who | Effect |
|---|---|---|
| `createBus(draft)` | super admin | Adds a bus with `zone/position = null` |
| `updateBusRoute(draft)` | super admin | Renames the route; **cannot** touch location |
| `moveBus(number, location \| null)` | transport admin | Parks, moves, or un-parks, validated against the layout |
| `deleteBus(number)` | super admin | Removes the bus |
| `addZone(zone)` | super admin | Adds a zone and its position count |
| `updateZone(previousName, zone)` | super admin | Renames and/or resizes, cascading to buses |
| `deleteZone(name)` | super admin | Removes a zone and un-parks its buses |

All validate **before** mutating. (An earlier version validated after, which made a duplicate bus
number a silent no-op reported as success.)

### 4.4 Search engine — `lib/buses.ts`

Rewritten after the first version was found broken.

- **Field-bound tokens:** `zone`/`pos`/`position`/`slot`/`bus`/`no`/`number`/`route` bind to the
  *next* token, so `zone a` means "parked in zone A".
- **Spaces narrow (AND), commas widen (OR):** `zone a row 2` → one bus; `igando,agege` → both.
- **Ranking:** exact bus number `+100`, exact route `+80`, then prefix/infix scores.
- Unparked buses expose no zone/position values, so `zone a` cannot match them, but they remain
  findable by number or route.

### 4.5 Staff UI

Search box (as-you-type, `aria-live` count), **ranked results panel with match highlighting** in the
main column, quick-filter zone chips, zone grid showing `N of M matches` and dimming empty zones,
selected-bus panel, and a filterable list. Unparked buses render an amber "Not parked yet" state
rather than a blank or a fake location. `Enter` selects the top result, `Escape` clears, and a
single unambiguous match auto-selects.

### 4.6 Super admin UI

Unlock screen, then the **bus register** (add / edit route / two-step delete, "Awaiting location"
counter, per-zone occupancy, next-free-number) and the **car park layout** section (add / rename /
resize / remove zones, with an over-capacity warning and two-step delete that states how many buses
will be un-parked). The bus form contains only bus number and route name.

The transport admin's zone and position selects are driven by the layout, and the position list is
**scoped to the chosen zone** — a 12-position zone offers only 01–12. Changing zone resets the
position to 1, and a draft position left beyond a shrunken zone is clamped to a real option.

---

## 5. Verified behaviour

Tested against the real modules (no copies): 69 assertions for the layout, 55 for the bus model,
37 for search.

- both zone and bus validators accept valid input and reject every out-of-range/duplicate/blank case
- new zone is immediately usable by admins, and position 31 of a 30-position zone is rejected
- renaming a zone moves every bus in it, preserving positions, and reports the count
- shrinking a zone un-parks buses beyond the new last position and clears **both** fields
- growing a zone does not resurrect previously un-parked buses
- deleting a zone un-parks its buses; the last remaining zone cannot be deleted
- malformed JSON and an empty zone list both fail loudly; deleting the file reseeds
- legacy bus file with `row` migrates: row dropped, zone/position preserved, nulls preserved
- `createBus` produces an unparked bus and rejects duplicates **without** inserting
- `updateBusRoute` cannot alter location; `moveBus` cannot alter route
- unparked buses are excluded from zone search but findable by route/number
- codes are cross-rejected; neither code nor fallback appears in any client bundle
- `tsc --noEmit` clean; `/` and `/super-admin` both 200

---

## 6. File inventory

```
app/
  page.tsx                  server: staff route
  super-admin/page.tsx      server: super admin route
  actions/auth.ts           code verification (server)
  actions/buses.ts          bus CRUD (server)
  actions/zones.ts          zone/position CRUD (server)
  layout.tsx                html shell, metadata, analytics
  globals.css               Tailwind v4 + shadcn OKLCH tokens
components/
  bus-finder.tsx            client: staff + transport admin UI
  super-admin-panel.tsx     client: bus register + layout management UI
  ui/button.tsx             shadcn Button — UNUSED scaffolding
lib/
  buses.ts                  pure domain: bus types, validators, search
  layout.ts                 pure domain: zone types, bounds, helpers
  bus-store.ts              server-only bus JSON persistence + migration
  layout-store.ts           server-only layout JSON persistence
  utils.ts                  cn() — used only by the unused Button
data/
  buses.json                the bus register
  layout.json               the car park zones and position counts
```

---

## 7. Limitations (honest list)

1. **No real session.** `loggedIn` / `unlocked` are client state, so a determined user can bypass
   both codes in devtools. The codes raise the bar for casual use; they are not authorization.
   Fixing this means a cookie-backed session with the panels rendered server-side only after
   verification.
2. **4-digit codes, no rate limiting.** 10,000 combinations.
3. **Single JSON file.** Fine for one server; concurrent writes from multiple instances would race.
   Move to a database when that matters.
4. **`next.config.mjs` sets `typescript.ignoreBuildErrors: true`**, so `pnpm build` will not catch
   type errors. Run `npx tsc --noEmit` manually.
5. **No tests in the repo.** The suites above were run from a temp directory and discarded. Worth
   committing with a `test` script.
6. **No lint config** (no ESLint/Biome) and no `test`/`typecheck` scripts.
7. **`package.json` is still named `my-project`**, `metadata.generator` is `v0.app`.
8. **Hard-coded hex palette** throughout, bypassing the OKLCH tokens in `globals.css`.
9. **The Help button has no handler.**
10. **Environment note:** the dev machine is a 5400rpm HDD (TOSHIBA MQ04ABF100) with Defender
    real-time scanning on, so cold compiles are very slow (minutes). Warm requests are ~2s.
    Add a Defender exclusion as administrator to fix.

---

## 8. Run

```bash
pnpm install
pnpm dev            # http://localhost:3000  +  /super-admin
npx tsc --noEmit    # the build will not do this for you
```
