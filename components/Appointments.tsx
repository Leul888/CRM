import React, { useMemo, useState } from 'react';
import { BellRing, CalendarPlus, ChevronLeft, ChevronRight, Copy, Download, Sparkles } from 'lucide-react';
import type { Appointment, AppointmentStatus, ServiceType, User } from '../types';
import { Badge, Button, Card, DetailRow, EmptyState, Field, Input, Modal, PageHeader, Select, Table, Tabs, Textarea, copyToClipboard, run, useStore } from './SharedComponents';
import { can, scopeAppointments, scopeLeads } from '../services/permissions';
import { assignEstimatorForService } from '../services/assignmentService';
import { buildIcs } from '../services/calendarService';
import { dateTime, downloadFile, fromLocalInput, humanize, time, toLocalInput } from '../services/format';
import { serviceLabel } from '../services/catalog';

const STATUSES: AppointmentStatus[] = ['REQUESTED', 'SCHEDULED', 'CONFIRMED', 'COMPLETED', 'CANCELLED'];

export const AppointmentForm: React.FC<{ currentUser: User; initial?: Partial<Appointment>; onClose: () => void }> = ({ currentUser, initial, onClose }) => {
  const s = useStore();
  const leads = scopeLeads(currentUser, s.state).filter((l) => !['PAID', 'LOST'].includes(l.status));
  const firstLead = s.leadById(initial?.leadId) || leads[0];
  const defaultStart = () => {
    const d = new Date(Date.now() + 86400_000);
    d.setHours(10, 0, 0, 0);
    return d.toISOString();
  };
  const [d, setD] = useState({
    id: initial?.id,
    leadId: initial?.leadId || firstLead?.id || '',
    estimatorId: initial?.estimatorId || firstLead?.assignedEstimatorId || '',
    serviceType: (initial?.serviceType || firstLead?.serviceType || 'FLOORING_REPLACEMENT') as ServiceType,
    start: toLocalInput(initial?.startTime || defaultStart()),
    duration: initial?.startTime && initial?.endTime ? Math.round((new Date(initial.endTime).getTime() - new Date(initial.startTime).getTime()) / 60000) : 60,
    status: (initial?.status || 'SCHEDULED') as AppointmentStatus,
    notes: initial?.notes || '',
    reminderStatus: initial?.reminderStatus || 'PENDING',
    googleCalendarEventId: initial?.googleCalendarEventId,
  });
  const [error, setError] = useState('');

  const eligible = s.usersByRole('ESTIMATOR').filter((u) => u.serviceCapabilities.includes(d.serviceType) && (!s.isSpecialist(d.serviceType) || u.qualifiedForRenovation));
  const suggestion = useMemo(
    () => (d.start ? assignEstimatorForService(s.state.users, s.state.appointments.filter((a) => a.id !== d.id), d.serviceType, fromLocalInput(d.start), d.duration, s.isSpecialist(d.serviceType)) : null),
    [d.start, d.serviceType, d.duration, d.id, s.state.users, s.state.appointments],
  );

  const conflict = useMemo(() => {
    if (!d.estimatorId || !d.start) return null;
    const st = new Date(d.start).getTime();
    const en = st + d.duration * 60000;
    return s.state.appointments.find((a) => a.id !== d.id && a.estimatorId === d.estimatorId && a.status !== 'CANCELLED' && new Date(a.startTime).getTime() < en && new Date(a.endTime).getTime() > st);
  }, [d, s.state.appointments]);

  const save = async () => {
    if (!d.leadId) return setError('Choose a lead.');
    if (!d.estimatorId) return setError('Choose an estimator.');
    if (!d.start) return setError('Choose a start time.');
    if (conflict && !window.confirm(`${s.userName(d.estimatorId)} already has a visit at ${time(conflict.startTime)}. Double-book anyway?`)) return;
    const startIso = fromLocalInput(d.start);
    await s.saveAppointment({
      id: d.id,
      leadId: d.leadId,
      estimatorId: d.estimatorId,
      serviceType: d.serviceType,
      startTime: startIso,
      endTime: new Date(new Date(startIso).getTime() + d.duration * 60000).toISOString(),
      status: d.status,
      notes: d.notes,
      reminderStatus: d.reminderStatus,
      googleCalendarEventId: d.googleCalendarEventId,
    });
    s.toast(d.id ? 'Appointment updated' : 'Appointment booked and synced to calendar');
    onClose();
  };

  return (
    <Modal
      title={d.id ? 'Edit appointment' : 'Schedule estimate visit'}
      onClose={onClose}
      size="lg"
      footer={<><Button variant="outline" onClick={onClose}>Cancel</Button><Button onClick={save}>{d.id ? 'Save' : 'Book visit'}</Button></>}
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Lead" className="sm:col-span-2">
          <Select
            value={d.leadId}
            onChange={(e) => {
              const l = s.leadById(e.target.value);
              setD((x) => ({ ...x, leadId: e.target.value, serviceType: l?.serviceType || x.serviceType, estimatorId: l?.assignedEstimatorId || x.estimatorId }));
            }}
            placeholder="Select lead"
            options={leads.map((l) => ({ value: l.id, label: `${l.name} — ${serviceLabel(l.serviceType)}` }))}
          />
        </Field>
        <Field label="Service"><Select value={d.serviceType} onChange={(e) => setD((x) => ({ ...x, serviceType: e.target.value as ServiceType }))} options={s.services.map((x) => ({ value: x.key, label: x.label }))} /></Field>
        <Field label="Status"><Select value={d.status} onChange={(e) => setD((x) => ({ ...x, status: e.target.value as AppointmentStatus }))} options={STATUSES.map((v) => ({ value: v, label: humanize(v) }))} /></Field>
        <Field label="Start"><Input type="datetime-local" value={d.start} onChange={(e) => setD((x) => ({ ...x, start: e.target.value }))} /></Field>
        <Field label="Duration">
          <Select value={String(d.duration)} onChange={(e) => setD((x) => ({ ...x, duration: Number(e.target.value) }))} options={[30, 45, 60, 90, 120].map((m) => ({ value: String(m), label: `${m} minutes` }))} />
        </Field>
        <Field label="Estimator" className="sm:col-span-2" error={conflict ? `Conflicts with another visit at ${time(conflict.startTime)}` : undefined}>
          <Select value={d.estimatorId} onChange={(e) => setD((x) => ({ ...x, estimatorId: e.target.value }))} placeholder="Select estimator" options={eligible.map((u) => ({ value: u.id, label: `${u.name}${u.qualifiedForRenovation ? ' · specialist' : ''}` }))} />
        </Field>
        {suggestion?.estimatorId && suggestion.estimatorId !== d.estimatorId && (
          <div className="flex items-center justify-between gap-3 rounded-2xl bg-brand-50 px-4 py-3 text-sm text-brand-800 sm:col-span-2">
            <span className="flex items-start gap-2"><Sparkles size={16} className="mt-0.5 shrink-0" /> {suggestion.reason}</span>
            <Button size="sm" variant="secondary" onClick={() => setD((x) => ({ ...x, estimatorId: suggestion.estimatorId }))}>Use</Button>
          </div>
        )}
        <Field label="Notes" className="sm:col-span-2"><Textarea value={d.notes} onChange={(e) => setD((x) => ({ ...x, notes: e.target.value }))} /></Field>
        {error && <p className="text-sm font-medium text-rose-600 sm:col-span-2">{error}</p>}
      </div>
    </Modal>
  );
};

