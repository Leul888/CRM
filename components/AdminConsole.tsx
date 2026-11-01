import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Activity,
  Rocket,
  Bell,
  Building2,
  CheckCircle2,
  Copy,
  CreditCard,
  FileSpreadsheet,
  Palette,
  Wrench,
  Database,
  Download,
  KeyRound,
  Link2,
  LogOut,
  Mail,
  MessageSquare,
  Pencil,
  RotateCcw,
  ShieldCheck,
  Upload,
  UserPlus,
  Users,
  XCircle,
} from 'lucide-react';
import type { CompanySettings, Role, ServiceType, User } from '../types';
import { store, type AdminUser, type AuditEntry, type SignupRow } from '../store';
import {
  Avatar,
  Badge,
  Button,
  Card,
  ConfirmDialog,
  EmptyState,
  Field,
  Input,
  Modal,
  PageHeader,
  SearchInput,
  Select,
  StatCard,
  Table,
  Tabs,
  copyToClipboard,
  useStore,
} from './SharedComponents';
import Outbox from './Outbox';
import AdminBilling from './AdminBilling';
import ImportCustomers from './ImportCustomers';
import { BrandingTab, ServicesTab } from './AdminBranding';
import { can } from '../services/permissions';
import { dateTime, downloadFile, humanize, moneyShort, relative } from '../services/format';

const ROLES: Role[] = ['OWNER', 'MANAGER', 'OFFICE_MANAGER', 'DISPATCHER', 'SALES_REP', 'ESTIMATOR', 'WORKER', 'SUBCONTRACTOR'];
const ADMIN_ROLES: Role[] = ['OWNER', 'MANAGER', 'OFFICE_MANAGER'];
const ROLE_HELP: Record<Role, string> = {
  OWNER: 'Full access, including backups and granting owner.',
  MANAGER: 'Full access and user management.',
  OFFICE_MANAGER: 'Full access to data and settings; can view users.',
  DISPATCHER: 'All leads, calendars and work orders.',
  SALES_REP: 'Only leads assigned to them.',
  ESTIMATOR: 'Only their leads, visits and estimates.',
  WORKER: 'Only their assigned work orders.',
  SUBCONTRACTOR: 'Only their assigned work orders.',
};

type System = Awaited<ReturnType<typeof store.system>>;

// ------------------------------------------------------------------ users
type Draft = Partial<User> & { password?: string; sendInvite?: boolean };
type InviteInfo = { name: string; email: string; link: string; emailed: boolean };

