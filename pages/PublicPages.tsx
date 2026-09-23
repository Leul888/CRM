import React, { useEffect, useState } from 'react';
import { ArrowLeft, ArrowRight, CheckCircle2, Eye, EyeOff, FileSignature, KeyRound, Lock, Printer, ShieldCheck, XCircle } from 'lucide-react';
import { store, type ApprovalView } from '../store';
import { Badge, Button, Field, Input, Logo, Textarea, ThemeToggle, useStore } from '../components/SharedComponents';
import BookingForm from '../components/BookingForm';
import { date, dateTime, humanize, money } from '../services/format';
import { serviceLabel } from '../services/catalog';

const PublicShell: React.FC<{ children: React.ReactNode; wide?: boolean }> = ({ children, wide }) => (
  <div className="min-h-screen bg-ink-50/60">
    <header className="no-print border-b border-ink-100 bg-surface/80 backdrop-blur">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-5">
        <a href="#home">
          <Logo />
        </a>
        <div className="flex items-center gap-3">
          <a href="#home" className="inline-flex items-center gap-1.5 text-sm font-semibold text-ink-600 hover:text-ink-950">
            <ArrowLeft size={15} /> Back to site
          </a>
          <ThemeToggle />
        </div>
      </div>
    </header>
    <main className={`mx-auto px-5 py-12 ${wide ? 'max-w-6xl' : 'max-w-3xl'}`}>{children}</main>
  </div>
);

// ---------------- Booking ----------------
export const PublicBooking: React.FC = () => {
  const s = useStore();
  return (
    <PublicShell wide>
      <div className="grid gap-12 lg:grid-cols-[0.8fr,1.2fr]">
        <div>
          <div className="eyebrow eyebrow-dot">Book online</div>
          <h1 className="mt-4 text-4xl font-bold leading-[1.08] text-ink-950 sm:text-5xl">Schedule your free estimate.</h1>
          <p className="mt-4 text-lg text-ink-600">
            Choose a time and tell us about the project. {s.config?.companyName || 'We'} will match you with the right estimator automatically.
          </p>
          <div className="mt-8 rounded-3xl border border-ink-200 bg-surface p-6">
            <div className="flex items-center gap-3 text-sm font-semibold text-ink-900">
              <ShieldCheck size={18} className="text-brand-600" /> What happens next
            </div>
            <ol className="mt-4 space-y-3 text-sm text-ink-600">
              <li><strong className="text-ink-900">1.</strong> Instant confirmation with your requested slot.</li>
              <li><strong className="text-ink-900">2.</strong> A call to confirm within one business day.</li>
              <li><strong className="text-ink-900">3.</strong> Reminders by email and text before the visit.</li>
            </ol>
          </div>
        </div>
        <BookingForm />
      </div>
    </PublicShell>
  );
};

