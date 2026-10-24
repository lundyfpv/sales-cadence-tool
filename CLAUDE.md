# Sales Cadence Tool: notes for Claude

Read this before you change anything. It covers what the app does, how it's built, and how it gets deployed.

## Who uses it
Alec, a field sales rep, set it up and is its admin (his account is TSM + Admin). Other people can have accounts under a sales hierarchy (see Accounts below). He sees customers on a cadence (usually 3 weeks, some 5). Visits happen Tue–Thu. Mondays are office days for confirming the week's appointments, and Fridays are office days for sending recaps and planning the next week. He uses it on his phone (installed to the home screen) and his desktop.

## Deployment
- Runs on Alec's TrueNAS SCALE as a Custom App (Install via YAML), using the image `ghcr.io/lundyfpv/sales-cadence-tool:latest`.
- `.github/workflows/build.yml` rebuilds that image on every push to `main`. Alec then clicks Update in TrueNAS to pull it.
- The container runs as UID 568 (`apps`). Data lives in `/data`, mounted from a dataset: `cadence.db` (SQLite), `uploads/`, `certs/`.
- Ports: 8080 (HTTP, which also answers the ACME HTTP-01 challenge) and 8443 (HTTPS). The router forwards outside 80→8080 and 443→8443, because TrueNAS's own UI owns 80/443.
- **Every push to main ships to production.** Keep `main` working. Check JavaScript syntax with `node --check` and run the server locally before pushing.

## Hard constraints
- **No npm dependencies.** The server uses only Node 22 built-ins (`node:sqlite`, `crypto`, `http/https`). The front end is plain JS with no build step. Excel import uses `public/xlsx-lite.js` (built on DecompressionStream). Don't add packages without asking Alec.
- The CSP is strict: `script-src 'self'`, so no inline scripts and no third-party scripts or fonts. Inline `style=""` attributes are allowed.
- Every state-changing API call must send the header `X-CB: 1`. This is the CSRF guard.
- Never commit `data/`, `.db`, `.pem` or `.key` files, or any secret. The repo is public.

## Layout
- `server/index.js`: HTTP/HTTPS servers, routing, the auth gate, the files API, admin endpoints, and ACME jobs plus auto-renew.
- `server/store.js`: SQLite schema and the generic document store (`docs` table: coll + id + JSON), the files table, kv, and the revision counter behind live updates.
- `server/auth.js`: scrypt password hashing, sessions (only token hashes are stored), TOTP, and login throttling.
- `server/acme.js`: a minimal RFC 8555 client (ES256 JWS, DER CSR builder, HTTP-01).
- `public/app.js`: the whole planner UI. Writes go through `S.db.collection(...).doc(id).set/update/delete`, a shim over `/api/docs/:coll/:id`. Live updates come over SSE at `/api/events`, which makes the page re-fetch `/api/state`.
- `public/admin.*`, `public/login.*`: the admin and login pages. `theme.js` applies light/dark mode and the accent color before first paint.

## Accounts
- `users` rows: role (admin|director|rsm|tsm, ranked in that order), is_admin (admin permission on top of any role), manager_id (reports to; must outrank them), name, active, photo (time it was last set; the image is `uploads/avatar-<id>`, cropped to 256px in the browser, served at `/api/users/<id>/photo`).
- Each person sees their own records plus everyone below them in the chain; an admin sees everyone (`auth.visibleOwners`). Every docs/batch/files request is checked against that list in `writeDoc` / `apptVisible` (server/index.js). Never return or write a record without that check.
- Managing people (`/api/users`): an admin manages anyone but themselves; others manage people below them in their chain who have a lower role and are not admins (`auth.canManage`, `roleProblem`). Only admins grant Admin, and at least one active admin must remain. Anyone can change their own name; an admin can also set their own manager (Admin → People → Reports to…).
- The client loads everything it may see (`S.raw`) and narrows it with the **Viewing** picker (`applyView`). Writes made while viewing someone send `?owner=` so new customers belong to them.

