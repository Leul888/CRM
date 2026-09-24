import './env';
import express, { type NextFunction, type Request, type Response } from 'express';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { CRMState, Role, ServiceType, User } from '../types';
import { CRMEngine } from '../core/engine';
import { buildEmptyState, buildSeedState, uid } from '../core/seed';
import { can, isAdminRole } from '../services/permissions';
import { SERVICE_TYPES, isEmail } from '../services/format';
import { DATA_DIR, DB_PATH, audit, db, getMeta, loadState, pruneAudit, saveState, setMeta, wipeState } from './db';
import {
  activeSessionCount,
  INVITE_TTL_MS,
  burnTime,
  clearAllCredentials,
  consumeResetToken,
  createResetToken,
  createSession,
  destroySession,
  emailInUse,
  generateTempPassword,
  getCredential,
  getCredentialByEmail,
  passwordProblem,
  peekResetToken,
  pruneSessions,
  rateLimited,
  revokeUserSessions,
  sessionUserId,
  setCredentialEmail,
  setPassword,
  verifyPassword,
} from './auth';
import { ACTION_GUARDS, runAction, scopeState } from './actions';
import { NTFY_URL, deliver, needsNetwork, providers, sendEmailNow, sendPushNow } from './delivery';
import crypto from 'node:crypto';
import { activeServices, serviceDefs, setServiceCatalog, siteContent } from '../services/catalog';
import { billingConfigured, billingEnforced, billingStatus, confirmCheckout, createCheckout, createPortal, handleWebhook, instanceId, syncBilling } from './billing';

const PORT = Number(process.env.PORT || 8080);
const DEMO = process.env.SEED_DEMO === 'true';
const DEMO_PASSWORD = process.env.DEMO_PASSWORD || 'Demo1234';
const APP_URL = (process.env.APP_URL || '').replace(/\/$/, '');
const VERSION = '2.0.0';

// ---------------------------------------------------------------- state bootstrap
const engine = new CRMEngine(loadState() || ({ users: [] } as unknown as CRMState));
engine.timeZone = process.env.APP_TIMEZONE || 'America/New_York';

const hasWorkspace = () => engine.state.users?.length > 0;

const seedDemo = () => {
  engine.state = buildSeedState();
  // Optional branding for demos: survives restarts because it comes from the environment.
  if (process.env.COMPANY_NAME) engine.state.settings.companyName = process.env.COMPANY_NAME.trim().slice(0, 120);
  if (/^#[0-9a-f]{6}$/i.test(process.env.BRAND_COLOR || '')) engine.state.settings.brandColor = process.env.BRAND_COLOR!.toLowerCase();
  saveState(engine.state);
  setMeta('demo_workspace', '1');
  for (const u of engine.state.users) setPassword(u.id, u.email, DEMO_PASSWORD, false);
  console.log(`[boot] demo workspace seeded — every demo user's password is "${DEMO_PASSWORD}"`);
};

const newAdmin = (name: string, email: string): User => ({
  id: uid('user'),
  name: name.trim(),
  email: email.trim().toLowerCase(),
  phone: '',
  role: 'OWNER',
  active: true,
  qualifiedForRenovation: true,
  serviceCapabilities: [...SERVICE_TYPES],
  calendarColor: '#4B3AB3',
});

/**
 * Going live: when SEED_DEMO is turned off on a disk that still holds the demo workspace,
 * the demo data and its shared-password accounts are cleared (after a JSON backup) so the
 * real company starts clean via ADMIN_EMAIL or first-time setup.
 */
const isDemoWorkspace = () => getMeta('demo_workspace') === '1' || engine.state.users?.some((u) => u.id === 'user_owner');
if (!DEMO && hasWorkspace() && isDemoWorkspace()) {
  const file = path.join(DATA_DIR, `demo-backup-${new Date().toISOString().replace(/[:.]/g, '-')}.json`);
  try {
    fs.writeFileSync(file, JSON.stringify(engine.state));
  } catch (e) {
    console.error('[boot] could not write demo backup', e);
  }
  wipeState();
  clearAllCredentials();
  setMeta('demo_workspace', '0');
  engine.state = { users: [] } as unknown as CRMState;
  console.log(`[boot] SEED_DEMO is off: demo workspace removed (backup: ${file})`);
}

if (!hasWorkspace()) {
  if (DEMO) seedDemo();
  else if (process.env.ADMIN_EMAIL && process.env.ADMIN_PASSWORD) {
    const admin = newAdmin(process.env.ADMIN_NAME || 'Administrator', process.env.ADMIN_EMAIL);
    engine.state = buildEmptyState(admin, process.env.COMPANY_NAME || 'Company X');
    if (/^#[0-9a-f]{6}$/i.test(process.env.BRAND_COLOR || '')) engine.state.settings.brandColor = process.env.BRAND_COLOR!.toLowerCase();
    saveState(engine.state);
    setPassword(admin.id, admin.email, process.env.ADMIN_PASSWORD, true);
    console.log(`[boot] workspace created for ${admin.email} (password change required on first sign-in)`);
  } else console.log('[boot] no workspace yet — open the app to run first-time setup');
}

// ---------------------------------------------------------------- persistence + delivery
const persist = () => {
  saveState(engine.state);
  setServiceCatalog(engine.state.settings?.services);
};
setServiceCatalog(engine.state.settings?.services);
instanceId();

/** Rejects writes when the subscription lapsed. Reads, exports, sign-in and billing keep working. */
const LOCKED_MSG = 'This workspace is read-only until the subscription is renewed. An admin can fix this under Admin console → Billing.';
const isLocked = () => billingStatus().locked;

const resolveRecipient = (to: string) => {
  const u = engine.state.users.find((x) => x.id === to);
  return u ? { email: u.email, phone: u.phone } : undefined;
};

const setMessageStatus = (id: string, patch: { status: 'SENT' | 'LOGGED' | 'FAILED'; error?: string }) => {
  engine.state.outbox = engine.state.outbox.map((m) => (m.id === id ? { ...m, ...patch } : m));
};

/** Persist the engine state and hand queued messages to providers. */
const commit = () => {
  const msgs = engine.pending.splice(0);
  const network = msgs.filter(needsNetwork);
  for (const m of msgs) if (!needsNetwork(m)) setMessageStatus(m.id, { status: 'LOGGED' });
  persist();
  if (network.length) {
    void Promise.all(
      network.map(async (m) => {
        const result = await deliver(m, engine.state.settings.companyName, resolveRecipient, engine.state.settings.supportEmail, engine.state.settings.ntfyTopic);
        setMessageStatus(m.id, result as { status: 'SENT' | 'LOGGED' | 'FAILED'; error?: string });
      }),
    ).then(persist, (e) => console.error('[delivery]', e));
  }
};

const withActor = <T,>(req: Request, actorId: string | null, fn: () => T): T => {
  engine.actorId = actorId;
  engine.appUrl = APP_URL || `${req.protocol}://${req.get('host')}`;
  try {
    return fn();
  } finally {
    engine.actorId = null;
  }
};

// ---------------------------------------------------------------- app
const app = express();
app.set('trust proxy', Number(process.env.TRUST_PROXY ?? 1));
app.disable('x-powered-by');

app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  res.setHeader(
    'Content-Security-Policy',
    "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com data:; img-src 'self' data: blob:; connect-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'",
  );
  if (req.secure) res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  next();
});

