# Farm Ledger 10 — Architecture

Owner: Builder agent. Status: Phase 1 (engine). Visual design comes from design/00 and design/01; sector screens from design/1x-*.md.

## 1. Principles

- Vanilla HTML/CSS/JS, ES modules, no bundler, no runtime CDN. Firebase 10.7.0 *compat* scripts are loaded from `vendor/` with classic `<script>` tags; ES modules use `window.firebase`.
- Offline-first. The service worker keeps a full copy of the app; Firestore offline persistence keeps the data. The app must open, sign in (once signed in before) and record work with no signal.
- One job per file, files kept small (target under ~300 lines). Screens never talk to Firebase directly: they use services, services use `core/store.js`.
- Everything is testable without Firebase: the store and auth each have an in-memory backend. Playwright runs the whole app against that backend (`?backend=memory`).
- Relative paths only (hosted under `/farm-ledger/` on GitHub Pages). Hash routing (`#/overview`) so no server rewrites are needed.

## 2. Folder layout

```
build/
  ARCHITECTURE.md        this file
  BUILD-LOG.md           what is done / tested / known gaps
  firebase/              NOT served. firestore.rules, firestore.indexes.json, firebase.json (emulator config)
  tools/                 dev-only node tools (firebase-tools, rules-unit-testing), sw asset-list generator
  tests/
    run.sh               runs everything
    unit/                node --test files (store, policy, services, migration)
    rules/               rules matrix (data) + emulator test + JS-model test
    e2e/                 Playwright specs (memory backend)
    fixtures/            synthetic v9 document
    rules-matrix.md      every role x action -> allow/deny (generated from tests/rules/matrix.mjs)
  screens/               screenshots 390x844, light + dark
  app/                   THE SITE (what would be published)
    index.html
    manifest.json
    service-worker.js    precaches asset-list.js entries; same network strategy as v9.14
    asset-list.js        generated: every file + content hash -> cache name
    board-feed.js        v10 Morning Board writer (same boardFeed/<token> output as v9)
    vendor/              firebase-*-compat.js (10.7.0), leaflet
    icons/
    css/                 tokens.css, base.css, components.css, motion.css (+ per-sector css later)
    js/
      app.js             boot: pick backends, start auth, mount router
      config.js          Firebase config, build id, defaults
      core/
        store.js         the ONE storage interface + backend selection
        store-memory.js  in-memory backend (+ optional rules enforcement via policy-rules.js)
        store-firestore.js Firestore compat backend
        auth.js          auth interface + backend selection
        auth-memory.js   fake auth for tests
        auth-firebase.js Firebase Email/Password
        policy.js        roles, sectors, collection -> permission table (used by UI and by rules model)
        policy-rules.js  JS model of firestore.rules (memory backend + node tests)
        router.js        hash router with screen transitions
        bus.js           tiny pub/sub
        ids.js, dates.js, html.js  helpers
      services/
        profile.js       users/{uid}
        ledgers.js       create / list (overview) / update / delete / transfer ownership
        members.js       list / change role / remove / leave
        invites.js       create share link / read / accept / revoke
        records.js       generic per-ledger collection CRUD (edit history, soft delete, live lists)
        export.js        whole-account / per-ledger JSON + CSV export
        account.js       delete account flow
      ui/
        toast.js, sheet.js, form.js, transition.js, icons.js, dom.js
      screens/           platform screens (Phase 2)
      sectors/
        registry.js      sector list in fixed order: beef, sheep, dairy, pigs, layers, broilers
        beef/ ...        Phase 3, one folder per sector, each with its own screens and collections
      migrate/
        v9-to-v10.js     Tom's v9 single document -> his Beef ledger records (dry run)
```

## 3. Data model (Firestore)

The v9 app kept the whole farm in one document (`farms/tomsfarm65748392`) holding arrays. That hits Firestore's 1 MB document limit as records grow, rewrites the whole herd on every save, and cannot be shared per area. v10 stores **one document per record**.

```
users/{uid}                                 profile: displayName, email, region, createdAt, lastLedgerId, prefs{theme}
ledgers/{ledgerId}                          name, farmName, farmId, type, region, ownerUid, createdAt, updatedAt, settings{}
ledgers/{ledgerId}/members/{uid}            uid, role, addedAt, addedBy, displayName, email, inviteCode?
ledgers/{ledgerId}/private/boardFeed        token  (owner only; Morning Board secret, Tom's beef ledger)
ledgers/{ledgerId}/meta/{name}              single settings docs (keeper, fqa, silage, places ...)
ledgers/{ledgerId}/{collection}/{recordId}  one document per record
invites/{code}                              ledgerId, ledgerName, farmName, type, role, createdBy, createdByName, createdAt, expiresAt, usedBy, usedAt
boardFeed/{token}                           Morning Board summary (unchanged from v9)
farms/{farmCode}                            v9 legacy data; read-only source for migration, left in place
```

