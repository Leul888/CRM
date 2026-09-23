import React, { useMemo } from 'react';
import { ArrowRight, CalendarDays, CircleDollarSign, ClipboardList, FileSignature, Package2, Phone, Receipt, TrendingUp, Users } from 'lucide-react';
import type { User } from '../types';
import { Badge, Button, Card, EmptyState, PageHeader, ProgressBar, StatCard, useStore } from './SharedComponents';
import { isAdminRole, scopeAppointments, scopeEstimates, scopeLeads, scopeWorkOrders } from '../services/permissions';
import { dateTime, money, moneyShort, relative, time } from '../services/format';
import { serviceLabel } from '../services/catalog';

const go = (hash: string) => () => {
  window.location.hash = hash;
};

type Todo = { key: string; icon: React.ReactNode; title: string; detail: string; href: string; tone: 'red' | 'amber' | 'violet' };

const Dashboard: React.FC<{ currentUser: User }> = ({ currentUser }) => {
  const s = useStore();
  const { state } = s;

  const leads = scopeLeads(currentUser, state);
  const appts = scopeAppointments(currentUser, state);
  const estimates = scopeEstimates(currentUser, state);
  const workOrders = scopeWorkOrders(currentUser, state);

  const metrics = useMemo(() => {
    const open = leads.filter((l) => !['PAID', 'LOST'].includes(l.status));
    const pipelineValue = open.reduce((sum, l) => sum + l.budget, 0);
    const now = new Date();
    const thisMonth = state.invoices
      .flatMap((i) => i.payments || [])
      .filter((p) => {
        const d = new Date(p.receivedAt);
        return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
      })
      .reduce((x, p) => x + p.amount, 0);
    const outstanding = state.invoices.filter((i) => i.status !== 'CANCELLED').reduce((sum, i) => sum + i.balanceDue, 0);
    const overdue = state.invoices.filter((i) => i.status === 'OVERDUE');
    const followUps = open
      .filter((l) => l.nextFollowUpDate && new Date(l.nextFollowUpDate) <= new Date(Date.now() + 86400_000))
      .sort((a, b) => new Date(a.nextFollowUpDate!).getTime() - new Date(b.nextFollowUpDate!).getTime());
    return { open, pipelineValue, thisMonth, outstanding, overdue, followUps };
  }, [leads, state.invoices]);

  const upcoming = appts
    .filter((a) => !['CANCELLED', 'COMPLETED'].includes(a.status) && new Date(a.endTime) >= new Date())
    .sort((a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime())
    .slice(0, 5);

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

  // ---------- everyone else: three numbers, one to-do list, next visits ----------
  const finance = isAdminRole(currentUser.role);
  const todos: Todo[] = [
    ...metrics.followUps.map((l) => {
      const late = new Date(l.nextFollowUpDate!) < new Date(new Date().toDateString());
      return { key: `f-${l.id}`, icon: <Phone size={15} />, title: `Follow up with ${l.name}`, detail: `${late ? 'Overdue' : 'Due today'} · ${l.phone || l.email}`, href: `leads/${l.id}`, tone: late ? ('red' as const) : ('amber' as const) };
    }),
    ...(finance ? metrics.overdue.map((i) => ({ key: `i-${i.id}`, icon: <CircleDollarSign size={15} />, title: `Collect ${money(i.balanceDue, 0)} from ${i.customerName}`, detail: `${i.invoiceNumber} is overdue`, href: `invoices/${i.id}`, tone: 'red' as const })) : []),
    ...awaiting.map((e) => ({ key: `e-${e.id}`, icon: <FileSignature size={15} />, title: `${s.leadById(e.leadId)?.name || 'Client'} hasn't signed yet`, detail: `${e.number} · ${money(e.total, 0)} · sent ${relative(e.createdAt)}`, href: `estimates/${e.id}`, tone: 'violet' as const })),
    ...(finance ? lowStock.map((i) => ({ key: `s-${i.id}`, icon: <Package2 size={15} />, title: `Reorder ${i.name}`, detail: `${i.quantityOnHand} left`, href: 'inventory', tone: 'amber' as const })) : []),
  ];
  const toneCls = { red: 'bg-rose-50 text-rose-600', amber: 'bg-amber-50 text-amber-700', violet: 'bg-brand-50 text-brand-600' };

  return (
    <div>
      <PageHeader
        eyebrow={new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}
        title={`${greeting}, ${currentUser.name.split(' ')[0]}.`}
        description={todos.length ? `You have ${todos.length} thing${todos.length === 1 ? '' : 's'} to take care of.` : "You're all caught up."}
        actions={<Button onClick={go('leads/new')} icon={<Users size={16} />}>New lead</Button>}
      />

      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard label="Open pipeline" value={moneyShort(metrics.pipelineValue)} hint={`${metrics.open.length} open leads`} icon={<TrendingUp size={16} />} accent onClick={go('leads')} />
        {finance ? (
          <>
            <StatCard label="Collected this month" value={moneyShort(metrics.thisMonth)} hint="payments received" icon={<CircleDollarSign size={16} />} onClick={go('invoices')} />
            <StatCard label="Still owed to you" value={moneyShort(metrics.outstanding)} hint={metrics.overdue.length ? `${metrics.overdue.length} overdue` : 'nothing overdue'} icon={<Receipt size={16} />} onClick={go('invoices')} />
          </>
        ) : (
          <>
            <StatCard label="Upcoming visits" value={String(upcoming.length)} hint="on your calendar" icon={<CalendarDays size={16} />} onClick={go('appointments')} />
            <StatCard label="Awaiting signature" value={String(awaiting.length)} hint={moneyShort(awaiting.reduce((x, e) => x + e.total, 0))} icon={<FileSignature size={16} />} onClick={go('estimates')} />
          </>
        )}
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-[1.3fr,1fr]">
        <Card>
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-bold">To do</h2>
            {todos.length > 0 && <span className="rounded-full bg-ink-100 px-2.5 py-0.5 text-xs font-semibold text-ink-600">{todos.length}</span>}
          </div>
          <div className="mt-4 divide-y divide-ink-100">
            {todos.length === 0 && <p className="py-6 text-center text-sm text-ink-500">Nothing needs your attention right now.</p>}
            {todos.slice(0, 7).map((t) => (
              <button key={t.key} onClick={go(t.href)} className="flex w-full items-center gap-3 py-3 text-left transition hover:opacity-80">
                <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full ${toneCls[t.tone]}`}>{t.icon}</span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-semibold text-ink-900">{t.title}</span>
                  <span className="block truncate text-xs text-ink-500">{t.detail}</span>
                </span>
                <ArrowRight size={15} className="shrink-0 text-ink-300" />
              </button>
            ))}
            {todos.length > 7 && <p className="pt-3 text-xs text-ink-500">+ {todos.length - 7} more</p>}
          </div>
        </Card>

        <Card>
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-bold">Next visits</h2>
            <button onClick={go('appointments')} className="text-xs font-semibold text-brand-600">Calendar</button>
          </div>
          <div className="mt-4 space-y-3">
            {upcoming.length === 0 && <p className="py-6 text-center text-sm text-ink-500">No visits scheduled.</p>}
            {upcoming.map((a) => {
              const d = new Date(a.startTime);
              return (
                <div key={a.id} className="flex items-center gap-3">
                  <div className="flex h-11 w-11 shrink-0 flex-col items-center justify-center rounded-xl bg-ink-50 text-center">
                    <span className="text-[10px] font-semibold uppercase text-ink-500">{d.toLocaleDateString('en-US', { weekday: 'short' })}</span>
                    <span className="font-display text-sm font-bold leading-none">{d.getDate()}</span>
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-semibold">{s.leadById(a.leadId)?.name}</div>
                    <div className="truncate text-xs text-ink-500">{time(a.startTime)} · {serviceLabel(a.serviceType)}</div>
                  </div>
                  {a.status === 'REQUESTED' && <Badge value={a.status} label="Confirm" />}
                </div>
              );
            })}
          </div>
        </Card>
      </div>
    </div>
  );
};

export default Dashboard;