// Stripe webhook needs the raw body for signature verification, so it's registered before the JSON parser.
app.post('/api/billing/webhook', express.raw({ type: '*/*', limit: '1mb' }), async (req, res) => {
  try {
    const r = await handleWebhook(req.body as Buffer, req.get('stripe-signature'));
    if (!r.ok) return res.status(r.status).json({ error: r.error });
    audit(null, 'billing.webhook', billingStatus().status);
    res.json({ received: true });
  } catch (e) {
    console.error('[billing webhook]', e);
    res.status(500).json({ error: 'Webhook failed.' });
  }
});

app.use('/api', express.json({ limit: '5mb' }));

// CSRF defence: state-changing API calls must be JSON (cross-site forms can't send that without CORS preflight).
app.use('/api', (req, res, next) => {
  // Uploads are raw bytes but must carry a custom header, which cross-site forms cannot send.
  if (req.method === 'POST' && /^\/work-orders\/[^/]+\/attachments$/.test(req.path) && req.get('X-CF-Upload') === '1') return next();
  if (req.method !== 'GET' && req.method !== 'HEAD' && !req.is('application/json')) return res.status(415).json({ error: 'Content-Type must be application/json.' });
  next();
});

const ip = (req: Request) => req.ip || 'unknown';

type Authed = Request & { user: User; mustChange: boolean };

const requireUser = (opts: { allowPasswordChange?: boolean } = {}) => (req: Request, res: Response, next: NextFunction) => {
  const userId = sessionUserId(req);
  const user = userId ? engine.state.users.find((u) => u.id === userId) : undefined;
  if (!user || !user.active) return res.status(401).json({ error: 'Please sign in.' });
  const cred = getCredential(user.id);
  const mustChange = !!cred?.must_change;
  if (mustChange && !opts.allowPasswordChange) return res.status(403).json({ error: 'Please set a new password first.', code: 'PASSWORD_CHANGE_REQUIRED' });
  (req as Authed).user = user;
  (req as Authed).mustChange = mustChange;
  next();
};

const requireAdmin = (req: Request, res: Response, next: NextFunction) => (isAdminRole((req as Authed).user.role) ? next() : res.status(403).json({ error: 'Admins only.' }));

// ----- health & public config
app.get('/api/health', (_req, res) => {
  db.prepare('SELECT 1').get();
  res.json({ ok: true, version: VERSION });
});

app.get('/api/public/config', (_req, res) => {
  const s = engine.state;
  if (!hasWorkspace()) return res.json({ setupRequired: true, companyName: 'Company X', demo: DEMO });
  const est = s.users.filter((u) => u.role === 'ESTIMATOR' && u.active);
  const approved = s.estimates.filter((e) => e.status === 'APPROVED');
  res.json({
    setupRequired: false,
    demo: DEMO,
    demoPassword: DEMO ? DEMO_PASSWORD : undefined,
    demoAccounts: DEMO
      ? ['user_owner', 'user_office', 'user_dispatcher', 'user_sales_1', 'estimator_1', 'worker_2']
          .map((id) => s.users.find((u) => u.id === id))
          .filter(Boolean)
          .map((u) => ({ name: u!.name, email: u!.email, role: u!.role }))
      : [],
    companyName: s.settings.companyName,
    supportEmail: s.settings.supportEmail,
    supportPhone: s.settings.supportPhone,
    address: s.settings.address,
    serviceArea: s.settings.serviceArea,
    stats: {
      estimators: est.length,
      renovation: est.filter((u) => u.qualifiedForRenovation).length,
      crews: s.users.filter((u) => ['WORKER', 'SUBCONTRACTOR'].includes(u.role) && u.active).length,
      avgApproved: approved.length ? approved.reduce((x, e) => x + e.total, 0) / approved.length : 0,
    },
    nextVisits: s.appointments
      .filter((a) => a.status !== 'CANCELLED' && new Date(a.startTime) > new Date())
      .sort((a, b) => a.startTime.localeCompare(b.startTime))
      .slice(0, 3)
      .map((a) => ({ serviceType: a.serviceType, startTime: a.startTime, color: s.users.find((u) => u.id === a.estimatorId)?.calendarColor })),
    services: activeServices(s.settings),
    site: siteContent(s.settings),
    brandColor: s.settings.brandColor,
    logoUrl: s.settings.logoDataUrl ? `/api/public/logo?v=${s.settings.logoVersion || '1'}` : null,
    billing: billingStatus(),
  });
});

