import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Bell,
  CalendarDays,
  ClipboardList,
  FileSignature,
  Grid2x2,
  LogOut,
  Menu,
  Package2,
  Receipt,
  Search,
  ShieldCheck,
  UserCircle2,
  Users,
  UsersRound,
  Wrench,
  X,
} from 'lucide-react';
import type { User } from './types';
import { store } from './store';
import { AppPage, canAccessPage, isAdminRole, scopeEstimates, scopeLeads } from './services/permissions';
import { Avatar, Logo, ThemeToggle, Toaster, useStore } from './components/SharedComponents';
import Landing from './pages/Landing';
import { AcceptInvite, ForcePasswordChange, ForgotPassword, Login, PublicBooking, PublicEstimateApproval, ResetPassword, Setup } from './pages/PublicPages';
import Dashboard from './components/Dashboard';
import Leads from './components/Leads';
import Appointments from './components/Appointments';
import Estimates from './components/Estimates';
import WorkOrders from './components/WorkOrders';
import Invoices from './components/Invoices';
import Inventory from './components/Inventory';
import Products from './components/Products';
import Team from './components/Team';
import AdminConsole from './components/AdminConsole';
import Account from './components/Account';
import { humanize, relative } from './services/format';

type NavItem = { id: AppPage; label: string; icon: React.ComponentType<{ size?: number; className?: string }>; group: 'Workspace' | 'Operations' | 'Admin' };

const NAV: NavItem[] = [
  { id: 'dashboard', label: 'Dashboard', icon: Grid2x2, group: 'Workspace' },
  { id: 'leads', label: 'Leads', icon: Users, group: 'Workspace' },
  { id: 'appointments', label: 'Calendar', icon: CalendarDays, group: 'Workspace' },
  { id: 'estimates', label: 'Estimates', icon: FileSignature, group: 'Workspace' },
  { id: 'work-orders', label: 'Work orders', icon: ClipboardList, group: 'Operations' },
  { id: 'invoices', label: 'Invoices', icon: Receipt, group: 'Operations' },
  { id: 'inventory', label: 'Inventory', icon: Package2, group: 'Operations' },
  { id: 'products', label: 'Products', icon: Wrench, group: 'Operations' },
  { id: 'team', label: 'Team', icon: UsersRound, group: 'Operations' },
  { id: 'admin', label: 'Admin console', icon: ShieldCheck, group: 'Admin' },
];