// ---------------- E-sign approval ----------------
export const PublicEstimateApproval: React.FC<{ token: string }> = ({ token }) => {
  const [data, setData] = useState<ApprovalView | null>(null);
  const [loadError, setLoadError] = useState('');
  const [name, setName] = useState('');
  const [agree, setAgree] = useState(false);
  const [mode, setMode] = useState<'sign' | 'decline'>('sign');
  const [reason, setReason] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    store
      .getApproval(token)
      .then(setData)
      .catch((e) => setLoadError(e instanceof Error ? e.message : 'This link is not valid.'));
  }, [token]);

  if (loadError) {
    return (
      <PublicShell>
        <div className="card p-10 text-center">
          <XCircle className="mx-auto text-rose-500" size={40} />
          <h1 className="mt-4 text-2xl font-bold">This link isn't valid</h1>
          <p className="mt-2 text-ink-500">The approval link may have been mistyped or replaced by a newer estimate. Please contact us for a fresh link.</p>
        </div>
      </PublicShell>
    );
  }
  if (!data) {
    return (
      <PublicShell>
        <div className="card h-96 animate-pulse" />
      </PublicShell>
    );
  }

  const { estimate, lead, signature, estimator, company } = data;
  const subtotal = estimate.lineItems.reduce((sum, i) => sum + i.total, 0);
  const expired = new Date(estimate.expirationDate) < new Date() && signature.approvalStatus === 'PENDING';

  const approve = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (name.trim().length < 3) return setError('Type your full legal name to sign.');
    if (name.trim().toLowerCase() !== lead.name.toLowerCase() && !window.confirm(`The name on this estimate is "${lead.name}". Sign as "${name.trim()}" anyway?`)) return;
    if (!agree) return setError('Please confirm you agree to the scope and total.');
    setBusy(true);
    try {
      setData(await store.approveEstimate(token, name.trim()));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not sign. Please try again.');
    } finally {
      setBusy(false);
    }
  };

  const decline = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      setData(await store.declineEstimate(token, reason.trim()));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not submit. Please try again.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <PublicShell>
      <div className="print-area card overflow-hidden">
        <div className="surface-violet relative overflow-hidden px-8 py-8 text-white">
          <div className="glow-violet absolute inset-0" />
          <div className="relative flex flex-col justify-between gap-6 sm:flex-row sm:items-start">
            <div>
              <div className="text-xs font-semibold uppercase tracking-[0.18em] text-white/70">Estimate {estimate.number}</div>
              <h1 className="mt-2 text-3xl font-bold">{serviceLabel(estimate.serviceType)}</h1>
              <p className="mt-1 text-white/80">Prepared for {lead.name} · {lead.address}</p>
            </div>
            <div className="text-left sm:text-right">
              <div className="text-xs uppercase tracking-[0.18em] text-white/70">Total</div>
              <div className="font-display text-4xl font-bold">{money(estimate.total)}</div>
              <div className="mt-1 text-xs text-white/70">Valid until {date(estimate.expirationDate)}</div>
            </div>
          </div>
        </div>

        <div className="px-8 py-7">
          <div className="grid gap-4 text-sm sm:grid-cols-3">
            <div><div className="text-ink-400">From</div><div className="font-semibold">{company.companyName}</div><div className="text-ink-500">{company.supportPhone}</div></div>
            <div><div className="text-ink-400">Estimator</div><div className="font-semibold">{estimator?.name || '—'}</div><div className="text-ink-500">{estimator?.email}</div></div>
            <div><div className="text-ink-400">Issued</div><div className="font-semibold">{date(estimate.createdAt)}</div></div>
          </div>

          <div className="mt-7 overflow-x-auto rounded-2xl border border-ink-200">
            <table className="min-w-full text-sm">
              <thead className="bg-ink-50 text-left text-[11px] uppercase tracking-[0.12em] text-ink-500">
                <tr><th className="px-4 py-3">Item</th><th className="px-4 py-3">Qty</th><th className="px-4 py-3 text-right">Rate</th><th className="px-4 py-3 text-right">Amount</th></tr>
              </thead>
              <tbody className="divide-y divide-ink-100">
                {estimate.lineItems.map((i) => (
                  <tr key={i.id}>
                    <td className="px-4 py-3"><div className="font-medium text-ink-900">{i.description}</div><div className="text-xs text-ink-400">{i.category}</div></td>
                    <td className="px-4 py-3 text-ink-600">{i.quantity} {i.unit}</td>
                    <td className="px-4 py-3 text-right text-ink-600">{money(i.unitPrice)}</td>
                    <td className="px-4 py-3 text-right font-semibold">{money(i.total)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="ml-auto mt-5 max-w-xs space-y-1.5 text-sm">
            <div className="flex justify-between"><span className="text-ink-500">Subtotal</span><span>{money(subtotal)}</span></div>
            {estimate.discount > 0 && <div className="flex justify-between"><span className="text-ink-500">Discount</span><span>−{money(estimate.discount)}</span></div>}
            <div className="flex justify-between"><span className="text-ink-500">Tax{estimate.taxRate ? ` (${estimate.taxRate}%)` : ''}</span><span>{money(estimate.tax)}</span></div>
            <div className="flex justify-between border-t border-ink-200 pt-2 font-display text-lg font-bold"><span>Total</span><span>{money(estimate.total)}</span></div>
          </div>
          {estimate.notes && <p className="mt-6 rounded-2xl bg-ink-50 p-4 text-sm text-ink-600"><strong className="text-ink-900">Notes: </strong>{estimate.notes}</p>}
        </div>

        <div className="border-t border-ink-100 bg-ink-50/60 px-8 py-7">
          {signature.approvalStatus === 'APPROVED' ? (
            <div className="flex items-start gap-4">
              <CheckCircle2 className="shrink-0 text-emerald-600" size={28} />
              <div>
                <div className="font-display text-xl font-bold">Approved. Thank you!</div>
                <p className="mt-1 text-sm text-ink-600">
                  Signed electronically by <span className="font-semibold">{signature.signatureName}</span> on {dateTime(signature.signedAt)}. We'll reach out to schedule your crew.
                </p>
                <p className="mt-3 font-[cursive] text-3xl text-ink-800">{signature.signatureName}</p>
              </div>
            </div>
          ) : signature.approvalStatus === 'DECLINED' ? (
            <div className="flex items-start gap-4">
              <XCircle className="shrink-0 text-rose-500" size={28} />
              <div>
                <div className="font-display text-xl font-bold">Estimate declined</div>
                <p className="mt-1 text-sm text-ink-600">Thanks for letting us know{signature.declineReason ? `: "${signature.declineReason}"` : ''}. Your estimator may follow up with options.</p>
              </div>
            </div>
          ) : expired ? (
            <div className="text-sm text-ink-600">This estimate expired on {date(estimate.expirationDate)}. Contact {company.supportEmail || company.companyName} for an updated quote.</div>
          ) : mode === 'sign' ? (
            <form onSubmit={approve} className="no-print">
              <div className="flex items-center gap-2 font-display text-xl font-bold"><FileSignature size={20} className="text-brand-600" /> Approve &amp; e-sign</div>
              <div className="mt-5 grid gap-4 sm:grid-cols-[1fr,auto] sm:items-end">
                <Field label="Type your full name">
                  <Input value={name} onChange={(e) => setName(e.target.value)} placeholder={lead.name} autoComplete="name" />
                </Field>
                <div className="h-[46px] min-w-[180px] rounded-xl border border-dashed border-ink-300 bg-surface px-4 pt-1 font-[cursive] text-2xl text-ink-800">{name}</div>
              </div>
              <label className="mt-4 flex items-start gap-2.5 text-sm text-ink-600">
                <input type="checkbox" checked={agree} onChange={(e) => setAgree(e.target.checked)} className="mt-0.5 h-4 w-4 accent-brand-600" />
                I agree to the scope of work and total of {money(estimate.total)}, and consent to sign this estimate electronically.
              </label>
              {error && <p className="mt-3 text-sm font-medium text-rose-600">{error}</p>}
              <div className="mt-6 flex flex-wrap gap-2">
                <Button type="submit" size="lg" disabled={busy}>{busy ? 'Signing…' : 'Approve estimate'} <ArrowRight size={18} /></Button>
                <Button variant="ghost" size="lg" onClick={() => setMode('decline')}>Decline</Button>
                <Button variant="outline" size="lg" icon={<Printer size={16} />} onClick={() => window.print()}>Print</Button>
              </div>
              <p className="mt-4 flex items-center gap-1.5 text-xs text-ink-400"><Lock size={12} /> Your name, time, IP address and device are recorded as your signature.</p>
            </form>
          ) : (
            <form onSubmit={decline} className="no-print">
              <div className="font-display text-xl font-bold">Decline this estimate</div>
              <Field label="Help us improve (optional)" className="mt-4">
                <Textarea value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Budget, timing, scope…" />
              </Field>
              {error && <p className="mt-3 text-sm font-medium text-rose-600">{error}</p>}
              <div className="mt-5 flex gap-2">
                <Button type="submit" variant="danger" disabled={busy}>Decline estimate</Button>
                <Button variant="ghost" onClick={() => setMode('sign')}>Back</Button>
              </div>
            </form>
          )}
        </div>
      </div>
      <div className="mt-4 text-center"><Badge value={signature.approvalStatus} /></div>
    </PublicShell>
  );
};

// ---------------- Auth shell (company-branded) ----------------
const AuthShell: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const s = useStore();
  const company = s.config?.companyName || 'Company X';
  return (
    <div className="grid min-h-screen lg:grid-cols-[1.05fr,1fr]">
      <div className="surface-violet relative hidden overflow-hidden p-12 text-white lg:flex lg:flex-col lg:justify-between">
        <div className="glow-violet absolute inset-0" />
        <div className="grid-bg absolute inset-0 opacity-40 [mask-image:radial-gradient(ellipse_at_top,black_20%,transparent_70%)]" />
        <a href="#home" className="relative"><Logo dark /></a>
        <div className="relative">
          <div className="eyebrow !text-white/70">{company} workspace</div>
          <h1 className="mt-4 text-5xl font-bold leading-[1.05]">Every lead, estimate and job, <span className="text-white/70">in one place.</span></h1>
          <p className="mt-5 max-w-md text-lg text-white/80">Admins run the company from the admin console. Everyone else gets a workspace built for their role.</p>
        </div>
        <div className="relative grid grid-cols-3 gap-3 text-sm">
          {[
            ['Admin console', 'Users, roles, company settings, audit log'],
            ['Role workspaces', 'Sales, estimating, dispatch and crews'],
            ['Secure by default', 'Hashed passwords, httpOnly sessions'],
          ].map(([t, d]) => (
            <div key={t} className="rounded-2xl border border-white/20 bg-white/10 p-4">
              <div className="font-semibold">{t}</div>
              <div className="mt-1 text-xs text-white/70">{d}</div>
            </div>
          ))}
        </div>
      </div>
      <div className="relative flex items-center justify-center px-5 py-12">
        <ThemeToggle className="absolute right-5 top-5" />
        <div className="w-full max-w-md">
          <a href="#home" className="lg:hidden"><Logo /></a>
          {children}
        </div>
      </div>
    </div>
  );
};

const PasswordInput: React.FC<{ value: string; onChange: (v: string) => void; autoComplete: string; placeholder?: string }> = ({ value, onChange, autoComplete, placeholder }) => {
  const [show, setShow] = useState(false);
  return (
    <div className="relative">
      <Input type={show ? 'text' : 'password'} value={value} onChange={(e) => onChange(e.target.value)} autoComplete={autoComplete} placeholder={placeholder || '••••••••'} className="pr-11" />
      <button type="button" onClick={() => setShow(!show)} className="absolute right-2 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-full text-ink-400 hover:text-ink-800" aria-label={show ? 'Hide password' : 'Show password'}>
        {show ? <EyeOff size={16} /> : <Eye size={16} />}
      </button>
    </div>
  );
};

const passwordHint = 'At least 8 characters, with a letter and a number.';
const weak = (pw: string) => pw.length < 8 || !/[A-Za-z]/.test(pw) || !/\d/.test(pw);

// ---------------- Login ----------------
export const Login: React.FC = () => {
  const s = useStore();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [remember, setRemember] = useState(true);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const company = s.config?.companyName || 'Company X';

  const go = async (em: string, pw: string) => {
    setError('');
    setBusy(true);
    try {
      const r = await store.login(em, pw, remember);
      if (!r.mustChangePassword) window.location.hash = ['OWNER', 'MANAGER', 'OFFICE_MANAGER'].includes(r.user.role) ? 'admin' : 'dashboard';
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Sign-in failed.');
    } finally {
      setBusy(false);
    }
  };

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim() || !password) return setError('Enter your email and password.');
    void go(email.trim(), password);
  };

  return (
    <AuthShell>
      <h2 className="mt-8 text-3xl font-bold text-ink-950 lg:mt-0">Sign in to {company}</h2>
      <p className="mt-2 text-ink-500">Use the email your administrator set up for you.</p>
      <form onSubmit={submit} className="mt-8 space-y-4" noValidate>
        <Field label="Work email">
          <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@company.com" autoComplete="username" autoFocus />
        </Field>
        <Field label="Password">
          <PasswordInput value={password} onChange={setPassword} autoComplete="current-password" />
        </Field>
        <div className="flex items-center justify-between text-sm">
          <label className="flex items-center gap-2 text-ink-600">
            <input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} className="h-4 w-4 accent-brand-600" /> Keep me signed in
          </label>
          <a href="#forgot" className="font-semibold text-brand-700 hover:text-brand-900">Forgot password?</a>
        </div>
        {error && <p className="rounded-xl bg-rose-50 px-4 py-3 text-sm font-medium text-rose-700">{error}</p>}
        <Button type="submit" size="lg" className="w-full" disabled={busy}>{busy ? 'Signing in…' : 'Sign in'} {!busy && <ArrowRight size={18} />}</Button>
      </form>

      {s.config?.demo && s.config.demoAccounts?.length ? (
        <div className="mt-10">
          <div className="flex items-center gap-3 text-xs font-semibold uppercase tracking-[0.16em] text-ink-400">
            <span className="h-px flex-1 bg-ink-200" /> Demo accounts <span className="h-px flex-1 bg-ink-200" />
          </div>
          <div className="mt-4 grid gap-2 sm:grid-cols-2">
            {s.config.demoAccounts.map((u) => (
              <button key={u.email} onClick={() => void go(u.email, s.config!.demoPassword || '')} className="flex items-center justify-between rounded-2xl border border-ink-200 px-3.5 py-2.5 text-left transition hover:border-brand-300 hover:bg-brand-50/50">
                <span className="min-w-0">
                  <span className="block truncate text-sm font-semibold text-ink-900">{u.name}</span>
                  <span className="block text-xs text-ink-500">{['OWNER', 'MANAGER', 'OFFICE_MANAGER'].includes(u.role) ? 'Admin · ' : ''}{humanize(u.role)}</span>
                </span>
                <ArrowRight size={14} className="text-ink-400" />
              </button>
            ))}
          </div>
          <p className="mt-4 text-center text-xs text-ink-400">Demo mode is on. Every demo password is <code className="rounded bg-ink-100 px-1">{s.config.demoPassword}</code>.</p>
        </div>
      ) : null}
    </AuthShell>
  );
};