app.get('/api/public/logo', (_req, res) => {
  const m = /^data:(image\/(?:png|jpeg|webp));base64,(.+)$/.exec(engine.state.settings?.logoDataUrl || '');
  if (!m) return res.status(404).end();
  res.setHeader('Content-Type', m[1]);
  res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
  res.send(Buffer.from(m[2], 'base64'));
});

// ----- first-run setup
app.post('/api/setup', (req, res) => {
  if (hasWorkspace()) return res.status(409).json({ error: 'This workspace is already set up.' });
  const { companyName, name, email, password } = req.body || {};
  if (typeof companyName !== 'string' || !companyName.trim()) return res.status(400).json({ error: 'Company name is required.' });
  if (typeof name !== 'string' || !name.trim()) return res.status(400).json({ error: 'Your name is required.' });
  if (typeof email !== 'string' || !isEmail(email)) return res.status(400).json({ error: 'Enter a valid email.' });
  const pw = passwordProblem(password);
  if (pw) return res.status(400).json({ error: pw });
  const admin = newAdmin(name, email);
  engine.state = buildEmptyState(admin, companyName.trim());
  persist();
  setPassword(admin.id, admin.email, password, false);
  audit(admin.id, 'workspace.setup', companyName.trim(), ip(req));
  createSession(req, res, admin.id, true);
  res.json({ ok: true });
});

// ----- auth
app.post('/api/auth/login', (req, res) => {
  const { email, password, remember } = req.body || {};
  if (typeof email !== 'string' || typeof password !== 'string') return res.status(400).json({ error: 'Enter your email and password.' });
  if (rateLimited(`login:${ip(req)}`, 30, 15 * 60_000) || rateLimited(`login:${email.toLowerCase()}`, 8, 15 * 60_000)) {
    return res.status(429).json({ error: 'Too many attempts. Wait 15 minutes and try again.' });
  }
  const cred = getCredentialByEmail(email);
  const ok = cred ? verifyPassword(password, cred.password_hash) : burnTime(password) && false;
  const user = cred ? engine.state.users.find((u) => u.id === cred.user_id) : undefined;
  if (!ok || !user) {
    audit(cred?.user_id || null, 'auth.login_failed', email.slice(0, 120), ip(req));
    return res.status(401).json({ error: 'Incorrect email or password.' });
  }
  if (!user.active) return res.status(403).json({ error: 'This account has been deactivated. Contact your administrator.' });
  createSession(req, res, user.id, !!remember);
  audit(user.id, 'auth.login', undefined, ip(req));
  res.json({ user, mustChangePassword: !!cred!.must_change });
});

app.post('/api/auth/logout', (req, res) => {
  const uidv = sessionUserId(req);
  destroySession(req, res);
  if (uidv) audit(uidv, 'auth.logout', undefined, ip(req));
  res.json({ ok: true });
});

app.get('/api/auth/me', requireUser({ allowPasswordChange: true }), (req, res) => {
  const r = req as Authed;
  res.json({ user: r.user, mustChangePassword: r.mustChange });
});

app.post('/api/auth/change-password', requireUser({ allowPasswordChange: true }), (req, res) => {
  const r = req as Authed;
  const { current, next } = req.body || {};
  const cred = getCredential(r.user.id);
  if (!cred || typeof current !== 'string' || !verifyPassword(current, cred.password_hash)) return res.status(400).json({ error: 'Your current password is incorrect.' });
  const problem = passwordProblem(next);
  if (problem) return res.status(400).json({ error: problem });
  if (current === next) return res.status(400).json({ error: 'Choose a password you have not used here.' });
  setPassword(r.user.id, cred.email, next, false);
  revokeUserSessions(r.user.id, req);
  audit(r.user.id, 'auth.password_changed', undefined, ip(req));
  res.json({ ok: true });
});

app.post('/api/auth/logout-all', requireUser({ allowPasswordChange: true }), (req, res) => {
  const r = req as Authed;
  revokeUserSessions(r.user.id, req);
  audit(r.user.id, 'auth.logout_everywhere', undefined, ip(req));
  res.json({ ok: true });
});

app.post('/api/auth/forgot', async (req, res) => {
  const { email } = req.body || {};
  if (rateLimited(`forgot:${ip(req)}`, 5, 60 * 60_000)) return res.status(429).json({ error: 'Too many requests. Try again later.' });
  const generic = { ok: true, emailEnabled: providers.email };
  if (typeof email !== 'string' || !providers.email) return res.json(generic);
  const cred = getCredentialByEmail(email);
  const user = cred ? engine.state.users.find((u) => u.id === cred.user_id && u.active) : undefined;
  if (user && cred) {
    const tokenRaw = createResetToken(user.id);
    const base = APP_URL || `${req.protocol}://${req.get('host')}`;
    try {
      await sendEmailNow(
        cred.email,
        `Reset your ${engine.state.settings.companyName} password`,
        `Hi ${user.name},\n\nUse this link within one hour to choose a new password:\n${base}/#reset/${tokenRaw}\n\nIf you didn't ask for this, you can ignore this email.`,
        engine.state.settings.companyName,
      );
      audit(user.id, 'auth.reset_requested', undefined, ip(req));
    } catch (e) {
      console.error('[forgot] email failed', e);
    }
  }
  res.json(generic);
});

app.post('/api/auth/reset', (req, res) => {
  const { token, password } = req.body || {};
  if (rateLimited(`reset:${ip(req)}`, 10, 60 * 60_000)) return res.status(429).json({ error: 'Too many attempts.' });
  const problem = passwordProblem(password);
  if (problem) return res.status(400).json({ error: problem });
  const userId = typeof token === 'string' ? consumeResetToken(token) : null;
  const cred = userId ? getCredential(userId) : undefined;
  if (!userId || !cred) return res.status(400).json({ error: 'This reset link is invalid or has expired.' });
  setPassword(userId, cred.email, password, false);
  revokeUserSessions(userId);
  audit(userId, 'auth.password_reset', undefined, ip(req));
  res.json({ ok: true });
});

