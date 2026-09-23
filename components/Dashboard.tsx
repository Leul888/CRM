import React, { useMemo } from 'react';
import { AlertTriangle, ArrowRight, CalendarDays, CircleDollarSign, ClipboardList, FileSignature, TrendingUp, Users } from 'lucide-react';
import type { LeadStatus, User } from '../types';
import { Avatar, Badge, Button, Card, EmptyState, PageHeader, ProgressBar, StatCard, useStore } from './SharedComponents';
import { isAdminRole, scopeAppointments, scopeEstimates, scopeLeads, scopeWorkOrders } from '../services/permissions';
import { dateTime, money, moneyShort, relative, time } from '../services/format';
import { serviceLabel } from '../services/catalog';

const FUNNEL: Array<{ label: string; statuses: LeadStatus[] }> = [
  { label: 'New & contacted', statuses: ['NEW', 'CONTACTED'] },
  { label: 'Visit scheduled', statuses: ['SCHEDULED'] },
  { label: 'Estimate sent', statuses: ['ESTIMATE_SENT'] },
  { label: 'Won / in production', statuses: ['APPROVED', 'JOB_SCHEDULED', 'IN_PROGRESS', 'COMPLETED'] },
  { label: 'Invoiced & paid', statuses: ['INVOICED', 'PAID'] },
];

const go = (hash: string) => () => {
  window.location.hash = hash;
};

const RevenueChart: React.FC<{ data: Array<{ label: string; value: number }> }> = ({ data }) => {
  const max = Math.max(1, ...data.map((d) => d.value));
  return (
    <div className="flex h-56 items-end gap-3 pt-6">
      {data.map((d, i) => {
        const h = Math.max(2, (d.value / max) * 100);
        const last = i === data.length - 1;
        return (
          <div key={d.label} className="group flex h-full flex-1 flex-col items-center justify-end gap-2">
            <span className={`text-[11px] font-semibold ${d.value ? 'text-ink-700' : 'text-ink-300'}`}>{d.value ? moneyShort(d.value) : '—'}</span>
            <div
              className={`w-full max-w-[56px] rounded-t-xl transition-all ${last ? 'bg-gradient-to-t from-brand-700 to-brand-500' : 'bg-brand-200 group-hover:bg-brand-300'}`}
              style={{ height: `${h}%` }}
              title={`${d.label}: ${money(d.value)}`}
            />
            <span className="text-[11px] font-medium text-ink-500">{d.label}</span>
          </div>
        );
      })}
    </div>
  );
};