// ---------------- First-run setup ----------------
export const Setup: React.FC = () => {
  const [f, setF] = useState({ companyName: 'Company X', name: '', email: '', password: '', confirm: '' });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const set = (k: keyof typeof f) => (v: string) => setF((x) => ({ ...x, [k]: v }));

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (!f.companyName.trim() || !f.name.trim() || !f.email.trim()) return setError('Fill in every field.');
    if (weak(f.password)) return setError(passwordHint);
    if (f.password !== f.confirm) return setError('Passwords do not match.');
    setBusy(true);
    try {
      await store.setup({ companyName: f.companyName.trim(), name: f.name.trim(), email: f.email.trim(), password: f.password });
      window.location.hash = 'admin';
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Setup failed.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <AuthShell>
      <div className="eyebrow eyebrow-dot mt-8 lg:mt-0">First-time setup</div>
      <h2 className="mt-3 text-3xl font-bold text-ink-950">Create your company workspace</h2>
      <p className="mt-2 text-ink-500">You'll be the owner and first administrator. You can invite your team next.</p>
      <form onSubmit={submit} className="mt-8 space-y-4" noValidate>
        <Field label="Company name"><Input value={f.companyName} onChange={(e) => set('companyName')(e.target.value)} /></Field>
        <Field label="Your name"><Input value={f.name} onChange={(e) => set('name')(e.target.value)} autoComplete="name" /></Field>
        <Field label="Work email"><Input type="email" value={f.email} onChange={(e) => set('email')(e.target.value)} autoComplete="username" /></Field>
        <Field label="Password" hint={passwordHint}><PasswordInput value={f.password} onChange={set('password')} autoComplete="new-password" /></Field>
        <Field label="Confirm password"><PasswordInput value={f.confirm} onChange={set('confirm')} autoComplete="new-password" /></Field>
        {error && <p className="rounded-xl bg-rose-50 px-4 py-3 text-sm font-medium text-rose-700">{error}</p>}
        <Button type="submit" size="lg" className="w-full" disabled={busy}>{busy ? 'Creating…' : 'Create workspace'}</Button>
      </form>
    </AuthShell>
  );
};