// ----- invitations: a one-time link where a new user picks their own password
const baseUrl = (req: Request) => APP_URL || `${req.protocol}://${req.get('host')}`;
const issueInvite = (req: Request, inviter: User, target: User) => {
  const link = `${baseUrl(req)}/#invite/${createResetToken(target.id, INVITE_TTL_MS)}`;
  let emailed = false;
  if (providers.email && req.body?.sendInvite !== false) {
    emailed = true;
    const company = engine.state.settings.companyName;
    void sendEmailNow(
      target.email,
      `You're invited to ${company}`,
      `Hi ${target.name},\n\n${inviter.name} invited you to ${company}'s workspace.\n\nSet your password and sign in here (the link works once and expires in 7 days):\n${link}\n\nYour sign-in email is ${target.email}.`,
      company,
    ).catch((e) => console.error('[invite]', e));
  }
  audit(inviter.id, 'admin.invite_sent', `${target.email}${emailed ? ' (emailed)' : ' (link copied)'}`, ip(req));
  return { inviteLink: link, emailed };
};

app.get('/api/auth/invite/:token', (req, res) => {
  if (rateLimited(`invite-view:${ip(req)}`, 30, 60 * 60_000)) return res.status(429).json({ error: 'Too many attempts.' });
  const userId = peekResetToken(String(req.params.token));
  const user = userId ? engine.state.users.find((u) => u.id === userId && u.active) : undefined;
  if (!user) return res.status(404).json({ error: 'This invitation is invalid, already used, or expired. Ask your admin for a new link.' });
  res.json({ name: user.name, email: user.email, companyName: engine.state.settings.companyName });
});

app.post('/api/auth/accept-invite', (req, res) => {
  const { token, password } = req.body || {};
  if (rateLimited(`invite:${ip(req)}`, 10, 60 * 60_000)) return res.status(429).json({ error: 'Too many attempts.' });
  const problem = passwordProblem(password);
  if (problem) return res.status(400).json({ error: problem });
  const peek = typeof token === 'string' ? peekResetToken(token) : null;
  const user = peek ? engine.state.users.find((u) => u.id === peek && u.active) : undefined;
  if (!user || consumeResetToken(token) !== user.id) return res.status(400).json({ error: 'This invitation is invalid, already used, or expired. Ask your admin for a new link.' });
  setPassword(user.id, user.email, password, false);
  revokeUserSessions(user.id);
  createSession(req, res, user.id, false);
  audit(user.id, 'auth.invite_accepted', undefined, ip(req));
  res.json({ user, mustChangePassword: false });
});

// ----- account (any signed-in user)
app.patch('/api/account/profile', requireUser(), (req, res) => {
  const r = req as Authed;
  const { name, phone } = req.body || {};
  if (typeof name !== 'string' || !name.trim() || name.length > 120) return res.status(400).json({ error: 'Enter your name.' });
  engine.state.users = engine.state.users.map((u) => (u.id === r.user.id ? { ...u, name: name.trim(), phone: typeof phone === 'string' ? phone.slice(0, 40) : u.phone } : u));
  persist();
  audit(r.user.id, 'account.profile_updated', undefined, ip(req));
  res.json({ user: engine.state.users.find((u) => u.id === r.user.id) });
});

// ----- workspace data
app.get('/api/state', requireUser(), (req, res) => {
  res.json({ state: scopeState((req as Authed).user, engine.state) });
});

app.post('/api/actions/:name', requireUser(), (req, res) => {
  const r = req as Authed;
  const name = String(req.params.name);
  const guard = Object.prototype.hasOwnProperty.call(ACTION_GUARDS, name) ? ACTION_GUARDS[name] : undefined;
  const args = Array.isArray(req.body?.args) ? req.body.args : null;
  if (!guard || !args) return res.status(400).json({ error: 'Unknown action.' });
  if (isLocked() && !name.startsWith('markNotification') && name !== 'markAllNotificationsRead') return res.status(402).json({ error: LOCKED_MSG, code: 'BILLING_LOCKED' });
  const denied = guard({ user: r.user, state: engine.state }, args);
  if (denied) return res.status(403).json({ error: denied });
  let result: unknown;
  try {
    result = withActor(req, r.user.id, () => runAction(engine, name, args));
  } catch (e) {
    console.error(`[action ${name}]`, e);
    engine.state = loadState() || engine.state; // roll back to last persisted state
    engine.pending = [];
    return res.status(500).json({ error: 'Something went wrong. No changes were saved.' });
  }
  commit();
  const target = typeof args[0] === 'string' ? args[0] : (args[0] as { id?: string })?.id;
  if (!name.startsWith('markNotification') && !name.startsWith('markAll')) audit(r.user.id, `action.${name}`, target, ip(req));
  res.json({ result: result ?? null, state: scopeState(r.user, engine.state) });
});

// ----- work-order attachments (photos, PDFs) stored on disk next to the database
const UPLOAD_DIR = path.join(path.dirname(DB_PATH), 'uploads');
const MAX_UPLOAD = 15 * 1024 * 1024;
const ALLOWED_TYPES = /^(image\/(jpeg|png|webp|gif|heic|heif)|application\/pdf|text\/plain)$/;
const safeName = (n: string) => n.replace(/[^\w.\- ]+/g, '_').slice(0, 120) || 'file';
const woForUser = (user: User, id: string) => scopeState(user, engine.state).workOrders.find((w) => w.id === id);

