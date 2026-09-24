import React, { useEffect, useMemo, useState } from 'react';
import { CalendarPlus, Upload, Download, FilePlus2, KanbanSquare, List, Mail, MessageSquare, Pencil, Phone, Plus, Trash2, Users } from 'lucide-react';
import type { Lead, LeadActivity, LeadSource, LeadStatus, ServiceType, User } from '../types';
import {
  Avatar,
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
  run,
  useStore,
} from './SharedComponents';
import { can, estimatorPool, scopeLeads } from '../services/permissions';
import { date, downloadFile, fromLocalInput, humanize, isEmail, money, relative, toCsv, toDateInput } from '../services/format';
import { AppointmentForm, VisitOutcome } from './Appointments';
import ImportCustomers from './ImportCustomers';
import { EstimateEditor } from './Estimates';
import { serviceLabel } from '../services/catalog';

export const LEAD_STATUSES: LeadStatus[] = ['NEW', 'CONTACTED', 'SCHEDULED', 'ESTIMATE_SENT', 'APPROVED', 'JOB_SCHEDULED', 'IN_PROGRESS', 'COMPLETED', 'INVOICED', 'PAID', 'LOST'];
const SOURCES: LeadSource[] = ['WEBSITE', 'CALL_CENTER', 'SOCIAL_MEDIA', 'REFERRAL', 'MANUAL'];
const BOARD_COLUMNS: LeadStatus[] = ['NEW', 'CONTACTED', 'SCHEDULED', 'ESTIMATE_SENT', 'APPROVED', 'JOB_SCHEDULED', 'IN_PROGRESS', 'INVOICED', 'PAID'];

type Draft = Omit<Lead, 'id' | 'createdAt'> & { id?: string; createdAt?: string };

const emptyLead = (user: User): Draft => ({
  name: '',
  email: '',
  phone: '',
  address: '',
  budget: 10000,
  serviceType: 'FLOORING_REPLACEMENT',
  status: 'NEW',
  source: 'MANUAL',
  notes: '',
  assignedSalesRepId: user.role === 'SALES_REP' ? user.id : undefined,
  assignedEstimatorId: user.role === 'ESTIMATOR' ? user.id : undefined,
  nextFollowUpDate: new Date(Date.now() + 86400_000).toISOString(),
});

