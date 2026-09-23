import React, { useEffect, useState } from 'react';
import { CheckCircle2, CreditCard, RefreshCw, ShieldAlert } from 'lucide-react';
import type { User } from '../types';
import { store, type BillingStatus } from '../store';
import { Badge, Button, Card } from './SharedComponents';
import { date } from '../services/format';

const LABEL: Record<string, string> = {
  not_required: 'Not required',
  comped: 'Complimentary',
  trial: 'Free trial',
  trialing: 'Trialing',
  active: 'Active',
  past_due: 'Payment failed',
  canceled: 'Canceled',
  unpaid: 'Unpaid',
  incomplete: 'Incomplete',
  incomplete_expired: 'Expired',
  expired: 'Trial ended',
};

const AdminBilling: React.FC<{ actor: User }> = ({ actor }) => {
  const [info, setInfo] = useState<(BillingStatus & { configured: boolean; hasCustomer?: boolean; cancelAtPeriodEnd?: boolean }) | null>(null);
  const [busy, setBusy] = useState('');
  const canBill = actor.role === 'OWNER' || actor.role === 'MANAGER';

  const load = () => store.billingInfo().then(setInfo).catch(() => setInfo(null));
  useEffect(() => {
    void load();
  }, []);

  const act = async (kind: string, fn: () => Promise<unknown>) => {
    setBusy(kind);
    try {
      await fn();
      await load();
    } catch (e) {
      store.toast(e instanceof Error ? e.message : 'Billing error', 'error');
    } finally {
      setBusy('');
    }
  };

  if (!info) return <div className="card h-48 animate-pulse" />;

  if (!info.configured || !info.enforced) {
    return (
      <Card>
        <div className="flex items-start gap-3">
          <CheckCircle2 className="mt-0.5 text-emerald-600" />
          <div>
            <h2 className="text-lg font-bold">{info.status === 'comped' ? 'Complimentary plan' : 'No subscription required'}</h2>
            <p className="mt-1 text-sm text-ink-500">This workspace isn't billed through the app. Contact your provider with any billing questions.</p>
          </div>
        </div>
      </Card>
    );
  }

  const good = ['active', 'trialing', 'trial'].includes(info.status);
  return (
    <div className="grid gap-6 xl:grid-cols-[1.2fr,1fr]">
      <Card>
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="eyebrow">Subscription</div>
            <h2 className="mt-2 font-display text-3xl font-bold">{LABEL[info.status] || info.status}</h2>
          </div>
          <Badge value={good ? 'ACTIVE' : info.locked ? 'OVERDUE' : 'PENDING'} tone={good ? 'green' : info.locked ? 'red' : 'amber'} label={info.locked ? 'Read-only' : good ? 'Good standing' : 'Action needed'} />
        </div>
        {info.message && (
          <p className={`mt-4 flex items-start gap-2 rounded-2xl px-4 py-3 text-sm ${info.locked ? 'bg-rose-50 text-rose-800' : good ? 'bg-brand-50 text-brand-800' : 'bg-amber-50 text-amber-900'}`}>
            {!good && <ShieldAlert size={16} className="mt-0.5 shrink-0" />} {info.message}
          </p>
        )}
        <div className="mt-5 grid gap-3 text-sm sm:grid-cols-2">
          {info.trialEndsAt && info.status === 'trial' && <div className="rounded-xl border border-ink-200 p-3"><div className="text-xs text-ink-500">Trial ends</div><div className="font-semibold">{date(info.trialEndsAt)}</div></div>}
          {info.currentPeriodEnd && (
            <div className="rounded-xl border border-ink-200 p-3">
              <div className="text-xs text-ink-500">{['canceled', 'unpaid', 'incomplete_expired'].includes(info.status) ? 'Ended' : info.cancelAtPeriodEnd ? 'Access ends' : info.status === 'past_due' ? 'Payment was due' : 'Renews'}</div>
              <div className="font-semibold">{date(info.currentPeriodEnd)}</div>
            </div>
          )}
        </div>
        {canBill ? (
          <div className="mt-6 flex flex-wrap gap-2">
            {!info.hasCustomer || ['canceled', 'expired', 'incomplete_expired', 'trial'].includes(info.status) ? (
              <Button icon={<CreditCard size={16} />} disabled={!!busy} onClick={() => void act('checkout', () => store.startCheckout())}>{busy === 'checkout' ? 'Opening Stripe…' : 'Subscribe'}</Button>
            ) : null}
            {info.hasCustomer && (
              <Button variant="outline" icon={<CreditCard size={16} />} disabled={!!busy} onClick={() => void act('portal', () => store.openBillingPortal())}>{busy === 'portal' ? 'Opening…' : 'Manage card & invoices'}</Button>
            )}
            <Button variant="ghost" icon={<RefreshCw size={15} />} disabled={!!busy} onClick={() => void act('sync', async () => { await store.syncBilling(); store.toast('Billing status refreshed'); })}>Refresh status</Button>
          </div>
        ) : (
          <p className="mt-6 text-sm text-ink-500">Only owners and managers can change billing.</p>
        )}
      </Card>
      <Card>
        <h2 className="text-lg font-bold">How billing works</h2>
        <ul className="mt-3 space-y-2 text-sm text-ink-600">
          <li>Payments are handled securely by Stripe. Card details never touch this app.</li>
          <li>Use <em>Manage card &amp; invoices</em> to update your card, download receipts or cancel.</li>
          <li>If a payment fails you keep full access during a short grace period.</li>
          <li>If the subscription lapses, the workspace becomes read-only. Your data stays safe and you can still sign in and export it.</li>
        </ul>
      </Card>
    </div>
  );
};

export default AdminBilling;
