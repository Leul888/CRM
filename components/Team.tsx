import React, { useState } from 'react';
import { Mail, Phone, Settings2 } from 'lucide-react';
import type { Role, User } from '../types';
import { Avatar, Badge, Button, Card, PageHeader, SearchInput, Tabs, useStore } from './SharedComponents';
import { canAccessPage, isAdminRole } from '../services/permissions';

const GROUPS: Record<string, Role[]> = {
  all: ['OWNER', 'MANAGER', 'OFFICE_MANAGER', 'DISPATCHER', 'SALES_REP', 'ESTIMATOR', 'WORKER', 'SUBCONTRACTOR'],
  office: ['OWNER', 'MANAGER', 'OFFICE_MANAGER', 'DISPATCHER'],
  sales: ['SALES_REP', 'ESTIMATOR'],
  field: ['WORKER', 'SUBCONTRACTOR'],
};

/** Team directory with live workload. Account management lives in the admin console. */
const Team: React.FC<{ currentUser: User }> = ({ currentUser }) => {
  const s = useStore();
  const [tab, setTab] = useState('all');
  const [q, setQ] = useState('');
  const list = s.state.users.filter((u) => u.active && GROUPS[tab].includes(u.role) && (!q || `${u.name} ${u.email}`.toLowerCase().includes(q.toLowerCase())));

  const workload = (u: User) => {
    if (u.role === 'ESTIMATOR') return `${s.state.appointments.filter((a) => a.estimatorId === u.id && new Date(a.startTime) > new Date() && a.status !== 'CANCELLED').length} upcoming visits`;
    if (u.role === 'SALES_REP') return `${s.state.leads.filter((l) => l.assignedSalesRepId === u.id && !['PAID', 'LOST'].includes(l.status)).length} open leads`;
    if (['WORKER', 'SUBCONTRACTOR'].includes(u.role)) return `${s.state.workOrders.filter((w) => w.assignedWorkerId === u.id && !['COMPLETED', 'CANCELLED'].includes(w.status)).length} active jobs`;
    return isAdminRole(u.role) ? 'Administrator' : 'Dispatch';
  };

  return (
    <div>
      <PageHeader
        eyebrow="People"
        title="Team"
        description={`${s.state.users.filter((u) => u.active).length} active people across office, sales and field.`}
        actions={canAccessPage(currentUser, 'admin') ? <Button variant="outline" icon={<Settings2 size={16} />} onClick={() => (window.location.hash = 'admin/users')}>Manage accounts</Button> : undefined}
      />
      <div className="mb-5 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <Tabs value={tab} onChange={setTab} items={[{ value: 'all', label: 'Everyone' }, { value: 'office', label: 'Office' }, { value: 'sales', label: 'Sales & estimating' }, { value: 'field', label: 'Field' }]} />
        <SearchInput value={q} onChange={setQ} placeholder="Search team" className="md:w-72" />
      </div>
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {list.map((u) => (
          <Card key={u.id}>
            <div className="flex items-start gap-3">
              <Avatar name={u.name} color={u.calendarColor} size="lg" />
              <div className="min-w-0 flex-1">
                <div className="truncate font-display text-lg font-semibold">{u.name}</div>
                <div className="mt-1 flex flex-wrap gap-1.5">
                  <Badge value={u.role} />
                  {u.qualifiedForRenovation && u.role === 'ESTIMATOR' && <Badge value="RENOVATION_QUALIFIED" label="Specialist" />}
                </div>
              </div>
            </div>
            <div className="mt-4 space-y-1.5 text-sm text-ink-600">
              <a href={`mailto:${u.email}`} className="flex items-center gap-2 truncate hover:text-brand-700"><Mail size={14} className="text-ink-400" /> {u.email}</a>
              {u.phone && <a href={`tel:${u.phone}`} className="flex items-center gap-2 hover:text-brand-700"><Phone size={14} className="text-ink-400" /> {u.phone}</a>}
            </div>
            <div className="mt-4 flex items-center justify-between border-t border-ink-100 pt-3 text-xs">
              <span className="font-semibold text-ink-700">{workload(u)}</span>
              <span className="text-ink-400">{u.serviceCapabilities.length} services</span>
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
};

export default Team;