app.post('/api/work-orders/:id/attachments', requireUser(), express.raw({ type: () => true, limit: MAX_UPLOAD }), (req, res) => {
  const r = req as Authed;
  if (isLocked()) return res.status(402).json({ error: LOCKED_MSG, code: 'BILLING_LOCKED' });
  const wo = woForUser(r.user, String(req.params.id));
  if (!wo || !can(r.user, 'workorder:update-status')) return res.status(403).json({ error: 'Not allowed.' });
  const type = String(req.get('Content-Type') || '').split(';')[0];
  if (!ALLOWED_TYPES.test(type)) return res.status(415).json({ error: 'Upload photos (JPG, PNG, WEBP, HEIC) or PDFs.' });
  const body = req.body as Buffer;
  if (!Buffer.isBuffer(body) || !body.length) return res.status(400).json({ error: 'Empty file.' });
  const name = safeName(decodeURIComponent(String(req.query.name || 'file')));
  const fileId = uid('file');
  const dir = path.join(UPLOAD_DIR, wo.id);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, fileId), body);
  fs.writeFileSync(path.join(dir, `${fileId}.meta.json`), JSON.stringify({ name, type, size: body.length, by: r.user.id, at: new Date().toISOString() }));
  const ref = `file:${fileId}:${encodeURIComponent(name)}:${body.length}`;
  withActor(req, r.user.id, () => engine.addWorkOrderAttachments(wo.id, [ref]));
  commit();
  audit(r.user.id, 'action.uploadAttachment', `${wo.id} ${name}`, ip(req));
  res.json({ state: scopeState(r.user, engine.state) });
});

app.get('/api/work-orders/:id/attachments/:fileId', requireUser(), (req, res) => {
  const r = req as Authed;
  const wo = woForUser(r.user, String(req.params.id));
  const fileId = String(req.params.fileId);
  if (!wo || !/^file_[a-f0-9]+$/.test(fileId) || !wo.attachments.some((a) => a.startsWith(`file:${fileId}:`))) return res.status(404).json({ error: 'Not found.' });
  const file = path.join(UPLOAD_DIR, wo.id, fileId);
  if (!fs.existsSync(file)) return res.status(404).json({ error: 'File missing.' });
  const meta = JSON.parse(fs.readFileSync(`${file}.meta.json`, 'utf8')) as { name: string; type: string };
  res.setHeader('Content-Type', meta.type);
  res.setHeader('Content-Disposition', `${meta.type.startsWith('image/') || meta.type === 'application/pdf' ? 'inline' : 'attachment'}; filename="${meta.name}"`);
  res.setHeader('Cache-Control', 'private, max-age=3600');
  res.sendFile(file);
});

// ----- public: booking & e-sign
app.post('/api/public/booking', (req, res) => {
  if (!hasWorkspace() || isLocked()) return res.status(503).json({ error: 'Online booking is temporarily unavailable. Please call us.' });
  if (rateLimited(`book:${ip(req)}`, 6, 60 * 60_000)) return res.status(429).json({ error: 'Too many requests. Please call us instead.' });
  const b = req.body || {};
  const errors: string[] = [];
  const text = (v: unknown, max: number) => (typeof v === 'string' ? v.trim().slice(0, max) : '');
  const name = text(b.name, 120);
  const email = text(b.email, 160);
  const phone = text(b.phone, 40);
  const address = text(b.address, 240);
  const notes = text(b.notes, 2000);
  if (!name) errors.push('name');
  if (!isEmail(email)) errors.push('email');
  if (phone.replace(/\D/g, '').length < 7) errors.push('phone');
  if (address.length < 5) errors.push('address');
  if (!activeServices(engine.state.settings).some((x) => x.key === b.serviceType)) errors.push('service');
  const when = new Date(b.preferredDateTime);
  if (isNaN(when.getTime()) || when < new Date()) errors.push('time');
  if (b.website) return res.json({ ok: true }); // honeypot
  if (errors.length) return res.status(400).json({ error: `Please check: ${errors.join(', ')}.` });
  const r = withActor(req, null, () =>
    engine.createBookingRequest({
      name,
      email,
      phone,
      address,
      budget: Math.max(0, Math.min(10_000_000, Number(b.budget) || 0)),
      serviceType: b.serviceType as ServiceType,
      preferredDateTime: when.toISOString(),
      notes,
      source: 'WEBSITE',
    }),
  );
  commit();
  audit(null, 'public.booking', r.lead.id, ip(req));
  res.json({
    lead: { name: r.lead.name, email: r.lead.email, address: r.lead.address },
    appointment: { id: r.appointment.id, serviceType: r.appointment.serviceType, startTime: r.appointment.startTime, endTime: r.appointment.endTime },
    estimatorName: r.estimator?.name,
  });
});

const approvalView = (tokenValue: string) => {
  const data = engine.getEstimateByApprovalToken(tokenValue);
  if (!data) return null;
  const { estimate, lead, signature } = data;
  const est = engine.state.users.find((u) => u.id === estimate.estimatorId);
  const s = engine.state.settings;
  return {
    estimate,
    lead: { name: lead.name, address: lead.address },
    signature: { approvalStatus: signature.approvalStatus, signatureName: signature.signatureName, signedAt: signature.signedAt, declineReason: signature.declineReason },
    estimator: est ? { name: est.name, email: est.email } : null,
    company: { companyName: s.companyName, supportEmail: s.supportEmail, supportPhone: s.supportPhone },
  };
};

app.get('/api/public/approvals/:token', (req, res) => {
  if (rateLimited(`approval-view:${ip(req)}`, 120, 60 * 60_000)) return res.status(429).json({ error: 'Too many requests.' });
  const view = approvalView(String(req.params.token));
  if (!view) return res.status(404).json({ error: 'This link is not valid.' });
  res.json(view);
});

app.post('/api/public/approvals/:token/:decision', (req, res) => {
  if (isLocked()) return res.status(503).json({ error: 'Online signing is temporarily unavailable. Please contact us.' });
  if (rateLimited(`approval:${ip(req)}`, 20, 60 * 60_000)) return res.status(429).json({ error: 'Too many requests.' });
  const t = String(req.params.token);
  const decision = String(req.params.decision);
  const { name, agree, reason } = req.body || {};
  let r: { error?: string } | { success: true };
  if (decision === 'approve') {
    if (typeof name !== 'string' || name.trim().length < 3 || name.length > 120) return res.status(400).json({ error: 'Type your full legal name to sign.' });
    if (agree !== true) return res.status(400).json({ error: 'Please confirm you agree to the scope and total.' });
    r = withActor(req, null, () => engine.approveEstimateByToken(t, name.trim(), ip(req), (req.get('user-agent') || '').slice(0, 250)));
  } else if (decision === 'decline') {
    r = withActor(req, null, () => engine.declineEstimateByToken(t, typeof reason === 'string' ? reason.trim().slice(0, 1000) : ''));
  } else return res.status(404).json({ error: 'Not found.' });
  if ('error' in r && r.error) return res.status(400).json({ error: r.error });
  commit();
  audit(null, `public.estimate_${decision}`, t.slice(0, 8), ip(req));
  res.json(approvalView(t));
});

