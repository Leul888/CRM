import React, { useState } from 'react';
import { CheckCircle2, ClipboardList, MapPin, Paperclip, Pencil, Play, Plus, Receipt, Send, Trash2, X } from 'lucide-react';
import type { User, WorkOrder, WorkOrderStatus } from '../types';
import { uid } from '../store';
import { Badge, Button, Card, ConfirmDialog, DetailRow, Drawer, EmptyState, Field, Input, Modal, PageHeader, ProgressBar, Select, Tabs, Textarea, run, useStore } from './SharedComponents';
import { can, crewPool, isAdminRole, scopeWorkOrders } from '../services/permissions';
import { dateTime, fromLocalInput, humanize, money, toLocalInput } from '../services/format';
import { serviceLabel } from '../services/catalog';

export const WorkOrderForm: React.FC<{ currentUser: User; workOrder?: WorkOrder; estimateId?: string; onClose: () => void }> = ({ currentUser, workOrder, estimateId, onClose }) => {
  const s = useStore();
  const approved = s.state.estimates.filter((e) => e.status === 'APPROVED');
  const initialEst = s.state.estimates.find((e) => e.id === (workOrder?.estimateId || estimateId)) || approved[0];
  const initialLead = s.leadById(initialEst?.leadId);
  const start = new Date(Date.now() + 3 * 86400_000);
  start.setHours(8, 0, 0, 0);
  const end = new Date(start.getTime() + 2 * 86400_000);
  end.setHours(17, 0, 0, 0);

  const [d, setD] = useState({
    estimateId: initialEst?.id || '',
    assignedWorkerId: workOrder?.assignedWorkerId || '',
    scopeOfWork: workOrder?.scopeOfWork || initialEst?.lineItems.map((i) => i.description).join(', ') || '',
    location: workOrder?.location || initialLead?.address || '',
    scheduledStart: toLocalInput(workOrder?.scheduledStart || start.toISOString()),
    scheduledEnd: toLocalInput(workOrder?.scheduledEnd || end.toISOString()),
    notes: workOrder?.notes || '',
    checklist: workOrder?.checklist || [],
  });
  const [newItem, setNewItem] = useState('');
  const [error, setError] = useState('');
  const est = s.state.estimates.find((e) => e.id === d.estimateId);
  const crews = crewPool(s.state.users);
  const capable = crews.filter((u) => !est || u.serviceCapabilities.includes(est.serviceType));

  const save = async () => {
    if (!d.estimateId || !est) return setError('Choose an approved estimate.');
    if (!d.assignedWorkerId) return setError('Assign a crew member.');
    if (new Date(d.scheduledEnd) <= new Date(d.scheduledStart)) return setError('End must be after start.');
    await s.saveWorkOrder({
      id: workOrder?.id,
      estimateId: d.estimateId,
      leadId: est.leadId,
      assignedWorkerId: d.assignedWorkerId,
      scopeOfWork: d.scopeOfWork,
      location: d.location,
      scheduledStart: fromLocalInput(d.scheduledStart),
      scheduledEnd: fromLocalInput(d.scheduledEnd),
      status: workOrder?.status || 'ASSIGNED',
      notes: d.notes,
      attachments: workOrder?.attachments || [],
      checklist: d.checklist,
    });
    s.toast(workOrder ? 'Work order updated' : 'Work order created and crew notified');
    onClose();
  };

  return (
    <Modal title={workOrder ? 'Edit work order' : 'Schedule job'} size="lg" onClose={onClose} footer={<><Button variant="outline" onClick={onClose}>Cancel</Button><Button onClick={save}>{workOrder ? 'Save' : 'Create work order'}</Button></>}>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Approved estimate" className="sm:col-span-2">
          <Select
            value={d.estimateId}
            disabled={!!workOrder}
            onChange={(e) => {
              const ne = s.state.estimates.find((x) => x.id === e.target.value);
              setD((x) => ({ ...x, estimateId: e.target.value, location: s.leadById(ne?.leadId)?.address || x.location, scopeOfWork: ne?.lineItems.map((i) => i.description).join(', ') || x.scopeOfWork }));
            }}
            placeholder="Select estimate"
            options={approved.map((e) => ({ value: e.id, label: `${e.number} — ${s.leadById(e.leadId)?.name} (${serviceLabel(e.serviceType)})` }))}
          />
        </Field>
        <Field label="Crew / subcontractor" hint={est ? `Showing crews capable of ${serviceLabel(est.serviceType).toLowerCase()}` : undefined}>
          <Select value={d.assignedWorkerId} onChange={(e) => setD((x) => ({ ...x, assignedWorkerId: e.target.value }))} placeholder="Select" options={(capable.length ? capable : crews).map((u) => ({ value: u.id, label: `${u.name} · ${humanize(u.role)}` }))} />
        </Field>
        <Field label="Location"><Input value={d.location} onChange={(e) => setD((x) => ({ ...x, location: e.target.value }))} /></Field>
        <Field label="Start"><Input type="datetime-local" value={d.scheduledStart} onChange={(e) => setD((x) => ({ ...x, scheduledStart: e.target.value }))} /></Field>
        <Field label="End"><Input type="datetime-local" value={d.scheduledEnd} onChange={(e) => setD((x) => ({ ...x, scheduledEnd: e.target.value }))} /></Field>
        <Field label="Scope of work" className="sm:col-span-2"><Textarea value={d.scopeOfWork} onChange={(e) => setD((x) => ({ ...x, scopeOfWork: e.target.value }))} /></Field>
        <Field label="Crew notes" className="sm:col-span-2"><Textarea rows={2} value={d.notes} onChange={(e) => setD((x) => ({ ...x, notes: e.target.value }))} /></Field>
        <div className="sm:col-span-2">
          <span className="label">Checklist</span>
          <div className="space-y-1.5">
            {d.checklist.map((c) => (
              <div key={c.id} className="flex items-center justify-between rounded-xl bg-ink-50 px-3 py-2 text-sm">
                {c.label}
                <button onClick={() => setD((x) => ({ ...x, checklist: x.checklist.filter((y) => y.id !== c.id) }))} className="text-ink-400 hover:text-rose-600" aria-label="Remove"><X size={14} /></button>
              </div>
            ))}
          </div>
          <div className="mt-2 flex gap-2">
            <Input value={newItem} onChange={(e) => setNewItem(e.target.value)} placeholder="e.g. Protect floors" onKeyDown={(e) => { if (e.key === 'Enter' && newItem.trim()) { e.preventDefault(); setD((x) => ({ ...x, checklist: [...x.checklist, { id: uid('chk'), label: newItem.trim(), done: false }] })); setNewItem(''); } }} />
            <Button variant="outline" onClick={() => { if (!newItem.trim()) return; setD((x) => ({ ...x, checklist: [...x.checklist, { id: uid('chk'), label: newItem.trim(), done: false }] })); setNewItem(''); }}><Plus size={16} /></Button>
          </div>
        </div>
        {error && <p className="text-sm font-medium text-rose-600 sm:col-span-2">{error}</p>}
      </div>
    </Modal>
  );
};

