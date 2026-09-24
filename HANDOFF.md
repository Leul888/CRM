# Client handoff & subscription playbook

How to launch this CRM for a paying client (for example a home construction company), bill them monthly, and support them. You host it; they subscribe.

---

## 1. One-time setup (you, once)

1. **GitHub**: keep this code in one private repo. Every client runs from it, so a fix pushed once updates everyone.
2. **Stripe** (stripe.com):
   - Create a product, e.g. *"CRM – Standard"*, with a **recurring monthly price**. Copy the Price ID (`price_…`).
   - Settings → Billing → **Customer portal**: turn it on (lets clients update cards, see invoices, cancel).
   - Developers → API keys: copy the **secret key** (`sk_live_…`; use `sk_test_…` while testing).
3. **Render** (render.com), or Fly.io / any Docker host, with a payment method on file.
4. **Resend** (resend.com) or another email provider: one account for you. Each client verifies their own sending domain inside it.

## 2. Launch a client (≈45 minutes)

| Step | Where | What |
| --- | --- | --- |
| 1 | Render → New → Blueprint | Pick the repo. Rename the service to the client (e.g. `acme-builders-crm`). The Blueprint adds a disk at `/data` |
| 2 | Render → Environment | `ADMIN_EMAIL` = client owner's email · `ADMIN_PASSWORD` = temporary · `COMPANY_NAME` · `APP_URL` = their final URL · `SEED_DEMO=false` |
| 3 | Render → Environment | Billing: `STRIPE_SECRET_KEY`, `STRIPE_PRICE_ID`, `TRIAL_DAYS` (0 if they pay up front) |
| 4 | Stripe → Developers → Webhooks | Add endpoint `https://<their-url>/api/billing/webhook` with events `checkout.session.completed`, `customer.subscription.created/updated/deleted`, `invoice.paid`, `invoice.payment_failed`. Paste the signing secret into `STRIPE_WEBHOOK_SECRET` |
| 5 | Their DNS | CNAME `crm.theircompany.com` → the Render URL; add the custom domain in Render (HTTPS is automatic) |
| 6 | Resend | Verify their domain; set `SMTP_HOST=smtp.resend.com`, `SMTP_PORT=2465` (Render's free plan blocks 25/465/587; 2465 isn't on that list), `SMTP_USER=resend`, `SMTP_PASS=<api key>`, `SMTP_FROM=crm@theircompany.com` |
| 7 | Optional: Twilio | `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_FROM` for SMS reminders (pass SMS costs through or bundle them) |
| 8 | The app | Sign in as the owner, set the real password, then **Admin console → Users** and add yourself as a *Manager* for support (put this in the agreement) |
| — | Going from demo to live | If this service ran with `SEED_DEMO=true`, set it to `false` (and set `ADMIN_EMAIL`/`ADMIN_PASSWORD`). On the next deploy the demo data and demo logins are removed automatically and the demo box disappears from the login page |

## 3. Configure it for their business (with them on a call)

- **Admin → Company**: legal name, phone, email, address, tax rate, estimate validity, invoice terms. Turn on **Phone alerts for new leads** and connect the owner's phone with the free ntfy app.
- **Admin → Branding & website**: logo, brand color, homepage headline, booking text, FAQ.
- **Admin → Services**: replace the remodeling defaults with what they sell, e.g. *New home build* (specialist), *Additions* (specialist), *Roofing*, *Framing*, *Decks & outdoor*. New services are automatically offered by all estimators.
- **Admin → Users**: add their team with the right roles using **Invite link** (emailed if email is set up, otherwise copy it and text it). Each person picks their own password. Mark estimators who can run specialist jobs as *Specialist-qualified*.
- **Leads → Import**: upload their existing customer spreadsheet (CSV). Duplicates are skipped.
- **Products / Inventory**: add their standard packages so estimators can build estimates fast.
- **Billing**: the owner clicks **Subscribe** and pays by card in Stripe Checkout. You can also send them the Stripe customer portal.

## 4. Training (1 hour)

1. Owner/admins: Admin console, users, company settings, audit log, backups.
2. Office: leads board, calendar, estimates → e-sign → invoice → payments.
3. Estimators: their calendar, writing estimates from the product catalog, sending for signature.
4. Crews (on their phone): work orders, checklists, uploading job photos.

Give them the URL, the login page (`/#login`) and your support contact.

## 5. How billing behaves

| Situation | What the client sees |
| --- | --- |
| Trial (`TRIAL_DAYS`) | Full access; admins see "Free trial ends …" with a Subscribe link |
| Active | Normal. Admin → Billing shows renewal date and *Manage card & invoices* |
| Payment failed | Full access for `BILLING_GRACE_DAYS` (default 7) with an "Update card" banner |
| Lapsed / canceled / trial ended | **Read-only**: sign-in, viewing, exports and billing still work; changes, online booking and e-sign pause until renewed |
| `BILLING_OVERRIDE=active` | Comped client, never locks |
| No Stripe keys | Billing is off entirely |

Status comes from the Stripe webhook, from the return trip after checkout, a 6-hourly sync, and the **Refresh status** button.

## 6. Pricing worksheet (fill in with current prices)

| Cost per client / month | Amount |
| --- | --- |
| Render web service + 1 GB disk | $ |
| Email (Resend/Postmark) | $ |
| SMS (Twilio number + messages) | $ |
| Stripe fees (≈ % of subscription) | $ |
| **Your time**: support, updates, backups | $ |
| **Total cost** | $ |
| **Monthly price** (cost × margin) | $ |
| One-time setup / onboarding fee | $ |

Common structure: setup fee + monthly subscription, with an annual option (two months free). Charge SMS by usage if they send a lot.

## 7. Agreement checklist (have a lawyer review)

- You own the software; they receive a subscription license to use it.
- **They own their data.** On cancellation you provide a full export (Admin → System & data → Download backup) and delete their instance after an agreed period.
- Fees, billing date, late payment → read-only after grace period.
- Support hours, response times, planned maintenance windows.
- Uptime target and backups (Render disk snapshots + weekly JSON export).
- Privacy/security: where data is hosted, who has access (your support Manager account), breach notification.
- E-signature: the app records name, time, IP and device; the client confirms it meets their legal needs.
- Term, renewal, cancellation notice, price changes with notice.

## 8. Ongoing operations

- **Updates**: merge to `main` → every client auto-deploys. Test first on a staging service running with `SEED_DEMO=true`.
- **Monitoring**: a free UptimeRobot check on `https://<client>/api/health`.
- **Backups**: Render disk snapshots, plus a monthly JSON export you keep.
- **Support access**: your Manager account; everything you do shows in their audit log.
- **Offboarding**: download a backup and send it to them, cancel the Stripe subscription, then delete the Render service after the agreed retention period.
