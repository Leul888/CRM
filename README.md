# Company X — CRM

> Selling this to clients? See **[HANDOFF.md](HANDOFF.md)** for the launch checklist, Stripe subscription setup, training plan and pricing worksheet.

A production-ready CRM for a remodeling contractor. It comes with a public website that captures leads, a company-branded login, an **admin console** for administrators and **role-based user workspaces** for everyone else. One Node server handles the API and the web app, and data lives in SQLite on a persistent disk.

## What's inside

| Area | Who | Highlights |
| --- | --- | --- |
| Website `#home`, `#book` | Public | Lead-capture form (`#cta-form`) creates a lead, smart-assigns an estimator, books the visit and sends confirmations |
| E-sign `#approve/<token>` | Clients | Review line items, type-to-sign or decline. Signature records name, time, IP and device. Approval auto-creates the invoice |
| Login `#login` | Staff | Company-branded, "keep me signed in", forgot/reset password, forced change of temporary passwords |
| Admin console `#admin` | Owner, Manager, Office manager | **Branding & website** (logo, brand color, homepage text, FAQ) · **Services** (your own catalog; mark specialist services) · **Billing** (Stripe subscription, card, invoices) · **Overview** (KPIs, team, activity, system health) · **Users & access** (add users, roles, temporary passwords, reset password, deactivate, sign out sessions) · **Company** (name and details used on the login page, website and documents; tax and terms defaults) · **Messages** (every email/SMS with delivery status) · **Audit log** (sign-ins, admin changes, data changes, public events) · **System & data** (integration status, backups, restore) |
| User workspace | Everyone | Dashboard, leads (table + drag-and-drop board), calendar, estimates, work orders (checklists + photo/PDF uploads), invoices and payments, inventory, products and team, all scoped by role |
| My account `#account` | Everyone | Profile, change password, sign out other devices |

### Roles

| Role | Type | Sees |
| --- | --- | --- |
| Owner | Admin | Everything, backups/restore, can grant Owner |
| Manager | Admin | Everything, manages users |
| Office manager | Admin | Everything and company settings; can view users |
| Dispatcher | User | All leads, calendars, work orders |
| Sales rep | User | Their assigned leads and related visits/estimates |
| Estimator | User | Their leads, visits and estimates |
| Worker / Subcontractor | User | Their work orders only |

The server enforces these rules on every request. Each action checks the role permission, checks that the record is within the caller's scope, and strips fields the role may not set (for example, an estimator can't mark their own estimate approved). The UI only mirrors those rules.

## Security

- Passwords are hashed with scrypt (salted). Unknown emails take the same time to reject as wrong passwords.
- Sessions are random 256-bit tokens stored hashed. The cookie is `httpOnly` and `SameSite=Lax`, `Secure` when `COOKIE_SECURE=true`. Sessions last 7 days, or 30 with "keep me signed in".
- Changing, resetting or deactivating an account revokes that user's sessions.
- Logins, password resets, public booking and e-sign are rate-limited.
- CSRF defence: every mutating API call must be JSON (uploads require a custom header).
- Security headers are set: CSP, X-Frame-Options DENY, nosniff, Referrer-Policy, and HSTS over HTTPS.
- E-sign links use 192-bit random tokens.
- Everything admins and users do is written to the audit log.

## Run locally

```bash
npm install
npm run dev          # API on :8080 + web on :3000 (demo data on by default in dev)
```

Open http://localhost:3000. With demo data on, the login page lists demo accounts; every demo password is `Demo1234`.

For a clean workspace instead: `SEED_DEMO=false npm run dev`, then open the app and complete **first-time setup** (company name + owner account).

## Build & run in production

```bash
npm ci
npm run build        # typecheck + web bundle (dist/) + server bundle (server-dist/)
npm start            # serves web + API on $PORT (default 8080)
```

Copy `.env.example` to `.env` (or set real environment variables). Key settings:

