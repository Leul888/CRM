/**
 * Online invoice payments through the construction company's OWN Stripe account
 * (separate from the subscription keys, which bill the company for the CRM itself).
 *
 * Flow: invoice email → "Pay online" link (#pay/<token>) → Stripe Checkout (card or US bank / ACH)
 * → back to the app, which confirms with Stripe. Card payments are recorded immediately; bank
 * payments show as "processing" and are recorded when Stripe reports them settled (webhook or sync).
 */
import { verifyStripeSignature } from './billing';

const KEY = process.env.INVOICE_STRIPE_SECRET_KEY || '';
/** Override only for automated tests. */
const API = (process.env.STRIPE_API_BASE || 'https://api.stripe.com').replace(/\/$/, '');
const WEBHOOK_SECRET = process.env.INVOICE_STRIPE_WEBHOOK_SECRET || '';
/** card + us_bank_account by default; set INVOICE_PAYMENT_METHODS=card to turn bank payments off. */
const METHODS = (process.env.INVOICE_PAYMENT_METHODS || 'card,us_bank_account')
  .split(',')
  .map((m) => m.trim())
  .filter((m) => m === 'card' || m === 'us_bank_account');

export const paymentsConfigured = !!KEY;
export const paymentMethods = METHODS.length ? METHODS : ['card'];
export const SOURCE = 'crm-invoice';

const form = (params: Record<string, string | number | undefined>) =>
  new URLSearchParams(Object.entries(params).filter(([, v]) => v !== undefined).map(([k, v]) => [k, String(v)]));

const stripe = async <T,>(method: 'GET' | 'POST', path: string, params?: Record<string, string | number | undefined>): Promise<T> => {
  if (!KEY) throw new Error('Online payments are not set up.');
  const url = `${API}/v1/${path}${method === 'GET' && params ? `?${form(params)}` : ''}`;
  const res = await fetch(url, {
    method,
    headers: { Authorization: `Bearer ${KEY}`, ...(method === 'POST' ? { 'Content-Type': 'application/x-www-form-urlencoded' } : {}) },
    body: method === 'POST' && params ? form(params) : undefined,
  });
  const data = (await res.json().catch(() => ({}))) as { error?: { message?: string } } & T;
  if (!res.ok) throw new Error(data?.error?.message || `Stripe error ${res.status}`);
  return data;
};

export interface CheckoutSession {
  id: string;
  url?: string;
  status?: string; // open | complete | expired
  payment_status?: string; // paid | unpaid | no_payment_required
  amount_total?: number;
  metadata?: Record<string, string>;
  payment_intent?: string | { id: string; status?: string; payment_method?: { type?: string } | string };
}

export const createPaymentCheckout = async (input: {
  invoiceId: string;
  invoiceNumber: string;
  amount: number;
  companyName: string;
  customerEmail?: string;
  returnBase: string; // e.g. https://crm.example.com/api/public/pay/return?t=<token>
}) => {
  const cents = Math.round(input.amount * 100);
  if (cents < 50) throw new Error('The balance is too small to pay online.');
  const params: Record<string, string | number | undefined> = {
    mode: 'payment',
    success_url: `${input.returnBase}&session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${input.returnBase}&cancel=1`,
    customer_email: input.customerEmail && input.customerEmail.includes('@') ? input.customerEmail : undefined,
    'line_items[0][quantity]': 1,
    'line_items[0][price_data][currency]': 'usd',
    'line_items[0][price_data][unit_amount]': cents,
    'line_items[0][price_data][product_data][name]': `Invoice ${input.invoiceNumber} · ${input.companyName}`.slice(0, 250),
    'metadata[source]': SOURCE,
    'metadata[invoice_id]': input.invoiceId,
    'payment_intent_data[metadata][source]': SOURCE,
    'payment_intent_data[metadata][invoice_id]': input.invoiceId,
    'payment_intent_data[description]': `Invoice ${input.invoiceNumber}`,
  };
  paymentMethods.forEach((m, i) => (params[`payment_method_types[${i}]`] = m));
  return stripe<CheckoutSession>('POST', 'checkout/sessions', params);
};

export const getCheckoutSession = (id: string) =>
  stripe<CheckoutSession>('GET', `checkout/sessions/${encodeURIComponent(id)}`, { 'expand[]': 'payment_intent.payment_method' });

/** "CARD" or "ACH", from the payment method Stripe actually charged. */
export const methodOf = (s: CheckoutSession): 'CARD' | 'ACH' => {
  const pi = s.payment_intent;
  const pm = pi && typeof pi === 'object' ? pi.payment_method : undefined;
  const type = pm && typeof pm === 'object' ? pm.type : undefined;
  if (type === 'us_bank_account') return 'ACH';
  if (type === 'card') return 'CARD';
  return s.payment_status === 'paid' ? 'CARD' : 'ACH';
};

export type PaymentEvent =
  | { kind: 'paid'; invoiceId: string; sessionId: string; amount: number; method: 'CARD' | 'ACH' }
  | { kind: 'processing'; invoiceId: string; sessionId: string; amount: number }
  | { kind: 'failed'; invoiceId: string; sessionId: string }
  | { kind: 'ignored' };

/** Verify and translate a Stripe webhook into what the CRM should do. */
export const parsePaymentWebhook = (raw: Buffer, signature: string | undefined): { ok: false; status: number; error: string } | { ok: true; event: PaymentEvent } => {
  if (!WEBHOOK_SECRET) return { ok: false, status: 400, error: 'Payments webhook secret is not set.' };
  if (!verifyStripeSignature(raw, signature, WEBHOOK_SECRET)) return { ok: false, status: 400, error: 'Invalid signature.' };
  let evt: { type?: string; data?: { object?: CheckoutSession } };
  try {
    evt = JSON.parse(raw.toString('utf8'));
  } catch {
    return { ok: false, status: 400, error: 'Invalid payload.' };
  }
  const s = evt.data?.object;
  if (!s || s.metadata?.source !== SOURCE || !s.metadata?.invoice_id) return { ok: true, event: { kind: 'ignored' } };
  const base = { invoiceId: s.metadata.invoice_id, sessionId: s.id };
  const amount = (s.amount_total || 0) / 100;
  switch (evt.type) {
    case 'checkout.session.completed':
      return { ok: true, event: s.payment_status === 'paid' ? { kind: 'paid', ...base, amount, method: 'CARD' } : { kind: 'processing', ...base, amount } };
    case 'checkout.session.async_payment_succeeded':
      return { ok: true, event: { kind: 'paid', ...base, amount, method: 'ACH' } };
    case 'checkout.session.async_payment_failed':
      return { ok: true, event: { kind: 'failed', ...base } };
    default:
      return { ok: true, event: { kind: 'ignored' } };
  }
};