- `type` is one of `beef | sheep | dairy | pigs | layers | broilers` (sector order is fixed everywhere).
- `region` is `NI` today; `ENG | SCO | WAL` later. Region only changes content (rules text, form names, checklist versions), never the data model.
- Every record carries: `createdAt, createdBy, updatedAt, updatedBy` and optionally `deleted: true` (soft delete keeps compliance history) and `history` (last 10 earlier versions, same as v9's editStamp).
- Domain dates (date of birth, treatment date) stay as `YYYY-MM-DD` strings, as in v9, so they sort and display without time-zone surprises. System times (`createdAt`, `expiresAt`) are Firestore Timestamps; the store converts them to JS `Date` on read.
- Collections per sector come from the designs. Common to all sectors: `finance`, `tasks`, `events`, `medicines` (use + disposal), `purchases`, `medProducts`, `fields`, `photos`. Beef (from v9): `animals`, `feedGroups`, `feedAdjust`, plus meta docs `keeper`, `fqa`, `silage`, `places`.

### Farm vs ledger — decision: derive the farm, no `farms` collection

The Overview groups ledgers by farm. I **derive** the farm instead of storing a `farms/{farmId}` document:

- Each ledger carries `farmId` (a random id created with the first ledger, reused for every further ledger the same person adds to that farm) and `farmName`.
- The Overview lists the signed-in user's ledgers with one collection-group query: `collectionGroup('members').where('uid','==',me)`, then reads each parent ledger, then groups by `farmId`.

Why: sharing happens per ledger (a shepherd is invited to the Sheep ledger only, not the whole farm), so a farm document would need its own membership list kept in step with the ledgers' lists — two sources of truth and more rules. Deriving it means one membership list per ledger, nothing to keep in sync, and a collaborator only ever sees the ledgers they were invited to (their Overview shows just those). The cost is one indexed query on start-up, which Firestore serves from the offline cache. If farm-level settings are ever needed (e.g. one holding number shared by all ledgers), they can be copied onto each ledger or a `farms/{farmId}` doc can be added later without migrating records.

### The farm space (hidden `type: "farm"` ledger, design/01 §12)

Farm-wide records (money in/out, the medicine store, map fields and places, documents, contacts, feed purchases) live in one hidden ledger per farm: `ledgers/{farmId}` with `type: "farm"` and `id == farmId`. It is created with the farm (services/ledgers.js `createFarm`), never appears in the type picker or ledger rail, and uses the same members / meta / record paths and rules as any ledger, so the owner (and any manager or accountant added to it) gets it through ordinary membership. Sector screens read it for shared things (e.g. Beef's data.js reads the farm medicine store and contacts from it when the user is a member). A sector's own money (e.g. a Beef sale's £ lines, 01 §15.2) is written to that sector ledger's `finance` collection, and Overview → Money sums the farm space and every sector ledger the user can read money in. Deleting a farm deletes its sector ledgers first and the farm space last (services/account.js sorts `type: "farm"` to the end), so nothing is orphaned.

### Photos (Firestore, not Cloud Storage — the Spark plan has no Storage for new projects)

```
ledgers/{lid}/photos/{photoId}            parentColl, parentId, parentLabel, money, takenAt, by, byName,
                                          w, h, bytes, caption, chunkCount, mime, thumb (~240 px JPEG data URL)
ledgers/{lid}/photos/{photoId}/chunks/{n} { n, data }  base64 JPEG, <= 700,000 chars (rules: <= 750,000)
```

- The phone shrinks every picture before saving (services/photo-image.js + photo-codec.js): longest side 1600 px, JPEG quality 0.72 stepped down to 0.40, then 80 % of the size, until <= 350 KB — so a photo is almost always one chunk and well under Firestore's 1 MiB document limit. Re-encoding on a canvas drops EXIF (GPS, phone model); the browser applies the EXIF rotation when decoding.
- A photo follows its parent record. `money = (parentColl == "finance")`: money photos are seen by owner / manager / accountant, every other photo by owner / manager / worker / viewer; whoever can write the parent record can add, caption and delete its photos. Virtual parents are allowed (`checklist` with id `<list>.<item>` for inspection evidence). Because Firestore only allows a list the rules can prove, non-managers always query with `where money == <bool>` (services/photos.js does this).
- Offline: the photo doc + chunks go in one batch; Firestore keeps it on the phone. `watchQuery` meta carries `pendingIds`, shown as "Waiting to upload".
- UI: ui/photo-strip.js (strip in any record sheet; draft mode commits when the record is saved), ui/photo-viewer.js (full-screen viewer), screens/photos.js (Ledger More → Photos, Farm More → Farm photos). Export puts each photo in the zip under `<ledger>/photos/`; delete-ledger and hard-delete of a record remove photos and chunks.

## 4. Roles and security model

| Role | Ledger settings | Members & invites | Operational records | Finance | Delete records |
|---|---|---|---|---|---|
| owner | edit, delete ledger, transfer ownership | invite any role except owner; change roles; remove | read + write | read + write | yes |
| manager | edit (not owner/type) | invite worker / viewer / accountant; cannot change roles | read + write | read + write | yes |
| worker | read | read list | read + write (soft delete only) | **no access** | no (soft delete) |
| viewer | read | read list | read only | **no access** | no |
| accountant | read | read list | **no access** | read + write | no (soft delete) |

Decisions (guesses the designer may overturn — they are one table in `core/policy.js` and one block in `firestore.rules`):
- Workers and viewers do not see money. Farm hands, relief milkers and family viewers rarely need the books; the owner can make someone a manager if they do.
- Accountants see finance (and the ledger name, members) only.
- Nobody but owner/manager hard-deletes; everyone else's "delete" sets `deleted: true`, so inspection history survives.

Rules summary (`build/firebase/firestore.rules`):
- `users/{uid}`: only that user.
- `ledgers/{id}`: get by members; create only with `ownerUid == me` together with my owner member doc; update by owner/manager, `ownerUid` changes only by the owner to an existing member (transfer); delete by owner.
- Listing ledgers is impossible except via your own membership docs (collection-group rule only returns docs where `uid == me`), so nobody can list other people's ledgers.
- `members/{uid}`: read by members of that ledger. Created as owner only by the ledger's `ownerUid`; created as anything else only by the invited user themselves, in the same batch that marks a valid, unused, unexpired invite for that ledger as used by them, with exactly the invite's role.
- `invites/{code}`: `get` by any signed-in user who knows the code (long random code), never `list`. Create by owner/manager of that ledger (managers cannot invite managers; nobody invites an owner), max 14 days expiry. Update only to mark used, by the accepting user. Delete (revoke) by the creator or the ledger owner.
- `boardFeed/{token}`: Tom's v9 rule kept exactly (anyone may `get` with the token, no `list`, only Tom's UID writes, token >= 40 chars).
- `farms/{path=**}`: Tom's v9 rule kept (Tom only) so the migration can read the old document.
- Everything else denied.

The same permission table lives in `core/policy.js` (UI hides what you cannot do) and `core/policy-rules.js` (a JS model of the rules that the memory backend enforces, so Playwright tests see real permission-denied errors). `tests/rules/matrix.mjs` is the single list of role x action cases; it drives both the JS-model test (runs now) and the emulator test (runs when the Firestore emulator can be downloaded).


## Notifications (builder-notify, 2026-10-27)

- **One source of truth for "what needs doing"**: `services/duties.js` calls each sector's own `alerts(ledger, role)` and `tasks(ledger)` plus hand-made tasks, and `services/notify-core.js` (pure functions: prefs, time zones, quiet hours, classification into kinds, money redaction, messages, dedupe keys) turns them into items. The bell, the notification centre (`#/notifications`), the app badge, the "became late" pop-up on open/resume and the hourly sender all use these two files — no duplicated alert logic.
- **Per-phone opt-in** (`services/notify.js`, `screens/notify-settings.js`, route `#/settings/notifications`): permission is requested only inside the Turn on tap. The FCM token comes from `vendor/firebase-messaging-compat.js` (10.7.0, from the npm package) with the VAPID public key `FCM_VAPID_KEY` in `config.js` (empty = push not set up; the screen says so). Stored at `users/{uid}/devices/{deviceId}` `{ token, platform, ua, createdAt, lastSeen, tz, prefs }`; refreshed on open, removed on turn-off, sign-out and account deletion; included (token hidden) in the data export.
- **Dedupe log** `users/{uid}/notifyLog/{logId}` `{ key, sentAt, kind, … }`: "now late" items once per person (the app writes it too when it shows the pop-up, so the sender doesn't repeat it), summaries once per phone per local day, accepted invites once. Pruned after 60 days.
- **Service worker**: `push` shows the sender's data-only message (title, body, url, tag, badge) and sets the app badge; `notificationclick` focuses an open window and posts `{type:'fl-open', url}` (the page navigates) or opens `index.html#<url>`. No Firebase code in the worker; offline caching unchanged.
- **Sender** (`build/notify/`, run hourly by `.github/workflows/notify.yml`, Node 20, firebase-admin): `admin-store.mjs` implements the app's store interface over the Admin SDK, so `sender.mjs` runs the app's sector code unchanged in Node (per person: `session.useLedgers`, roles respected exactly as in the app, process TZ set to the phone's zone). `--dry-run` uses the in-memory store and the e2e seed scripts (all six sectors) via `fixtures.mjs`.
- **Rules**: `users/{uid}/devices/*` and `notifyLog/*` read/write by that uid only; no collection-group access (only the Admin SDK reads all phones).
