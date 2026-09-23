import React, { useState } from 'react';
import { LogOut, ShieldCheck } from 'lucide-react';
import type { User } from '../types';
import { store } from '../store';
import { Avatar, Badge, Button, Card, DetailRow, Field, Input, PageHeader, useStore } from './SharedComponents';
import { ChangePasswordForm } from '../pages/PublicPages';
import { isAdminRole } from '../services/permissions';
import { humanize } from '../services/format';

const WHAT_YOU_SEE: Record<string, string> = {
  OWNER: 'Everything, plus the admin console, backups and owner-only controls.',
  MANAGER: 'Everything, plus the admin console and user management.',
  OFFICE_MANAGER: 'Everything, plus company settings in the admin console.',
  DISPATCHER: 'All leads, calendars and work orders across the team.',
  SALES_REP: 'Leads assigned to you and their visits and estimates.',
  ESTIMATOR: 'Your leads, your estimate visits and the estimates you write.',
  WORKER: 'Work orders assigned to you.',
  SUBCONTRACTOR: 'Work orders assigned to your company.',
};

/** The user page: profile, password and session security for whoever is signed in. */
const Account: React.FC<{ currentUser: User }> = ({ currentUser }) => {
  const s = useStore();
  const [name, setName] = useState(currentUser.name);
  const [phone, setPhone] = useState(currentUser.phone);
  const [busy, setBusy] = useState(false);

  const saveProfile = async () => {
    setBusy(true);
    try {
      await store.updateProfile(name, phone);
      store.toast('Profile updated');
    } catch (e) {
      store.toast(e instanceof Error ? e.message : 'Could not save', 'error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div>
      <PageHeader eyebrow="My account" title={currentUser.name} description={`Signed in to ${s.state.settings.companyName}.`} />
      <div className="grid gap-6 xl:grid-cols-[1fr,1fr]">
        <Card>
          <div className="flex items-center gap-4">
            <Avatar name={currentUser.name} color={currentUser.calendarColor} size="lg" />
            <div>
              <div className="font-display text-xl font-bold">{currentUser.name}</div>
              <div className="mt-1 flex gap-1.5">
                <Badge value={isAdminRole(currentUser.role) ? 'ADMIN' : 'USER'} tone={isAdminRole(currentUser.role) ? 'dark' : 'blue'} label={isAdminRole(currentUser.role) ? 'Admin' : 'User'} />
                <Badge value={currentUser.role} dot={false} />
              </div>
            </div>
          </div>
          <div className="mt-6 grid gap-4 sm:grid-cols-2">
            <Field label="Full name"><Input value={name} onChange={(e) => setName(e.target.value)} /></Field>
            <Field label="Mobile phone" hint="Used for SMS reminders."><Input value={phone} onChange={(e) => setPhone(e.target.value)} /></Field>
          </div>
          <div className="mt-5 flex justify-end">
            <Button onClick={saveProfile} disabled={busy || !name.trim()}>{busy ? 'Saving…' : 'Save profile'}</Button>
          </div>
          <div className="mt-6 divide-y divide-ink-100 rounded-2xl border border-ink-200 px-4">
            <DetailRow label="Sign-in email">{currentUser.email}</DetailRow>
            <DetailRow label="Role">{humanize(currentUser.role)}</DetailRow>
            <DetailRow label="What you can see"><span className="block max-w-xs text-right text-ink-600">{WHAT_YOU_SEE[currentUser.role]}</span></DetailRow>
          </div>
          <p className="mt-3 text-xs text-ink-400">To change your email or role, ask an administrator.</p>
        </Card>

        <div className="space-y-6">
          <Card>
            <h2 className="flex items-center gap-2 text-lg font-bold"><ShieldCheck size={18} className="text-brand-600" /> Password</h2>
            <p className="mt-1 text-sm text-ink-500">Changing your password signs you out on every other device.</p>
            <div className="mt-5"><ChangePasswordForm compact /></div>
          </Card>
          <Card>
            <h2 className="text-lg font-bold">Sessions</h2>
            <p className="mt-1 text-sm text-ink-500">Lost a device or used a shared computer? Sign out everywhere except here.</p>
            <div className="mt-4 flex flex-wrap gap-2">
              <Button variant="outline" icon={<LogOut size={16} />} onClick={async () => { await store.logoutEverywhere(); store.toast('Signed out on all other devices'); }}>Sign out other devices</Button>
              <Button variant="ghost" onClick={() => void store.logout().then(() => (window.location.hash = 'login'))}>Sign out</Button>
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
};

export default Account;