## Company logo
- Admin → Company logo: the browser draws every icon size from the uploaded image and posts each PNG to `POST /api/admin/brand?file=<name>`. Files live in `DATA_DIR/brand/` (never commit a company logo; the repo is public). While they exist, requests for `/icons/icon-192.png`, `icon-512.png`, `maskable-512.png`, `apple-touch-icon.png` and `icon.svg` are answered from there. Optional wide logos `signin.png` and `header.png` are served at `/brand/signin.png` and `/brand/header.png`. `brandInfo()` reports which exist (in `/api/session`, `/api/state` and admin status). `DELETE /api/admin/brand?file=signin.png|header.png` removes one; with no file it restores the whole built-in look. Icons are served `no-cache` so a change shows right away.

## Mentions and notifications
- `@username` in an appointment's notes, recap or actions notifies that user once per appointment and field (`notifyMentions` in server/index.js; `mentions_sent` remembers who was told). Tables: `notifications` (per recipient, with a text excerpt, customer and date, so the note reads even without access to the appointment) and `mentions_sent`.
- Being tagged shares that appointment read-only: `GET /api/mention/<apptId>` returns its agenda, recap and action items only if the user has a notification for it. The tray opens the real appointment when it's in the user's chain, and this read-only view otherwise.
- `/api/state` includes `directory` (every active user: id, username, name, role, photo; used for @ autocomplete) and the user's last 50 `notifications`. `POST /api/notifications/read` takes `{ids}` or `{all: true}`.
- Usernames can contain `.`, `_`, `@` and `-`, so mentions are matched per known username (`mentioned` / `mentionRe`), not with a generic pattern. `fill()` strips mentions so customer emails never include them.

## Data model
- `docs.owner` is the user id each customer and appointment belongs to. New appointments take their customer's owner.
- **customers**: name, custId (the customer's own ID, free text), prospect (bool), prospectSince (date it became a prospect), assigned (bool, assigned account), products (array of category names they currently buy), competitors (array of competitor equipment brands; older records may still have a single `competitor` string, read as a one-item list), distributors (array of current distributors), contact, phone, email, address, kind (visit|call|email|text), cadence, unit (weeks|days), homeDay (0–6 or ''), preferredTime, duration, active, notes, lastTouch, rhythmDate.
- **appointments**: customerId, name, kind, date (YYYY-MM-DD), time (HH:MM or '' = all day), duration, status (proposed|confirmed|completed|missed|cancelled), rhythmDate, notes (agenda), recap, actions ("My action items": the rep's to-dos before the next meeting, one per line; an upcoming appointment shows its own plus those from the customer's last meeting), actionsDone (texts of the items ticked off), recapSent.
- **settings** are stored in two docs: personal ones in `config/u:<userId>`, and company-wide keys (`store.COMPANY_KEYS`: productCategories, competitors, distributors, competitorsSeeded, usHolidays) in `config/company`. The client still reads and writes one merged object at `config/settings`, and the server splits it. Company keys are only saved for admins, directors and RSMs.
- **settings** fields: visitDays, officeDays, dayStart/End, visitLength, buffer, maxVisitsPerDay, default cadence, autoNext, blackouts[], message templates, theme {mode (system|light|dark|midnight|oled), accent}, weekStart (0 = Sunday, the default; 1 = Monday; only affects the Week and Month calendars), prospectCadence (weeks, default 2), coldAfter (follow-ups before a prospect shows "Going cold", default 4), productCategories[], competitors[], distributors[] (the master lists behind the customer checkboxes, edited in Settings or with the + on a customer), competitorsSeeded (one-time copy of old competitor values done), usHolidays (default true: show US federal holidays computed in `usHolidays()`; the major ones block like blackouts).
- **Calendar colors** come from the customer, not the appointment type: prospects yellow, assigned accounts green, everyone else blue. Status still overrides (proposed is dashed, done is grey, missed is red).

## Cadence rules (agreed with Alec; don't change them without asking)
- The next due date is counted from the appointment's **rhythmDate** (its original slot), not from the day it actually happened.
- A missed or cancelled appointment still rolls forward from the original rhythm.
- When an appointment is moved to another date, the app asks: "Just this one" (rhythm unchanged) or "This and future" (rhythmDate and homeDay change).
- Week-based cadences land on the customer's homeDay. If a date falls on a non-visit day, it moves to the nearest visit day (Mon→Tue, Fri→Thu), and blackout dates are skipped.
- Mon and Fri visits are allowed, with a warning.
- The Friday plan's "Add all" spreads visits to the lightest Tue–Thu day once a day reaches maxVisitsPerDay.
