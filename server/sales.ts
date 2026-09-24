/**
 * Selling the CRM itself: a separate "#pricing" page where contractors pick a plan and subscribe.
 * Only turned on for YOUR sales site (SALES_PAGE=true), never on a client's workspace.
 * Payments go to YOUR Stripe account (SALES_STRIPE_SECRET_KEY, falling back to STRIPE_SECRET_KEY).
 */
import crypto from 'node:crypto';
import { db } from './db';
import { verifyStripeSignature } from './billing';

export const salesEnabled = process.env.SALES_PAGE === 'true';
const KEY = process.env.SALES_STRIPE_SECRET_KEY || process.env.STRIPE_SECRET_KEY || '';
const WEBHOOK_SECRET = process.env.SALES_STRIPE_WEBHOOK_SECRET || '';
/** Override only for automated tests. */
const API = (process.env.STRIPE_API_BASE || 'https://api.stripe.com').replace(/\/$/, '');
export const salesCheckoutReady = salesEnabled && !!KEY;
export const PRODUCT_NAME = (process.env.PRODUCT_NAME || 'ConstructFlow').slice(0, 60);
export const SETUP_FEE = Math.max(0, Number(process.env.SALES_SETUP_FEE ?? 750) || 0);
export const SOURCE = 'crm-sales';

export interface Plan {
  key: 'starter' | 'pro';
  name: string;
  monthly: number;
  annual: number;
  users: number;
  blurb: string;
  features: string[];
  popular?: boolean;
}

export const PLANS: Plan[] = [
  {
    key: 'starter',
    name: 'Starter',
    monthly: 99,
    annual: 990,
    users: 5,
    blurb: 'For small crews getting organized.',
    features: [
      'Up to 5 team members',
      'Your branded website with online estimate requests',
      'Leads, calendar and site visits',
      'Estimates with e-signature',
      'Work orders with checklists and job photos',
      'Invoices and payment tracking',
      'Email confirmations and new-lead phone alerts',
    ],
  },
  {
    key: 'pro',
    name: 'Pro',
    monthly: 149,
    annual: 1490,
    users: 15,
    popular: true,
    blurb: 'For growing contractors who want to get paid faster.',
    features: [
      'Up to 15 team members',
      'Everything in Starter',
      'Online invoice payments by card or bank (ACH)',
      'Your own domain (crm.yourcompany.com)',
      'Customer import from spreadsheets',
      'Roles and permissions for office, estimators and crews',
      'Priority support',
    ],
  },
];

db.exec(`
  CREATE TABLE IF NOT EXISTS signups (
    id TEXT PRIMARY KEY,
    created_at TEXT NOT NULL,
    company TEXT NOT NULL,
    name TEXT NOT NULL,
    email TEXT NOT NULL,
    phone TEXT,
    plan TEXT NOT NULL,
    billing TEXT NOT NULL,
    status TEXT NOT NULL,
    session_id TEXT,
    paid_at TEXT
  );
  CREATE INDEX IF NOT EXISTS signups_created ON signups(created_at);
`);

export interface Signup {
  id: string;
  created_at: string;
  company: string;
  name: string;
  email: string;
  phone: string | null;
  plan: string;
  billing: string;
  status: 'started' | 'requested' | 'paid';
  session_id: string | null;
  paid_at: string | null;
}

export const createSignup = (s: Pick<Signup, 'company' | 'name' | 'email' | 'phone' | 'plan' | 'billing'>, status: Signup['status']) => {
  const id = `su_${crypto.randomBytes(9).toString('hex')}`;
  db.prepare('INSERT INTO signups (id, created_at, company, name, email, phone, plan, billing, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)').run(
    id, new Date().toISOString(), s.company, s.name, s.email, s.phone, s.plan, s.billing, status,
  );
  return id;
};
export const getSignup = (id: string) => db.prepare('SELECT * FROM signups WHERE id = ?').get(id) as Signup | undefined;
export const listSignups = () => db.prepare('SELECT * FROM signups ORDER BY created_at DESC LIMIT 500').all() as Signup[];
export const setSignupSession = (id: string, sessionId: string) => db.prepare('UPDATE signups SET session_id = ? WHERE id = ?').run(sessionId, id);
/** Returns true the first time a sign-up is marked paid (so notifications fire once). */
export const markSignupPaid = (id: string, sessionId: string) =>
  db.prepare("UPDATE signups SET status = 'paid', paid_at = ?, session_id = ? WHERE id = ? AND status != 'paid'").run(new Date().toISOString(), sessionId, id).changes > 0;

