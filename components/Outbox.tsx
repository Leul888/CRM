import React, { useState } from 'react';
import { CalendarDays, Inbox, Mail, MessageSquare } from 'lucide-react';
import { Badge, EmptyState, PageHeader, SearchInput, Table, Tabs, useStore } from './SharedComponents';
import { dateTime } from '../services/format';

const icon = { EMAIL: <Mail size={14} />, SMS: <MessageSquare size={14} />, CALENDAR: <CalendarDays size={14} />, INTERNAL: <Inbox size={14} /> };

const Outbox: React.FC<{ embedded?: boolean }> = ({ embedded }) => {
  const s = useStore();
  const [tab, setTab] = useState('all');
  const [q, setQ] = useState('');
  const all = s.state.outbox || [];
  const list = all.filter((m) => (tab === 'all' || m.channel === tab) && (!q || `${m.to} ${m.subject} ${m.body}`.toLowerCase().includes(q.toLowerCase())));
  return (
    <div>
      {!embedded && <PageHeader eyebrow="Admin" title="Messages" description="Every email, SMS and calendar event the CRM sends." />}
      <p className="mb-4 text-sm text-ink-500"><strong className="text-ink-800">Sent</strong> = delivered to the provider · <strong className="text-ink-800">Logged</strong> = recorded only (provider not configured) · <strong className="text-ink-800">Failed</strong> = provider rejected it.</p>
      <div className="mb-5 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <Tabs value={tab} onChange={setTab} items={[{ value: 'all', label: 'All', count: all.length }, { value: 'EMAIL', label: 'Email' }, { value: 'SMS', label: 'SMS' }, { value: 'CALENDAR', label: 'Calendar' }]} />
        <SearchInput value={q} onChange={setQ} placeholder="Search recipient or content" className="md:w-72" />
      </div>
      {list.length === 0 ? (
        <EmptyState icon={<Inbox size={22} />} title="Nothing sent yet" description="Book a visit, send an estimate or record a payment to see messages here." />
      ) : (
        <Table head={<tr><th className="table-head">Channel</th><th className="table-head">To</th><th className="table-head">Message</th><th className="table-head">Sent</th><th className="table-head">Status</th></tr>}>
          {list.map((m) => (
            <tr key={m.id}>
              <td className="table-cell"><span className="inline-flex items-center gap-1.5 rounded-full bg-brand-50 px-2.5 py-1 text-xs font-semibold text-brand-700">{icon[m.channel]} {m.channel}</span></td>
              <td className="table-cell whitespace-nowrap font-medium text-ink-900">{s.state.users.find((u) => u.id === m.to)?.name || m.to}</td>
              <td className="table-cell max-w-md">{m.subject && <div className="font-semibold text-ink-900">{m.subject}</div>}<div className="line-clamp-2 text-xs text-ink-500">{m.body}</div></td>
              <td className="table-cell whitespace-nowrap text-xs text-ink-500">{dateTime(m.sentAt)}</td>
              <td className="table-cell"><Badge value={m.status} />{m.error && <div className="mt-1 max-w-[180px] truncate text-[11px] text-rose-600" title={m.error}>{m.error}</div>}</td>
            </tr>
          ))}
        </Table>
      )}
    </div>
  );
};

export default Outbox;
