# Sales Cadence Tool

A self-hosted planner for keeping customers on a regular visit/call cadence.

- **Week and Month calendars.** Drag appointments to move them on the Week view; click an empty slot to add one. Office days are shaded, today is highlighted, and each day shows how full it is. Weeks start on Sunday or Monday (Settings → Appearance). A color key sits under both calendars.
- **Customer colors.** Assigned accounts are green, unassigned accounts blue, prospects yellow. Proposed appointments are dashed, done ones grey, missed ones red.
- **Not scheduled list** beside the Month calendar: active customers with nothing booked between today and one default cadence from now (Settings → Default cadence for new customers), each with a Schedule button.
- **Cadence engine.** Each customer has a cadence (4 weeks by default) and a "day". The next appointment is counted from the original date, so one missed or moved meeting doesn't shift their rhythm unless you choose "this and future".
- **Prospects.** Tick Prospect on a customer to follow up on the prospect cadence (2 weeks by default). After 4 follow-ups (adjustable) they're tagged "Going cold". Convert to customer puts them back on the normal cadence.
- **Customer records** include a customer ID, assigned account, and checkbox lists for **Currently buying**, **Competitor equipment brands** and **Current distributor**. Each list has a + on the customer and a master list in Settings.
- **Recap and Plan** (Fridays). The Recap side logs what happened and sends recap emails. The Plan side shows next week's load, upcoming appointments with your action items, action items further out, and everyone due but not scheduled (Add all balances them across Tue–Thu).
- **My action items** on every appointment: your to-dos for that customer before the next meeting, with checkboxes to tick them off. They show on Recap and Plan and on the Week view's confirmation list.
- **Confirm visits** beside the Week calendar: the shown week's open visits with contact details, action items, a copyable confirmation message, Previous recap, and Confirmed, Move and Cancel buttons. Confirmed visits collapse to one line with Undo.
- **US federal holidays** appear on the calendar automatically. New Year's, Memorial Day, July 4th, Labor Day, Thanksgiving and the day after, and Christmas are blocked like time off; the rest are labeled only. Add your own time off under Settings → Holidays & time off.
- **Team accounts.** Global admin → Sales director → Regional sales manager → Territory sales manager, with an optional Admin permission on any role. See "Accounts and roles" below.
- **@mentions and notifications.** Type @ in an agenda, recap or action items box to tag anyone in the company. They get a notification in the bell tray at the top, which opens the appointment if it's on their team's calendar. If it isn't, tagging shares that one appointment with them read-only (agenda, recap and action items). Each person is notified once per mention, and tags are removed from emails to customers.
- **Recaps & files** on every appointment (photos, quotes, order forms).
- **Import and export.** Customers import from Excel (.xlsx) or CSV, or from rows pasted from a spreadsheet, and export to CSV. A week exports as a calendar CSV.
- **Login.** Password with optional authenticator-app codes; sessions last 30 days.
- **HTTPS.** Let's Encrypt certificate from the Admin page, with automatic renewal.
- **Installable** as an app on Android (account menu → Install app) and iPhone (Safari → Share → Add to Home Screen).
- **Themes.** Match device, Light, Dark (graphite), Midnight blue or OLED black, plus an accent color, from the account menu or Settings. Each person's theme follows them across devices.

No npm packages: it runs on Node 22's built-in SQLite and crypto, so there's nothing to install or patch beyond the Node image.

---

## Install on TrueNAS SCALE

### 1. Make a dataset for the data

In **Datasets**, create one (for example `tank/apps/cadence-book`). Its folder holds the database, uploaded files and the certificate. Give the `apps` user (UID 568) read/write access, or change `user:` in `docker-compose.yml` to match the dataset's owner.

Include this dataset in a **periodic snapshot** task. That is your backup of everything, attached files included.

### 2. Get the code onto the NAS and start it

From the TrueNAS shell (System → Shell), or over SSH:

```sh
cd /mnt/tank/apps
git clone https://github.com/<your-username>/sales-cadence-tool.git
cd sales-cadence-tool
# edit docker-compose.yml: set the volume path to your dataset and your TZ
sudo docker compose up -d --build
```

Updating later:

```sh
cd /mnt/tank/apps/sales-cadence-tool && git pull && sudo docker compose up -d --build
```

(Prefer clicking in the UI? TrueNAS 24.10+ has **Apps → Discover → Custom App → Install via YAML**. That route needs a prebuilt image, so see "Optional: prebuilt image" below.)

### 3. Create your account (before opening it to the internet)

On your home network, open `http://<nas-ip>:8080`. The first visit asks you to create the account. Whoever reaches a fresh install first gets to create it, so do this **before** you set up port forwarding. The first account is a Territory sales manager with Admin, so it has its own customers and can manage everyone.

Then go to **Admin** (account menu, top right) and consider turning on two-step codes. Add your team there under **People**.

### 4. Router and DNS

1. Create a DNS record (for example `planner.yourdomain.com`) pointing to your home's public IP. If your IP changes, use dynamic DNS (DuckDNS, Cloudflare DDNS, or your registrar's).
2. On your router, forward:
   - outside **TCP 80 → NAS port 8080**
   - outside **TCP 443 → NAS port 8443**

   TrueNAS's own web UI already uses ports 80/443 on the NAS, which is why the app uses 8080/8443 and the router translates.