// ----- admin console
const adminUserView = (u: User) => {
  const cred = getCredential(u.id);
  return { ...u, hasLogin: !!cred, mustChangePassword: !!cred?.must_change, lastLoginAt: cred?.last_login_at || null, activeSessions: activeSessionCount(u.id) };
};

app.get('/api/admin/users', requireUser(), requireAdmin, (_req, res) => {
  res.json({ users: engine.state.users.map(adminUserView) });
});

const ROLES: Role[] = ['OWNER', 'MANAGER', 'OFFICE_MANAGER', 'DISPATCHER', 'SALES_REP', 'ESTIMATOR', 'WORKER', 'SUBCONTRACTOR'];

const validateUserInput = (actor: User, body: Record<string, unknown>, existing?: User): { user?: User; error?: string } => {
  const name = typeof body.name === 'string' ? body.name.trim() : '';
  const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
  const role = body.role as Role;
  if (!name || name.length > 120) return { error: 'Name is required.' };
  if (!isEmail(email)) return { error: 'Enter a valid email.' };
  if (!ROLES.includes(role)) return { error: 'Choose a role.' };
  if (emailInUse(email, existing?.id) || engine.state.users.some((u) => u.email.toLowerCase() === email && u.id !== existing?.id)) return { error: 'That email is already in use.' };
  if ((role === 'OWNER' || existing?.role === 'OWNER') && actor.role !== 'OWNER' && role !== existing?.role) return { error: 'Only an owner can grant or remove the Owner role.' };
  if (existing?.id === actor.id && role !== existing.role) return { error: "You can't change your own role." };
  const active = body.active === undefined ? true : !!body.active;
  if (existing?.id === actor.id && !active) return { error: "You can't deactivate yourself." };
  if (existing?.role === 'OWNER' && (role !== 'OWNER' || !active) && engine.state.users.filter((u) => u.role === 'OWNER' && u.active).length <= 1)
    return { error: 'The workspace needs at least one active owner.' };
  const services = Array.isArray(body.serviceCapabilities) ? (body.serviceCapabilities as ServiceType[]).filter((s) => serviceDefs(engine.state.settings).some((x) => x.key === s)) : existing?.serviceCapabilities || [];
  return {
    user: {
      id: existing?.id || uid('user'),
      name,
      email,
      phone: typeof body.phone === 'string' ? body.phone.slice(0, 40) : existing?.phone || '',
      role,
      active,
      qualifiedForRenovation: !!body.qualifiedForRenovation,
      serviceCapabilities: services,
      calendarColor: typeof body.calendarColor === 'string' && /^#[0-9a-f]{6}$/i.test(body.calendarColor) ? body.calendarColor : existing?.calendarColor || '#4B3AB3',
    },
  };
};

app.post('/api/admin/users', requireUser(), (req, res) => {
  const r = req as Authed;
  if (!can(r.user, 'team:manage')) return res.status(403).json({ error: 'Only owners and managers can add users.' });
  const v = validateUserInput(r.user, req.body || {});
  if (v.error || !v.user) return res.status(400).json({ error: v.error });
  const mode: 'invite' | 'temp' | 'set' = req.body?.accessMode === 'temp' || req.body?.accessMode === 'set' ? req.body.accessMode : 'invite';
  const given = mode === 'set' ? req.body?.password : undefined;
  if (mode === 'set') {
    const problem = passwordProblem(given);
    if (problem) return res.status(400).json({ error: problem });
  }
  // Invite mode: an unguessable placeholder password nobody knows; the link sets the real one.
  const tempPassword = mode === 'invite' ? `${generateTempPassword()}${generateTempPassword()}` : given || generateTempPassword();
  engine.state.users = [...engine.state.users, v.user];
  persist();
  setPassword(v.user.id, v.user.email, tempPassword, true);
  audit(r.user.id, 'admin.user_created', `${v.user.email} (${v.user.role})`, ip(req));
  if (mode === 'invite') {
    const inv = issueInvite(req, r.user, v.user);
    return res.json({ user: adminUserView(v.user), ...inv });
  }
  if (req.body?.sendInvite && providers.email) {
    void sendEmailNow(
      v.user.email,
      `You've been invited to ${engine.state.settings.companyName}`,
      `Hi ${v.user.name},\n\n${r.user.name} added you to ${engine.state.settings.companyName}.\nSign in at ${baseUrl(req)}/#login with:\n\nEmail: ${v.user.email}\nTemporary password: ${tempPassword}\n\nYou'll choose your own password after signing in.`,
      engine.state.settings.companyName,
    ).catch((e) => console.error('[invite]', e));
  }
  res.json({ user: adminUserView(v.user), tempPassword: given ? undefined : tempPassword });
});