const UserModal: React.FC<{ actor: User; user?: AdminUser; emailEnabled: boolean; onClose: () => void; onSaved: (temp?: { email: string; password: string }, invite?: InviteInfo) => void }> = ({
  actor,
  user,
  emailEnabled,
  onClose,
  onSaved,
}) => {
  const [d, setD] = useState<Draft>(
    user
      ? { ...user }
      : { name: '', email: '', phone: '', role: 'SALES_REP', active: true, qualifiedForRenovation: false, serviceCapabilities: store.services.map((x) => x.key), calendarColor: '#4B3AB3', sendInvite: emailEnabled },
  );
  const [pwMode, setPwMode] = useState<'invite' | 'temp' | 'set'>('invite');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => setD((x) => ({ ...x, [k]: v }));
  const toggleService = (sv: ServiceType) => {
    const list = d.serviceCapabilities || [];
    set('serviceCapabilities', list.includes(sv) ? list.filter((x) => x !== sv) : [...list, sv]);
  };
  const roleOptions = ROLES.filter((r) => r !== 'OWNER' || actor.role === 'OWNER' || user?.role === 'OWNER');

  const save = async () => {
    setError('');
    setBusy(true);
    try {
      if (user) {
        await store.updateUser(user.id, d);
        store.toast('User updated');
        onSaved();
      } else {
        const payload = { ...d, accessMode: pwMode, password: pwMode === 'set' ? d.password : undefined };
        const r = await store.createUser(payload);
        store.toast(`${d.name} added`);
        if (r.inviteLink) onSaved(undefined, { name: r.user.name, email: r.user.email, link: r.inviteLink, emailed: !!r.emailed });
        else onSaved(r.tempPassword ? { email: r.user.email, password: r.tempPassword } : undefined);
      }
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      title={user ? `Edit ${user.name}` : 'Add a user'}
      description={user ? user.email : 'They sign in with their email and a password you set or a temporary one.'}
      size="lg"
      onClose={onClose}
      footer={
        <>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={save} disabled={busy}>{busy ? 'Saving…' : user ? 'Save changes' : 'Create user'}</Button>
        </>
      }
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Full name"><Input value={d.name || ''} onChange={(e) => set('name', e.target.value)} autoFocus /></Field>
        <Field label="Work email"><Input type="email" value={d.email || ''} onChange={(e) => set('email', e.target.value)} /></Field>
        <Field label="Phone (for SMS reminders)"><Input value={d.phone || ''} onChange={(e) => set('phone', e.target.value)} /></Field>
        <Field label="Role" hint={ROLE_HELP[(d.role as Role) || 'SALES_REP']}>
          <Select value={d.role} onChange={(e) => set('role', e.target.value as Role)} disabled={user?.id === actor.id} options={roleOptions.map((r) => ({ value: r, label: `${ADMIN_ROLES.includes(r) ? 'Admin · ' : ''}${humanize(r)}` }))} />
        </Field>
        <Field label="Calendar color"><Input type="color" value={d.calendarColor || '#4b3ab3'} onChange={(e) => set('calendarColor', e.target.value)} className="h-11 !p-1" /></Field>
        <div className="flex flex-col justify-end gap-2 pb-1">
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={!!d.active} disabled={user?.id === actor.id} onChange={(e) => set('active', e.target.checked)} className="h-4 w-4 accent-brand-600" /> Active (can sign in)</label>
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={!!d.qualifiedForRenovation} onChange={(e) => set('qualifiedForRenovation', e.target.checked)} className="h-4 w-4 accent-brand-600" /> Specialist-qualified (can take specialist services)</label>
        </div>
        <div className="sm:col-span-2">
          <span className="label">Service capabilities</span>
          <div className="flex flex-wrap gap-2">
            {store.services.map(({ key: sv, label }) => (
              <button key={sv} type="button" onClick={() => toggleService(sv)} className={`rounded-full px-3 py-1.5 text-xs font-semibold ring-1 transition ${(d.serviceCapabilities || []).includes(sv) ? 'bg-brand-600 text-white ring-brand-600' : 'bg-surface text-ink-600 ring-ink-200 hover:ring-brand-300'}`}>
                {label}
              </button>
            ))}
          </div>
        </div>
        {!user && (
          <div className="rounded-2xl border border-ink-200 p-4 sm:col-span-2">
            <span className="label">How will they sign in?</span>
            <Tabs value={pwMode} onChange={(v) => setPwMode(v as 'invite' | 'temp' | 'set')} items={[{ value: 'invite', label: 'Invite link' }, { value: 'temp', label: 'Temporary password' }, { value: 'set', label: 'Set a password' }]} />
            {pwMode === 'invite' && (
              <>
                <p className="mt-3 text-xs text-ink-500">They get a one-time link (valid 7 days) where they choose their own password. Nobody else ever sees it.</p>
                {emailEnabled ? (
                  <label className="mt-3 flex items-center gap-2 text-sm"><input type="checkbox" checked={d.sendInvite !== false} onChange={(e) => set('sendInvite', e.target.checked)} className="h-4 w-4 accent-brand-600" /> Email the link to them now</label>
                ) : (
                  <p className="mt-2 text-xs text-ink-500">Email isn't set up yet, so you'll get the link to copy and text or send them.</p>
                )}
              </>
            )}
            {pwMode === 'set' && (
              <Field label="Initial password" hint="They'll be asked to change it on first sign-in." className="mt-3">
                <Input type="text" value={d.password || ''} onChange={(e) => set('password', e.target.value)} autoComplete="new-password" />
              </Field>
            )}
            {pwMode === 'temp' &&
              (emailEnabled ? (
                <label className="mt-3 flex items-center gap-2 text-sm"><input type="checkbox" checked={!!d.sendInvite} onChange={(e) => set('sendInvite', e.target.checked)} className="h-4 w-4 accent-brand-600" /> Email them the sign-in details</label>
              ) : (
                <p className="mt-3 text-xs text-ink-500">Share the temporary password with them directly. It's shown once after you save.</p>
              ))}
          </div>
        )}
        {error && <p className="text-sm font-medium text-rose-600 sm:col-span-2">{error}</p>}
      </div>
    </Modal>
  );
};

const TempPasswordModal: React.FC<{ email: string; password: string; onClose: () => void }> = ({ email, password, onClose }) => (
  <Modal title="Temporary password" description="Shown once. Share it securely. They'll choose their own password after signing in." onClose={onClose} footer={<Button onClick={onClose}>Done</Button>}>
    <div className="rounded-2xl border border-brand-100 bg-brand-50/70 p-5">
      <div className="text-xs font-semibold uppercase tracking-[0.16em] text-brand-600">Email</div>
      <div className="font-medium text-ink-900">{email}</div>
      <div className="mt-4 text-xs font-semibold uppercase tracking-[0.16em] text-brand-600">Temporary password</div>
      <div className="flex items-center justify-between gap-3">
        <code className="font-mono text-2xl font-bold tracking-wider text-ink-950">{password}</code>
        <Button size="sm" variant="primary" icon={<Copy size={14} />} onClick={() => copyToClipboard(`Sign in at ${window.location.origin}/#login\nEmail: ${email}\nTemporary password: ${password}`, 'Sign-in details copied')}>Copy</Button>
      </div>
    </div>
  </Modal>
);

const InviteModal: React.FC<InviteInfo & { onClose: () => void }> = ({ name, email, link, emailed, onClose }) => (
  <Modal title="Invitation ready" description={emailed ? `We emailed ${name} a link to set their password. You can also copy it below.` : `Send this link to ${name} by text or email. It works once and expires in 7 days.`} onClose={onClose} footer={<Button onClick={onClose}>Done</Button>}>
    <div className="rounded-2xl border border-brand-100 bg-brand-50/70 p-5">
      <div className="text-xs font-semibold uppercase tracking-[0.16em] text-brand-600">Sign-in email</div>
      <div className="font-medium text-ink-900">{email}</div>
      <div className="mt-4 text-xs font-semibold uppercase tracking-[0.16em] text-brand-600">Invite link</div>
      <div className="mt-1 flex items-center gap-3">
        <code className="min-w-0 flex-1 truncate rounded-lg bg-surface px-3 py-2 font-mono text-xs text-ink-800" data-testid="invite-link">{link}</code>
        <Button size="sm" variant="primary" icon={<Copy size={14} />} onClick={() => copyToClipboard(`Hi ${name.split(' ')[0]}, here's your invite to set up your account: ${link}`, 'Invite link copied')}>Copy</Button>
      </div>
    </div>
  </Modal>
);

const UsersTab: React.FC<{ actor: User; system: System | null }> = ({ actor, system }) => {
  const [users, setUsers] = useState<AdminUser[] | null>(null);
  const [q, setQ] = useState('');
  const [filter, setFilter] = useState('all');
  const [editing, setEditing] = useState<AdminUser | 'new' | null>(null);
  const [temp, setTemp] = useState<{ email: string; password: string } | null>(null);
  const [confirmReset, setConfirmReset] = useState<AdminUser | null>(null);
  const [invite, setInvite] = useState<InviteInfo | null>(null);
  const reinvite = async (u: AdminUser) => {
    try {
      const r = await store.sendInvite(u.id, !!system?.providers.email);
      setInvite({ name: u.name, email: u.email, link: r.inviteLink, emailed: r.emailed });
    } catch (e) {
      store.toast(e instanceof Error ? e.message : 'Failed', 'error');
    }
  };
  const manage = can(actor, 'team:manage');

  const load = useCallback(() => store.adminUsers().then(setUsers).catch(() => setUsers([])), []);
  useEffect(() => {
    void load();
  }, [load]);

  const list = (users || [])
    .filter((u) => (filter === 'all' ? true : filter === 'admins' ? ADMIN_ROLES.includes(u.role) : filter === 'inactive' ? !u.active : !ADMIN_ROLES.includes(u.role) && u.active))
    .filter((u) => !q || `${u.name} ${u.email} ${u.role}`.toLowerCase().includes(q.toLowerCase()));

  const toggleActive = async (u: AdminUser) => {
    try {
      await store.updateUser(u.id, { active: !u.active });
      store.toast(u.active ? `${u.name} deactivated and signed out` : `${u.name} reactivated`);
      void load();
    } catch (e) {
      store.toast(e instanceof Error ? e.message : 'Failed', 'error');
    }
  };

  return (
    <div>
      <div className="mb-5 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <Tabs
          value={filter}
          onChange={setFilter}
          items={[
            { value: 'all', label: 'All', count: users?.length },
            { value: 'admins', label: 'Admins', count: users?.filter((u) => ADMIN_ROLES.includes(u.role)).length },
            { value: 'users', label: 'Users', count: users?.filter((u) => !ADMIN_ROLES.includes(u.role) && u.active).length },
            { value: 'inactive', label: 'Deactivated', count: users?.filter((u) => !u.active).length },
          ]}
        />
        <div className="flex gap-2">
          <SearchInput value={q} onChange={setQ} placeholder="Search users" className="md:w-64" />
          {manage && <Button icon={<UserPlus size={16} />} onClick={() => setEditing('new')}>Add user</Button>}
        </div>
      </div>
      {!manage && <p className="mb-4 rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-900">You can view users. Only owners and managers can add or change them.</p>}
      {users === null ? (
        <div className="card h-64 animate-pulse" />
      ) : list.length === 0 ? (
        <EmptyState icon={<Users size={22} />} title="No users match" />
      ) : (
        <Table head={<tr><th className="table-head">User</th><th className="table-head">Access</th><th className="table-head">Status</th><th className="table-head">Last sign-in</th><th className="table-head text-right">Actions</th></tr>}>
          {list.map((u) => (
            <tr key={u.id} className={u.active ? '' : 'opacity-60'}>
              <td className="table-cell">
                <div className="flex items-center gap-3">
                  <Avatar name={u.name} color={u.calendarColor} size="sm" />
                  <div className="min-w-0">
                    <div className="truncate font-semibold text-ink-900">{u.name}{u.id === actor.id && <span className="ml-1.5 text-xs font-medium text-ink-400">(you)</span>}</div>
                    <div className="truncate text-xs text-ink-500">{u.email}</div>
                  </div>
                </div>
              </td>
              <td className="table-cell">
                <div className="flex flex-wrap gap-1.5">
                  <Badge value={ADMIN_ROLES.includes(u.role) ? 'ADMIN' : 'USER'} tone={ADMIN_ROLES.includes(u.role) ? 'dark' : 'blue'} label={ADMIN_ROLES.includes(u.role) ? 'Admin' : 'User'} />
                  <Badge value={u.role} dot={false} />
                </div>
              </td>
              <td className="table-cell">
                {!u.active ? <Badge value="INACTIVE" /> : u.mustChangePassword ? <Badge value="PENDING" tone="amber" label="Invited" /> : <Badge value="ACTIVE" />}
                {u.activeSessions > 0 && <div className="mt-1 text-[11px] text-ink-400">{u.activeSessions} active session{u.activeSessions > 1 ? 's' : ''}</div>}
              </td>
              <td className="table-cell whitespace-nowrap text-xs text-ink-500">{u.lastLoginAt ? relative(u.lastLoginAt) : 'Never'}</td>
              <td className="table-cell whitespace-nowrap text-right">
                {manage && (
                  <div className="flex justify-end gap-1">
                    <button title="Edit" aria-label="Edit" className="rounded-full p-2 text-ink-400 hover:bg-ink-100 hover:text-ink-900" onClick={() => setEditing(u)}><Pencil size={15} /></button>
                    {u.id !== actor.id && (
                      <>
                        {u.active && u.mustChangePassword && (
                          <button title="Send invite link" aria-label="Send invite link" className="rounded-full p-2 text-ink-400 hover:bg-ink-100 hover:text-ink-900" onClick={() => void reinvite(u)}><Link2 size={15} /></button>
                        )}
                        <button title="Reset password" aria-label="Reset password" className="rounded-full p-2 text-ink-400 hover:bg-ink-100 hover:text-ink-900" onClick={() => setConfirmReset(u)}><KeyRound size={15} /></button>
                        {u.activeSessions > 0 && (
                          <button title="Sign out everywhere" aria-label="Sign out everywhere" className="rounded-full p-2 text-ink-400 hover:bg-ink-100 hover:text-ink-900" onClick={async () => { await store.revokeSessions(u.id); store.toast(`${u.name} signed out`); void load(); }}><LogOut size={15} /></button>
                        )}
                        <button title={u.active ? 'Deactivate' : 'Reactivate'} aria-label={u.active ? 'Deactivate' : 'Reactivate'} className={`rounded-full p-2 hover:bg-ink-100 ${u.active ? 'text-ink-400 hover:text-rose-600' : 'text-emerald-600'}`} onClick={() => void toggleActive(u)}>
                          {u.active ? <XCircle size={15} /> : <CheckCircle2 size={15} />}
                        </button>
                      </>
                    )}
                  </div>
                )}
              </td>
            </tr>
          ))}
        </Table>
      )}
      {editing && (
        <UserModal
          actor={actor}
          user={editing === 'new' ? undefined : editing}
          emailEnabled={!!system?.providers.email}
          onClose={() => setEditing(null)}
          onSaved={(t, inv) => {
            void load();
            if (t) setTemp(t);
            if (inv) setInvite(inv);
          }}
        />
      )}
      {confirmReset && (
        <ConfirmDialog
          title={`Reset ${confirmReset.name}'s password?`}
          message="They'll be signed out everywhere and must sign in with a new temporary password, then choose their own."
          confirmLabel="Reset password"
          onConfirm={async () => {
            try {
              const r = await store.adminResetPassword(confirmReset.id);
              setTemp({ email: confirmReset.email, password: r.tempPassword });
              void load();
            } catch (e) {
              store.toast(e instanceof Error ? e.message : 'Failed', 'error');
            }
          }}
          onClose={() => setConfirmReset(null)}
        />
      )}
      {temp && <TempPasswordModal {...temp} onClose={() => setTemp(null)} />}
      {invite && <InviteModal {...invite} onClose={() => setInvite(null)} />}
    </div>
  );
};

// ------------------------------------------------------------------ company
const CompanyTab: React.FC<{ actor: User }> = ({ actor }) => {
  const s = useStore();
  const [d, setD] = useState<CompanySettings>(s.state.settings);
  const [busy, setBusy] = useState(false);
  const manage = can(actor, 'settings:manage');
  const set = <K extends keyof CompanySettings>(k: K, v: CompanySettings[K]) => setD((x) => ({ ...x, [k]: v }));
  const save = async () => {
    if (!d.companyName.trim()) return store.toast('Company name is required', 'error');
    setBusy(true);
    try {
      await s.saveSettings(d);
      await store.refreshConfig();
      store.toast('Company settings saved. The login page and website now use them.');
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="grid gap-6 xl:grid-cols-[1.4fr,1fr]">
      <Card>
        <h2 className="text-lg font-bold">Company profile</h2>
        <p className="mt-1 text-sm text-ink-500">Shown on the login page, website, estimates, invoices and outbound messages.</p>
        <div className="mt-5 grid gap-4 sm:grid-cols-2">
          <Field label="Company name" className="sm:col-span-2"><Input disabled={!manage} value={d.companyName} onChange={(e) => set('companyName', e.target.value)} /></Field>
          <Field label="Owner / principal"><Input disabled={!manage} value={d.ownerName} onChange={(e) => set('ownerName', e.target.value)} /></Field>
          <Field label="Support phone"><Input disabled={!manage} value={d.supportPhone} onChange={(e) => set('supportPhone', e.target.value)} /></Field>
          <Field label="Company email" hint="Customers' replies to the app's emails come here. New website inquiries are emailed here only when phone alerts are off." className="sm:col-span-2"><Input disabled={!manage} type="email" value={d.supportEmail} onChange={(e) => set('supportEmail', e.target.value)} /></Field>
          <Field label="Business address" className="sm:col-span-2"><Input disabled={!manage} value={d.address || ''} onChange={(e) => set('address', e.target.value)} /></Field>
          <Field label="Service area" className="sm:col-span-2" hint="Shown in the website hero."><Input disabled={!manage} value={d.serviceArea || ''} onChange={(e) => set('serviceArea', e.target.value)} /></Field>
        </div>
      </Card>
      <div className="space-y-6">
      <Card>
        <h2 className="text-lg font-bold">Defaults</h2>
        <div className="mt-5 grid gap-4">
          <Field label="Sales tax (%)"><Input disabled={!manage} type="number" step="0.01" min={0} value={d.defaultTaxRate ?? 0} onChange={(e) => set('defaultTaxRate', Number(e.target.value))} /></Field>
          <Field label="Estimates valid for (days)"><Input disabled={!manage} type="number" min={1} value={d.estimateValidityDays ?? 30} onChange={(e) => set('estimateValidityDays', Number(e.target.value))} /></Field>
          <Field label="Invoice terms (days)"><Input disabled={!manage} type="number" min={0} value={d.invoiceTermsDays ?? 14} onChange={(e) => set('invoiceTermsDays', Number(e.target.value))} /></Field>
        </div>
        {manage && <Button className="mt-6 w-full" onClick={save} disabled={busy}>{busy ? 'Saving…' : 'Save company settings'}</Button>}
      </Card>
      {manage && <PhoneAlertsCard />}
      </div>
    </div>
  );
};

/** Free push notifications (ntfy) so the owner hears about every new lead on their phone. */
const PhoneAlertsCard: React.FC = () => {
  const [a, setA] = useState<{ enabled: boolean; topic: string | null; server: string } | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    store.phoneAlerts().then(setA).catch(() => setA({ enabled: false, topic: null, server: 'https://ntfy.sh' }));
  }, []);
  const toggle = async (on: boolean) => {
    setBusy(true);
    try {
      setA(await store.setPhoneAlerts(on));
      store.toast(on ? 'Phone alerts turned on. Follow the steps to connect your phone.' : 'Phone alerts turned off');
    } catch (e) {
      store.toast(e instanceof Error ? e.message : 'Failed', 'error');
    } finally {
      setBusy(false);
    }
  };
  const test = async () => {
    setBusy(true);
    try {
      await store.testPhoneAlert();
      store.toast('Test alert sent. Check your phone.');
    } catch (e) {
      store.toast(e instanceof Error ? e.message : 'Failed', 'error');
    } finally {
      setBusy(false);
    }
  };
  const customServer = a && a.server !== 'https://ntfy.sh';
  return (
    <Card>
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold">Phone alerts for new leads</h2>
          <p className="mt-1 text-sm text-ink-500">Get a pop-up on your phone, like a text, every time someone asks for an estimate. Free, with the ntfy app.</p>
        </div>
        {a && <Badge value={a.enabled ? 'ACTIVE' : 'PENDING'} tone={a.enabled ? 'green' : 'amber'} label={a.enabled ? 'On' : 'Off'} />}
      </div>
      {!a ? (
        <div className="mt-4 h-24 animate-pulse rounded-2xl bg-ink-100" />
      ) : !a.enabled ? (
        <Button className="mt-5 w-full" icon={<Bell size={16} />} onClick={() => void toggle(true)} disabled={busy}>Turn on phone alerts</Button>
      ) : (
        <>
          <ol className="mt-5 space-y-3 text-sm text-ink-700">
            <li><span className="font-semibold">1.</span> On your phone, install <span className="font-semibold">ntfy</span> from the App Store or Google Play.</li>
            <li><span className="font-semibold">2.</span> Open it, tap <span className="font-semibold">+</span> (Subscribe to topic){customServer ? <>, choose "Use another server" and enter <code className="rounded bg-ink-100 px-1">{a.server}</code></> : null}, and paste this code:</li>
          </ol>
          <div className="mt-2 flex items-center gap-2">
            <code className="min-w-0 flex-1 truncate rounded-lg bg-ink-50 px-3 py-2 font-mono text-sm text-ink-900" data-testid="ntfy-topic">{a.topic}</code>
            <Button size="sm" variant="secondary" icon={<Copy size={14} />} onClick={() => copyToClipboard(a.topic || '', 'Code copied')}>Copy</Button>
          </div>
          <p className="mt-3 text-sm text-ink-700"><span className="font-semibold">3.</span> Tap <span className="font-semibold">Send test alert</span> below. Allow notifications if your phone asks.</p>
          <p className="mt-3 rounded-xl bg-amber-50 px-3 py-2 text-xs text-amber-900">Treat this code like a password: anyone who has it can see your lead alerts. Alerts show only the customer's name and service; details stay in the app.</p>
          <div className="mt-5 flex flex-wrap gap-2">
            <Button icon={<Bell size={16} />} onClick={() => void test()} disabled={busy}>Send test alert</Button>
            <Button variant="secondary" icon={<RotateCcw size={15} />} onClick={() => void toggle(true)} disabled={busy} title="Makes a new code; phones using the old one stop getting alerts">New code</Button>
            <Button variant="ghost" onClick={() => void toggle(false)} disabled={busy}>Turn off</Button>
          </div>
        </>
      )}
    </Card>
  );
};