// ---------------- Forgot / reset ----------------
export const ForgotPassword: React.FC = () => {
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState<null | boolean>(null);
  const [error, setError] = useState('');
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    try {
      const r = await store.forgotPassword(email.trim());
      setSent(r.emailEnabled);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong.');
    }
  };
  return (
    <AuthShell>
      <a href="#login" className="mt-8 inline-flex items-center gap-1.5 text-sm font-semibold text-ink-500 hover:text-ink-900 lg:mt-0"><ArrowLeft size={15} /> Back to sign in</a>
      <h2 className="mt-4 text-3xl font-bold text-ink-950">Reset your password</h2>
      {sent === null ? (
        <form onSubmit={submit} className="mt-8 space-y-4">
          <Field label="Work email"><Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="username" autoFocus /></Field>
          {error && <p className="text-sm font-medium text-rose-600">{error}</p>}
          <Button type="submit" size="lg" className="w-full">Send reset link</Button>
        </form>
      ) : sent ? (
        <p className="mt-6 rounded-2xl bg-emerald-50 p-5 text-sm text-emerald-800">If an account exists for <strong>{email}</strong>, a reset link is on its way. It expires in one hour.</p>
      ) : (
        <p className="mt-6 rounded-2xl bg-amber-50 p-5 text-sm text-amber-900">Email isn't set up for this workspace yet, so ask your administrator to reset your password from the admin console. You'll get a temporary password to sign in with.</p>
      )}
    </AuthShell>
  );
};