const AppointmentDetail: React.FC<{ appt: Appointment; currentUser: User; onClose: () => void; onEdit: () => void }> = ({ appt, currentUser, onClose, onEdit }) => {
  const s = useStore();
  const lead = s.leadById(appt.leadId);
  const est = s.state.users.find((u) => u.id === appt.estimatorId);
  const manage = can(currentUser, 'appointment:manage');
  const setStatus = (st: AppointmentStatus) => {
    void run(s.setAppointmentStatus(appt.id, st), `Appointment ${humanize(st).toLowerCase()}`);
  };
  const ics = () =>
    downloadFile(`visit-${appt.id}.ics`, buildIcs({ uid: appt.id, title: `Estimate: ${lead?.name} (${serviceLabel(appt.serviceType)})`, description: appt.notes || '', location: lead?.address || '', start: appt.startTime, end: appt.endTime }), 'text/calendar');

  return (
    <Modal
      title={lead?.name || 'Appointment'}
      description={`${serviceLabel(appt.serviceType)} · ${dateTime(appt.startTime)} – ${time(appt.endTime)}`}
      onClose={onClose}
      footer={
        manage ? (
          <>
            <Button variant="ghost" icon={<Download size={15} />} onClick={ics}>.ics</Button>
            <Button variant="outline" icon={<BellRing size={15} />} disabled={['CANCELLED', 'COMPLETED'].includes(appt.status)} onClick={async () => { const r = await s.sendAppointmentReminder(appt.id); s.toast('error' in r ? r.error! : 'Reminders sent to client and estimator', 'error' in r ? 'error' : 'success'); }}>Send reminder</Button>
            <Button variant="outline" onClick={onEdit}>Edit</Button>
          </>
        ) : undefined
      }
    >
      <div className="flex flex-wrap gap-2"><Badge value={appt.status} /><Badge value={appt.reminderStatus} label={`Reminder: ${humanize(appt.reminderStatus)}`} /></div>
      <div className="mt-4 divide-y divide-ink-100 rounded-2xl border border-ink-200 px-4">
        <DetailRow label="Estimator">{est?.name}</DetailRow>
        <DetailRow label="Address">{lead?.address}</DetailRow>
        <DetailRow label="Phone">{lead?.phone}</DetailRow>
        <DetailRow label="Calendar event">{appt.googleCalendarEventId || '—'}</DetailRow>
      </div>
      {appt.notes && <p className="mt-4 rounded-2xl bg-ink-50 p-4 text-sm text-ink-700">{appt.notes}</p>}
      {manage && (
        <div className="mt-5 flex flex-wrap gap-2">
          {appt.status === 'REQUESTED' && <Button size="sm" onClick={() => setStatus('SCHEDULED')}>Accept request</Button>}
          {['REQUESTED', 'SCHEDULED'].includes(appt.status) && <Button size="sm" variant="secondary" onClick={() => setStatus('CONFIRMED')}>Mark confirmed</Button>}
          {!['COMPLETED', 'CANCELLED'].includes(appt.status) && <Button size="sm" variant="secondary" onClick={() => setStatus('COMPLETED')}>Mark completed</Button>}
          {!['COMPLETED', 'CANCELLED'].includes(appt.status) && <Button size="sm" variant="ghost" className="text-rose-600" onClick={() => setStatus('CANCELLED')}>Cancel visit</Button>}
          <Button size="sm" variant="ghost" onClick={() => (window.location.hash = `leads/${appt.leadId}`)}>Open lead</Button>
        </div>
      )}
    </Modal>
  );
};