// ------------------------------------------------------------------ audit
const actionLabel = (a: string) =>
  a
    .replace(/^action\./, '')
    .replace(/^auth\./, 'Auth · ')
    .replace(/^admin\./, 'Admin · ')
    .replace(/^public\./, 'Public · ')
    .replace(/_/g, ' ')
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .toLowerCase()
    .replace(/^./, (c) => c.toUpperCase());

const AuditTab: React.FC = () => {
  const s = useStore();
  const [rows, setRows] = useState<AuditEntry[] | null>(null);
  const [q, setQ] = useState('');
  const [kind, setKind] = useState('all');
  useEffect(() => {
    store.auditLog(500).then(setRows).catch(() => setRows([]));
  }, []);
  const list = (rows || [])
    .filter((r) => kind === 'all' || (kind === 'auth' ? r.action.startsWith('auth.') : kind === 'admin' ? r.action.startsWith('admin.') || r.action.startsWith('workspace.') : kind === 'public' ? r.action.startsWith('public.') : r.action.startsWith('action.')))
    .filter((r) => !q || `${r.action} ${r.detail} ${s.userName(r.user_id)} ${r.ip}`.toLowerCase().includes(q.toLowerCase()));
  return (
    <div>
      <div className="mb-5 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <Tabs value={kind} onChange={setKind} items={[{ value: 'all', label: 'All' }, { value: 'auth', label: 'Sign-ins' }, { value: 'admin', label: 'Admin' }, { value: 'data', label: 'Data changes' }, { value: 'public', label: 'Public' }]} />
        <SearchInput value={q} onChange={setQ} placeholder="Search audit log" className="md:w-72" />
      </div>
      {rows === null ? (
        <div className="card h-64 animate-pulse" />
      ) : list.length === 0 ? (
        <EmptyState icon={<Activity size={22} />} title="No entries" />
      ) : (
        <Table head={<tr><th className="table-head">When</th><th className="table-head">Who</th><th className="table-head">Event</th><th className="table-head">Detail</th><th className="table-head">IP</th></tr>}>
          {list.map((r) => (
            <tr key={r.id}>
              <td className="table-cell whitespace-nowrap text-xs text-ink-500">{dateTime(r.at)}</td>
              <td className="table-cell whitespace-nowrap font-medium text-ink-900">{r.user_id ? s.userName(r.user_id) : <span className="text-ink-400">Public / system</span>}</td>
              <td className="table-cell whitespace-nowrap"><span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${r.action.includes('failed') ? 'bg-rose-50 text-rose-700' : r.action.startsWith('admin.') ? 'bg-brand-100 text-brand-800' : 'bg-brand-50 text-brand-700'}`}>{actionLabel(r.action)}</span></td>
              <td className="table-cell max-w-xs truncate text-xs text-ink-500">{r.detail || '—'}</td>
              <td className="table-cell whitespace-nowrap font-mono text-[11px] text-ink-400">{r.ip || '—'}</td>
            </tr>
          ))}
        </Table>
      )}
    </div>
  );
};

// ------------------------------------------------------------------ system & data
const SystemTab: React.FC<{ actor: User; system: System | null }> = ({ actor, system }) => {
  const fileRef = useRef<HTMLInputElement>(null);
  const [reset, setReset] = useState(false);
  const [importing, setImporting] = useState(false);
  const exportNow = async () => {
    const data = await store.exportBackup();
    downloadFile(`crm-backup-${new Date().toISOString().slice(0, 10)}.json`, JSON.stringify(data, null, 2), 'application/json');
    store.toast('Backup downloaded');
  };
  const importFile = async (f?: File) => {
    if (!f) return;
    try {
      await store.importBackup(JSON.parse(await f.text()));
      store.toast('Backup restored');
    } catch (e) {
      store.toast(e instanceof Error ? e.message : 'Could not restore backup', 'error');
    }
  };
  const Status: React.FC<{ on: boolean; label: string; hint: string }> = ({ on, label, hint }) => (
    <div className="flex items-start justify-between gap-3 rounded-xl bg-ink-50 px-4 py-3 text-sm">
      <div><div className="font-semibold text-ink-900">{label}</div><div className="text-xs text-ink-500">{hint}</div></div>
      <span className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold ring-1 ${on ? 'bg-emerald-50 text-emerald-700 ring-emerald-200' : 'bg-amber-50 text-amber-700 ring-amber-200'}`}>{on ? 'Connected' : 'Not configured'}</span>
    </div>
  );
  return (
    <div className="grid gap-6 xl:grid-cols-2">
      <Card>
        <h2 className="text-lg font-bold">Integrations</h2>
        <div className="mt-4 space-y-3">
          <Status on={!!system?.providers.email} label="Email (SMTP)" hint="Confirmations, estimates, invoices, invites, password resets. Set SMTP_* env vars." />
          <Status on={!!system?.providers.sms} label="SMS (Twilio)" hint="Appointment reminders and crew alerts. Set TWILIO_* env vars." />
          <Status on={!!(system?.providers as { payments?: boolean } | undefined)?.payments} label="Online payments (Stripe)" hint="Customers pay invoices by card or bank. Set INVOICE_STRIPE_SECRET_KEY (and INVOICE_STRIPE_WEBHOOK_SECRET)." />
          <div className="rounded-xl bg-ink-50 px-4 py-3 text-xs text-ink-500">Anything not configured is still recorded in Messages, so nothing is lost.</div>
        </div>
        <div className="mt-6 grid grid-cols-2 gap-3 text-sm">
          <div className="rounded-xl border border-ink-200 p-3"><div className="text-xs text-ink-500">Version</div><div className="font-semibold">{system?.version || '—'}</div></div>
          <div className="rounded-xl border border-ink-200 p-3"><div className="text-xs text-ink-500">Database size</div><div className="font-semibold">{system ? `${(system.dbSizeBytes / 1024).toFixed(0)} KB` : '—'}</div></div>
          <div className="rounded-xl border border-ink-200 p-3"><div className="text-xs text-ink-500">Time zone</div><div className="font-semibold">{system?.timeZone || '—'}</div></div>
          <div className="rounded-xl border border-ink-200 p-3"><div className="text-xs text-ink-500">Public URL</div><div className="truncate font-semibold">{system?.appUrl || window.location.origin}</div></div>
        </div>
      </Card>
      <div className="space-y-6">
        <Card>
          <h2 className="text-lg font-bold">Backups</h2>
          <p className="mt-1 text-sm text-ink-500">Download a full JSON backup of company data. Passwords are never included.</p>
          <div className="mt-5 flex flex-wrap gap-2">
            {can(actor, 'settings:manage') && <Button variant="outline" icon={<Download size={16} />} onClick={exportNow}>Download backup</Button>}
            {actor.role === 'OWNER' && <Button variant="outline" icon={<Upload size={16} />} onClick={() => fileRef.current?.click()}>Restore backup</Button>}
            <input ref={fileRef} type="file" accept="application/json" className="hidden" onChange={(e) => void importFile(e.target.files?.[0])} />
          </div>
        </Card>
        {can(actor, 'settings:manage') && (
          <Card>
            <h2 className="text-lg font-bold">Import customers</h2>
            <p className="mt-1 text-sm text-ink-500">Moving from spreadsheets or another CRM? Upload a CSV of customers and leads. Duplicates are skipped automatically.</p>
            <Button variant="outline" className="mt-4" icon={<FileSpreadsheet size={16} />} onClick={() => setImporting(true)}>Import from CSV</Button>
          </Card>
        )}
        {importing && <ImportCustomers onClose={() => setImporting(false)} />}
        {system?.demo && actor.role === 'OWNER' && (
          <Card className="border-rose-200">
            <h2 className="text-lg font-bold text-rose-700">Reset demo data</h2>
            <p className="mt-1 text-sm text-ink-500">Demo mode only. Replaces all records with the sample workspace.</p>
            <Button variant="outline" className="mt-4 text-rose-600" icon={<RotateCcw size={16} />} onClick={() => setReset(true)}>Reset workspace</Button>
          </Card>
        )}
      </div>
      {reset && <ConfirmDialog title="Reset demo data?" message="All records will be replaced with sample data." confirmLabel="Reset" onConfirm={async () => { await store.resetDemo(); store.toast('Demo workspace reset'); }} onClose={() => setReset(false)} />}
    </div>
  );
};

// ------------------------------------------------------------------ overview
const OverviewTab: React.FC<{ actor: User; system: System | null; go: (t: string) => void }> = ({ system, go }) => {
  const s = useStore();
  const { state } = s;
  const [recent, setRecent] = useState<AuditEntry[]>([]);
  useEffect(() => {
    store.auditLog(8).then(setRecent).catch(() => undefined);
  }, []);
  const m = useMemo(() => {
    const open = state.leads.filter((l) => !['PAID', 'LOST'].includes(l.status));
    return {
      activeUsers: state.users.filter((u) => u.active).length,
      admins: state.users.filter((u) => u.active && ADMIN_ROLES.includes(u.role)).length,
      pipeline: open.reduce((x, l) => x + l.budget, 0),
      openLeads: open.length,
      ar: state.invoices.filter((i) => i.status !== 'CANCELLED').reduce((x, i) => x + i.balanceDue, 0),
      overdue: state.invoices.filter((i) => i.status === 'OVERDUE').length,
      jobs: state.workOrders.filter((w) => !['COMPLETED', 'CANCELLED'].includes(w.status)).length,
      failedMsgs: state.outbox.filter((o) => o.status === 'FAILED').length,
    };
  }, [state]);
  const byRole = ROLES.map((r) => ({ r, n: state.users.filter((u) => u.role === r && u.active).length })).filter((x) => x.n);
  return (
    <div>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Active users" value={String(m.activeUsers)} hint={`${m.admins} admins`} icon={<Users size={16} />} accent onClick={() => go('users')} />
        <StatCard label="Open pipeline" value={moneyShort(m.pipeline)} hint={`${m.openLeads} open leads`} onClick={() => (window.location.hash = 'leads')} />
        <StatCard label="Outstanding A/R" value={moneyShort(m.ar)} hint={`${m.overdue} overdue`} onClick={() => (window.location.hash = 'invoices')} />
        <StatCard label="Jobs in production" value={String(m.jobs)} hint="active work orders" onClick={() => (window.location.hash = 'work-orders')} />
      </div>
      <div className="mt-6 grid gap-6 xl:grid-cols-3">
        <Card>
          <div className="flex items-center justify-between"><div className="eyebrow">Team by role</div><button className="text-xs font-semibold text-brand-600" onClick={() => go('users')}>Manage users</button></div>
          <div className="mt-4 space-y-2.5">
            {byRole.map(({ r, n }) => (
              <div key={r} className="flex items-center justify-between text-sm">
                <span className="flex items-center gap-2"><Badge value={r} dot={false} />{ADMIN_ROLES.includes(r) && <span className="text-[10px] font-bold uppercase tracking-wider text-ink-400">admin</span>}</span>
                <span className="font-semibold">{n}</span>
              </div>
            ))}
          </div>
        </Card>
        <Card>
          <div className="flex items-center justify-between"><div className="eyebrow">Recent activity</div><button className="text-xs font-semibold text-brand-600" onClick={() => go('audit')}>Audit log</button></div>
          <div className="mt-4 space-y-3">
            {recent.length === 0 && <p className="text-sm text-ink-500">No activity yet.</p>}
            {recent.map((r) => (
              <div key={r.id} className="text-sm">
                <div className="font-medium text-ink-900">{actionLabel(r.action)}</div>
                <div className="text-xs text-ink-500">{r.user_id ? s.userName(r.user_id) : 'Public'} · {relative(r.at)}</div>
              </div>
            ))}
          </div>
        </Card>
        <Card>
          <div className="eyebrow">System health</div>
          <div className="mt-4 space-y-3 text-sm">
            <div className="flex items-center justify-between"><span className="flex items-center gap-2"><Mail size={15} className="text-ink-400" /> Email delivery</span><Badge value={system?.providers.email ? 'ACTIVE' : 'PENDING'} tone={system?.providers.email ? 'green' : 'amber'} label={system?.providers.email ? 'Connected' : 'Log only'} /></div>
            <div className="flex items-center justify-between"><span className="flex items-center gap-2"><MessageSquare size={15} className="text-ink-400" /> SMS delivery</span><Badge value={system?.providers.sms ? 'ACTIVE' : 'PENDING'} tone={system?.providers.sms ? 'green' : 'amber'} label={system?.providers.sms ? 'Connected' : 'Log only'} /></div>
            <div className="flex items-center justify-between"><span className="flex items-center gap-2"><XCircle size={15} className="text-ink-400" /> Failed messages</span><span className={`font-semibold ${m.failedMsgs ? 'text-rose-600' : ''}`}>{m.failedMsgs}</span></div>
            <div className="flex items-center justify-between"><span className="flex items-center gap-2"><ShieldCheck size={15} className="text-ink-400" /> Sessions</span><span className="text-ink-500">httpOnly, hashed</span></div>
          </div>
        </Card>
      </div>
    </div>
  );
};

// ------------------------------------------------------------------ rename
const RenameCompany: React.FC<{ onClose: () => void }> = ({ onClose }) => {
  const s = useStore();
  const [name, setName] = useState(s.state.settings.companyName);
  const [busy, setBusy] = useState(false);
  const save = async () => {
    const clean = name.trim();
    if (!clean) return store.toast('Enter a company name.', 'error');
    setBusy(true);
    try {
      await s.saveSettings({ ...s.state.settings, companyName: clean });
      await store.refreshConfig();
      store.toast(`Company renamed to ${clean}`);
      onClose();
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal
      title="Rename company"
      description="Updates the logo text, login page, website, estimates, invoices and emails right away."
      onClose={onClose}
      footer={
        <>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={save} disabled={busy || !name.trim()}>{busy ? 'Saving…' : 'Save name'}</Button>
        </>
      }
    >
      <Field label="Company name">
        <Input value={name} maxLength={120} autoFocus onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && void save()} placeholder="e.g. Summit Home Builders" />
      </Field>
    </Modal>
  );
};

// ------------------------------------------------------------------ sign-ups (sales site only)
const SignupsTab: React.FC = () => {
  const [rows, setRows] = useState<SignupRow[] | null>(null);
  useEffect(() => {
    store.adminSignups().then((r) => setRows(r.signups)).catch(() => setRows([]));
  }, []);
  const link = `${window.location.origin}/#pricing`;
  const paid = (rows || []).filter((r) => r.status === 'paid');
  return (
    <div className="space-y-6">
      <Card>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-bold">Contractor sign-ups</h2>
            <p className="mt-1 text-sm text-ink-500">Companies that chose a plan on your pricing page. Paid ones need a workspace set up (see HANDOFF.md).</p>
          </div>
          <div className="flex gap-2">
            <Button variant="secondary" icon={<Copy size={14} />} onClick={() => copyToClipboard(link, 'Pricing page link copied')}>Copy pricing link</Button>
            <a href="#pricing" target="_blank" rel="noreferrer"><Button variant="outline">Open pricing page</Button></a>
          </div>
        </div>
        <div className="mt-5 grid gap-3 sm:grid-cols-3">
          <div className="rounded-2xl bg-ink-50 p-4"><div className="text-xs uppercase tracking-[0.14em] text-ink-500">Paid</div><div className="font-display text-3xl font-bold">{paid.length}</div></div>
          <div className="rounded-2xl bg-ink-50 p-4"><div className="text-xs uppercase tracking-[0.14em] text-ink-500">Requests</div><div className="font-display text-3xl font-bold">{(rows || []).filter((r) => r.status === 'requested').length}</div></div>
          <div className="rounded-2xl bg-ink-50 p-4"><div className="text-xs uppercase tracking-[0.14em] text-ink-500">Left checkout</div><div className="font-display text-3xl font-bold">{(rows || []).filter((r) => r.status === 'started').length}</div></div>
        </div>
      </Card>
      {rows === null ? (
        <div className="card h-40 animate-pulse" />
      ) : rows.length === 0 ? (
        <EmptyState icon={<Rocket size={22} />} title="No sign-ups yet" description="Share your pricing page link with contractors. Sign-ups show up here." />
      ) : (
        <Table head={<tr><th className="table-head">Company</th><th className="table-head">Contact</th><th className="table-head">Plan</th><th className="table-head">Status</th><th className="table-head">When</th></tr>}>
          {rows.map((r) => (
            <tr key={r.id}>
              <td className="table-cell font-semibold text-ink-900">{r.company}</td>
              <td className="table-cell">{r.name}<div className="text-xs text-ink-500">{r.email}{r.phone ? ` · ${r.phone}` : ''}</div></td>
              <td className="table-cell capitalize">{r.plan}<div className="text-xs text-ink-500">{r.price}/{r.billing === 'year' ? 'yr' : 'mo'}</div></td>
              <td className="table-cell">
                {r.status === 'paid' ? <Badge value="PAID" label="Paid" /> : r.status === 'requested' ? <Badge value="PENDING" tone="amber" label="Wants a call" /> : <Badge value="PENDING" tone="gray" label="Left checkout" />}
              </td>
              <td className="table-cell whitespace-nowrap text-xs text-ink-500">{relative(r.paid_at || r.created_at)}</td>
            </tr>
          ))}
        </Table>
      )}
    </div>
  );
};

// ------------------------------------------------------------------ console
const TABS: Array<{ value: string; label: string; icon: typeof Activity; salesOnly?: boolean }> = [
  { value: 'overview', label: 'Overview', icon: Activity },
  { value: 'users', label: 'Users & access', icon: Users },
  { value: 'company', label: 'Company', icon: Building2 },
  { value: 'branding', label: 'Branding & website', icon: Palette },
  { value: 'services', label: 'Services', icon: Wrench },
  { value: 'billing', label: 'Billing', icon: CreditCard },
  { value: 'signups', label: 'Sign-ups', icon: Rocket, salesOnly: true },
  { value: 'messages', label: 'Messages', icon: Mail },
  { value: 'audit', label: 'Audit log', icon: ShieldCheck },
  { value: 'system', label: 'System & data', icon: Database },
];

const AdminConsole: React.FC<{ currentUser: User; tab?: string }> = ({ currentUser, tab }) => {
  const s = useStore();
  const tabs = TABS.filter((t) => !t.salesOnly || s.config?.salesPage);
  const active = tabs.some((t) => t.value === tab) ? tab! : 'overview';
  const [system, setSystem] = useState<System | null>(null);
  useEffect(() => {
    store.system().then(setSystem).catch(() => undefined);
  }, []);
  const go = (t: string) => (window.location.hash = `admin/${t}`);
  const [renaming, setRenaming] = useState(false);

  return (
    <div>
      <PageHeader
        eyebrow="Admin console"
        title={s.state.settings.companyName}
        description="Manage who can sign in, what they can see, and how the company is set up."
        actions={
          <>
            {can(currentUser, 'settings:manage') && <Button variant="outline" icon={<Pencil size={15} />} onClick={() => setRenaming(true)}>Rename company</Button>}
            {can(currentUser, 'team:manage') && <Button icon={<UserPlus size={16} />} onClick={() => go('users')}>Add or manage users</Button>}
          </>
        }
      />
      {renaming && <RenameCompany onClose={() => setRenaming(false)} />}
      <div className="-mx-1 mb-6 overflow-x-auto px-1">
        <div className="inline-flex gap-1 rounded-full bg-ink-100 p-1">
          {tabs.map((t) => {
            const Icon = t.icon;
            return (
              <button key={t.value} onClick={() => go(t.value)} className={`inline-flex items-center gap-2 whitespace-nowrap rounded-full px-4 py-2 text-sm font-semibold transition ${active === t.value ? 'bg-surface text-ink-950 shadow-sm' : 'text-ink-500 hover:text-ink-900'}`}>
                <Icon size={15} /> {t.label}
              </button>
            );
          })}
        </div>
      </div>
      {active === 'overview' && <OverviewTab actor={currentUser} system={system} go={go} />}
      {active === 'users' && <UsersTab actor={currentUser} system={system} />}
      {active === 'company' && <CompanyTab actor={currentUser} />}
      {active === 'branding' && <BrandingTab actor={currentUser} />}
      {active === 'services' && <ServicesTab actor={currentUser} />}
      {active === 'billing' && <AdminBilling actor={currentUser} />}
      {active === 'signups' && <SignupsTab />}
      {active === 'messages' && <Outbox embedded />}
      {active === 'audit' && <AuditTab />}
      {active === 'system' && <SystemTab actor={currentUser} system={system} />}
    </div>
  );
};

export default AdminConsole;