### 5. Get the certificate

Admin → **HTTPS certificate**:

1. Enter the domain and your email, then click **Check port 80**. Some routers can't reach their own public address from inside (no "hairpin NAT"), so a failed check here isn't always a real problem.
2. Click **Test with staging**. This uses Let's Encrypt's test service, which has loose rate limits. Browsers will warn about this test certificate; that's expected.
3. Click **Get real certificate**. HTTPS turns on immediately, with no restart. Renewal is automatic.

Then open `https://planner.yourdomain.com` on your phone and add it to the home screen (Safari: Share → Add to Home Screen; Chrome: ⋮ → Install app).

---

## Accounts and roles

Roles, from the top: **Global admin**, **Sales director**, **Regional sales manager (RSM)**, **Territory sales manager (TSM)**. Each person reports to someone with a higher role.

- **What people see.** Everyone has their own customers and calendar. A manager also sees and can edit everyone below them in their chain: an RSM sees their TSMs, a director sees their RSMs and those RSMs' TSMs, and an admin sees everyone. Managers switch between people with the **Viewing** menu in the top bar (or pick **Whole team**). A customer or appointment added while viewing someone goes to that person.
- **Who manages whom.** Admin → **People** lets you add people, change their role or manager, reset passwords and turn accounts off. An admin manages everyone. A director manages the RSMs and TSMs below them, and an RSM manages their TSMs. Turning an account off signs that person out everywhere.
- **Admin is also a permission.** Any role can have Admin on top, such as a TSM + Admin who works a territory and runs the app. Only admins see HTTPS and backups, and only admins can grant Admin. The app always keeps at least one active admin.
- **Profile photos.** Everyone can set their name and photo under Admin → Your profile. Photos are cropped and shrunk on the device before upload. Managers can also set photos for the people they manage. Photos show on the account button and in the People list.
- **Settings.** Personal settings (theme, visit and office days, cadence, templates, time off) belong to each person. The product categories, competitor brands, distributors and the holiday switch are shared by the whole company. Admins, directors and RSMs can edit those; TSMs see them read-only.

Upgrading from the single-user version is automatic. The existing account becomes TSM + Admin and keeps all of its customers, appointments and settings.

## Configuration

| Variable | Default | Purpose |
|---|---|---|
| `DATA_DIR` | `/data` | Database, uploads, certificates |
| `HTTP_PORT` / `HTTPS_PORT` | `8080` / `8443` | Ports inside the container |
| `PUBLIC_HTTPS_PORT` | `443` | Outside HTTPS port, used for http→https redirects |
| `TRUST_PROXY` | `false` | Set `true` only behind a reverse proxy (uses `X-Forwarded-*`) |
| `MAX_UPLOAD_MB` | `25` | Largest attachment |
| `SESSION_DAYS` | `30` | How long a sign-in lasts |
| `TZ` | – | Your time zone |

## Security notes

- Passwords are hashed with scrypt; session tokens are stored hashed; cookies are `HttpOnly` and `SameSite=Lax`.
- Repeated wrong passwords lock out that IP for 1 minute, then for longer each time after that.
- Every request that changes data needs a custom header, which blocks cross-site request forgery.
- Every customer, appointment and file is checked against who owns it, so people only reach their own records and their team's.
- Uploaded files are served only to signed-in users who can see the appointment; anything other than images, PDFs and text downloads instead of opening in the browser.
- A strict Content-Security-Policy is set, and no third-party scripts or fonts are loaded.

**Forgot your password?** Stop the container and run:
```sh
sudo docker compose run --rm cadence-book node -e "const a=require('./server/auth');a.q.setPass.run(a.hashPassword(process.argv[1]),a.q.byName.get(process.argv[2]).id)" 'new-password-here' yourusername
```

## Prebuilt image

`.github/workflows/build.yml` builds the image on every push to `main` and publishes it as `ghcr.io/<you>/sales-cadence-tool:latest`. TrueNAS can run that as a Custom App (Install via YAML) instead of building it.

To update, wait for the build to finish on GitHub (Actions tab). Then open the app in TrueNAS and click **Edit → Save**. If the app's YAML has `pull_policy: always`, saving pulls the new image; otherwise stop and start the app.

## Moving data from the trial version

In the hosted trial, go to Customers → **Export** to save a CSV. Then here, go to Customers → **Import** and choose that file.

## Development

```sh
npm run dev      # http://localhost:8080, data in ./data
```

### Load testing

`scripts/load-test/` builds a database the size of a 37-person team and times it. That's 1 admin, 1 director, 5 RSMs and 30 TSMs, with 4,650 customers and about 121,000 appointments. Use an empty folder, never your real data:

```sh
node --disable-warning=ExperimentalWarning scripts/load-test/seed.js /tmp/cadence-load
DATA_DIR=/tmp/cadence-load HTTP_PORT=8090 HTTPS_PORT=8453 node server/index.js &
node scripts/load-test/measure.mjs http://localhost:8090      # /api/state size and time per role
node scripts/load-test/measure-ui.cjs http://localhost:8090   # draw time per screen (needs Playwright installed)
```

On that data a director's `/api/state` is about 44 MB raw and 1.4 MB gzipped, returned in about 0.7 s. Every screen draws in under 0.1 s, except the admin's whole-company Recap and Plan, which takes about 0.2 s.
