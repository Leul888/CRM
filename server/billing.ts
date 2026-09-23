/**
 * Subscription billing for this workspace, charged to YOUR Stripe account (the provider).
 *
 * Each client runs their own instance. Configure with:
 *   STRIPE_SECRET_KEY   sk_live_… / sk_test_…
 *   STRIPE_PRICE_ID     price_… (the recurring price the client subscribes to)
 *   STRIPE_WEBHOOK_SECRET whsec_… (optional but recommended; endpoint: /api/billing/webhook)
 *   TRIAL_DAYS          free days before a subscription is required (default 14)
 *   BILLING_GRACE_DAYS  days a past-due account keeps working (default 7)
 *   BILLING_OVERRIDE=active   comp this client (never locks)
 * Without STRIPE_SECRET_KEY + STRIPE_PRICE_ID billing is off and nothing is ever locked.
 */
import crypto from 'node:crypto';
import { getMeta, setMeta } from './db';

const KEY = process.env.STRIPE_SECRET_KEY || '';
const PRICE = process.env.STRIPE_PRICE_ID || '';
const WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET || '';
const TRIAL_DAYS = Number(process.env.TRIAL_DAYS ?? 14);
const GRACE_DAYS = Number(process.env.BILLING_GRACE_DAYS ?? 7);
const OVERRIDE = process.env.BILLING_OVERRIDE === 'active';

export const billingConfigured = !!(KEY && PRICE);
export const billingEnforced = billingConfigured && !OVERRIDE;

interface BillingRecord {
  customerId?: string;
  subscriptionId?: string;
  status?: string; // Stripe subscription status
  currentPeriodEnd?: string | null;
  cancelAtPeriodEnd?: boolean;
  updatedAt?: string;
}

// ---------- persistent identity + record ----------
export const instanceId = () => {
  let id = getMeta('instance_id');
  if (!id) {
    id = `cfi_${crypto.randomBytes(9).toString('hex')}`;
    setMeta('instance_id', id);
  }
  createdAt(); // the trial clock starts when the workspace first boots
  return id;
};

const createdAt = () => {
  let at = getMeta('created_at');
  if (!at) {
    at = new Date().toISOString();
    setMeta('created_at', at);
  }
  return at;
};

const read = (): BillingRecord => {
  try {
    return JSON.parse(getMeta('billing') || '{}');
  } catch {
    return {};
  }
};
const write = (r: BillingRecord) => setMeta('billing', JSON.stringify({ ...r, updatedAt: new Date().toISOString() }));

// ---------- status ----------
export interface BillingStatus {
  enforced: boolean;
  status: 'not_required' | 'comped' | 'trial' | 'active' | 'trialing' | 'past_due' | 'canceled' | 'unpaid' | 'incomplete' | 'expired' | string;
  locked: boolean;
  trialEndsAt?: string | null;
  currentPeriodEnd?: string | null;
  cancelAtPeriodEnd?: boolean;
  hasCustomer?: boolean;
  message?: string;
}

export const billingStatus = (): BillingStatus => {
  if (!billingConfigured) return { enforced: false, status: 'not_required', locked: false };
  if (OVERRIDE) return { enforced: false, status: 'comped', locked: false };
  const r = read();
  const trialEnds = new Date(new Date(createdAt()).getTime() + TRIAL_DAYS * 86400_000);
  const now = Date.now();
  const base = { enforced: true, currentPeriodEnd: r.currentPeriodEnd || null, cancelAtPeriodEnd: !!r.cancelAtPeriodEnd, hasCustomer: !!r.customerId };

  if (r.status === 'active' || r.status === 'trialing') {
    return { ...base, status: r.status, locked: false, message: r.cancelAtPeriodEnd ? 'Your subscription is set to cancel at the end of the period.' : undefined };
  }
  if (r.status === 'past_due') {
    const graceEnd = (r.currentPeriodEnd ? new Date(r.currentPeriodEnd).getTime() : now) + GRACE_DAYS * 86400_000;
    const locked = now > graceEnd;
    return { ...base, status: 'past_due', locked, message: locked ? 'Payment failed and the grace period ended. Update your card to unlock the workspace.' : 'Your last payment failed. Update your card to avoid interruption.' };
  }
  if (!r.status && now < trialEnds.getTime()) {
    return { ...base, status: 'trial', locked: false, trialEndsAt: trialEnds.toISOString(), message: `Free trial ends ${trialEnds.toDateString()}.` };
  }
  return {
    ...base,
    status: r.status || 'expired',
    locked: true,
    trialEndsAt: trialEnds.toISOString(),
    message: r.status ? 'Your subscription is not active. Subscribe to unlock the workspace.' : 'Your free trial has ended. Subscribe to keep using the workspace.',
  };
};

// ---------- Stripe REST ----------
const form = (params: Record<string, string | number | boolean | undefined>) =>
  new URLSearchParams(Object.entries(params).filter(([, v]) => v !== undefined).map(([k, v]) => [k, String(v)]));

const stripe = async <T,>(method: 'GET' | 'POST', path: string, params?: Record<string, string | number | boolean | undefined>): Promise<T> => {
  const url = `https://api.stripe.com/v1/${path}${method === 'GET' && params ? `?${form(params)}` : ''}`;
  const res = await fetch(url, {
    method,
    headers: { Authorization: `Bearer ${KEY}`, ...(method === 'POST' ? { 'Content-Type': 'application/x-www-form-urlencoded' } : {}) },
    body: method === 'POST' && params ? form(params) : undefined,
  });
  const data = (await res.json().catch(() => ({}))) as { error?: { message?: string } } & T;
  if (!res.ok) throw new Error(data?.error?.message || `Stripe error ${res.status}`);
  return data;
};