// ---------- Stripe ----------
const form = (params: Record<string, string | number | undefined>) =>
  new URLSearchParams(Object.entries(params).filter(([, v]) => v !== undefined).map(([k, v]) => [k, String(v)]));

const stripe = async <T,>(method: 'GET' | 'POST', path: string, params?: Record<string, string | number | undefined>): Promise<T> => {
  if (!KEY) throw new Error('Online sign-up is not set up.');
  const res = await fetch(`${API}/v1/${path}${method === 'GET' && params ? `?${form(params)}` : ''}`, {
    method,
    headers: { Authorization: `Bearer ${KEY}`, ...(method === 'POST' ? { 'Content-Type': 'application/x-www-form-urlencoded' } : {}) },
    body: method === 'POST' && params ? form(params) : undefined,
  });
  const data = (await res.json().catch(() => ({}))) as { error?: { message?: string } } & T;
  if (!res.ok) throw new Error(data?.error?.message || `Stripe error ${res.status}`);
  return data;
};

interface Session {
  id: string;
  url?: string;
  status?: string;
  payment_status?: string;
  metadata?: Record<string, string>;
}

export const createSalesCheckout = async (input: { signupId: string; plan: Plan; billing: 'month' | 'year'; email: string; company: string; returnBase: string }) => {
  const price = input.billing === 'year' ? input.plan.annual : input.plan.monthly;
  const params: Record<string, string | number | undefined> = {
    mode: 'subscription',
    success_url: `${input.returnBase}&session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${input.returnBase}&cancel=1`,
    customer_email: input.email,
    allow_promotion_codes: 'true',
    client_reference_id: input.signupId,
    'line_items[0][quantity]': 1,
    'line_items[0][price_data][currency]': 'usd',
    'line_items[0][price_data][unit_amount]': Math.round(price * 100),
    'line_items[0][price_data][recurring][interval]': input.billing,
    'line_items[0][price_data][product_data][name]': `${PRODUCT_NAME} ${input.plan.name}`,
    'metadata[source]': SOURCE,
    'metadata[signup_id]': input.signupId,
    'subscription_data[metadata][source]': SOURCE,
    'subscription_data[metadata][signup_id]': input.signupId,
    'subscription_data[metadata][company]': input.company.slice(0, 200),
  };
  if (SETUP_FEE > 0) {
    params['line_items[1][quantity]'] = 1;
    params['line_items[1][price_data][currency]'] = 'usd';
    params['line_items[1][price_data][unit_amount]'] = Math.round(SETUP_FEE * 100);
    params['line_items[1][price_data][product_data][name]'] = 'One-time setup and onboarding';
  }
  return stripe<Session>('POST', 'checkout/sessions', params);
};

export const getSalesSession = (id: string) => stripe<Session>('GET', `checkout/sessions/${encodeURIComponent(id)}`);

/** Verify a webhook from YOUR Stripe account; returns the sign-up that was paid, if any. */
export const parseSalesWebhook = (raw: Buffer, signature: string | undefined): { ok: false; status: number; error: string } | { ok: true; paid?: { signupId: string; sessionId: string } } => {
  if (!WEBHOOK_SECRET) return { ok: false, status: 400, error: 'Sales webhook secret is not set.' };
  if (!verifyStripeSignature(raw, signature, WEBHOOK_SECRET)) return { ok: false, status: 400, error: 'Invalid signature.' };
  try {
    const evt = JSON.parse(raw.toString('utf8')) as { type?: string; data?: { object?: Session } };
    const s = evt.data?.object;
    if (evt.type === 'checkout.session.completed' && s?.metadata?.source === SOURCE && s.metadata.signup_id && s.payment_status !== 'unpaid') {
      return { ok: true, paid: { signupId: s.metadata.signup_id, sessionId: s.id } };
    }
    return { ok: true };
  } catch {
    return { ok: false, status: 400, error: 'Invalid payload.' };
  }
};
