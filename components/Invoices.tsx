import React, { useState } from 'react';
import { CircleDollarSign, Clock, Link2, Printer, Receipt, Send, XCircle } from 'lucide-react';
import type { Invoice, PaymentMethod, User } from '../types';
import { Badge, Button, DetailRow, Drawer, EmptyState, Field, Input, Modal, PageHeader, SearchInput, Select, StatCard, Table, Tabs, copyToClipboard, run, useStore } from './SharedComponents';
import { scopeInvoices } from '../services/permissions';
import { date, dateTime, humanize, money, moneyShort } from '../services/format';

const esc = (v?: string) => (v || '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

const METHODS: PaymentMethod[] = ['CARD', 'ACH', 'CHECK', 'CASH', 'OTHER'];

const PaymentModal: React.FC<{ invoice: Invoice; onClose: () => void }> = ({ invoice, onClose }) => {
  const s = useStore();
  const [amount, setAmount] = useState(String(invoice.balanceDue));
  const [method, setMethod] = useState<PaymentMethod>('CARD');
  const [ref, setRef] = useState('');
  const [error, setError] = useState('');
  const save = async () => {
    const r = await s.recordPayment(invoice.id, Number(amount), method, ref || undefined);
    if ('error' in r) return setError(r.error || '');
    s.toast(`Payment of ${money(Number(amount))} recorded`);
    onClose();
  };
  return (
    <Modal title="Record payment" description={`${invoice.invoiceNumber} · balance ${money(invoice.balanceDue)}`} onClose={onClose} footer={<><Button variant="outline" onClick={onClose}>Cancel</Button><Button onClick={save}>Record payment</Button></>}>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Amount"><Input type="number" min={0} step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} autoFocus /></Field>
        <Field label="Method"><Select value={method} onChange={(e) => setMethod(e.target.value as PaymentMethod)} options={METHODS.map((m) => ({ value: m, label: humanize(m) }))} /></Field>
        <Field label="Reference (optional)" className="sm:col-span-2"><Input value={ref} onChange={(e) => setRef(e.target.value)} placeholder="Check #, transaction ID…" /></Field>
        <div className="flex gap-2 sm:col-span-2">
          {[0.25, 0.5, 1].map((f) => (
            <button key={f} className="rounded-full bg-ink-100 px-3 py-1 text-xs font-semibold text-ink-700 hover:bg-brand-100" onClick={() => setAmount(String(Math.round(invoice.balanceDue * f * 100) / 100))}>
              {f === 1 ? 'Full balance' : `${f * 100}%`}
            </button>
          ))}
        </div>
        {error && <p className="text-sm font-medium text-rose-600 sm:col-span-2">{error}</p>}
      </div>
    </Modal>
  );
};

const InvoiceDrawer: React.FC<{ invoice: Invoice; onClose: () => void }> = ({ invoice, onClose }) => {
  const s = useStore();
  const [pay, setPay] = useState(false);
  const { settings } = s.state;
  const lead = s.leadById(invoice.leadId);
  const open = !['PAID', 'CANCELLED'].includes(invoice.status);

  const print = () => {
    const w = window.open('', '_blank', 'width=820,height=1000');
    if (!w) return;
    const rows = invoice.lineItems.map((i) => `<tr><td>${esc(i.description)}</td><td>${i.quantity} ${esc(i.unit)}</td><td style="text-align:right">${money(i.unitPrice)}</td><td style="text-align:right">${money(i.total)}</td></tr>`).join('');
    w.document.write(`<!doctype html><html><head><title>${invoice.invoiceNumber}</title><style>
      body{font-family:Inter,system-ui,sans-serif;color:#12122a;padding:48px;max-width:760px;margin:auto}
      h1{font-size:28px;margin:0}.muted{color:#6f6f8a}table{width:100%;border-collapse:collapse;margin-top:28px;font-size:14px}
      th{text-align:left;font-size:11px;text-transform:uppercase;letter-spacing:.12em;color:#6f6f8a;border-bottom:1px solid #e2e2ee;padding:10px 0}
      td{padding:10px 0;border-bottom:1px solid #efeff6}.tot{margin-left:auto;width:280px;margin-top:20px;font-size:14px}
      .tot div{display:flex;justify-content:space-between;padding:4px 0}.big{font-size:20px;font-weight:700;border-top:2px solid #12122a;padding-top:8px!important}
      .bar{height:6px;background:#4b3ab3;border-radius:6px;margin-bottom:32px}
    </style></head><body><div class="bar"></div>
      <div style="display:flex;justify-content:space-between"><div><h1>Invoice ${invoice.invoiceNumber}</h1><div class="muted">Issued ${date(invoice.createdAt)} · Due ${date(invoice.dueDate)}</div></div>
      <div style="text-align:right"><strong>${esc(settings.companyName)}</strong><div class="muted">${esc(settings.address)}<br/>${esc(settings.supportEmail)}<br/>${esc(settings.supportPhone)}</div></div></div>
      <div style="margin-top:28px"><div class="muted" style="font-size:12px">BILL TO</div><strong>${esc(invoice.customerName)}</strong><div class="muted">${esc(lead?.address)}<br/>${esc(invoice.customerEmail)}</div></div>
      <table><thead><tr><th>Description</th><th>Qty</th><th style="text-align:right">Rate</th><th style="text-align:right">Amount</th></tr></thead><tbody>${rows}</tbody></table>
      <div class="tot"><div><span>Subtotal</span><span>${money(invoice.subtotal)}</span></div><div><span>Tax</span><span>${money(invoice.tax)}</span></div>
      <div><span>Total</span><span>${money(invoice.total)}</span></div><div><span>Paid</span><span>−${money(invoice.amountPaid)}</span></div>
      <div class="big"><span>Balance due</span><span>${money(invoice.balanceDue)}</span></div></div>
      <p class="muted" style="margin-top:48px;font-size:12px">Thank you for your business.</p>
</body></html>`);
    w.document.close();
    w.focus();
    setTimeout(() => w.print(), 250);
  };

  return (
    <>
      <Drawer
        title={invoice.invoiceNumber}
        subtitle={<span className="flex items-center gap-2"><Badge value={invoice.status} /> {invoice.customerName}</span>}
        onClose={onClose}
        footer={
          <>
            {open && <Button icon={<CircleDollarSign size={16} />} onClick={() => setPay(true)}>Record payment</Button>}
            {open && <Button variant="outline" icon={<Send size={15} />} onClick={() => void run(s.sendInvoice(invoice.id), `Invoice emailed to ${invoice.customerEmail}`)}>{invoice.status === 'DRAFT' ? 'Send' : 'Resend'}</Button>}
            <Button variant="outline" icon={<Printer size={15} />} onClick={print}>Print / PDF</Button>
            {open && invoice.amountPaid === 0 && <Button variant="ghost" className="ml-auto text-rose-600" icon={<XCircle size={15} />} onClick={() => void run(s.updateInvoiceStatus(invoice.id, 'CANCELLED'), 'Invoice voided')}>Void</Button>}
          </>
        }
      >
        <div className="grid grid-cols-2 gap-3">
          <div className="rounded-2xl border border-brand-100 bg-brand-50/60 p-4"><div className="text-xs font-semibold uppercase tracking-[0.14em] text-brand-600">Balance due</div><div className="font-display text-3xl font-bold text-brand-800">{money(invoice.balanceDue)}</div></div>
          <div className="rounded-2xl bg-ink-50 p-4"><div className="text-xs uppercase tracking-[0.14em] text-ink-500">Paid</div><div className="font-display text-3xl font-bold">{money(invoice.amountPaid)}</div></div>
        </div>
        {invoice.onlinePending && (
          <div className="mt-4 flex items-start gap-3 rounded-2xl bg-amber-50 px-4 py-3 text-sm text-amber-900">
            <Clock size={16} className="mt-0.5 shrink-0" />
            <span>Bank payment of <strong>{money(invoice.onlinePending.amount)}</strong> started {dateTime(invoice.onlinePending.startedAt)}. It's recorded automatically when it clears (about 4 business days).</span>
          </div>
        )}
        {open && s.config?.onlinePayments && (
          <div className="mt-4 flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-ink-200 px-4 py-3 text-sm">
            <span className="text-ink-600">Customer pays online by card or bank. The link is in the invoice email.</span>
            <Button size="sm" variant="secondary" icon={<Link2 size={14} />} onClick={async () => { const link = await s.payLink(invoice.id); if (typeof link === 'string' && link) void copyToClipboard(link, 'Payment link copied'); }}>Copy payment link</Button>
          </div>
        )}
        <div className="mt-4 divide-y divide-ink-100 rounded-2xl border border-ink-200 px-4">
          <DetailRow label="Issued">{date(invoice.createdAt)}</DetailRow>
          <DetailRow label="Due">{date(invoice.dueDate)}</DetailRow>
          <DetailRow label="Customer">{invoice.customerEmail}<br />{invoice.customerPhone}</DetailRow>
          <DetailRow label="Estimate">{s.state.estimates.find((e) => e.id === invoice.estimateId)?.number || '—'}</DetailRow>
        </div>
        <div className="mt-5 overflow-hidden rounded-2xl border border-ink-200">
          {invoice.lineItems.map((i) => (
            <div key={i.id} className="flex justify-between gap-3 border-b border-ink-100 px-4 py-3 text-sm last:border-0">
              <span>{i.description}<span className="block text-xs text-ink-400">{i.quantity} {i.unit} × {money(i.unitPrice)}</span></span>
              <span className="font-semibold">{money(i.total)}</span>
            </div>
          ))}
          <div className="space-y-1 bg-ink-50 px-4 py-3 text-sm">
            <div className="flex justify-between"><span className="text-ink-500">Subtotal</span><span>{money(invoice.subtotal)}</span></div>
            <div className="flex justify-between"><span className="text-ink-500">Tax</span><span>{money(invoice.tax)}</span></div>
            <div className="flex justify-between font-display text-base font-bold"><span>Total</span><span>{money(invoice.total)}</span></div>
          </div>
        </div>
        <div className="mt-6">
          <div className="eyebrow mb-3">Payments</div>
          {(invoice.payments || []).length === 0 ? (
            <p className="text-sm text-ink-500">No payments recorded yet.</p>
          ) : (
            <div className="space-y-2">
              {(invoice.payments || []).map((p) => (
                <div key={p.id} className="flex items-center justify-between rounded-xl bg-emerald-50/70 px-4 py-2.5 text-sm">
                  <span><span className="font-semibold">{money(p.amount)}</span> <span className="text-ink-500">· {humanize(p.method)}{p.reference?.startsWith('Stripe ') ? ' · paid online' : p.reference ? ` · ${p.reference}` : ''}</span></span>
                  <span className="text-xs text-ink-500">{dateTime(p.receivedAt)}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </Drawer>
      {pay && <PaymentModal invoice={invoice} onClose={() => setPay(false)} />}
    </>
  );
};

const Invoices: React.FC<{ currentUser: User; focusId?: string }> = ({ currentUser, focusId }) => {
  const s = useStore();
  const [tab, setTab] = useState('open');
  const [q, setQ] = useState('');
  const all = scopeInvoices(currentUser, s.state);
  const openInv = all.filter((i) => !['PAID', 'CANCELLED'].includes(i.status));
  const list = all
    .filter((i) => (tab === 'open' ? !['PAID', 'CANCELLED'].includes(i.status) : tab === 'all' ? true : i.status === tab))
    .filter((i) => !q || `${i.invoiceNumber} ${i.customerName}`.toLowerCase().includes(q.toLowerCase()))
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const focused = focusId ? all.find((i) => i.id === focusId) : undefined;
  const collected30 = all.flatMap((i) => i.payments || []).filter((p) => Date.now() - new Date(p.receivedAt).getTime() < 30 * 86400_000).reduce((x, p) => x + p.amount, 0);

  return (
    <div>
      <PageHeader eyebrow="Finance" title="Invoices" description="Invoices are created automatically when a client e-signs an estimate." />
      <div className="mb-6 grid gap-4 sm:grid-cols-3">
        <StatCard label="Outstanding" value={moneyShort(openInv.reduce((x, i) => x + i.balanceDue, 0))} hint={`${openInv.length} open invoices`} accent />
        <StatCard label="Overdue" value={moneyShort(all.filter((i) => i.status === 'OVERDUE').reduce((x, i) => x + i.balanceDue, 0))} hint={`${all.filter((i) => i.status === 'OVERDUE').length} invoices`} onClick={() => setTab('OVERDUE')} />
        <StatCard label="Collected · 30 days" value={moneyShort(collected30)} hint="all payment methods" />
      </div>
      <div className="mb-5 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <Tabs value={tab} onChange={setTab} items={[{ value: 'open', label: 'Open', count: openInv.length }, { value: 'DRAFT', label: 'Draft' }, { value: 'OVERDUE', label: 'Overdue' }, { value: 'PAID', label: 'Paid' }, { value: 'all', label: 'All' }]} />
        <SearchInput value={q} onChange={setQ} placeholder="Search invoice or customer" className="md:w-72" />
      </div>
      {list.length === 0 ? (
        <EmptyState icon={<Receipt size={22} />} title="No invoices" description="Approved estimates become invoices automatically." />
      ) : (
        <Table head={<tr><th className="table-head">Invoice</th><th className="table-head">Customer</th><th className="table-head">Status</th><th className="table-head">Due</th><th className="table-head text-right">Total</th><th className="table-head text-right">Balance</th></tr>}>
          {list.map((i) => (
            <tr key={i.id} className="cursor-pointer hover:bg-brand-50/40" onClick={() => (window.location.hash = `invoices/${i.id}`)}>
              <td className="table-cell font-semibold text-ink-900">{i.invoiceNumber}</td>
              <td className="table-cell">{i.customerName}</td>
              <td className="table-cell"><Badge value={i.status} /></td>
              <td className={`table-cell whitespace-nowrap ${i.status === 'OVERDUE' ? 'font-semibold text-rose-600' : 'text-ink-500'}`}>{date(i.dueDate)}</td>
              <td className="table-cell text-right">{money(i.total)}</td>
              <td className="table-cell text-right font-display font-bold text-ink-900">{money(i.balanceDue)}</td>
            </tr>
          ))}
        </Table>
      )}
      {focused && <InvoiceDrawer invoice={focused} onClose={() => (window.location.hash = 'invoices')} />}
    </div>
  );
};

export default Invoices;