// ----- phone alerts for new leads (ntfy)
const alertsView = () => ({ enabled: !!engine.state.settings.ntfyTopic, topic: engine.state.settings.ntfyTopic || null, server: NTFY_URL });
app.get('/api/admin/alerts', requireUser(), (req, res) => {
  if (!can((req as Authed).user, 'settings:manage')) return res.status(403).json({ error: 'Not allowed.' });
  res.json(alertsView());
});
app.post('/api/admin/alerts', requireUser(), (req, res) => {
  const r = req as Authed;
  if (!can(r.user, 'settings:manage')) return res.status(403).json({ error: 'Not allowed.' });
  if (isLocked()) return res.status(402).json({ error: LOCKED_MSG, code: 'BILLING_LOCKED' });
  const on = req.body?.enabled !== false;
  // A long random topic name is what keeps the alerts private.
  engine.state.settings = { ...engine.state.settings, ntfyTopic: on ? `leads-${crypto.randomBytes(15).toString('base64url').replace(/[-_]/g, 'x')}` : undefined };
  persist();
  audit(r.user.id, on ? 'admin.alerts_enabled' : 'admin.alerts_disabled', undefined, ip(req));
  res.json(alertsView());
});
app.post('/api/admin/alerts/test', requireUser(), async (req, res) => {
  const r = req as Authed;
  if (!can(r.user, 'settings:manage')) return res.status(403).json({ error: 'Not allowed.' });
  const topic = engine.state.settings.ntfyTopic;
  if (!topic) return res.status(400).json({ error: 'Turn on phone alerts first.' });
  if (rateLimited(`alert-test:${r.user.id}`, 10, 60 * 60_000)) return res.status(429).json({ error: 'Too many test alerts. Try again later.' });
  try {
    await sendPushNow(topic, 'Test alert', `Phone alerts are working for ${engine.state.settings.companyName}.`, `${baseUrl(req)}/#leads`);
    res.json({ ok: true });
  } catch (e) {
    res.status(502).json({ error: `Couldn't reach the alert service: ${e instanceof Error ? e.message : 'unknown error'}` });
  }
});

app.post('/api/admin/users/:id/invite', requireUser(), (req, res) => {
  const r = req as Authed;
  if (!can(r.user, 'team:manage')) return res.status(403).json({ error: 'Only owners and managers can send invitations.' });
  const target = engine.state.users.find((u) => u.id === req.params.id);
  if (!target) return res.status(404).json({ error: 'User not found.' });
  if (!target.active) return res.status(400).json({ error: 'Reactivate this user first.' });
  if (target.role === 'OWNER' && r.user.role !== 'OWNER') return res.status(403).json({ error: 'Only an owner can do this for an owner.' });
  if (!getCredential(target.id)) setPassword(target.id, target.email, `${generateTempPassword()}${generateTempPassword()}`, true);
  res.json(issueInvite(req, r.user, target));
});

app.patch('/api/admin/users/:id', requireUser(), (req, res) => {
  const r = req as Authed;
  if (!can(r.user, 'team:manage')) return res.status(403).json({ error: 'Only owners and managers can edit users.' });
  const existing = engine.state.users.find((u) => u.id === req.params.id);
  if (!existing) return res.status(404).json({ error: 'User not found.' });
  const v = validateUserInput(r.user, { ...existing, ...(req.body || {}) }, existing);
  if (v.error || !v.user) return res.status(400).json({ error: v.error });
  engine.state.users = engine.state.users.map((u) => (u.id === existing.id ? v.user! : u));
  persist();
  if (v.user.email !== existing.email && getCredential(existing.id)) setCredentialEmail(existing.id, v.user.email);
  if (!v.user.active || v.user.role !== existing.role) revokeUserSessions(existing.id);
  audit(r.user.id, 'admin.user_updated', `${v.user.email}${v.user.active ? '' : ' (deactivated)'}${v.user.role !== existing.role ? ` role ${existing.role}→${v.user.role}` : ''}`, ip(req));
  res.json({ user: adminUserView(v.user) });
});

app.post('/api/admin/users/:id/reset-password', requireUser(), (req, res) => {
  const r = req as Authed;
  if (!can(r.user, 'team:manage')) return res.status(403).json({ error: 'Only owners and managers can reset passwords.' });
  const target = engine.state.users.find((u) => u.id === req.params.id);
  if (!target) return res.status(404).json({ error: 'User not found.' });
  if (target.role === 'OWNER' && r.user.role !== 'OWNER') return res.status(403).json({ error: "Only an owner can reset an owner's password." });
  const temp = generateTempPassword();
  setPassword(target.id, target.email, temp, true);
  revokeUserSessions(target.id);
  audit(r.user.id, 'admin.password_reset', target.email, ip(req));
  res.json({ tempPassword: temp });
});

app.post('/api/admin/users/:id/revoke-sessions', requireUser(), (req, res) => {
  const r = req as Authed;
  if (!can(r.user, 'team:manage')) return res.status(403).json({ error: 'Not allowed.' });
  revokeUserSessions(String(req.params.id));
  audit(r.user.id, 'admin.sessions_revoked', String(req.params.id), ip(req));
  res.json({ ok: true });
});

app.get('/api/admin/audit', requireUser(), requireAdmin, (req, res) => {
  const limit = Math.min(500, Number(req.query.limit) || 200);
  const rows = db.prepare('SELECT * FROM audit ORDER BY id DESC LIMIT ?').all(limit);
  res.json({ entries: rows });
});

app.get('/api/admin/system', requireUser(), requireAdmin, (_req, res) => {
  let size = 0;
  try {
    size = fs.statSync(DB_PATH).size;
  } catch {
    /* ignore */
  }
  res.json({ version: VERSION, demo: DEMO, providers, dbSizeBytes: size, appUrl: APP_URL || null, timeZone: engine.timeZone, users: engine.state.users.length });
});

app.get('/api/admin/export', requireUser(), (req, res) => {
  const r = req as Authed;
  if (!can(r.user, 'settings:manage')) return res.status(403).json({ error: 'Not allowed.' });
  audit(r.user.id, 'admin.export', undefined, ip(req));
  res.setHeader('Content-Disposition', `attachment; filename="crm-backup-${new Date().toISOString().slice(0, 10)}.json"`);
  res.json(engine.state);
});

app.post('/api/admin/import', requireUser(), (req, res) => {
  const r = req as Authed;
  if (r.user.role !== 'OWNER') return res.status(403).json({ error: 'Only an owner can restore a backup.' });
  const prev = engine.state;
  const result = engine.importState(req.body);
  if ('error' in result) return res.status(400).json(result);
  if (!engine.state.users.some((u) => u.id === r.user.id && u.active && u.role === 'OWNER')) {
    engine.state = prev;
    return res.status(400).json({ error: 'The backup must include your own owner account.' });
  }
  persist();
  audit(r.user.id, 'admin.import', `${engine.state.leads.length} leads`, ip(req));
  res.json({ ok: true });
});