const NEXT: Partial<Record<WorkOrderStatus, { to: WorkOrderStatus; label: string; icon: React.ReactNode }>> = {
  ASSIGNED: { to: 'ACCEPTED', label: 'Accept job', icon: <CheckCircle2 size={16} /> },
  ACCEPTED: { to: 'IN_PROGRESS', label: 'Start work', icon: <Play size={16} /> },
  IN_PROGRESS: { to: 'COMPLETED', label: 'Mark complete', icon: <CheckCircle2 size={16} /> },
};

const WorkOrderDrawer: React.FC<{ wo: WorkOrder; currentUser: User; onClose: () => void }> = ({ wo, currentUser, onClose }) => {
  const s = useStore();
  const lead = s.leadById(wo.leadId);
  const [edit, setEdit] = useState(false);
  const [del, setDel] = useState(false);
  const next = NEXT[wo.status];
  const canUpdate = can(currentUser, 'workorder:update-status') && (isAdminRole(currentUser.role) || currentUser.role === 'DISPATCHER' || wo.assignedWorkerId === currentUser.id);
  const checklist = wo.checklist || [];
  const done = checklist.filter((c) => c.done).length;
  const finance = can(currentUser, 'invoice:manage');
  const invoice = s.state.invoices.find((i) => i.estimateId === wo.estimateId && i.status !== 'CANCELLED');
  const jobDone = wo.status === 'COMPLETED';
  const billed = !!invoice && invoice.status !== 'DRAFT';
  const createInvoice = async () => {
    const inv = await s.createInvoiceFromEstimate(wo.estimateId);
    if (inv) s.toast(`Invoice ${inv.invoiceNumber} ready to send`);
  };
  const sendInvoice = async () => {
    if (!invoice) return;
    await run(s.sendInvoice(invoice.id), `Invoice ${invoice.invoiceNumber} emailed to ${invoice.customerEmail}`);
  };

  const [uploading, setUploading] = useState(0);
  const attach = async (input: HTMLInputElement) => {
    const files = Array.from(input.files || []);
    input.value = '';
    if (!files.length) return;
    setUploading(files.length);
    let ok = 0;
    for (const f of files) {
      try {
        await s.uploadAttachment(wo.id, f);
        ok += 1;
      } catch {
        /* toast already shown */
      } finally {
        setUploading((n) => n - 1);
      }
    }
    if (ok) s.toast(`${ok} file${ok > 1 ? 's' : ''} uploaded`);
  };
  const files = wo.attachments
    .filter((a) => !a.startsWith('Attachment uploads'))
    .map((a) => {
      const m = /^file:(file_[a-f0-9]+):([^:]*):(\d+)$/.exec(a);
      return m ? { key: a, id: m[1], name: decodeURIComponent(m[2]), size: Number(m[3]) } : { key: a, id: '', name: a, size: 0 };
    });
  const isImage = (n: string) => /\.(jpe?g|png|webp|gif|heic|heif)$/i.test(n);

  return (
    <>
      <Drawer
        title={lead?.name || 'Work order'}
        subtitle={<span className="flex items-center gap-2"><Badge value={wo.status} /> {s.userName(wo.assignedWorkerId)}</span>}
        onClose={onClose}
        footer={
          <>
            {canUpdate && next && (
              <Button icon={next.icon} onClick={() => {
                if (next.to === 'COMPLETED' && done < checklist.length && !window.confirm(`${checklist.length - done} checklist item(s) are still open. Complete anyway?`)) return;
                void run(s.updateWorkOrderStatus(wo.id, next.to), `Job ${humanize(next.to).toLowerCase()}`);
              }}>{next.label}</Button>
            )}
            {finance && jobDone && !invoice && <Button icon={<Receipt size={16} />} onClick={() => void createInvoice()}>Create invoice</Button>}
            {finance && jobDone && invoice?.status === 'DRAFT' && <Button icon={<Send size={16} />} onClick={() => void sendInvoice()}>Send invoice</Button>}
            {can(currentUser, 'workorder:create') && <Button variant="outline" icon={<Pencil size={15} />} onClick={() => setEdit(true)}>Edit</Button>}
            {can(currentUser, 'workorder:create') && !['COMPLETED', 'CANCELLED'].includes(wo.status) && <Button variant="ghost" onClick={() => void run(s.updateWorkOrderStatus(wo.id, 'CANCELLED'), 'Work order cancelled')}>Cancel job</Button>}
            {can(currentUser, 'lead:delete') && <Button variant="ghost" className="ml-auto text-rose-600" icon={<Trash2 size={15} />} onClick={() => setDel(true)}>Delete</Button>}
          </>
        }
      >
        <a href={`https://maps.google.com/?q=${encodeURIComponent(wo.location)}`} target="_blank" rel="noreferrer" className="flex items-center gap-2 rounded-2xl bg-brand-50 px-4 py-3 text-sm font-semibold text-brand-800"><MapPin size={16} /> {wo.location}</a>
        {finance && (
          <div className={`mt-4 rounded-2xl border p-4 ${jobDone && !billed ? 'border-brand-200 bg-brand-50/70' : 'border-ink-200'}`}>
            <div className="flex items-center justify-between gap-3">
              <span className="flex items-center gap-2 text-sm font-semibold"><Receipt size={16} className="text-brand-600" /> Invoice</span>
              {invoice ? <Badge value={invoice.status} /> : <Badge value="PENDING" tone="gray" label="Not created" />}
            </div>
            {invoice ? (
              <>
                <p className="mt-2 text-sm text-ink-600">
                  {invoice.invoiceNumber} · {money(invoice.total)}
                  {invoice.amountPaid > 0 ? ` · ${money(invoice.balanceDue)} still owed` : ''}
                </p>
                {jobDone && invoice.status === 'DRAFT' && <p className="mt-1 text-xs font-medium text-brand-700">Job's done. Send the invoice so the client can pay.</p>}
                <div className="mt-3 flex flex-wrap gap-2">
                  {invoice.status === 'DRAFT' && <Button size="sm" icon={<Send size={14} />} onClick={() => void sendInvoice()}>Send invoice</Button>}
                  <Button size="sm" variant="secondary" onClick={() => (window.location.hash = `invoices/${invoice.id}`)}>Open invoice</Button>
                </div>
              </>
            ) : (
              <>
                <p className="mt-2 text-sm text-ink-600">{jobDone ? "Job's done. Create the invoice from the approved estimate." : 'You can bill now (for a deposit) or when the job is done.'}</p>
                <Button size="sm" className="mt-3" icon={<Receipt size={14} />} onClick={() => void createInvoice()}>Create invoice</Button>
              </>
            )}
          </div>
        )}
        <div className="mt-4 divide-y divide-ink-100 rounded-2xl border border-ink-200 px-4">
          <DetailRow label="Start">{dateTime(wo.scheduledStart)}</DetailRow>
          <DetailRow label="End">{dateTime(wo.scheduledEnd)}</DetailRow>
          <DetailRow label="Client phone">{lead?.phone}</DetailRow>
          <DetailRow label="Estimate">{s.state.estimates.find((e) => e.id === wo.estimateId)?.number}</DetailRow>
        </div>
        <div className="mt-5"><div className="eyebrow mb-2">Scope</div><p className="text-sm leading-relaxed text-ink-700">{wo.scopeOfWork}</p></div>
        {wo.notes && <p className="mt-4 rounded-2xl bg-amber-50 p-4 text-sm text-amber-900">{wo.notes}</p>}

        <div className="mt-6">
          <div className="mb-2 flex items-center justify-between"><div className="eyebrow">Checklist</div><span className="text-xs font-semibold text-ink-500">{done}/{checklist.length}</span></div>
          {checklist.length > 0 && <ProgressBar value={(done / checklist.length) * 100} className="mb-3" />}
          <div className="space-y-1.5">
            {checklist.length === 0 && <p className="text-sm text-ink-500">No checklist items.</p>}
            {checklist.map((c) => (
              <label key={c.id} className={`flex cursor-pointer items-center gap-3 rounded-xl border px-3.5 py-2.5 text-sm transition ${c.done ? 'border-emerald-200 bg-emerald-50/60 text-ink-500 line-through' : 'border-ink-200 hover:border-brand-300'}`}>
                <input type="checkbox" checked={c.done} disabled={!canUpdate} onChange={() => s.toggleChecklistItem(wo.id, c.id)} className="h-4 w-4 accent-brand-600" />
                {c.label}
              </label>
            ))}
          </div>
        </div>

        <div className="mt-6">
          <div className="eyebrow mb-2">Attachments</div>
          {files.length === 0 && <p className="text-sm text-ink-500">No photos or files yet.</p>}
          {files.some((f) => f.id && isImage(f.name)) && (
            <div className="mb-2 grid grid-cols-3 gap-2">
              {files.filter((f) => f.id && isImage(f.name)).map((f) => (
                <a key={f.key} href={s.attachmentUrl(wo.id, f.id)} target="_blank" rel="noreferrer" className="group relative aspect-square overflow-hidden rounded-xl bg-ink-100">
                  <img src={s.attachmentUrl(wo.id, f.id)} alt={f.name} loading="lazy" className="h-full w-full object-cover transition group-hover:scale-105" />
                </a>
              ))}
            </div>
          )}
          <div className="space-y-1.5">
            {files.filter((f) => !f.id || !isImage(f.name)).map((f) =>
              f.id ? (
                <a key={f.key} href={s.attachmentUrl(wo.id, f.id)} target="_blank" rel="noreferrer" className="flex items-center gap-2 rounded-xl bg-ink-50 px-3 py-2 text-sm hover:bg-brand-50">
                  <Paperclip size={14} className="text-ink-400" /> <span className="flex-1 truncate">{f.name}</span> <span className="text-xs text-ink-400">{Math.ceil(f.size / 1024)} KB</span>
                </a>
              ) : (
                <div key={f.key} className="flex items-center gap-2 rounded-xl bg-ink-50 px-3 py-2 text-sm"><Paperclip size={14} className="text-ink-400" /> {f.name}</div>
              ),
            )}
          </div>
          {canUpdate && (
            <label className={`mt-3 inline-flex cursor-pointer items-center gap-2 rounded-full border border-dashed border-ink-300 px-4 py-2 text-xs font-semibold text-ink-600 hover:border-brand-400 hover:text-brand-700 ${uploading ? 'pointer-events-none opacity-60' : ''}`}>
              <Paperclip size={14} /> {uploading ? `Uploading ${uploading}…` : 'Upload photos / PDFs'}
              <input type="file" multiple accept="image/*,application/pdf" className="hidden" onChange={(e) => void attach(e.currentTarget)} />
            </label>
          )}
          <p className="mt-2 text-[11px] text-ink-400">Up to 15 MB each. Only people with access to this job can open them.</p>
        </div>
      </Drawer>
      {edit && <WorkOrderForm currentUser={currentUser} workOrder={wo} onClose={() => setEdit(false)} />}
      {del && <ConfirmDialog title="Delete work order?" message="This removes the job from the schedule." onConfirm={() => void run(s.deleteWorkOrder(wo.id), 'Work order deleted').then(onClose)} onClose={() => setDel(false)} />}
    </>
  );
};

const WorkOrders: React.FC<{ currentUser: User; focusId?: string }> = ({ currentUser, focusId }) => {
  const s = useStore();
  const [tab, setTab] = useState('active');
  const [creating, setCreating] = useState(false);
  const all = scopeWorkOrders(currentUser, s.state);
  const list = all
    .filter((w) => (tab === 'active' ? !['COMPLETED', 'CANCELLED'].includes(w.status) : tab === 'all' ? true : w.status === tab))
    .sort((a, b) => a.scheduledStart.localeCompare(b.scheduledStart));
  const focused = focusId ? all.find((w) => w.id === focusId) : undefined;

  return (
    <div>
      <PageHeader
        eyebrow="Production"
        title="Work orders"
        description={currentUser.role === 'WORKER' || currentUser.role === 'SUBCONTRACTOR' ? 'Jobs assigned to you.' : 'Every job in production, by crew and start date.'}
        actions={can(currentUser, 'workorder:create') ? <Button icon={<Plus size={16} />} onClick={() => setCreating(true)}>Schedule job</Button> : undefined}
      />
      <div className="mb-5">
        <Tabs
          value={tab}
          onChange={setTab}
          items={[
            { value: 'active', label: 'Active', count: all.filter((w) => !['COMPLETED', 'CANCELLED'].includes(w.status)).length },
            { value: 'ASSIGNED', label: 'Assigned' },
            { value: 'IN_PROGRESS', label: 'In progress' },
            { value: 'COMPLETED', label: 'Completed' },
            { value: 'all', label: 'All' },
          ]}
        />
      </div>
      {list.length === 0 ? (
        <EmptyState icon={<ClipboardList size={22} />} title="No work orders" description="Approved estimates can be turned into jobs." />
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {list.map((w) => {
            const lead = s.leadById(w.leadId);
            const cl = w.checklist || [];
            const done = cl.filter((c) => c.done).length;
            return (
              <Card key={w.id} className="cursor-pointer transition hover:-translate-y-0.5 hover:border-brand-300" onClick={() => (window.location.hash = `work-orders/${w.id}`)}>
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="truncate font-display text-lg font-semibold">{lead?.name}</div>
                    <div className="truncate text-xs text-ink-500">{w.location}</div>
                  </div>
                  <Badge value={w.status} />
                </div>
                <p className="mt-3 line-clamp-2 text-sm text-ink-600">{w.scopeOfWork}</p>
                <div className="mt-4 flex items-center justify-between text-xs text-ink-500">
                  <span>{dateTime(w.scheduledStart)}</span>
                  <span className="font-semibold text-ink-700">{s.userName(w.assignedWorkerId)}</span>
                </div>
                {cl.length > 0 && <div className="mt-3 flex items-center gap-2"><ProgressBar value={(done / cl.length) * 100} /><span className="text-[11px] font-semibold text-ink-500">{done}/{cl.length}</span></div>}
              </Card>
            );
          })}
        </div>
      )}
      {creating && <WorkOrderForm currentUser={currentUser} onClose={() => setCreating(false)} />}
      {focused && <WorkOrderDrawer wo={focused} currentUser={currentUser} onClose={() => (window.location.hash = 'work-orders')} />}
    </div>
  );
};

export default WorkOrders;