interface StripeSubscription {
  id: string;
  customer: string;
  status: string;
  cancel_at_period_end?: boolean;
  current_period_end?: number;
  items?: { data?: Array<{ current_period_end?: number }> };
  metadata?: Record<string, string>;
}

const applySubscription = (sub: StripeSubscription) => {
  const end = sub.current_period_end ?? sub.items?.data?.[0]?.current_period_end;
  write({
    ...read(),
    customerId: sub.customer,
    subscriptionId: sub.id,
    status: sub.status,
    cancelAtPeriodEnd: !!sub.cancel_at_period_end,
    currentPeriodEnd: end ? new Date(end * 1000).toISOString() : null,
  });
};

export const createCheckout = async (appUrl: string, email: string, companyName: string) => {
  const r = read();
  const id = instanceId();
  const session = await stripe<{ url: string }>('POST', 'checkout/sessions', {
    mode: 'subscription',
    'line_items[0][price]': PRICE,
    'line_items[0][quantity]': 1,
    success_url: `${appUrl}/?checkout_session={CHECKOUT_SESSION_ID}#admin/billing`,
    cancel_url: `${appUrl}/#admin/billing`,
    client_reference_id: id,
    ...(r.customerId ? { customer: r.customerId } : { customer_email: email }),
    'metadata[instance_id]': id,
    'subscription_data[metadata][instance_id]': id,
    'subscription_data[metadata][company]': companyName.slice(0, 200),
    allow_promotion_codes: true,
  });
  return session.url;
};

export const confirmCheckout = async (sessionId: string) => {
  const session = await stripe<{ metadata?: Record<string, string>; subscription?: StripeSubscription | string; customer?: string }>(
    'GET',
    `checkout/sessions/${encodeURIComponent(sessionId)}`,
    { 'expand[]': 'subscription' },
  );
  if (session.metadata?.instance_id !== instanceId()) throw new Error('This checkout belongs to a different workspace.');
  if (session.subscription && typeof session.subscription === 'object') applySubscription(session.subscription);
  else if (session.customer) write({ ...read(), customerId: session.customer });
  return billingStatus();
};

export const createPortal = async (appUrl: string) => {
  const r = read();
  if (!r.customerId) throw new Error('No billing account yet. Subscribe first.');
  const portal = await stripe<{ url: string }>('POST', 'billing_portal/sessions', { customer: r.customerId, return_url: `${appUrl}/#admin/billing` });
  return portal.url;
};

export const syncBilling = async () => {
  if (!billingConfigured) return billingStatus();
  const r = read();
  if (r.subscriptionId) {
    applySubscription(await stripe<StripeSubscription>('GET', `subscriptions/${encodeURIComponent(r.subscriptionId)}`));
  } else if (r.customerId) {
    const list = await stripe<{ data: StripeSubscription[] }>('GET', 'subscriptions', { customer: r.customerId, status: 'all', limit: 1 });
    if (list.data[0]) applySubscription(list.data[0]);
  }
  return billingStatus();
};

/** Verify a Stripe webhook signature (v1, HMAC-SHA256, 5-minute tolerance). */
export const verifyStripeSignature = (raw: Buffer, header: string | undefined, secret = WEBHOOK_SECRET, now = Date.now()) => {
  if (!secret || !header) return false;
  const parts = Object.fromEntries(header.split(',').map((p) => p.split('=') as [string, string]).filter((p) => p.length === 2));
  const t = Number(parts.t);
  if (!t || Math.abs(now / 1000 - t) > 300) return false;
  const expected = crypto.createHmac('sha256', secret).update(`${t}.${raw.toString('utf8')}`).digest('hex');
  const sigs = header
    .split(',')
    .filter((p) => p.startsWith('v1='))
    .map((p) => p.slice(3));
  return sigs.some((sig) => sig.length === expected.length && crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected)));
};

export const handleWebhook = async (raw: Buffer, signature: string | undefined) => {
  if (!WEBHOOK_SECRET) return { ok: false, status: 400, error: 'Webhook secret not configured.' };
  if (!verifyStripeSignature(raw, signature)) return { ok: false, status: 400, error: 'Invalid signature.' };
  const event = JSON.parse(raw.toString('utf8')) as { type: string; data: { object: Record<string, unknown> } };
  const obj = event.data.object;
  const mine = (o: Record<string, unknown>) =>
    (o.metadata as Record<string, string> | undefined)?.instance_id === instanceId() || (!!read().customerId && o.customer === read().customerId);

  if (event.type === 'checkout.session.completed' && mine(obj)) {
    write({ ...read(), customerId: obj.customer as string, subscriptionId: obj.subscription as string });
    await syncBilling().catch(() => undefined);
  } else if (event.type.startsWith('customer.subscription.') && mine(obj)) {
    applySubscription(obj as unknown as StripeSubscription);
  } else if ((event.type === 'invoice.payment_failed' || event.type === 'invoice.paid') && mine(obj)) {
    await syncBilling().catch(() => undefined);
  }
  return { ok: true, status: 200 };
};
