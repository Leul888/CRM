import React, { useEffect, useMemo, useState } from 'react';
import { ClipboardList, Copy, ExternalLink, FilePlus2, FileSignature, Pencil, Plus, Receipt, Send, Trash2 } from 'lucide-react';
import type { Estimate, EstimateLineItem, ServiceType, User } from '../types';
import { computeEstimateTotals, lineItem } from '../store';
import {
  Badge,
  Button,
  ConfirmDialog,
  DetailRow,
  Drawer,
  EmptyState,
  Field,
  Input,
  Modal,
  PageHeader,
  SearchInput,
  Select,
  Table,
  Tabs,
  Textarea,
  copyToClipboard,
  run,
  useStore,
} from './SharedComponents';
import { can, estimatorPool, scopeEstimates, scopeLeads } from '../services/permissions';
import { date, dateTime, fromLocalInput, money, toDateInput } from '../services/format';
import { WorkOrderForm } from './WorkOrders';
import { serviceLabel } from '../services/catalog';
import { OPEN_VISIT, VisitOutcome } from './Appointments';
import { LINE_PRESETS } from '../core/starterCatalog';

const CATEGORIES = ['Labor', 'Materials', 'Equipment', 'Permits', 'Other'];

/** Common construction units. "Other…" allows anything else. */
export const UNITS = ['each', 'sq ft', 'linear ft', 'sq yd', 'cu yd', 'square', 'hour', 'day', 'week', 'lot', 'job', 'room', 'window', 'door', 'fixture', 'sheet', 'bundle', 'gallon', 'load', 'ton', 'allowance'];

const UnitPicker: React.FC<{ value: string; onChange: (v: string) => void }> = ({ value, onChange }) => {
  const [custom, setCustom] = useState(!!value && !UNITS.includes(value));
  if (custom)
    return (
      <div className="flex w-32 items-center gap-1">
        <Input value={value} autoFocus placeholder="Unit" onChange={(e) => onChange(e.target.value)} className="min-w-0" />
        <button type="button" title="Pick from list" aria-label="Pick from list" className="shrink-0 rounded-full p-1 text-xs text-ink-400 hover:bg-ink-100 hover:text-ink-900" onClick={() => { setCustom(false); if (!UNITS.includes(value)) onChange('each'); }}>▾</button>
      </div>
    );
  return (
    <Select
      className="w-32"
      aria-label="Unit"
      value={UNITS.includes(value) ? value : 'each'}
      onChange={(e) => {
        if (e.target.value === '__other') {
          setCustom(true);
          onChange('');
        } else onChange(e.target.value);
      }}
      options={[...UNITS.map((u) => ({ value: u, label: u })), { value: '__other', label: 'Other…' }]}
    />
  );
};

