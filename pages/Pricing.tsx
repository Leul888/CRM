import React, { useEffect, useState } from 'react';
import {
  ArrowRight,
  BellRing,
  CalendarClock,
  Check,
  CheckCircle2,
  ClipboardCheck,
  CreditCard,
  FileSignature,
  Globe,
  Lock,
  Minus,
  Plus,
  X,
} from 'lucide-react';
import { store, type SalesPlan, type SalesPlans } from '../store';
import { Button, Field, Input, Select, ThemeToggle } from '../components/SharedComponents';

const INCLUDED = [
  { icon: Globe, title: 'Your own website', text: 'Homeowners request estimates online. Every request lands in your pipeline.' },
  { icon: CalendarClock, title: 'Scheduling', text: 'Site visits on one calendar, assigned to the right estimator automatically.' },
  { icon: FileSignature, title: 'E-sign estimates', text: 'Send professional estimates. Clients review and sign from their phone.' },
  { icon: ClipboardCheck, title: 'Work orders', text: 'Crews see their jobs, tick off checklists and upload photos from the site.' },
  { icon: CreditCard, title: 'Invoices & payments', text: 'Invoice when the job is done. Clients pay online by card or bank.' },
  { icon: BellRing, title: 'Instant alerts', text: 'Your phone buzzes the moment a new lead comes in.' },
];

const FAQ = [
  { q: 'How quickly can we start?', a: 'Usually within one business day. We set up your workspace, branding and website, then walk your team through it on a call.' },
  { q: "What's the setup fee for?", a: 'Your logo and colors, website text and services, your domain and email, importing your existing customers, and training for your team.' },
  { q: 'Can we cancel?', a: 'Yes, anytime. You keep access until the end of the period you paid for, and we give you a full export of your data.' },
  { q: 'Is our data safe?', a: 'Passwords are encrypted, every sign-in and change is logged, and your data is backed up. Your data belongs to you.' },
];

const SignupForm: React.FC<{ data: SalesPlans; plan: SalesPlan['key']; billing: 'month' | 'year'; onClose: () => void }> = ({ data, plan: initialPlan, billing: initialBilling, onClose }) => {
  const [d, setD] = useState({ company: '', name: '', email: '', phone: '', plan: initialPlan, billing: initialBilling, website: '' });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const set = (k: keyof typeof d, v: string) => setD((x) => ({ ...x, [k]: v }));
  const chosen = data.plans.find((p) => p.key === d.plan) || data.plans[0];
  const price = d.billing === 'year' ? chosen.annual : chosen.monthly;
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      const r = await store.startSignup(d);
      if (r.url) window.location.href = r.url;
      else window.location.hash = 'pricing/thanks';
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong.');
      setBusy(false);
    }
  };
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-ink-950/50 p-0 backdrop-blur-sm sm:items-center sm:p-6" role="dialog" aria-modal="true" onClick={onClose}>
      <form onSubmit={submit} onClick={(e) => e.stopPropagation()} className="max-h-[92vh] w-full max-w-lg overflow-y-auto rounded-t-3xl bg-surface p-6 shadow-2xl sm:rounded-3xl sm:p-8">
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="eyebrow">Get started</div>
            <h2 className="mt-1 text-2xl font-bold text-ink-950">Set up {data.product} for your company</h2>
          </div>
          <button type="button" onClick={onClose} className="rounded-full p-2 text-ink-400 hover:bg-ink-100 hover:text-ink-900" aria-label="Close"><X size={18} /></button>
        </div>
        <div className="mt-6 grid gap-4 sm:grid-cols-2">
          <Field label="Company name" className="sm:col-span-2"><Input required value={d.company} onChange={(e) => set('company', e.target.value)} autoComplete="organization" placeholder="Acme Builders" /></Field>
          <Field label="Your name"><Input required value={d.name} onChange={(e) => set('name', e.target.value)} autoComplete="name" /></Field>
          <Field label="Phone"><Input value={d.phone} onChange={(e) => set('phone', e.target.value)} autoComplete="tel" type="tel" /></Field>
          <Field label="Work email" className="sm:col-span-2"><Input required type="email" value={d.email} onChange={(e) => set('email', e.target.value)} autoComplete="email" /></Field>
          <Field label="Plan"><Select value={d.plan} onChange={(e) => set('plan', e.target.value)} options={data.plans.map((p) => ({ value: p.key, label: `${p.name} (up to ${p.users} users)` }))} /></Field>
          <Field label="Billing"><Select value={d.billing} onChange={(e) => set('billing', e.target.value)} options={[{ value: 'month', label: 'Monthly' }, { value: 'year', label: 'Yearly (2 months free)' }]} /></Field>
          <input tabIndex={-1} autoComplete="off" className="hidden" value={d.website} onChange={(e) => set('website', e.target.value)} aria-hidden="true" />
        </div>
        <div className="mt-5 space-y-1.5 rounded-2xl bg-ink-50 p-4 text-sm">
          <div className="flex justify-between"><span className="text-ink-600">{data.product} {chosen.name}</span><span className="font-semibold">${price.toLocaleString('en-US')}/{d.billing === 'year' ? 'yr' : 'mo'}</span></div>
          {data.setupFee > 0 && <div className="flex justify-between"><span className="text-ink-600">One-time setup &amp; onboarding</span><span className="font-semibold">${data.setupFee.toLocaleString('en-US')}</span></div>}
          <div className="flex justify-between border-t border-ink-200 pt-2 font-display text-base font-bold"><span>Due today</span><span>${(price + data.setupFee).toLocaleString('en-US')}</span></div>
        </div>
        {error && <p className="mt-4 text-sm font-medium text-rose-600">{error}</p>}
        <Button type="submit" size="lg" className="mt-5 w-full" icon={data.checkout ? <Lock size={16} /> : undefined} disabled={busy}>
          {busy ? 'Please wait…' : data.checkout ? 'Continue to secure checkout' : 'Request my workspace'}
        </Button>
        <p className="mt-3 text-center text-xs text-ink-500">{data.checkout ? 'Payment is handled by Stripe. Have a promo code? Enter it at checkout.' : "We'll email you to confirm and send a payment link."}</p>
      </form>
    </div>
  );
};