export const LeadForm: React.FC<{ lead: Draft; currentUser: User; onClose: () => void; onSaved?: (l: Lead) => void }> = ({ lead, currentUser, onClose, onSaved }) => {
  const s = useStore();
  const [d, setD] = useState<Draft>(lead);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const canAssign = can(currentUser, 'lead:assign');
  const estPool = estimatorPool(s.state.users);
  const estCapable = estPool.filter((u) => u.serviceCapabilities.includes(d.serviceType) && (!s.isSpecialist(d.serviceType) || u.qualifiedForRenovation));
  const estimators = estCapable.length ? estCapable : estPool;
  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => setD((x) => ({ ...x, [k]: v }));

  const save = async () => {
    const e: Record<string, string> = {};
    if (!d.name.trim()) e.name = 'Name is required';
    if (d.email && !isEmail(d.email)) e.email = 'Invalid email';
    if (!d.phone.trim() && !d.email.trim()) e.phone = 'Add a phone or email';
    const dup = !d.id && s.state.leads.find((l) => d.email && l.email.toLowerCase() === d.email.toLowerCase());
    if (dup && !window.confirm(`${dup.name} already uses this email. Create a separate lead anyway?`)) return;
    setErrors(e);
    if (Object.keys(e).length) return;
    const saved = await s.saveLead({ ...d, name: d.name.trim(), email: d.email.trim() });
    s.toast(d.id ? 'Lead updated' : 'Lead created');
    onSaved?.(saved);
    onClose();
  };

  return (
    <Modal
      title={d.id ? 'Edit lead' : 'New lead'}
      description={d.id ? d.name : 'Capture a new opportunity. Required: name and a way to reach them.'}
      onClose={onClose}
      size="lg"
      footer={
        <>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={save}>{d.id ? 'Save changes' : 'Create lead'}</Button>
        </>
      }
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Full name" error={errors.name}><Input value={d.name} onChange={(e) => set('name', e.target.value)} autoFocus /></Field>
        <Field label="Email" error={errors.email}><Input type="email" value={d.email} onChange={(e) => set('email', e.target.value)} /></Field>
        <Field label="Phone" error={errors.phone}><Input value={d.phone} onChange={(e) => set('phone', e.target.value)} /></Field>
        <Field label="Budget"><Input type="number" min={0} step={500} value={d.budget} onChange={(e) => set('budget', Number(e.target.value))} /></Field>
        <Field label="Address" className="sm:col-span-2"><Input value={d.address} onChange={(e) => set('address', e.target.value)} /></Field>
        <Field label="Service"><Select value={d.serviceType} onChange={(e) => set('serviceType', e.target.value as ServiceType)} options={s.services.map((x) => ({ value: x.key, label: x.label }))} /></Field>
        <Field label="Source"><Select value={d.source} onChange={(e) => set('source', e.target.value as LeadSource)} options={SOURCES.map((x) => ({ value: x, label: humanize(x) }))} /></Field>
        <Field label="Status"><Select value={d.status} onChange={(e) => set('status', e.target.value as LeadStatus)} options={LEAD_STATUSES.map((x) => ({ value: x, label: humanize(x) }))} /></Field>
        <Field label="Next follow-up"><Input type="date" value={toDateInput(d.nextFollowUpDate)} onChange={(e) => set('nextFollowUpDate', e.target.value ? fromLocalInput(`${e.target.value}T09:00`) : undefined)} /></Field>
        <Field label="Sales rep">
          <Select disabled={!canAssign} value={d.assignedSalesRepId || ''} onChange={(e) => set('assignedSalesRepId', e.target.value || undefined)} placeholder="Unassigned" options={s.usersByRole('SALES_REP').map((u) => ({ value: u.id, label: u.name }))} />
        </Field>
        <Field label="Estimator" hint={s.isSpecialist(d.serviceType) ? 'Specialist-qualified estimators only' : undefined}>
          <Select disabled={!canAssign} value={d.assignedEstimatorId || ''} onChange={(e) => set('assignedEstimatorId', e.target.value || undefined)} placeholder="Unassigned" options={estimators.map((u) => ({ value: u.id, label: u.name }))} />
        </Field>
        <Field label="Notes" className="sm:col-span-2"><Textarea value={d.notes} onChange={(e) => set('notes', e.target.value)} /></Field>
      </div>
    </Modal>
  );
};

const activityIcon = (k: LeadActivity['kind']) => (k === 'CALL' ? <Phone size={13} /> : k === 'EMAIL' ? <Mail size={13} /> : k === 'NOTE' ? <MessageSquare size={13} /> : <span className="h-1.5 w-1.5 rounded-full bg-current" />);