const getHash = () => window.location.hash.replace(/^#\/?/, '');
const navigate = (hash: string) => {
  window.location.hash = hash;
};
export const homeFor = (u: User) => (isAdminRole(u.role) ? 'admin' : 'dashboard');

const NotificationsMenu: React.FC = () => {
  const s = useStore();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const mine = s.state.notifications.filter((n) => n.userId === s.currentUser.id).slice(0, 25);
  const unread = mine.filter((n) => !n.readAt).length;

  useEffect(() => {
    const h = (e: MouseEvent) => ref.current && !ref.current.contains(e.target as Node) && setOpen(false);
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, []);

  const openEntity = (id?: string) => {
    if (!id) return;
    if (id.startsWith('lead')) navigate(`leads/${id}`);
    else if (id.startsWith('estimate')) navigate(`estimates/${id}`);
    else if (id.startsWith('invoice')) navigate(`invoices/${id}`);
    else if (id.startsWith('wo')) navigate(`work-orders/${id}`);
    setOpen(false);
  };

  return (
    <div className="relative" ref={ref}>
      <button onClick={() => setOpen(!open)} className="relative flex h-10 w-10 items-center justify-center rounded-full border border-ink-200 bg-surface text-ink-600 transition hover:text-ink-950" aria-label="Notifications">
        <Bell size={17} />
        {unread > 0 && <span className="absolute -right-0.5 -top-0.5 flex h-5 min-w-5 items-center justify-center rounded-full bg-brand-600 px-1 text-[10px] font-bold text-white">{unread}</span>}
      </button>
      {open && (
        <div className="absolute right-0 z-50 mt-2 w-[360px] max-w-[calc(100vw-2rem)] animate-fade-up overflow-hidden rounded-2xl border border-ink-200 bg-surface shadow-pop">
          <div className="flex items-center justify-between border-b border-ink-100 px-4 py-3">
            <span className="font-display font-semibold">Notifications</span>
            {unread > 0 && (
              <button className="text-xs font-semibold text-brand-600 hover:text-brand-800" onClick={() => void s.markAllNotificationsRead(s.currentUser.id)}>
                Mark all read
              </button>
            )}
          </div>
          <div className="max-h-[420px] overflow-y-auto">
            {mine.length === 0 && <div className="px-4 py-10 text-center text-sm text-ink-500">You're all caught up.</div>}
            {mine.map((n) => (
              <button
                key={n.id}
                onClick={() => {
                  if (!n.readAt) void s.markNotificationRead(n.id);
                  openEntity(n.relatedEntityId);
                }}
                className={`flex w-full gap-3 border-b border-ink-50 px-4 py-3 text-left transition hover:bg-ink-50 ${n.readAt ? '' : 'bg-brand-50/40'}`}
              >
                <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${n.readAt ? 'bg-transparent' : 'bg-brand-600'}`} />
                <span className="min-w-0 flex-1">
                  <span className="flex items-center justify-between gap-2">
                    <span className="truncate text-sm font-semibold text-ink-900">{n.title}</span>
                    <span className="shrink-0 text-[11px] text-ink-400">{relative(n.createdAt)}</span>
                  </span>
                  <span className="mt-0.5 block text-xs leading-relaxed text-ink-500">{n.message}</span>
                </span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

const GlobalSearch: React.FC = () => {
  const s = useStore();
  const [q, setQ] = useState('');
  const [focus, setFocus] = useState(false);
  const user = s.currentUser;
  const results = useMemo(() => {
    const term = q.trim().toLowerCase();
    if (term.length < 2) return [];
    const out: Array<{ key: string; label: string; sub: string; href: string; kind: string }> = [];
    if (canAccessPage(user, 'leads'))
      scopeLeads(user, s.state)
        .filter((l) => [l.name, l.email, l.phone, l.address].some((v) => v.toLowerCase().includes(term)))
        .slice(0, 5)
        .forEach((l) => out.push({ key: l.id, label: l.name, sub: `${humanize(l.status)} · ${l.address}`, href: `leads/${l.id}`, kind: 'Lead' }));
    if (canAccessPage(user, 'estimates'))
      scopeEstimates(user, s.state)
        .filter((e) => (e.number || '').toLowerCase().includes(term) || (s.leadById(e.leadId)?.name || '').toLowerCase().includes(term))
        .slice(0, 4)
        .forEach((e) => out.push({ key: e.id, label: e.number || e.id, sub: s.leadById(e.leadId)?.name || '', href: `estimates/${e.id}`, kind: 'Estimate' }));
    if (canAccessPage(user, 'invoices'))
      s.state.invoices
        .filter((i) => i.invoiceNumber.toLowerCase().includes(term) || i.customerName.toLowerCase().includes(term))
        .slice(0, 4)
        .forEach((i) => out.push({ key: i.id, label: i.invoiceNumber, sub: i.customerName, href: `invoices/${i.id}`, kind: 'Invoice' }));
    return out;
  }, [q, s.state, user]);

  return (
    <div className="relative hidden w-full max-w-md md:block">
      <Search size={16} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-ink-400" />
      <input
        value={q}
        onChange={(e) => setQ(e.target.value)}
        onFocus={() => setFocus(true)}
        onBlur={() => setTimeout(() => setFocus(false), 150)}
        placeholder="Search leads, estimates, invoices…"
        className="field !rounded-full !bg-ink-50 pl-10 hover:!bg-surface focus:!bg-surface"
      />
      {focus && results.length > 0 && (
        <div className="absolute left-0 right-0 z-50 mt-2 overflow-hidden rounded-2xl border border-ink-200 bg-surface shadow-pop">
          {results.map((r) => (
            <button
              key={r.key}
              onMouseDown={() => {
                navigate(r.href);
                setQ('');
              }}
              className="flex w-full items-center justify-between gap-3 px-4 py-2.5 text-left hover:bg-ink-50"
            >
              <span className="min-w-0">
                <span className="block truncate text-sm font-semibold text-ink-900">{r.label}</span>
                <span className="block truncate text-xs text-ink-500">{r.sub}</span>
              </span>
              <span className="rounded-full bg-ink-100 px-2 py-0.5 text-[10px] font-semibold text-ink-600">{r.kind}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
};

const signOut = () => void store.logout().then(() => navigate('login'));

const AppShell: React.FC<{ page: AppPage; param?: string }> = ({ page, param }) => {
  const s = useStore();
  const user = s.currentUser;
  const admin = isAdminRole(user.role);
  const [menuOpen, setMenuOpen] = useState(false);
  const accessible = NAV.filter((n) => canAccessPage(user, n.id));
  const groups = ['Workspace', 'Operations', 'Admin'] as const;

  useEffect(() => setMenuOpen(false), [page, param]);

  const renderPage = () => {
    switch (page) {
      case 'dashboard': return <Dashboard currentUser={user} />;
      case 'leads': return <Leads currentUser={user} focusId={param} />;
      case 'appointments': return <Appointments currentUser={user} />;
      case 'estimates': return <Estimates currentUser={user} focusId={param} />;
      case 'work-orders': return <WorkOrders currentUser={user} focusId={param} />;
      case 'invoices': return <Invoices currentUser={user} focusId={param} />;
      case 'inventory': return <Inventory currentUser={user} />;
      case 'products': return <Products currentUser={user} />;
      case 'team': return <Team currentUser={user} />;
      case 'admin': return <AdminConsole currentUser={user} tab={param} />;
      case 'account': return <Account key={user.id} currentUser={user} />;
      default: return <Dashboard currentUser={user} />;
    }
  };

  const sidebar = (
    <div className="flex h-full flex-col">
      <a href={`#${homeFor(user)}`} className="px-2"><Logo /></a>
      <div className="mx-2 mt-5 flex flex-wrap items-center gap-1.5">
        <span className={`inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.14em] ring-1 ring-inset ${admin ? 'bg-brand-50 text-brand-700 ring-brand-200' : 'bg-sky-50 text-sky-700 ring-sky-200'}`}>
          {admin ? <ShieldCheck size={12} /> : <UserCircle2 size={12} />} {admin ? 'Admin' : 'User'}
        </span>
        <span className="whitespace-nowrap text-[11px] font-medium text-ink-500">{humanize(user.role)}</span>
      </div>
      <nav className="mt-6 flex-1 space-y-6 overflow-y-auto">
        {groups.map((g) => {
          const items = accessible.filter((n) => n.group === g);
          if (!items.length) return null;
          return (
            <div key={g}>
              <div className="mb-2 px-3 text-[10px] font-bold uppercase tracking-[0.2em] text-ink-400">{g}</div>
              <div className="space-y-0.5">
                {items.map((n) => {
                  const Icon = n.icon;
                  const active = page === n.id;
                  return (
                    <a
                      key={n.id}
                      href={`#${n.id}`}
                      className={`group flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition ${active ? 'bg-brand-50 text-brand-700' : 'text-ink-600 hover:bg-ink-50 hover:text-ink-950'}`}
                    >
                      <Icon size={18} className={active ? 'text-brand-600' : 'text-ink-400 group-hover:text-ink-700'} />
                      {n.label}
                    </a>
                  );
                })}
              </div>
            </div>
          );
        })}
      </nav>
      <div className="mt-3 flex items-center gap-2 rounded-2xl border border-ink-200 p-2">
        <a href="#account" className={`flex min-w-0 flex-1 items-center gap-2.5 rounded-xl p-1.5 transition hover:bg-ink-50 ${page === 'account' ? 'bg-brand-50' : ''}`}>
          <Avatar name={user.name} color={user.calendarColor} size="sm" />
          <span className="min-w-0">
            <span className="block truncate text-xs font-semibold text-ink-900">{user.name}</span>
            <span className="block truncate text-[11px] text-ink-500">My account</span>
          </span>
        </a>
        <button onClick={signOut} className="flex h-9 w-9 items-center justify-center rounded-full text-ink-500 hover:bg-ink-100 hover:text-ink-950" aria-label="Sign out" title="Sign out">
          <LogOut size={16} />
        </button>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-ink-50/60">
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-[264px] border-r border-ink-200/70 bg-surface px-4 py-6 lg:block">{sidebar}</aside>
      {menuOpen && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={() => setMenuOpen(false)} />
          <aside className="absolute inset-y-0 left-0 w-[280px] max-w-[85vw] animate-fade-up bg-surface px-4 py-6 shadow-pop">
            <button onClick={() => setMenuOpen(false)} className="absolute right-3 top-5 flex h-9 w-9 items-center justify-center rounded-full hover:bg-ink-100" aria-label="Close menu"><X size={18} /></button>
            {sidebar}
          </aside>
        </div>
      )}

      <div className="lg:pl-[264px]">
        <header className="no-print sticky top-0 z-20 border-b border-ink-200/70 bg-surface/85 backdrop-blur-xl">
          <div className="flex h-16 items-center gap-3 px-4 sm:px-6 lg:px-8">
            <button onClick={() => setMenuOpen(true)} className="flex h-10 w-10 items-center justify-center rounded-full border border-ink-200 lg:hidden" aria-label="Open menu"><Menu size={18} /></button>
            <GlobalSearch />
            <div className="ml-auto flex items-center gap-2">
              {admin && page !== 'admin' && (
                <a href="#admin" className="hidden items-center gap-1.5 rounded-full bg-brand-50 px-3.5 py-2 text-xs font-semibold text-brand-700 ring-1 ring-inset ring-brand-200 hover:bg-brand-100 sm:inline-flex">
                  <ShieldCheck size={14} /> Admin console
                </a>
              )}
              <ThemeToggle />
              <NotificationsMenu />
              <a href="#account" className="flex items-center gap-2.5 rounded-full border border-ink-200 bg-surface py-1 pl-1 pr-3 hover:border-ink-300" title="My account">
                <Avatar name={user.name} color={user.calendarColor} size="sm" />
                <span className="hidden leading-tight sm:block">
                  <span className="block text-xs font-semibold text-ink-900">{user.name}</span>
                  <span className="block text-[10px] text-ink-500">{humanize(user.role)}</span>
                </span>
              </a>
            </div>
          </div>
        </header>
        <main className="mx-auto max-w-[1400px] px-4 py-8 sm:px-6 lg:px-10 lg:py-10">
          <BillingBanner admin={admin} />
          {renderPage()}
        </main>
      </div>
    </div>
  );
};

const BillingBanner: React.FC<{ admin: boolean }> = ({ admin }) => {
  const s = useStore();
  const b = s.billing;
  if (!b?.enforced) return null;
  if (b.locked) {
    return (
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-rose-200 bg-rose-50 px-5 py-4 text-sm text-rose-900">
        <span><strong>Read-only mode.</strong> {b.message} {admin ? '' : 'Ask an administrator to renew the subscription.'}</span>
        {admin && <a href="#admin/billing" className="rounded-full bg-rose-600 px-4 py-2 text-xs font-semibold text-white hover:bg-rose-700">Go to billing</a>}
      </div>
    );
  }
  if (!admin || !['trial', 'past_due'].includes(b.status)) return null;
  return (
    <div className={`mb-6 flex flex-wrap items-center justify-between gap-3 rounded-2xl border px-5 py-3 text-sm ${b.status === 'past_due' ? 'border-amber-200 bg-amber-50 text-amber-900' : 'border-brand-100 bg-brand-50/70 text-brand-900'}`}>
      <span>{b.message}</span>
      <a href="#admin/billing" className="text-xs font-semibold underline-offset-2 hover:underline">{b.status === 'past_due' ? 'Update card' : 'Subscribe now'}</a>
    </div>
  );
};

const Splash: React.FC = () => (
  <div className="flex min-h-screen items-center justify-center bg-surface">
    <div className="flex flex-col items-center gap-4">
      <Logo compact />
      <div className="h-1 w-24 overflow-hidden rounded-full bg-ink-100"><div className="h-full w-1/2 animate-pulse rounded-full bg-brand-500" /></div>
    </div>
  </div>
);

const Redirect: React.FC<{ to: string }> = ({ to }) => {
  useEffect(() => {
    window.location.replace(`#${to}`);
  }, [to]);
  return null;
};

const LEGACY: Record<string, string> = { settings: 'admin/company', outbox: 'admin/messages' };

const App: React.FC = () => {
  const s = useStore();
  const [route, setRoute] = useState(getHash());

  useEffect(() => {
    void s.bootstrap();
    const handler = () => {
      setRoute(getHash());
      if (!getHash().startsWith('home')) window.scrollTo(0, 0);
    };
    window.addEventListener('hashchange', handler);
    return () => window.removeEventListener('hashchange', handler);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Returning from Stripe Checkout: confirm the subscription, then clean the URL.
  useEffect(() => {
    const sessionId = new URLSearchParams(window.location.search).get('checkout_session');
    if (!sessionId || !s.isAuthenticated) return;
    window.history.replaceState(null, '', `${window.location.pathname}${window.location.hash || '#admin/billing'}`);
    s.confirmCheckout(sessionId)
      .then(() => s.toast('Subscription active. Thank you!'))
      .catch((e) => s.toast(e instanceof Error ? e.message : 'Could not confirm subscription', 'error'));
  }, [s, s.isAuthenticated]);

  useEffect(() => {
    if (route === 'cta-form') setTimeout(() => document.getElementById('cta-form')?.scrollIntoView({ behavior: 'smooth' }), 80);
  }, [route]);

  // Keep the browser tab title on-brand.
  useEffect(() => {
    const name = (s.me ? s.state.settings.companyName : s.config?.companyName) || 'Company X';
    document.title = s.me ? `${name} · CRM` : name;
  }, [s.me, s.state.settings.companyName, s.config?.companyName]);

  const [head, param] = route.split('/');

  let content: React.ReactNode;
  if (!route || head === 'home' || head === 'cta-form') content = <Landing />;
  else if (head === 'book') content = <PublicBooking />;
  else if (head === 'approve' && param) content = <PublicEstimateApproval token={param} />;
  else if (head === 'reset' && param) content = <ResetPassword token={param} />;
  else if (head === 'invite' && param) content = <AcceptInvite token={param} />;
  else if (s.phase === 'booting') content = <Splash />;
  else if (s.config?.setupRequired) content = <Setup />;
  else if (head === 'forgot') content = s.isAuthenticated ? <Redirect to={homeFor(s.currentUser)} /> : <ForgotPassword />;
  else if (!s.isAuthenticated) content = <Login />;
  else if (s.mustChangePassword) content = <ForcePasswordChange />;
  else if (head === 'login' || head === 'setup') content = <Redirect to={homeFor(s.currentUser)} />;
  else if (LEGACY[head]) content = <Redirect to={LEGACY[head]} />;
  else {
    const user = s.currentUser;
    content = canAccessPage(user, head) ? <AppShell page={head as AppPage} param={param} /> : <Redirect to={homeFor(user)} />;
  }

  return (
    <>
      {content}
      <Toaster />
    </>
  );
};

export default App;