const Pricing: React.FC<{ thanks?: boolean }> = ({ thanks }) => {
  const [data, setData] = useState<SalesPlans | null>(null);
  const [missing, setMissing] = useState(false);
  const [billing, setBilling] = useState<'month' | 'year'>('month');
  const [signup, setSignup] = useState<SalesPlan['key'] | null>(null);
  const [open, setOpen] = useState<number | null>(0);
  useEffect(() => {
    store.getPlans().then(setData).catch(() => setMissing(true));
  }, []);
  useEffect(() => {
    if (data) document.title = `${data.product} · Pricing`;
  }, [data]);

  if (missing)
    return (
      <div className="flex min-h-screen items-center justify-center bg-ink-50/60 p-6 text-center">
        <div><h1 className="text-2xl font-bold">Page not found</h1><a href="#home" className="mt-3 inline-block text-sm font-semibold text-brand-600">Go to the homepage</a></div>
      </div>
    );
  if (!data) return <div className="min-h-screen bg-ink-50/60" />;

  const header = (
    <header className="sticky top-0 z-40 border-b border-ink-100/80 bg-surface/80 backdrop-blur-xl">
      <div className="mx-auto flex h-[68px] max-w-6xl items-center justify-between px-5">
        <a href="#pricing" className="flex items-center gap-2.5">
          <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-brand-600 font-display text-lg font-bold text-white">{data.product.charAt(0)}</span>
          <span className="font-display text-lg font-bold text-ink-950">{data.product}</span>
        </a>
        <div className="flex items-center gap-2">
          <ThemeToggle />
          <a href="#login" className="hidden rounded-full px-4 py-2 text-sm font-semibold text-ink-700 hover:text-ink-950 sm:inline-block">Customer sign in</a>
          {!thanks && <Button onClick={() => setSignup('pro')}>Get started</Button>}
        </div>
      </div>
    </header>
  );

  if (thanks)
    return (
      <div className="min-h-screen bg-ink-50/60">
        {header}
        <main className="mx-auto max-w-2xl px-5 py-20 text-center">
          <CheckCircle2 className="mx-auto text-emerald-600" size={48} />
          <h1 className="mt-5 text-4xl font-bold text-ink-950">You're all set. Welcome aboard!</h1>
          <p className="mx-auto mt-4 max-w-lg text-lg text-ink-600">We'll set up your workspace, website and branding within one business day and email you your sign-in details. A receipt is on its way to your inbox.</p>
          {(data.contactEmail || data.contactPhone) && <p className="mt-6 text-sm text-ink-500">Questions? {data.contactEmail}{data.contactEmail && data.contactPhone ? ' · ' : ''}{data.contactPhone}</p>}
        </main>
      </div>
    );

  return (
    <div className="min-h-screen bg-ink-50/40">
      {header}

      {/* HERO */}
      <section className="surface-violet relative overflow-hidden text-white">
        <div className="glow-violet absolute inset-0" />
        <div className="relative mx-auto max-w-4xl px-5 py-20 text-center lg:py-24">
          <div className="text-xs font-semibold uppercase tracking-[0.2em] text-white/70">For contractors &amp; home builders</div>
          <h1 className="mt-4 text-4xl font-bold leading-tight sm:text-5xl">Run your whole construction business from one app</h1>
          <p className="mx-auto mt-5 max-w-2xl text-lg text-white/80">Leads, site visits, estimates, crews, invoices and payments, with your own branded website. Simple pricing, no per-user surprises.</p>
          <div className="mt-8 flex flex-wrap justify-center gap-3">
            <Button size="lg" variant="light" onClick={() => document.getElementById('plans')?.scrollIntoView({ behavior: 'smooth' })}>See plans <ArrowRight size={16} /></Button>
          </div>
        </div>
      </section>

      {/* PLANS */}
      <section id="plans" className="mx-auto max-w-5xl scroll-mt-20 px-5 py-16">
        <div className="flex justify-center">
          <div className="inline-flex rounded-full bg-ink-100 p-1" role="group" aria-label="Billing period">
            {(['month', 'year'] as const).map((b) => (
              <button key={b} onClick={() => setBilling(b)} className={`rounded-full px-5 py-2 text-sm font-semibold transition ${billing === b ? 'bg-surface text-ink-950 shadow-sm' : 'text-ink-500 hover:text-ink-900'}`}>
                {b === 'month' ? 'Monthly' : 'Yearly'}{b === 'year' && <span className="ml-1.5 rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] text-emerald-700">2 months free</span>}
              </button>
            ))}
          </div>
        </div>

        <div className="mt-10 grid gap-6 md:grid-cols-2">
          {data.plans.map((p) => {
            const price = billing === 'year' ? p.annual : p.monthly;
            return (
              <div key={p.key} className={`relative flex flex-col rounded-3xl border bg-surface p-7 shadow-card ${p.popular ? 'border-brand-400 ring-2 ring-brand-200' : 'border-ink-200'}`}>
                {p.popular && <span className="absolute -top-3 left-7 rounded-full bg-brand-600 px-3 py-1 text-xs font-bold text-white">Most popular</span>}
                <h2 className="text-xl font-bold text-ink-950">{p.name}</h2>
                <p className="mt-1 text-sm text-ink-500">{p.blurb}</p>
                <div className="mt-5 flex items-end gap-1">
                  <span className="font-display text-5xl font-bold text-ink-950">${price.toLocaleString('en-US')}</span>
                  <span className="pb-2 text-sm text-ink-500">/{billing === 'year' ? 'year' : 'month'}</span>
                </div>
                <p className="mt-1 text-xs text-ink-500">{billing === 'year' ? `That's $${Math.round(p.annual / 12)}/month, billed yearly` : 'Billed monthly, cancel anytime'}</p>
                <ul className="mt-6 flex-1 space-y-2.5 text-sm">
                  {p.features.map((f) => (
                    <li key={f} className="flex items-start gap-2.5 text-ink-700"><Check size={16} className="mt-0.5 shrink-0 text-brand-600" /> {f}</li>
                  ))}
                </ul>
                <Button className="mt-7 w-full" size="lg" variant={p.popular ? 'primary' : 'outline'} onClick={() => setSignup(p.key)}>Choose {p.name}</Button>
              </div>
            );
          })}
        </div>
        {data.setupFee > 0 && (
          <p className="mx-auto mt-6 max-w-2xl text-center text-sm text-ink-500">
            Plus a one-time <span className="font-semibold text-ink-800">${data.setupFee.toLocaleString('en-US')} setup fee</span>: your branding, website, domain and email, customer import, and team training.
          </p>
        )}
      </section>

      {/* INCLUDED */}
      <section className="border-y border-ink-100 bg-surface">
        <div className="mx-auto max-w-6xl px-5 py-16">
          <div className="text-center">
            <div className="eyebrow">Every plan includes</div>
            <h2 className="mt-2 text-3xl font-bold text-ink-950">From first call to final payment</h2>
          </div>
          <div className="mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {INCLUDED.map(({ icon: Icon, title, text }) => (
              <div key={title} className="rounded-2xl border border-ink-100 p-5">
                <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-50 text-brand-600"><Icon size={19} /></span>
                <h3 className="mt-4 font-semibold text-ink-950">{title}</h3>
                <p className="mt-1 text-sm leading-relaxed text-ink-600">{text}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section className="mx-auto max-w-3xl px-5 py-16">
        <h2 className="text-center text-3xl font-bold text-ink-950">Questions</h2>
        <div className="mt-8 divide-y divide-ink-100 rounded-2xl border border-ink-200 bg-surface">
          {FAQ.map((f, i) => (
            <div key={f.q}>
              <button onClick={() => setOpen(open === i ? null : i)} className="flex w-full items-center justify-between gap-4 px-5 py-4 text-left font-semibold text-ink-900" aria-expanded={open === i}>
                {f.q} {open === i ? <Minus size={16} className="shrink-0 text-ink-400" /> : <Plus size={16} className="shrink-0 text-ink-400" />}
              </button>
              {open === i && <p className="px-5 pb-5 text-sm leading-relaxed text-ink-600">{f.a}</p>}
            </div>
          ))}
        </div>
        <div className="mt-10 text-center">
          <Button size="lg" onClick={() => setSignup('pro')}>Get started <ArrowRight size={16} /></Button>
          {(data.contactEmail || data.contactPhone) && <p className="mt-4 text-sm text-ink-500">Prefer to talk first? {data.contactEmail}{data.contactEmail && data.contactPhone ? ' · ' : ''}{data.contactPhone}</p>}
        </div>
      </section>

      <footer className="border-t border-ink-100 py-6 text-center text-xs text-ink-400">© {new Date().getFullYear()} {data.seller}. {data.product}.</footer>

      {signup && <SignupForm data={data} plan={signup} billing={billing} onClose={() => setSignup(null)} />}
    </div>
  );
};

export default Pricing;
