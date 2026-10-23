# Sales Cadence Tool

A self-hosted planner for keeping customers on a regular visit/call cadence.

- **Week calendar.** Drag appointments to move them; click an empty slot to add one. Office days are shaded, and each day shows how full it is.
- **Cadence engine.** Each customer has a cadence (e.g. every 3 weeks) and a "day". The next appointment is counted from the original date, so one missed or moved meeting doesn't shift their rhythm unless you choose "this and future".
- **Friday plan.** Log anything left open, write and copy recap emails, and fill next week with everyone who's due (balanced across Tue–Thu).
- **Monday confirm.** Next week's appointments with contact details, a copyable confirmation message, and a Confirmed button.
- **Recaps & files** on every appointment (photos, quotes, order forms).
- **Customers.** Import from Excel (.xlsx) or CSV, or paste rows copied from a spreadsheet.
- **Login.** Password with optional authenticator-app codes; sessions last 30 days.
- **HTTPS.** Let's Encrypt certificate from the Admin page, with automatic renewal.
- **Installable** on a phone's home screen. Light/dark mode and accent color are set under Settings.

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

On your home network, open `http://<nas-ip>:8080`. The first visit asks you to create the account. Whoever reaches a fresh install first gets to create it, so do this **before** you set up port forwarding.

Then go to **Admin** (account menu, top right) and consider turning on two-step codes.

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
- Uploaded files are served only to signed-in users; anything other than images, PDFs and text downloads instead of opening in the browser.
- A strict Content-Security-Policy is set, and no third-party scripts or fonts are loaded.

**Forgot your password?** Stop the container and run:
```sh
sudo docker compose run --rm cadence-book node -e "const a=require('./server/auth');a.q.setPass.run(a.hashPassword(process.argv[1]),a.q.byName.get(process.argv[2]).id)" 'new-password-here' yourusername
```

## Optional: prebuilt image

`docs/build-image-workflow.yml` builds the image on GitHub and publishes it to `ghcr.io`. Move it to `.github/workflows/build.yml` and push. Your token needs the **Workflows** permission to push that file. TrueNAS can then pull `ghcr.io/<you>/sales-cadence-tool:latest` (as a Custom App) instead of building.

## Moving data from the trial version

In the hosted trial, go to Customers → **Export** to save a CSV. Then here, go to Customers → **Import** and choose that file.

## Development

```sh
npm run dev      # http://localhost:8080, data in ./data
```