const startOfWeek = (d: Date) => {
  const x = new Date(d);
  const day = (x.getDay() + 6) % 7;
  x.setDate(x.getDate() - day);
  x.setHours(0, 0, 0, 0);
  return x;
};

const HOURS = Array.from({ length: 11 }, (_, i) => 8 + i);

const Appointments: React.FC<{ currentUser: User }> = ({ currentUser }) => {
  const s = useStore();
  const [view, setView] = useState('week');
  const [weekStart, setWeekStart] = useState(() => startOfWeek(new Date()));
  const [estimator, setEstimator] = useState('');
  const [editing, setEditing] = useState<Partial<Appointment> | null>(null);
  const [detail, setDetail] = useState<string | null>(null);

  const appts = scopeAppointments(currentUser, s.state).filter((a) => !estimator || a.estimatorId === estimator);
  const days = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(weekStart);
    d.setDate(d.getDate() + i);
    return d;
  });
  const detailAppt = s.state.appointments.find((a) => a.id === detail);
  const requested = appts.filter((a) => a.status === 'REQUESTED').length;

  const colorFor = (id: string) => s.state.users.find((u) => u.id === id)?.calendarColor || '#4b3ab3';
  const bookingLink = `${window.location.origin}${window.location.pathname}#book`;

  return (
    <div>
      <PageHeader
        eyebrow="Scheduling"
        title="Calendar"
        description={requested ? `${requested} booking request${requested > 1 ? 's' : ''} waiting for confirmation.` : 'Estimate visits across your team.'}
        actions={
          <>
            <Button variant="outline" icon={<Copy size={16} />} onClick={() => copyToClipboard(bookingLink, 'Public booking link copied')}>Copy booking link</Button>
            {can(currentUser, 'appointment:manage') && <Button icon={<CalendarPlus size={16} />} onClick={() => setEditing({})}>Schedule visit</Button>}
          </>
        }
      />

      <div className="mb-5 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div className="flex items-center gap-2">
          <Tabs value={view} onChange={setView} items={[{ value: 'week', label: 'Week' }, { value: 'list', label: 'List' }]} />
          {view === 'week' && (
            <div className="flex items-center gap-1">
              <button className="flex h-9 w-9 items-center justify-center rounded-full hover:bg-ink-100" onClick={() => setWeekStart((w) => new Date(w.getTime() - 7 * 86400_000))} aria-label="Previous week"><ChevronLeft size={18} /></button>
              <button className="rounded-full px-3 py-1.5 text-xs font-semibold hover:bg-ink-100" onClick={() => setWeekStart(startOfWeek(new Date()))}>Today</button>
              <button className="flex h-9 w-9 items-center justify-center rounded-full hover:bg-ink-100" onClick={() => setWeekStart((w) => new Date(w.getTime() + 7 * 86400_000))} aria-label="Next week"><ChevronRight size={18} /></button>
              <span className="ml-2 font-display text-sm font-semibold text-ink-800">
                {days[0].toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} – {days[6].toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
              </span>
            </div>
          )}
        </div>
        {currentUser.role !== 'ESTIMATOR' && (
          <Select className="md:w-60" value={estimator} onChange={(e) => setEstimator(e.target.value)} placeholder="All estimators" options={s.usersByRole('ESTIMATOR').map((u) => ({ value: u.id, label: u.name }))} />
        )}
      </div>

      {view === 'week' ? (
        <Card padded={false} className="overflow-hidden">
          <div className="overflow-x-auto">
            <div className="min-w-[860px]">
              <div className="grid grid-cols-[64px,repeat(7,1fr)] border-b border-ink-100 bg-ink-50/60">
                <div />
                {days.map((d) => {
                  const today = d.toDateString() === new Date().toDateString();
                  return (
                    <div key={d.toISOString()} className="px-2 py-3 text-center">
                      <div className="text-[11px] font-semibold uppercase tracking-[0.12em] text-ink-500">{d.toLocaleDateString('en-US', { weekday: 'short' })}</div>
                      <div className={`mx-auto mt-1 flex h-8 w-8 items-center justify-center rounded-full font-display text-sm font-bold ${today ? 'bg-brand-600 text-white' : 'text-ink-900'}`}>{d.getDate()}</div>
                    </div>
                  );
                })}
              </div>
              <div className="relative grid grid-cols-[64px,repeat(7,1fr)]">
                <div>
                  {HOURS.map((h) => (
                    <div key={h} className="h-16 border-b border-ink-100 pr-2 pt-1 text-right text-[11px] text-ink-400">{h > 12 ? h - 12 : h}{h >= 12 ? 'pm' : 'am'}</div>
                  ))}
                </div>
                {days.map((d) => {
                  const dayAppts = appts
                    .filter((a) => new Date(a.startTime).toDateString() === d.toDateString())
                    .sort((a, b) => a.startTime.localeCompare(b.startTime));
                  // Lane layout so overlapping visits sit side by side.
                  const laneEnds: number[] = [];
                  const lanes = new Map<string, number>();
                  dayAppts.forEach((a) => {
                    const st = new Date(a.startTime).getTime();
                    let lane = laneEnds.findIndex((end) => end <= st);
                    if (lane === -1) lane = laneEnds.length;
                    laneEnds[lane] = new Date(a.endTime).getTime();
                    lanes.set(a.id, lane);
                  });
                  const laneCount = Math.max(1, laneEnds.length);
                  return (
                    <div
                      key={d.toISOString()}
                      className="relative border-l border-ink-100"
                      onDoubleClick={(e) => {
                        if (!can(currentUser, 'appointment:manage')) return;
                        const rect = (e.currentTarget as HTMLDivElement).getBoundingClientRect();
                        const hour = 8 + Math.floor((e.clientY - rect.top) / 64);
                        const st = new Date(d);
                        st.setHours(hour, 0, 0, 0);
                        setEditing({ startTime: st.toISOString(), endTime: new Date(st.getTime() + 3600_000).toISOString() });
                      }}
                    >
                      {HOURS.map((h) => <div key={h} className="h-16 border-b border-ink-100" />)}
                      {dayAppts.map((a) => {
                        const st = new Date(a.startTime);
                        const top = (st.getHours() + st.getMinutes() / 60 - 8) * 64;
                        const height = Math.max(28, ((new Date(a.endTime).getTime() - st.getTime()) / 3600_000) * 64 - 4);
                        if (top < 0 || top > HOURS.length * 64) return null;
                        const c = colorFor(a.estimatorId);
                        return (
                          <button
                            key={a.id}
                            onClick={() => setDetail(a.id)}
                            className={`absolute overflow-hidden rounded-lg border-l-[3px] px-2 py-1 text-left text-[11px] transition hover:shadow-card ${a.status === 'CANCELLED' ? 'opacity-40 line-through' : ''}`}
                            style={{ top: top + 2, height, borderColor: c, background: `${c}14`, left: `calc(${((lanes.get(a.id) || 0) / laneCount) * 100}% + 3px)`, width: `calc(${100 / laneCount}% - 6px)` }}
                          >
                            <div className="truncate font-semibold text-ink-900">{s.leadById(a.leadId)?.name}</div>
                            <div className="truncate text-ink-500">{time(a.startTime)} · {s.userName(a.estimatorId).split(' ')[0]}</div>
                            {a.status === 'REQUESTED' && <div className="mt-0.5 font-semibold text-amber-700">Requested</div>}
                          </button>
                        );
                      })}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
          <div className="border-t border-ink-100 px-4 py-2.5 text-xs text-ink-400">Tip: double-click a slot to book it.</div>
        </Card>
      ) : appts.length === 0 ? (
        <EmptyState title="No appointments" description="Booked visits will appear here." />
      ) : (
        <Table head={<tr><th className="table-head">When</th><th className="table-head">Lead</th><th className="table-head">Estimator</th><th className="table-head">Status</th><th className="table-head">Reminder</th></tr>}>
          {[...appts].sort((a, b) => b.startTime.localeCompare(a.startTime)).map((a) => (
            <tr key={a.id} className="cursor-pointer hover:bg-brand-50/40" onClick={() => setDetail(a.id)}>
              <td className="table-cell whitespace-nowrap font-medium text-ink-900">{dateTime(a.startTime)}</td>
              <td className="table-cell">{s.leadById(a.leadId)?.name}<div className="text-xs text-ink-400">{serviceLabel(a.serviceType)}</div></td>
              <td className="table-cell"><span className="inline-flex items-center gap-2"><span className="h-2 w-2 rounded-full" style={{ background: colorFor(a.estimatorId) }} />{s.userName(a.estimatorId)}</span></td>
              <td className="table-cell"><Badge value={a.status} /></td>
              <td className="table-cell"><Badge value={a.reminderStatus} /></td>
            </tr>
          ))}
        </Table>
      )}

      {editing && <AppointmentForm currentUser={currentUser} initial={editing} onClose={() => setEditing(null)} />}
      {detailAppt && (
        <AppointmentDetail
          appt={detailAppt}
          currentUser={currentUser}
          onClose={() => setDetail(null)}
          onEdit={() => {
            setEditing(detailAppt);
            setDetail(null);
          }}
        />
      )}
    </div>
  );
};

export default Appointments;