const Dashboard: React.FC<{ currentUser: User }> = ({ currentUser }) => {
  const s = useStore();
  const { state } = s;
  const admin = isAdminRole(currentUser.role) || currentUser.role === 'DISPATCHER';

  const leads = scopeLeads(currentUser, state);
  const appts = scopeAppointments(currentUser, state);
  const estimates = scopeEstimates(currentUser, state);
  const workOrders = scopeWorkOrders(currentUser, state);

  const metrics = useMemo(() => {
    const open = leads.filter((l) => !['PAID', 'LOST'].includes(l.status));
    const pipelineValue = open.reduce((sum, l) => sum + l.budget, 0);
    const decided = estimates.filter((e) => ['APPROVED', 'REJECTED', 'EXPIRED'].includes(e.status));
    const winRate = decided.length ? Math.round((decided.filter((e) => e.status === 'APPROVED').length / decided.length) * 100) : 0;
    const collected = state.invoices.flatMap((i) => i.payments || []);
    const outstanding = state.invoices.filter((i) => i.status !== 'CANCELLED').reduce((sum, i) => sum + i.balanceDue, 0);
    const overdue = state.invoices.filter((i) => i.status === 'OVERDUE');

    const months = Array.from({ length: 6 }, (_, k) => {
      const d = new Date();
      d.setDate(1);
      d.setMonth(d.getMonth() - (5 - k));
      return { key: `${d.getFullYear()}-${d.getMonth()}`, label: d.toLocaleDateString('en-US', { month: 'short' }), value: 0 };
    });
    collected.forEach((p) => {
      const d = new Date(p.receivedAt);
      const m = months.find((x) => x.key === `${d.getFullYear()}-${d.getMonth()}`);
      if (m) m.value += p.amount;
    });
    const thisMonth = months[months.length - 1].value;

    const followUps = open
      .filter((l) => l.nextFollowUpDate && new Date(l.nextFollowUpDate) <= new Date(Date.now() + 86400_000))
      .sort((a, b) => new Date(a.nextFollowUpDate!).getTime() - new Date(b.nextFollowUpDate!).getTime());

    return { open, pipelineValue, winRate, outstanding, overdue, months, thisMonth, followUps };
  }, [leads, estimates, state.invoices]);

  const upcoming = appts
    .filter((a) => !['CANCELLED', 'COMPLETED'].includes(a.status) && new Date(a.endTime) >= new Date())
    .sort((a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime())
    .slice(0, 6);

  const awaiting = estimates.filter((e) => e.status === 'SENT');
  const lowStock = state.inventoryItems.filter((i) => i.status !== 'IN_STOCK');
  const activeJobs = workOrders.filter((w) => !['COMPLETED', 'CANCELLED'].includes(w.status));

  const hour = new Date().getHours();
  const greeting = hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening';

  // ---------- crew view ----------
  if (currentUser.role === 'WORKER' || currentUser.role === 'SUBCONTRACTOR') {
    return (
      <div>
        <PageHeader eyebrow="Your jobs" title={`${greeting}, ${currentUser.name.split(' ')[0]}.`} description="Everything assigned to you, in the order it starts." />
        <div className="grid gap-4 sm:grid-cols-3">
          <StatCard label="Active jobs" value={String(activeJobs.length)} icon={<ClipboardList size={16} />} accent onClick={go('work-orders')} />
          <StatCard label="Awaiting acceptance" value={String(workOrders.filter((w) => w.status === 'ASSIGNED').length)} />
          <StatCard label="Completed" value={String(workOrders.filter((w) => w.status === 'COMPLETED').length)} />
        </div>
        <div className="mt-6 space-y-3">
          {activeJobs.length === 0 && <EmptyState title="No active jobs" description="New work orders appear here as soon as dispatch assigns them." />}
          {activeJobs.map((w) => {
            const lead = s.leadById(w.leadId);
            const done = (w.checklist || []).filter((c) => c.done).length;
            const total = (w.checklist || []).length;
            return (
              <Card key={w.id} className="cursor-pointer transition hover:border-brand-200" onClick={go(`work-orders/${w.id}`)}>
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <div className="font-display text-lg font-semibold">{lead?.name}</div>
                    <div className="text-sm text-ink-500">{w.location} · starts {dateTime(w.scheduledStart)}</div>
                  </div>
                  <Badge value={w.status} />
                </div>
                {total > 0 && (
                  <div className="mt-4 flex items-center gap-3">
                    <ProgressBar value={(done / total) * 100} />
                    <span className="shrink-0 text-xs font-semibold text-ink-500">{done}/{total}</span>
                  </div>
                )}
              </Card>
            );
          })}
        </div>
      </div>
    );
  }

  return (
    <div>
      <PageHeader
        eyebrow={new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}
        title={`${greeting}, ${currentUser.name.split(' ')[0]}.`}
        description={admin ? 'Here is where the business stands today — pipeline, cash and what needs attention.' : 'Your leads, visits and estimates at a glance.'}
        actions={
          <>
            <Button variant="outline" onClick={go('appointments')} icon={<CalendarDays size={16} />}>Calendar</Button>
            <Button onClick={go('leads/new')} icon={<Users size={16} />}>New lead</Button>
          </>
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Open pipeline" value={moneyShort(metrics.pipelineValue)} hint={`${metrics.open.length} open leads`} icon={<TrendingUp size={16} />} accent onClick={go('leads')} />
        <StatCard label="Win rate" value={`${metrics.winRate}%`} hint="of decided estimates" icon={<FileSignature size={16} />} onClick={go('estimates')} />
        {admin && isAdminRole(currentUser.role) ? (
          <>
            <StatCard label="Collected this month" value={moneyShort(metrics.thisMonth)} hint="payments received" icon={<CircleDollarSign size={16} />} onClick={go('invoices')} />
            <StatCard label="Outstanding A/R" value={moneyShort(metrics.outstanding)} hint={`${metrics.overdue.length} overdue`} icon={<AlertTriangle size={16} />} onClick={go('invoices')} />
          </>
        ) : (
          <>
            <StatCard label="Upcoming visits" value={String(upcoming.length)} hint="next 7+ days" icon={<CalendarDays size={16} />} onClick={go('appointments')} />
            <StatCard label="Awaiting signature" value={String(awaiting.length)} hint={moneyShort(awaiting.reduce((x, e) => x + e.total, 0))} icon={<FileSignature size={16} />} onClick={go('estimates')} />
          </>
        )}
      </div>

      <div className="mt-6 grid gap-6 xl:grid-cols-[1.4fr,1fr]">
        {isAdminRole(currentUser.role) ? (
          <Card>
            <div className="flex items-center justify-between">
              <div>
                <div className="eyebrow">Cash collected</div>
                <div className="mt-1 font-display text-2xl font-bold">{money(metrics.months.reduce((x, m) => x + m.value, 0), 0)} <span className="text-sm font-medium text-ink-400">last 6 months</span></div>
              </div>
              <Button variant="ghost" size="sm" onClick={go('invoices')}>Invoices <ArrowRight size={14} /></Button>
            </div>
            <RevenueChart data={metrics.months} />
          </Card>
        ) : (
          <Card>
            <div className="eyebrow">Awaiting signature</div>
            <div className="mt-4 space-y-2">
              {awaiting.length === 0 && <p className="text-sm text-ink-500">Nothing out for signature.</p>}
              {awaiting.map((e) => (
                <button key={e.id} onClick={go(`estimates/${e.id}`)} className="flex w-full items-center justify-between rounded-xl bg-ink-50 px-4 py-3 text-left hover:bg-brand-50">
                  <span>
                    <span className="block text-sm font-semibold">{s.leadById(e.leadId)?.name}</span>
                    <span className="text-xs text-ink-500">{e.number} · sent {relative(e.createdAt)}</span>
                  </span>
                  <span className="font-display font-bold">{money(e.total, 0)}</span>
                </button>
              ))}
            </div>
          </Card>
        )}

        <Card>
          <div className="eyebrow">Pipeline by stage</div>
          <div className="mt-5 space-y-4">
            {FUNNEL.map((f) => {
              const items = leads.filter((l) => f.statuses.includes(l.status));
              const val = items.reduce((x, l) => x + l.budget, 0);
              const pct = leads.length ? (items.length / leads.length) * 100 : 0;
              return (
                <div key={f.label}>
                  <div className="mb-1.5 flex items-center justify-between text-sm">
                    <span className="font-medium text-ink-700">{f.label}</span>
                    <span className="text-ink-500"><strong className="text-ink-900">{items.length}</strong> · {moneyShort(val)}</span>
                  </div>
                  <ProgressBar value={pct} />
                </div>
              );
            })}
            <div className="flex items-center justify-between border-t border-ink-100 pt-3 text-sm">
              <span className="text-ink-500">Lost</span>
              <span className="font-semibold text-ink-700">{leads.filter((l) => l.status === 'LOST').length}</span>
            </div>
          </div>
        </Card>
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-2 xl:grid-cols-3">
        <Card>
          <div className="flex items-center justify-between">
            <div className="eyebrow">Upcoming visits</div>
            <button onClick={go('appointments')} className="text-xs font-semibold text-brand-600">View calendar</button>
          </div>
          <div className="mt-4 space-y-3">
            {upcoming.length === 0 && <p className="text-sm text-ink-500">No visits scheduled.</p>}
            {upcoming.map((a) => {
              const lead = s.leadById(a.leadId);
              const est = state.users.find((u) => u.id === a.estimatorId);
              const d = new Date(a.startTime);
              return (
                <div key={a.id} className="flex items-center gap-3">
                  <div className="flex h-12 w-12 shrink-0 flex-col items-center justify-center rounded-xl bg-ink-50 text-center">
                    <span className="text-[10px] font-semibold uppercase text-ink-500">{d.toLocaleDateString('en-US', { weekday: 'short' })}</span>
                    <span className="font-display text-base font-bold leading-none">{d.getDate()}</span>
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-semibold">{lead?.name}</div>
                    <div className="truncate text-xs text-ink-500">{time(a.startTime)} · {serviceLabel(a.serviceType)} · {est?.name}</div>
                  </div>
                  <Badge value={a.status} />
                </div>
              );
            })}
          </div>
        </Card>

        <Card>
          <div className="flex items-center justify-between">
            <div className="eyebrow">Follow-ups due</div>
            <span className="rounded-full bg-amber-50 px-2 py-0.5 text-xs font-semibold text-amber-700">{metrics.followUps.length}</span>
          </div>
          <div className="mt-4 space-y-2">
            {metrics.followUps.length === 0 && <p className="text-sm text-ink-500">No follow-ups due. Nice work.</p>}
            {metrics.followUps.slice(0, 6).map((l) => {
              const overdue = new Date(l.nextFollowUpDate!) < new Date();
              return (
                <button key={l.id} onClick={go(`leads/${l.id}`)} className="flex w-full items-center gap-3 rounded-xl px-2 py-2 text-left hover:bg-ink-50">
                  <Avatar name={l.name} size="sm" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-semibold">{l.name}</span>
                    <span className="block truncate text-xs text-ink-500">{serviceLabel(l.serviceType)} · {l.phone}</span>
                  </span>
                  <span className={`text-xs font-semibold ${overdue ? 'text-rose-600' : 'text-amber-700'}`}>{overdue ? 'Overdue' : 'Today'}</span>
                </button>
              );
            })}
          </div>
        </Card>

        <Card className="lg:col-span-2 xl:col-span-1">
          {isAdminRole(currentUser.role) && (lowStock.length > 0 || metrics.overdue.length > 0) ? (
            <>
              <div className="eyebrow text-rose-600">Needs attention</div>
              <div className="mt-4 space-y-2">
                {metrics.overdue.map((i) => (
                  <button key={i.id} onClick={go(`invoices/${i.id}`)} className="flex w-full items-center justify-between rounded-xl bg-rose-50 px-4 py-3 text-left">
                    <span><span className="block text-sm font-semibold text-rose-900">{i.invoiceNumber} overdue</span><span className="text-xs text-rose-700">{i.customerName}</span></span>
                    <span className="font-display font-bold text-rose-900">{money(i.balanceDue, 0)}</span>
                  </button>
                ))}
                {lowStock.map((i) => (
                  <button key={i.id} onClick={go('inventory')} className="flex w-full items-center justify-between rounded-xl bg-amber-50 px-4 py-3 text-left">
                    <span><span className="block text-sm font-semibold text-amber-900">{i.name}</span><span className="text-xs text-amber-700">{i.quantityOnHand} on hand · reorder at {i.reorderThreshold}</span></span>
                    <Badge value={i.status} />
                  </button>
                ))}
              </div>
            </>
          ) : (
            <>
              <div className="eyebrow">Recent leads</div>
              <div className="mt-4 space-y-2">
                {[...leads].sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 5).map((l) => (
                  <button key={l.id} onClick={go(`leads/${l.id}`)} className="flex w-full items-center justify-between rounded-xl px-2 py-2 text-left hover:bg-ink-50">
                    <span className="min-w-0"><span className="block truncate text-sm font-semibold">{l.name}</span><span className="text-xs text-ink-500">{relative(l.createdAt)}</span></span>
                    <Badge value={l.status} />
                  </button>
                ))}
              </div>
            </>
          )}
        </Card>
      </div>

      {admin && (
        <Card className="mt-6">
          <div className="flex items-center justify-between">
            <div className="eyebrow">Jobs in production</div>
            <button onClick={go('work-orders')} className="text-xs font-semibold text-brand-600">All work orders</button>
          </div>
          <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {activeJobs.length === 0 && <p className="text-sm text-ink-500">No active jobs.</p>}
            {activeJobs.map((w) => {
              const done = (w.checklist || []).filter((c) => c.done).length;
              const total = (w.checklist || []).length || 1;
              return (
                <button key={w.id} onClick={go(`work-orders/${w.id}`)} className="rounded-2xl border border-ink-200 p-4 text-left transition hover:border-brand-300">
                  <div className="flex items-center justify-between gap-2">
                    <span className="truncate text-sm font-semibold">{s.leadById(w.leadId)?.name}</span>
                    <Badge value={w.status} />
                  </div>
                  <div className="mt-1 truncate text-xs text-ink-500">{s.userName(w.assignedWorkerId)} · {w.location}</div>
                  <ProgressBar className="mt-3" value={(done / total) * 100} />
                </button>
              );
            })}
          </div>
        </Card>
      )}
    </div>
  );
};

export default Dashboard;