| Variable | Purpose |
| --- | --- |
| `DATA_DIR` | Where `crm.sqlite` and `uploads/` live. **Must be a persistent disk.** |
| `APP_URL` | Public URL, used in e-sign, invite and reset links |
| `COOKIE_SECURE=true` | Required behind HTTPS |
| `ADMIN_EMAIL` / `ADMIN_PASSWORD` / `COMPANY_NAME` | Optional: create the owner on first boot (otherwise use in-browser setup) |
| `SMTP_*` | Real email (Resend, Postmark, SendGrid, Mailgun, Google Workspace, any SMTP) |
| `TWILIO_*` | Real SMS reminders |
| `SEED_DEMO` | Sample data for evaluation only. Keep `false` for a real company |
| `COMPANY_NAME` / `BRAND_COLOR` | Name (and optional hex color) for a fresh workspace. With `SEED_DEMO=true` they are re-applied on every restart, so a free demo always shows your chosen name |
| `STRIPE_SECRET_KEY` / `STRIPE_PRICE_ID` / `STRIPE_WEBHOOK_SECRET` | Subscription billing for this client (your Stripe account). Leave empty to turn billing off |
| `TRIAL_DAYS` / `BILLING_GRACE_DAYS` / `BILLING_OVERRIDE` | Trial length, grace period after a failed payment, `active` to comp a client |

Without SMTP or Twilio configured, the app still works: messages are recorded in **Admin → Messages** as *Logged*, and admins reset passwords with temporary passwords.

## Deploy

The app needs **one Node process with a persistent disk** (SQLite plus uploads). Static-only hosts such as Vercel/Netlify static aren't suitable.

- **Render**: push to GitHub, then *New → Blueprint* and pick the repo. `render.yaml` sets up the Docker service, a 1 GB disk at `/data`, the health check and env vars. Fill in `APP_URL`, `ADMIN_EMAIL` and `ADMIN_PASSWORD` (and SMTP/Twilio if you have them).
- **Fly.io**: `fly launch --copy-config --no-deploy && fly volumes create data --size 1 && fly secrets set ADMIN_EMAIL=… ADMIN_PASSWORD=… APP_URL=https://… && fly deploy`
- **Any VPS / Docker host**: `docker build -t company-x-crm . && docker run -d -p 8080:8080 -v crm-data:/data --env-file .env company-x-crm`, with Nginx/Caddy in front for HTTPS.
- **Railway**: deploy from the repo (Dockerfile is detected), add a volume at `/data`, and set `DATA_DIR=/data` plus the env vars above.

Health check: `GET /api/health`.

### Backups

Admins can download a JSON backup from **Admin → System & data**, and owners can restore one. Also snapshot the `DATA_DIR` disk (the SQLite file and `uploads/`) with your host's volume backups.

## Architecture

```
index.html, App.tsx, pages/, components/   React 19 + Tailwind UI (hash routing)
store.ts                                   Client store: API calls, typed actions, 30s refresh
core/engine.ts                             Domain rules (leads → visits → estimates → invoices → jobs)
core/seed.ts                               Demo data, empty-workspace builder, estimate math
services/permissions.ts                    Roles, page access, row-level scoping (shared by client + server)
server/index.ts                            Express app: auth, admin, public, actions, uploads, static
server/actions.ts                          Per-action authorization + scoped state
server/auth.ts                             Password hashing, sessions, resets, rate limits
server/db.ts                               SQLite (WAL) persistence, audit log
server/delivery.ts                         SMTP + Twilio delivery with Outbox status
```

SQLite comfortably serves a single company with dozens of concurrent users. If you later outgrow one server, `server/db.ts` is the only persistence layer to swap (for example to Postgres).

## Customizing per client (no code)

- **Company name**: Admin console → **Rename company** (top right). Updates the logo text, login page, website, documents and emails instantly.
- **Night mode**: everyone can switch with the moon/sun button in the header (remembered per browser; follows the device setting by default).

- **Services**: Admin → Services. Add, rename, reorder or retire services. *Specialist* services only go to specialist-qualified estimators.
- **Brand**: Admin → Branding & website. Upload a logo, pick a brand color (applies across app, login and website) and edit the homepage headline, booking text and FAQ.
- **Existing customers**: Leads → Import (CSV from Excel, Google Sheets or another CRM). Columns are auto-matched, and duplicates by email or name + phone are skipped.

## Known limits

- Google Calendar two-way sync isn't connected. Visits export as `.ics` files, and calendar events are recorded in Messages.
- Online card payments (Stripe) aren't built in. Payments are recorded manually by method.
- E-sign captures name, time, IP and user agent. Have counsel confirm it meets your ESIGN/UETA needs.