export const ResetPassword: React.FC<{ token: string }> = ({ token }) => {
  const [pw, setPw] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (weak(pw)) return setError(passwordHint);
    if (pw !== confirm) return setError('Passwords do not match.');
    try {
      await store.resetPassword(token, pw);
      setDone(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Reset failed.');
    }
  };
  return (
    <AuthShell>
      <h2 className="mt-8 text-3xl font-bold text-ink-950 lg:mt-0">Choose a new password</h2>
      {done ? (
        <div className="mt-6">
          <p className="rounded-2xl bg-emerald-50 p-5 text-sm text-emerald-800">Your password was updated and other sessions were signed out.</p>
          <Button className="mt-5" onClick={() => (window.location.hash = 'login')}>Sign in</Button>
        </div>
      ) : (
        <form onSubmit={submit} className="mt-8 space-y-4">
          <Field label="New password" hint={passwordHint}><PasswordInput value={pw} onChange={setPw} autoComplete="new-password" /></Field>
          <Field label="Confirm new password"><PasswordInput value={confirm} onChange={setConfirm} autoComplete="new-password" /></Field>
          {error && <p className="text-sm font-medium text-rose-600">{error}</p>}
          <Button type="submit" size="lg" className="w-full">Update password</Button>
        </form>
      )}
    </AuthShell>
  );
};