app.post('/api/admin/reset-demo', requireUser(), (req, res) => {
  const r = req as Authed;
  if (!DEMO || r.user.role !== 'OWNER') return res.status(403).json({ error: 'Demo reset is only available in demo mode.' });
  wipeState();
  seedDemo();
  audit(r.user.id, 'admin.reset_demo', undefined, ip(req));
  res.json({ ok: true });
});

// ----- branding: logo upload (PNG/JPEG/WEBP, ≤ 300 KB)
app.post('/api/admin/logo', requireUser(), (req, res) => {
  const r = req as Authed;
  if (!can(r.user, 'settings:manage')) return res.status(403).json({ error: 'Not allowed.' });
  const dataUrl = String(req.body?.dataUrl || '');
  const m = /^data:image\/(png|jpeg|webp);base64,([A-Za-z0-9+/=]+)$/.exec(dataUrl);
  if (!m) return res.status(400).json({ error: 'Upload a PNG, JPG or WEBP image.' });
  if (Buffer.from(m[2], 'base64').length > 300 * 1024) return res.status(413).json({ error: 'Logo must be under 300 KB.' });
  engine.state.settings = { ...engine.state.settings, logoDataUrl: dataUrl, logoVersion: Date.now().toString(36) };
  persist();
  audit(r.user.id, 'admin.logo_updated', undefined, ip(req));
  res.json({ ok: true });
});

app.delete('/api/admin/logo', requireUser(), (req, res) => {
  const r = req as Authed;
  if (!can(r.user, 'settings:manage')) return res.status(403).json({ error: 'Not allowed.' });
  const { logoDataUrl: _drop, logoVersion: _v, ...rest } = engine.state.settings;
  engine.state.settings = rest;
  persist();
  audit(r.user.id, 'admin.logo_removed', undefined, ip(req));
  res.json({ ok: true });
});

// ----- subscription billing (your Stripe account)
const appBase = (req: Request) => APP_URL || `${req.protocol}://${req.get('host')}`;
const canBill = (u: User) => u.role === 'OWNER' || u.role === 'MANAGER';

app.get('/api/admin/billing', requireUser(), requireAdmin, (_req, res) => {
  res.json({ configured: billingConfigured, ...billingStatus() });
});

app.post('/api/admin/billing/checkout', requireUser(), async (req, res) => {
  const r = req as Authed;
  if (!canBill(r.user)) return res.status(403).json({ error: 'Only owners and managers can manage billing.' });
  if (!billingConfigured) return res.status(400).json({ error: 'Billing is not set up for this workspace.' });
  try {
    const url = await createCheckout(appBase(req), r.user.email, engine.state.settings.companyName);
    audit(r.user.id, 'billing.checkout_started', undefined, ip(req));
    res.json({ url });
  } catch (e) {
    res.status(502).json({ error: e instanceof Error ? e.message : 'Stripe error.' });
  }
});

app.post('/api/admin/billing/confirm', requireUser(), async (req, res) => {
  const r = req as Authed;
  try {
    const status = await confirmCheckout(String(req.body?.sessionId || ''));
    audit(r.user.id, 'billing.subscribed', status.status, ip(req));
    res.json(status);
  } catch (e) {
    res.status(400).json({ error: e instanceof Error ? e.message : 'Could not confirm checkout.' });
  }
});

app.post('/api/admin/billing/portal', requireUser(), async (req, res) => {
  const r = req as Authed;
  if (!canBill(r.user)) return res.status(403).json({ error: 'Only owners and managers can manage billing.' });
  try {
    res.json({ url: await createPortal(appBase(req)) });
  } catch (e) {
    res.status(400).json({ error: e instanceof Error ? e.message : 'Stripe error.' });
  }
});

app.post('/api/admin/billing/sync', requireUser(), requireAdmin, async (_req, res) => {
  try {
    res.json(await syncBilling());
  } catch (e) {
    res.status(502).json({ error: e instanceof Error ? e.message : 'Stripe error.' });
  }
});

app.use('/api', (_req, res) => res.status(404).json({ error: 'Not found.' }));

// ----- static frontend
const here = path.dirname(fileURLToPath(import.meta.url));
const staticDir = [process.env.STATIC_DIR, path.resolve(here, '../dist'), path.resolve(process.cwd(), 'dist')].find((d) => d && fs.existsSync(path.join(d, 'index.html')));
if (staticDir) {
  app.use('/assets', express.static(path.join(staticDir, 'assets'), { immutable: true, maxAge: '1y', index: false }));
  app.use(express.static(staticDir, { index: false, maxAge: '1h' }));
  app.get(/^(?!\/api).*/, (_req, res) => {
    res.setHeader('Cache-Control', 'no-cache');
    res.sendFile(path.join(staticDir, 'index.html'));
  });
} else console.warn('[boot] dist/ not found — run `npm run build` (API still available)');

// eslint-disable-next-line @typescript-eslint/no-unused-vars
app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
  console.error(err);
  res.status(err.name === 'PayloadTooLargeError' ? 413 : 400).json({ error: 'Bad request.' });
});

// ----- housekeeping (follow-ups, overdue invoices, expired estimates)
const housekeeping = () => {
  if (!hasWorkspace()) return;
  withActor({ protocol: 'http', get: () => 'localhost' } as unknown as Request, null, () => engine.runHousekeeping());
  commit();
  pruneSessions();
};
housekeeping();
setInterval(housekeeping, 5 * 60_000).unref();
if (billingEnforced) setInterval(() => void syncBilling().catch((e) => console.error('[billing sync]', e.message)), 6 * 3600_000).unref();
setInterval(() => pruneAudit(), 24 * 3600_000).unref();

const server = app.listen(PORT, () => console.log(`[boot] listening on :${PORT} (db: ${DB_PATH})`));
const shutdown = () => {
  server.close(() => {
    db.close();
    process.exit(0);
  });
  setTimeout(() => process.exit(0), 5000).unref();
};
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