export const EstimateEditor: React.FC<{ currentUser: User; estimate?: Estimate; leadId?: string; onClose: () => void; onSaved?: (e: Estimate) => void }> = ({
  currentUser,
  estimate,
  leadId,
  onClose,
  onSaved,
}) => {
  const s = useStore();
  const leads = scopeLeads(currentUser, s.state).filter((l) => l.status !== 'LOST');
  const initialLead = s.leadById(estimate?.leadId || leadId) || leads[0];
  const validity = s.state.settings.estimateValidityDays ?? 30;
  const [leadSel, setLeadSel] = useState(initialLead?.id || '');
  const [estimatorId, setEstimatorId] = useState(estimate?.estimatorId || initialLead?.assignedEstimatorId || (currentUser.role === 'ESTIMATOR' ? currentUser.id : ''));
  const [serviceType, setServiceType] = useState<ServiceType>(estimate?.serviceType || initialLead?.serviceType || 'FLOORING_REPLACEMENT');
  const [items, setItems] = useState<EstimateLineItem[]>(estimate?.lineItems.map((i) => ({ ...i })) || [lineItem('Labor', 'Labor', 1, 'lot', 0)]);
  const [discount, setDiscount] = useState(estimate?.discount || 0);
  const companyTax = s.state.settings.defaultTaxRate ?? 0;
  // Tax is on by default. Existing estimates keep whatever they were saved with.
  const [taxOn, setTaxOn] = useState(estimate ? (estimate.taxRate ?? 0) > 0 : true);
  const [rateInput, setRateInput] = useState<number>(estimate?.taxRate || companyTax || 0);
  const [saveDefault, setSaveDefault] = useState(companyTax === 0);
  const canSetDefault = can(currentUser, 'settings:manage');
  const taxRate = taxOn ? rateInput : 0;
  const [notes, setNotes] = useState(estimate?.notes || '');
  const [expiration, setExpiration] = useState(toDateInput(estimate?.expirationDate || new Date(Date.now() + validity * 86400_000).toISOString()));
  const [productPick, setProductPick] = useState('');
  const [error, setError] = useState('');

  const totals = useMemo(() => computeEstimateTotals(items, discount, taxRate), [items, discount, taxRate]);
  // Only the lead's latest open site visit, so its outcome can be recorded right here. Older visits stay on the calendar.
  const latestVisit = s.state.appointments
    .filter((a) => a.leadId === leadSel && OPEN_VISIT.includes(a.status))
    .sort((a, b) => b.startTime.localeCompare(a.startTime))[0];
  const products = s.state.products.filter((p) => p.active);

  const update = (id: string, patch: Partial<EstimateLineItem>) =>
    setItems((xs) => xs.map((i) => (i.id === id ? { ...i, ...patch, total: Math.round((patch.quantity ?? i.quantity) * (patch.unitPrice ?? i.unitPrice) * 100) / 100 } : i)));

  // Picking a common item fills in its category and unit; typing anything else works as before.
  const pickDescription = (id: string, description: string) => {
    const preset = LINE_PRESETS.find((p) => p.description.toLowerCase() === description.trim().toLowerCase());
    update(id, preset ? { description: preset.description, category: preset.category, unit: preset.unit } : { description });
  };
  const addPreset = (description: string) => {
    const p = LINE_PRESETS.find((x) => x.description === description);
    if (p) setItems((xs) => [...xs, lineItem(p.description, p.category, 1, p.unit, 0)]);
  };

  const addProduct = (pid: string) => {
    const p = products.find((x) => x.id === pid);
    if (!p) return;
    setItems((xs) => [...xs, lineItem(p.name, p.category === 'Upsells' || p.category === 'Packages' ? 'Materials' : 'Materials', 1, p.unit || 'each', p.price, p.id)]);
    setProductPick('');
  };

  const save = async () => {
    if (!leadSel) return setError('Choose a lead.');
    if (!estimatorId) return setError('Choose an estimator.');
    const clean = items.filter((i) => i.description.trim());
    if (!clean.length) return setError('Add at least one line item.');
    if (clean.some((i) => i.quantity <= 0 || i.unitPrice < 0)) return setError('Quantities must be above zero and prices non-negative.');
    if (discount > totals.subtotal) return setError('Discount cannot exceed the subtotal.');
    if (taxOn && !(rateInput > 0)) return setError('Enter your sales tax rate, or untick "Add sales tax" if this job is tax-exempt.');
    if (taxOn && rateInput > 30) return setError('That tax rate looks too high. Enter it as a percent, e.g. 6.35.');
    if (taxOn && canSetDefault && saveDefault && rateInput !== companyTax) {
      await s.saveSettings({ ...s.state.settings, defaultTaxRate: rateInput });
    }
    const t = computeEstimateTotals(clean, discount, taxRate);
    const saved = await s.saveEstimate({
      id: estimate?.id,
      number: estimate?.number,
      createdAt: estimate?.createdAt,
      leadId: leadSel,
      estimatorId,
      serviceType,
      lineItems: clean,
      materialCost: t.materialCost,
      laborCost: t.laborCost,
      quantity: 1,
      unitPrice: t.subtotal,
      discount,
      taxRate,
      tax: t.tax,
      total: t.total,
      status: estimate?.status && estimate.status !== 'REJECTED' && estimate.status !== 'EXPIRED' ? estimate.status : 'DRAFT',
      notes,
      expirationDate: fromLocalInput(`${expiration}T23:59`),
    });
    s.toast(estimate ? 'Estimate saved' : `Estimate ${saved.number} created`);
    onSaved?.(saved);
    onClose();
  };

  return (
    <Modal
      title={estimate ? `Edit ${estimate.number}` : 'New estimate'}
      description="Line items roll up to labor, materials, discount and tax automatically."
      size="xl"
      onClose={onClose}
      footer={
        <>
          <div className="mr-auto font-display text-lg font-bold">Total {money(totals.total)}</div>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={save}>{estimate ? 'Save estimate' : 'Create draft'}</Button>
        </>
      }
    >
      <div className="grid gap-4 md:grid-cols-4">
        <Field label="Lead" className="md:col-span-2">
          <Select
            value={leadSel}
            onChange={(e) => {
              const l = s.leadById(e.target.value);
              setLeadSel(e.target.value);
              if (l) {
                setServiceType(l.serviceType);
                if (l.assignedEstimatorId) setEstimatorId(l.assignedEstimatorId);
              }
            }}
            options={leads.map((l) => ({ value: l.id, label: `${l.name} — ${l.address}` }))}
            placeholder="Select lead"
          />
        </Field>
        <Field label="Estimator"><Select value={estimatorId} onChange={(e) => setEstimatorId(e.target.value)} placeholder="Select" options={estimatorPool(s.state.users).map((u) => ({ value: u.id, label: u.name }))} /></Field>
        <Field label="Service"><Select value={serviceType} onChange={(e) => setServiceType(e.target.value as ServiceType)} options={s.services.map((x) => ({ value: x.key, label: x.label }))} /></Field>
      </div>

      {latestVisit && (
        <div className="mt-5">
          <VisitOutcome appt={latestVisit} currentUser={currentUser} compact />
        </div>
      )}

      <datalist id="line-presets">{LINE_PRESETS.map((p) => <option key={p.description} value={p.description} />)}</datalist>
      <div className="mt-6 overflow-x-auto rounded-2xl border border-ink-200">
        <table className="min-w-[820px] w-full text-sm">
          <thead className="bg-ink-50">
            <tr>
              <th className="table-head w-[32%]">Description</th>
              <th className="table-head">Category</th>
              <th className="table-head">Qty</th>
              <th className="table-head">Unit</th>
              <th className="table-head">Rate</th>
              <th className="table-head text-right">Amount</th>
              <th className="table-head" />
            </tr>
          </thead>
          <tbody className="divide-y divide-ink-100">
            {items.map((i) => (
              <tr key={i.id}>
                <td className="p-2"><Input list="line-presets" value={i.description} onChange={(e) => pickDescription(i.id, e.target.value)} placeholder="Pick or type, e.g. Demolition" /></td>
                <td className="p-2"><Select className="min-w-[124px]" value={i.category} onChange={(e) => update(i.id, { category: e.target.value })} options={CATEGORIES.map((c) => ({ value: c, label: c }))} /></td>
                <td className="p-2"><Input type="number" min={0} step="any" value={i.quantity} onChange={(e) => update(i.id, { quantity: Number(e.target.value) })} className="w-20" /></td>
                <td className="p-2"><UnitPicker value={i.unit} onChange={(v) => update(i.id, { unit: v })} /></td>
                <td className="p-2"><Input type="number" min={0} step="any" value={i.unitPrice} onChange={(e) => update(i.id, { unitPrice: Number(e.target.value) })} className="w-28" /></td>
                <td className="p-2 text-right font-semibold">{money(i.total)}</td>
                <td className="p-2 text-right">
                  <button className="rounded-full p-2 text-ink-400 hover:bg-rose-50 hover:text-rose-600" onClick={() => setItems((xs) => xs.filter((x) => x.id !== i.id))} aria-label="Remove line"><Trash2 size={15} /></button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="flex flex-wrap items-center gap-2 border-t border-ink-100 bg-ink-50/50 p-3">
          <Button size="sm" variant="outline" icon={<Plus size={14} />} onClick={() => setItems((xs) => [...xs, lineItem('', 'Labor', 1, 'lot', 0)])}>Add line</Button>
          <Select className="!h-8 !w-56 !py-0 text-xs" value="" onChange={(e) => addPreset(e.target.value)} placeholder="+ Add common item" options={LINE_PRESETS.map((p) => ({ value: p.description, label: `${p.description} (${p.category})` }))} />
          <Select className="!h-8 !w-64 !py-0 text-xs" value={productPick} onChange={(e) => addProduct(e.target.value)} placeholder="+ Add from product catalog" options={products.map((p) => ({ value: p.id, label: `${p.name} · ${money(p.price)}/${p.unit || 'each'}` }))} />
        </div>
      </div>

      <div className="mt-6 grid gap-6 md:grid-cols-[1fr,320px]">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Discount ($)"><Input type="number" min={0} value={discount} onChange={(e) => setDiscount(Number(e.target.value))} /></Field>
          <div>
            <label className="flex items-center gap-2 text-sm font-semibold text-ink-900">
              <input type="checkbox" checked={taxOn} onChange={(e) => setTaxOn(e.target.checked)} className="h-4 w-4 accent-brand-600" /> Add sales tax
            </label>
            {taxOn ? (
              <div className="mt-1.5">
                <div className="relative">
                  <Input type="number" min={0} step="0.01" aria-label="Tax rate (%)" placeholder="e.g. 6.35" value={rateInput || ''} onChange={(e) => { setRateInput(Number(e.target.value)); setError(""); }} className={`pr-8 ${!(rateInput > 0) ? '!border-amber-400' : ''}`} />
                  <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-sm text-ink-400">%</span>
                </div>
                {canSetDefault && rateInput > 0 && rateInput !== companyTax && (
                  <label className="mt-1.5 flex items-center gap-2 text-xs text-ink-600">
                    <input type="checkbox" checked={saveDefault} onChange={(e) => setSaveDefault(e.target.checked)} className="h-3.5 w-3.5 accent-brand-600" /> Use {rateInput}% for all new estimates
                  </label>
                )}
              </div>
            ) : (
              <p className="mt-1.5 text-xs text-ink-500">No tax on this estimate (tax-exempt).</p>
            )}
          </div>
          <Field label="Valid until"><Input type="date" value={expiration} onChange={(e) => setExpiration(e.target.value)} /></Field>
          <Field label="Client-facing notes" className="sm:col-span-2"><Textarea value={notes} onChange={(e) => setNotes(e.target.value)} /></Field>
        </div>
        <div className="space-y-2 rounded-2xl border border-brand-100 bg-brand-50/60 p-5 text-sm text-ink-900">
          <div className="flex justify-between text-ink-600"><span>Labor</span><span>{money(totals.laborCost)}</span></div>
          <div className="flex justify-between text-ink-600"><span>Materials & other</span><span>{money(totals.materialCost)}</span></div>
          <div className="flex justify-between text-ink-600"><span>Discount</span><span>−{money(discount)}</span></div>
          <div className="flex justify-between text-ink-600"><span>{taxOn ? `Sales tax (${rateInput || 0}%)` : 'Sales tax'}</span><span>{money(totals.tax)}</span></div>
          <div className="flex justify-between border-t border-brand-200 pt-3 font-display text-xl font-bold text-brand-800"><span>Total</span><span>{money(totals.total)}</span></div>
        </div>
      </div>
      {error && <p className="mt-4 text-sm font-medium text-rose-600">{error}</p>}
    </Modal>
  );
};

const EstimateDrawer: React.FC<{ estimate: Estimate; currentUser: User; onClose: () => void }> = ({ estimate, currentUser, onClose }) => {
  const s = useStore();
  const lead = s.leadById(estimate.leadId);
  const sig = s.getApprovalSignatureForEstimate(estimate.id);
  const invoice = s.state.invoices.find((i) => i.estimateId === estimate.id && i.status !== 'CANCELLED');
  const wo = s.state.workOrders.find((w) => w.estimateId === estimate.id);
  const [edit, setEdit] = useState(false);
  const [del, setDel] = useState(false);
  const [woOpen, setWoOpen] = useState(false);
  const link = s.approvalLink(estimate.id);
  const admin = can(currentUser, 'invoice:manage');

  return (
    <>
      <Drawer
        title={`${estimate.number} · ${lead?.name}`}
        subtitle={<span className="flex items-center gap-2"><Badge value={estimate.status} /> {serviceLabel(estimate.serviceType)}</span>}
        onClose={onClose}
        footer={
          <>
            {can(currentUser, 'estimate:send') && ['DRAFT', 'SENT', 'REJECTED', 'EXPIRED'].includes(estimate.status) && (
              <Button size="sm" icon={<Send size={15} />} onClick={() => void run(s.sendEstimate(estimate.id), `Sent to ${lead?.email}`)}>{estimate.status === 'DRAFT' ? 'Send for e-sign' : 'Resend'}</Button>
            )}
            {can(currentUser, 'estimate:create') && estimate.status !== 'APPROVED' && <Button size="sm" variant="outline" icon={<Pencil size={15} />} onClick={() => setEdit(true)}>Edit</Button>}
            {estimate.status === 'APPROVED' && admin && !invoice && (
              <Button size="sm" variant="outline" icon={<Receipt size={15} />} onClick={async () => { const inv = await s.createInvoiceFromEstimate(estimate.id); s.toast(`Invoice ${inv?.invoiceNumber} created`); }}>Create invoice</Button>
            )}
            {estimate.status === 'APPROVED' && can(currentUser, 'workorder:create') && !wo && <Button size="sm" variant="outline" icon={<ClipboardList size={15} />} onClick={() => setWoOpen(true)}>Schedule job</Button>}
            {can(currentUser, 'lead:delete') && <Button size="sm" variant="ghost" className="ml-auto text-rose-600" icon={<Trash2 size={15} />} onClick={() => setDel(true)}>Delete</Button>}
          </>
        }
      >
        <div className="rounded-2xl border border-brand-100 bg-brand-50/60 p-5">
          <div className="text-xs font-semibold uppercase tracking-[0.16em] text-brand-600">Total</div>
          <div className="font-display text-4xl font-bold text-ink-950">{money(estimate.total)}</div>
          <div className="mt-1 text-xs text-ink-500">Valid until {date(estimate.expirationDate)} · by {s.userName(estimate.estimatorId)}</div>
        </div>

        {sig && (
          <div className="mt-4 rounded-2xl border border-ink-200 p-4">
            <div className="flex items-center justify-between">
              <span className="flex items-center gap-2 text-sm font-semibold"><FileSignature size={16} className="text-brand-600" /> E-signature</span>
              <Badge value={sig.approvalStatus} />
            </div>
            {sig.approvalStatus === 'APPROVED' && <p className="mt-2 text-sm text-ink-600">Signed by <strong>{sig.signatureName}</strong> on {dateTime(sig.signedAt)}</p>}
            {sig.approvalStatus === 'DECLINED' && <p className="mt-2 text-sm text-ink-600">Declined {dateTime(sig.signedAt)}{sig.declineReason ? ` — "${sig.declineReason}"` : ''}</p>}
            <div className="mt-3 flex gap-2">
              <Button size="sm" variant="secondary" icon={<Copy size={14} />} onClick={() => copyToClipboard(link, 'Approval link copied')}>Copy link</Button>
              <a href={link} target="_blank" rel="noreferrer"><Button size="sm" variant="ghost" icon={<ExternalLink size={14} />}>Open client view</Button></a>
            </div>
            {estimate.status !== 'APPROVED' && admin && (
              <button className="mt-3 text-xs font-semibold text-ink-500 underline-offset-2 hover:underline" onClick={() => void run(s.setEstimateStatus(estimate.id, 'APPROVED'), 'Marked approved (signed offline)')}>
                Client signed on paper? Mark approved
              </button>
            )}
          </div>
        )}

        <div className="mt-5 overflow-hidden rounded-2xl border border-ink-200">
          {estimate.lineItems.map((i) => (
            <div key={i.id} className="flex items-start justify-between gap-3 border-b border-ink-100 px-4 py-3 text-sm last:border-0">
              <div><div className="font-medium">{i.description}</div><div className="text-xs text-ink-400">{i.category} · {i.quantity} {i.unit} × {money(i.unitPrice)}</div></div>
              <div className="font-semibold">{money(i.total)}</div>
            </div>
          ))}
        </div>
        <div className="mt-4 divide-y divide-ink-100 rounded-2xl border border-ink-200 px-4">
          <DetailRow label="Labor">{money(estimate.laborCost)}</DetailRow>
          <DetailRow label="Materials">{money(estimate.materialCost)}</DetailRow>
          <DetailRow label="Discount">−{money(estimate.discount)}</DetailRow>
          <DetailRow label={`Tax${estimate.taxRate ? ` (${estimate.taxRate}%)` : ''}`}>{money(estimate.tax)}</DetailRow>
        </div>
        {estimate.notes && <p className="mt-4 rounded-2xl bg-ink-50 p-4 text-sm text-ink-700">{estimate.notes}</p>}
        <div className="mt-5 space-y-2 text-sm">
          {invoice && <a href={`#invoices/${invoice.id}`} className="flex items-center justify-between rounded-xl border border-ink-200 px-4 py-3 hover:border-brand-300"><span>Invoice {invoice.invoiceNumber}</span><Badge value={invoice.status} /></a>}
          {wo && <a href={`#work-orders/${wo.id}`} className="flex items-center justify-between rounded-xl border border-ink-200 px-4 py-3 hover:border-brand-300"><span>Work order · {s.userName(wo.assignedWorkerId)}</span><Badge value={wo.status} /></a>}
          <a href={`#leads/${estimate.leadId}`} className="flex items-center justify-between rounded-xl border border-ink-200 px-4 py-3 hover:border-brand-300"><span>Lead · {lead?.name}</span><Badge value={lead?.status || 'NEW'} /></a>
        </div>
      </Drawer>
      {edit && <EstimateEditor currentUser={currentUser} estimate={estimate} onClose={() => setEdit(false)} />}
      {woOpen && <WorkOrderForm currentUser={currentUser} estimateId={estimate.id} onClose={() => setWoOpen(false)} />}
      {del && <ConfirmDialog title="Delete estimate?" message={`${estimate.number} and its signature request will be removed.`} onConfirm={() => void run(s.deleteEstimate(estimate.id), 'Estimate deleted').then(onClose)} onClose={() => setDel(false)} />}
    </>
  );
};

const Estimates: React.FC<{ currentUser: User; focusId?: string }> = ({ currentUser, focusId }) => {
  const s = useStore();
  const [tab, setTab] = useState('all');
  const [q, setQ] = useState('');
  const [creating, setCreating] = useState(false);
  useEffect(() => {
    if (focusId === 'new') setCreating(true);
  }, [focusId]);

  const all = scopeEstimates(currentUser, s.state);
  const filtered = all
    .filter((e) => tab === 'all' || e.status === tab)
    .filter((e) => !q || `${e.number} ${s.leadById(e.leadId)?.name}`.toLowerCase().includes(q.toLowerCase()))
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const focused = focusId && focusId !== 'new' ? all.find((e) => e.id === focusId) : undefined;
  const count = (st: string) => all.filter((e) => e.status === st).length;

  return (
    <div>
      <PageHeader
        eyebrow="Sales"
        title="Estimates"
        description={`${money(all.filter((e) => e.status === 'SENT').reduce((x, e) => x + e.total, 0), 0)} awaiting signature · ${money(all.filter((e) => e.status === 'APPROVED').reduce((x, e) => x + e.total, 0), 0)} approved`}
        actions={can(currentUser, 'estimate:create') ? <Button icon={<FilePlus2 size={16} />} onClick={() => setCreating(true)}>New estimate</Button> : undefined}
      />
      <div className="mb-5 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <Tabs
          value={tab}
          onChange={setTab}
          items={[
            { value: 'all', label: 'All', count: all.length },
            { value: 'DRAFT', label: 'Draft', count: count('DRAFT') },
            { value: 'SENT', label: 'Sent', count: count('SENT') },
            { value: 'APPROVED', label: 'Approved', count: count('APPROVED') },
            { value: 'REJECTED', label: 'Declined', count: count('REJECTED') },
            { value: 'EXPIRED', label: 'Expired', count: count('EXPIRED') },
          ]}
        />
        <SearchInput value={q} onChange={setQ} placeholder="Search number or client" className="md:w-72" />
      </div>
      {filtered.length === 0 ? (
        <EmptyState icon={<FileSignature size={22} />} title="No estimates here" description="Create an estimate from a lead or with the button above." />
      ) : (
        <Table head={<tr><th className="table-head">Estimate</th><th className="table-head">Client</th><th className="table-head">Estimator</th><th className="table-head">Status</th><th className="table-head">Valid until</th><th className="table-head text-right">Total</th></tr>}>
          {filtered.map((e) => (
            <tr key={e.id} className="cursor-pointer hover:bg-brand-50/40" onClick={() => (window.location.hash = `estimates/${e.id}`)}>
              <td className="table-cell font-semibold text-ink-900">{e.number}<div className="text-xs font-normal text-ink-400">{date(e.createdAt)}</div></td>
              <td className="table-cell">{s.leadById(e.leadId)?.name}<div className="text-xs text-ink-400">{serviceLabel(e.serviceType)}</div></td>
              <td className="table-cell">{s.userName(e.estimatorId)}</td>
              <td className="table-cell"><Badge value={e.status} /></td>
              <td className="table-cell whitespace-nowrap text-ink-500">{date(e.expirationDate)}</td>
              <td className="table-cell text-right font-display font-bold text-ink-900">{money(e.total)}</td>
            </tr>
          ))}
        </Table>
      )}
      {creating && (
        <EstimateEditor
          currentUser={currentUser}
          onClose={() => {
            setCreating(false);
            if (focusId === 'new') window.location.hash = 'estimates';
          }}
          onSaved={(e) => setTimeout(() => (window.location.hash = `estimates/${e.id}`), 0)}
        />
      )}
      {focused && <EstimateDrawer estimate={focused} currentUser={currentUser} onClose={() => (window.location.hash = 'estimates')} />}
    </div>
  );
};

export default Estimates;