const LeadDrawer: React.FC<{ lead: Lead; currentUser: User; onClose: () => void }> = ({ lead, currentUser, onClose }) => {
  const s = useStore();
  const [note, setNote] = useState('');
  const [kind, setKind] = useState<LeadActivity['kind']>('NOTE');
  const [edit, setEdit] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const [schedule, setSchedule] = useState(false);
  const [estimate, setEstimate] = useState(false);
  const appts = s.state.appointments.filter((a) => a.leadId === lead.id);
  const ests = s.state.estimates.filter((e) => e.leadId === lead.id);
  const invs = s.state.invoices.filter((i) => i.leadId === lead.id);

  const addNote = async () => {
    if (!note.trim()) return;
    await run(s.addLeadActivity(lead.id, note.trim(), kind), 'Activity logged');
    setNote('');
  };

  return (
    <>
      <Drawer
        title={lead.name}
        subtitle={<span className="flex flex-wrap items-center gap-2"><Badge value={lead.status} /> <span>{serviceLabel(lead.serviceType)} · {humanize(lead.source)}</span></span>}
        onClose={onClose}
        footer={
          <>
            {can(currentUser, 'appointment:manage') && <Button variant="outline" size="sm" icon={<CalendarPlus size={15} />} onClick={() => setSchedule(true)}>Schedule visit</Button>}
            {can(currentUser, 'estimate:create') && <Button variant="outline" size="sm" icon={<FilePlus2 size={15} />} onClick={() => setEstimate(true)}>New estimate</Button>}
            {can(currentUser, 'lead:edit') && <Button variant="outline" size="sm" icon={<Pencil size={15} />} onClick={() => setEdit(true)}>Edit</Button>}
            {can(currentUser, 'lead:delete') && <Button variant="ghost" size="sm" className="ml-auto text-rose-600" icon={<Trash2 size={15} />} onClick={() => setConfirm(true)}>Delete</Button>}
          </>
        }
      >
        <div className="flex flex-wrap gap-2">
          <a href={`tel:${lead.phone}`} className="inline-flex items-center gap-1.5 rounded-full bg-brand-50 px-3 py-1.5 text-xs font-semibold text-brand-700"><Phone size={13} /> {lead.phone}</a>
          {lead.email && <a href={`mailto:${lead.email}`} className="inline-flex items-center gap-1.5 rounded-full bg-brand-50 px-3 py-1.5 text-xs font-semibold text-brand-700"><Mail size={13} /> {lead.email}</a>}
        </div>

        <div className="mt-5 divide-y divide-ink-100 rounded-2xl border border-ink-200 px-4">
          <DetailRow label="Address">{lead.address || '—'}</DetailRow>
          <DetailRow label="Budget">{money(lead.budget, 0)}</DetailRow>
          <DetailRow label="Sales rep">{s.userName(lead.assignedSalesRepId)}</DetailRow>
          <DetailRow label="Estimator">{s.userName(lead.assignedEstimatorId)}</DetailRow>
          <DetailRow label="Next follow-up">{lead.nextFollowUpDate ? date(lead.nextFollowUpDate) : '—'}</DetailRow>
          <DetailRow label="Created">{date(lead.createdAt)}</DetailRow>
        </div>

        {can(currentUser, 'lead:edit') && (
          <div className="mt-5">
            <span className="label">Move to stage</span>
            <Select value={lead.status} onChange={(e) => void run(s.setLeadStatus(lead.id, e.target.value as LeadStatus), `Moved to ${humanize(e.target.value)}`)} options={LEAD_STATUSES.map((x) => ({ value: x, label: humanize(x) }))} />
          </div>
        )}

        {lead.notes && <p className="mt-5 whitespace-pre-line rounded-2xl bg-ink-50 p-4 text-sm text-ink-700">{lead.notes}</p>}

        {(appts.length > 0 || ests.length > 0 || invs.length > 0) && (
          <div className="mt-6">
            <div className="eyebrow mb-3">Related</div>
            <div className="space-y-2">
              {appts.map((a) => (
                <VisitOutcome key={a.id} appt={a} currentUser={currentUser} />
              ))}
              {ests.map((e) => (
                <a key={e.id} href={`#estimates/${e.id}`} className="flex items-center justify-between rounded-xl border border-ink-200 px-3.5 py-2.5 text-sm hover:border-brand-300">
                  <span>{e.number} · {money(e.total)}</span><Badge value={e.status} />
                </a>
              ))}
              {invs.map((i) => (
                <a key={i.id} href={`#invoices/${i.id}`} className="flex items-center justify-between rounded-xl border border-ink-200 px-3.5 py-2.5 text-sm hover:border-brand-300">
                  <span>{i.invoiceNumber} · {money(i.balanceDue)} due</span><Badge value={i.status} />
                </a>
              ))}
            </div>
          </div>
        )}

        <div className="mt-6">
          <div className="eyebrow mb-3">Activity</div>
          {can(currentUser, 'lead:edit') && (
            <div className="rounded-2xl border border-ink-200 p-3">
              <Textarea rows={2} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Log a call, email or note…" className="!border-0 !p-1 !shadow-none focus:!ring-0" />
              <div className="mt-2 flex items-center justify-between">
                <Tabs value={kind} onChange={(v) => setKind(v as LeadActivity['kind'])} items={[{ value: 'NOTE', label: 'Note' }, { value: 'CALL', label: 'Call' }, { value: 'EMAIL', label: 'Email' }]} />
                <Button size="sm" onClick={addNote} disabled={!note.trim()}>Log</Button>
              </div>
            </div>
          )}
          <ol className="mt-4 space-y-4 border-l border-ink-200 pl-5">
            {(lead.activity || []).map((a) => (
              <li key={a.id} className="relative">
                <span className="absolute -left-[29px] flex h-5 w-5 items-center justify-center rounded-full bg-surface text-brand-600 ring-1 ring-ink-200">{activityIcon(a.kind)}</span>
                <div className="text-sm text-ink-800">{a.text}</div>
                <div className="mt-0.5 text-xs text-ink-400">{relative(a.at)}{a.userId ? ` · ${s.userName(a.userId)}` : ''}</div>
              </li>
            ))}
          </ol>
        </div>
      </Drawer>
      {edit && <LeadForm lead={lead} currentUser={currentUser} onClose={() => setEdit(false)} />}
      {confirm && <ConfirmDialog title="Delete lead?" message={`This permanently removes ${lead.name} and their appointments, estimates, invoices and work orders.`} onConfirm={() => void run(s.deleteLead(lead.id), 'Lead deleted').then(onClose)} onClose={() => setConfirm(false)} />}
      {schedule && <AppointmentForm currentUser={currentUser} initial={{ leadId: lead.id }} onClose={() => setSchedule(false)} />}
      {estimate && <EstimateEditor currentUser={currentUser} leadId={lead.id} onClose={() => setEstimate(false)} onSaved={(e) => setTimeout(() => (window.location.hash = `estimates/${e.id}`), 0)} />}
    </>
  );
};