// ---------------- Forced password change (temp passwords) ----------------
export const ChangePasswordForm: React.FC<{ onDone?: () => void; compact?: boolean }> = ({ onDone, compact }) => {
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (weak(next)) return setError(passwordHint);
    if (next !== confirm) return setError('New passwords do not match.');
    setBusy(true);
    try {
      await store.changePassword(current, next);
      setCurrent('');
      setNext('');
      setConfirm('');
      store.toast('Password updated');
      onDone?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not update password.');
    } finally {
      setBusy(false);
    }
  };
  return (
    <form onSubmit={submit} className={`space-y-4 ${compact ? '' : 'mt-8'}`}>
      <Field label={compact ? 'Current password' : 'Temporary / current password'}><PasswordInput value={current} onChange={setCurrent} autoComplete="current-password" /></Field>
      <Field label="New password" hint={passwordHint}><PasswordInput value={next} onChange={setNext} autoComplete="new-password" /></Field>
      <Field label="Confirm new password"><PasswordInput value={confirm} onChange={setConfirm} autoComplete="new-password" /></Field>
      {error && <p className="text-sm font-medium text-rose-600">{error}</p>}
      <Button type="submit" size={compact ? 'md' : 'lg'} className={compact ? '' : 'w-full'} icon={<KeyRound size={16} />} disabled={busy}>
        {busy ? 'Saving…' : 'Update password'}
      </Button>
    </form>
  );
};

export const ForcePasswordChange: React.FC = () => {
  const s = useStore();
  return (
    <AuthShell>
      <div className="eyebrow eyebrow-dot mt-8 lg:mt-0">Welcome, {s.me?.name.split(' ')[0]}</div>
      <h2 className="mt-3 text-3xl font-bold text-ink-950">Set your own password</h2>
      <p className="mt-2 text-ink-500">You signed in with a temporary password. Choose a new one to continue.</p>
      <ChangePasswordForm onDone={() => (window.location.hash = ['OWNER', 'MANAGER', 'OFFICE_MANAGER'].includes(s.me?.role || '') ? 'admin' : 'dashboard')} />
      <button className="mt-6 text-sm font-semibold text-ink-500 hover:text-ink-900" onClick={() => void store.logout()}>Sign out</button>
    </AuthShell>
  );
};