const Leads: React.FC<{ currentUser: User; focusId?: string }> = ({ currentUser, focusId }) => {
  const s = useStore();
  const [view, setView] = useState<'table' | 'board'>(() => {
    try {
      return (localStorage.getItem('cf-leads-view') as 'table' | 'board') || 'table';
    } catch {
      return 'table';
    }
  });
  const [q, setQ] = useState('');
  const [status, setStatus] = useState('');
  const [service, setService] = useState('');
  const [assignee, setAssignee] = useState('');
  const [source, setSource] = useState('');
  const [creating, setCreating] = useState(false);
  const [importing, setImporting] = useState(false);
  const [dragId, setDragId] = useState<string | null>(null);

  useEffect(() => {
    try {
      localStorage.setItem('cf-leads-view', view);
    } catch {
      /* ignore */
    }
  }, [view]);

  useEffect(() => {
    if (focusId === 'new' && can(currentUser, 'lead:create')) setCreating(true);
  }, [focusId, currentUser]);

  const all = scopeLeads(currentUser, s.state);
  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase();
    return all
      .filter((l) => !term || [l.name, l.email, l.phone, l.address].some((v) => v.toLowerCase().includes(term)))
      .filter((l) => !status || l.status === status)
      .filter((l) => !service || l.serviceType === service)
      .filter((l) => !source || l.source === source)
      .filter((l) => !assignee || l.assignedSalesRepId === assignee || l.assignedEstimatorId === assignee)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }, [all, q, status, service, source, assignee]);

  const focused = focusId && focusId !== 'new' ? all.find((l) => l.id === focusId) : undefined;
  const open = (id: string) => (window.location.hash = `leads/${id}`);
  const close = () => (window.location.hash = 'leads');

  const exportCsv = () => {
    downloadFile(
      `leads-${new Date().toISOString().slice(0, 10)}.csv`,
      toCsv(filtered.map((l) => ({ Name: l.name, Email: l.email, Phone: l.phone, Address: l.address, Service: serviceLabel(l.serviceType), Status: humanize(l.status), Source: humanize(l.source), Budget: l.budget, SalesRep: s.userName(l.assignedSalesRepId), Estimator: s.userName(l.assignedEstimatorId), Created: date(l.createdAt) }))),
      'text/csv',
    );
    s.toast(`Exported ${filtered.length} leads`);
  };

  const staff = s.state.users.filter((u) => ['SALES_REP', 'ESTIMATOR'].includes(u.role));

  return (
    <div>
      <PageHeader
        eyebrow="Pipeline"
        title="Leads"
        description={`${all.length} leads · ${money(all.filter((l) => !['PAID', 'LOST'].includes(l.status)).reduce((x, l) => x + l.budget, 0), 0)} in open pipeline`}
        actions={
          <>
            {can(currentUser, 'settings:manage') && <Button variant="outline" icon={<Upload size={16} />} onClick={() => setImporting(true)}>Import</Button>}
            <Button variant="outline" icon={<Download size={16} />} onClick={exportCsv}>Export CSV</Button>
            {can(currentUser, 'lead:create') && <Button icon={<Plus size={16} />} onClick={() => setCreating(true)}>New lead</Button>}
          </>
        }
      />

      <div className="mb-5 flex flex-col gap-3 xl:flex-row xl:items-center">
        <SearchInput value={q} onChange={setQ} placeholder="Search name, email, phone, address" className="xl:w-80" />
        <div className="grid flex-1 grid-cols-2 gap-2 md:grid-cols-4">
          <Select value={status} onChange={(e) => setStatus(e.target.value)} placeholder="All statuses" options={LEAD_STATUSES.map((x) => ({ value: x, label: humanize(x) }))} />
          <Select value={service} onChange={(e) => setService(e.target.value)} placeholder="All services" options={s.services.map((x) => ({ value: x.key, label: x.label }))} />
          <Select value={assignee} onChange={(e) => setAssignee(e.target.value)} placeholder="Any assignee" options={staff.map((u) => ({ value: u.id, label: u.name }))} />
          <Select value={source} onChange={(e) => setSource(e.target.value)} placeholder="All sources" options={SOURCES.map((x) => ({ value: x, label: humanize(x) }))} />
        </div>
        <div className="inline-flex rounded-full bg-ink-100 p-1">
          <button onClick={() => setView('table')} className={`flex h-8 w-9 items-center justify-center rounded-full ${view === 'table' ? 'bg-surface shadow-sm' : 'text-ink-500'}`} aria-label="Table view"><List size={16} /></button>
          <button onClick={() => setView('board')} className={`flex h-8 w-9 items-center justify-center rounded-full ${view === 'board' ? 'bg-surface shadow-sm' : 'text-ink-500'}`} aria-label="Board view"><KanbanSquare size={16} /></button>
        </div>
      </div>

      {filtered.length === 0 ? (
        <EmptyState icon={<Users size={22} />} title="No leads match" description="Try clearing filters, or add a new lead." action={can(currentUser, 'lead:create') ? <Button onClick={() => setCreating(true)}>New lead</Button> : undefined} />
      ) : view === 'table' ? (
        <Table
          head={
            <tr>
              <th className="table-head">Lead</th>
              <th className="table-head">Service</th>
              <th className="table-head">Status</th>
              <th className="table-head">Assigned</th>
              <th className="table-head text-right">Budget</th>
              <th className="table-head">Follow-up</th>
            </tr>
          }
        >
          {filtered.map((l) => {
            const due = l.nextFollowUpDate && new Date(l.nextFollowUpDate) <= new Date() && !['PAID', 'LOST', 'COMPLETED'].includes(l.status);
            return (
              <tr key={l.id} onClick={() => open(l.id)} className="cursor-pointer transition hover:bg-brand-50/40">
                <td className="table-cell">
                  <div className="flex items-center gap-3">
                    <Avatar name={l.name} size="sm" />
                    <div className="min-w-0">
                      <div className="truncate font-semibold text-ink-900">{l.name}</div>
                      <div className="truncate text-xs text-ink-500">{l.email || l.phone}</div>
                    </div>
                  </div>
                </td>
                <td className="table-cell whitespace-nowrap">{serviceLabel(l.serviceType)}<div className="text-xs text-ink-400">{humanize(l.source)}</div></td>
                <td className="table-cell"><Badge value={l.status} /></td>
                <td className="table-cell whitespace-nowrap text-xs">{s.userName(l.assignedSalesRepId)}<div className="text-ink-400">{s.userName(l.assignedEstimatorId)}</div></td>
                <td className="table-cell text-right font-semibold text-ink-900">{money(l.budget, 0)}</td>
                <td className={`table-cell whitespace-nowrap text-xs font-medium ${due ? 'text-rose-600' : 'text-ink-500'}`}>{l.nextFollowUpDate ? date(l.nextFollowUpDate) : '—'}</td>
              </tr>
            );
          })}
        </Table>
      ) : (
        <div className="-mx-4 overflow-x-auto px-4 pb-4 sm:-mx-6 sm:px-6 lg:-mx-10 lg:px-10">
          <div className="flex gap-4">
            {BOARD_COLUMNS.map((col) => {
              const items = filtered.filter((l) => l.status === col || (col === 'IN_PROGRESS' && l.status === 'COMPLETED'));
              return (
                <div
                  key={col}
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={() => {
                    if (dragId && can(currentUser, 'lead:edit')) {
                      void run(s.setLeadStatus(dragId, col), `Moved to ${humanize(col)}`);
                    }
                    setDragId(null);
                  }}
                  className={`flex w-[272px] shrink-0 flex-col rounded-2xl p-2 transition ${dragId ? 'bg-brand-50/60 ring-1 ring-dashed ring-brand-200' : 'bg-ink-100/70'}`}
                >
                  <div className="flex items-center justify-between px-2 py-2">
                    <span className="text-xs font-bold uppercase tracking-[0.12em] text-ink-600">{humanize(col)}</span>
                    <span className="rounded-full bg-surface px-2 text-xs font-semibold text-ink-600">{items.length}</span>
                  </div>
                  <div className="min-h-[80px] space-y-2">
                    {items.map((l) => (
                      <div
                        key={l.id}
                        draggable={can(currentUser, 'lead:edit')}
                        onDragStart={() => setDragId(l.id)}
                        onDragEnd={() => setDragId(null)}
                        onClick={() => open(l.id)}
                        className="cursor-pointer rounded-xl border border-ink-200/80 bg-surface p-3.5 shadow-sm transition hover:border-brand-300 hover:shadow-card"
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="truncate text-sm font-semibold text-ink-900">{l.name}</span>
                          <span className="text-xs font-bold text-ink-900">{money(l.budget, 0)}</span>
                        </div>
                        <div className="mt-1 truncate text-xs text-ink-500">{serviceLabel(l.serviceType)}</div>
                        <div className="mt-3 flex items-center justify-between">
                          <span className="text-[11px] text-ink-400">{relative(l.createdAt)}</span>
                          <span className="text-[11px] font-medium text-ink-500">{s.userName(l.assignedEstimatorId).split(' ')[0]}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {creating && (
        <LeadForm
          lead={emptyLead(currentUser)}
          currentUser={currentUser}
          onClose={() => {
            setCreating(false);
            if (focusId === 'new') close();
          }}
          onSaved={(l) => setTimeout(() => open(l.id), 0)}
        />
      )}
      {importing && <ImportCustomers onClose={() => setImporting(false)} />}
      {focused && <LeadDrawer lead={focused} currentUser={currentUser} onClose={close} />}
    </div>
  );
};

export default Leads;
