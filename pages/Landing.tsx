import React, { useMemo, useState } from 'react';
import {
  ArrowRight,
  BadgeCheck,
  Bath,
  CalendarClock,
  Check,
  ChefHat,
  ClipboardCheck,
  FileSignature,
  Building2,
  Hammer,
  Home,
  PlusSquare,
  Trees,
  Wrench,
  Layers,
  Menu,
  Minus,
  Paintbrush,
  PhoneCall,
  Plus,
  Receipt,
  Ruler,
  ShieldCheck,
  Sparkles,
  Square,
  X,
} from 'lucide-react';
import { Button, Logo, useStore } from '../components/SharedComponents';
import BookingForm from '../components/BookingForm';
import { moneyShort } from '../services/format';
import { serviceLabel, siteContent } from '../services/catalog';

const scrollTo = (id: string) => document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });

const NAV = [
  { id: 'services', label: 'Services' },
  { id: 'process', label: 'How it works' },
  { id: 'why', label: 'Why us' },
  { id: 'faq', label: 'FAQ' },
];

const ICONS: Array<[RegExp, React.ComponentType<{ size?: number }>]> = [
  [/kitchen|cabinet/i, ChefHat],
  [/bath|shower/i, Bath],
  [/floor|tile/i, Layers],
  [/counter|stone|quartz/i, Square],
  [/paint|finish/i, Paintbrush],
  [/roof/i, Home],
  [/new|build|home|custom|construction/i, Building2],
  [/addition|extension|garage/i, PlusSquare],
  [/deck|fence|patio|outdoor|landscap/i, Trees],
  [/plumb|electric|hvac|mechanical/i, Wrench],
];
const iconFor = (label: string) => ICONS.find(([re]) => re.test(label))?.[1] || Hammer;

const STAGES = [
  { n: '01', title: 'Request', copy: 'Tell us about the project and pick a time that works.', icon: PhoneCall },
  { n: '02', title: 'Matched', copy: 'The right estimator is auto-assigned by specialty and availability.', icon: CalendarClock },
  { n: '03', title: 'Measured', copy: 'A 45-minute on-site visit. Measurements, materials, questions answered.', icon: Ruler },
  { n: '04', title: 'E-signed', copy: 'An itemized estimate lands in your inbox. Approve it from your phone.', icon: FileSignature, highlight: true },
  { n: '05', title: 'Built & paid', copy: 'A scheduled crew, a daily checklist, and one clear invoice at the end.', icon: Hammer },
];


const Faq: React.FC<{ faqs: Array<{ q: string; a: string }> }> = ({ faqs }) => {
  const [open, setOpen] = useState<number | null>(0);
  return (
    <div className="divide-y divide-ink-200 border-y border-ink-200">
      {faqs.map((f, i) => (
        <div key={f.q}>
          <button className="flex w-full items-center justify-between gap-6 py-5 text-left" onClick={() => setOpen(open === i ? null : i)} aria-expanded={open === i}>
            <span className="font-display text-lg font-semibold text-ink-950">{f.q}</span>
            <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full transition ${open === i ? 'bg-brand-600 text-white' : 'bg-ink-100 text-ink-700'}`}>
              {open === i ? <Minus size={16} /> : <Plus size={16} />}
            </span>
          </button>
          {open === i && <p className="-mt-1 max-w-2xl pb-6 text-[15px] leading-relaxed text-ink-600">{f.a}</p>}
        </div>
      ))}
    </div>
  );
};

const HeroMock: React.FC = () => {
  const s = useStore();
  const upcoming = s.config?.nextVisits || [];
  return (
    <div className="relative">
      <div className="glow-violet absolute -inset-10 -z-10 blur-2xl" />
      <div className="rounded-[28px] border border-white/60 bg-white/80 p-3 shadow-pop backdrop-blur">
        <div className="rounded-[22px] border border-ink-100 bg-white p-5">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-ink-400">Estimate EST-2001</div>
              <div className="mt-1 font-display text-lg font-bold text-ink-950">{s.services[0]?.label || 'Your project'}</div>
            </div>
            <span className="rounded-full bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700 ring-1 ring-emerald-200">Ready to sign</span>
          </div>
          <div className="mt-4 space-y-2">
            {[
              ['Demolition and prep', '$1,200'],
              ['Quartz countertop package', '$6,200'],
              ['Cabinet refinishing', '$2,600'],
            ].map(([d, v]) => (
              <div key={d} className="flex items-center justify-between rounded-xl bg-ink-50 px-3.5 py-2.5 text-sm">
                <span className="text-ink-700">{d}</span>
                <span className="font-semibold text-ink-950">{v}</span>
              </div>
            ))}
          </div>
          <div className="mt-4 flex items-end justify-between border-t border-dashed border-ink-200 pt-4">
            <span className="text-sm text-ink-500">Total incl. tax</span>
            <span className="font-display text-2xl font-bold text-ink-950">$10,369</span>
          </div>
          <div className="mt-4 flex items-center gap-2 rounded-xl bg-brand-600 px-4 py-3 text-sm font-semibold text-white">
            <FileSignature size={16} /> Review &amp; e-sign
          </div>
        </div>
      </div>
      <div className="absolute -bottom-28 -left-8 hidden w-60 rounded-2xl border border-ink-100 bg-white p-4 shadow-pop sm:block">
        <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-ink-400">Next visits</div>
        <div className="mt-3 space-y-2.5">
          {upcoming.length === 0 && <div className="text-xs text-ink-400">Openings this week</div>}
          {upcoming.map((a) => (
            <div key={a.startTime + a.serviceType} className="flex items-center gap-2.5">
              <span className="h-2 w-2 rounded-full" style={{ background: a.color || '#4B3AB3' }} />
              <span className="flex-1 truncate text-xs font-medium text-ink-800">{serviceLabel(a.serviceType)}</span>
              <span className="text-[11px] text-ink-400">{new Date(a.startTime).toLocaleDateString('en-US', { weekday: 'short' })}</span>
            </div>
          ))}
        </div>
      </div>
      <div className="absolute -right-4 -top-6 hidden items-center gap-2 rounded-full bg-white px-4 py-2 text-xs font-semibold text-ink-900 ring-1 ring-brand-100 shadow-pop sm:flex">
        <BadgeCheck size={14} className="text-emerald-500" /> Estimator auto-assigned
      </div>
    </div>
  );
};

const Landing: React.FC = () => {
  const s = useStore();
  const [mobileNav, setMobileNav] = useState(false);
  const cfg = s.config;
  const site = siteContent({ site: cfg?.site });
  const settings = {
    companyName: cfg?.companyName || 'Company X',
    serviceArea: cfg?.serviceArea,
    supportPhone: cfg?.supportPhone || '',
    supportEmail: cfg?.supportEmail || '',
    address: cfg?.address || '',
  };

  const live = useMemo(() => {
    const st = cfg?.stats;
    return { avg: st?.avgApproved || 0, estimators: st?.estimators || 0, renovation: st?.renovation || 0, crews: st?.crews || 0 };
  }, [cfg]);

  return (
    <div className="min-h-screen bg-white">
      {/* NAV */}
      <header className="sticky top-0 z-40 border-b border-ink-100/80 bg-white/80 backdrop-blur-xl">
        <div className="mx-auto flex h-[72px] max-w-7xl items-center justify-between px-5 lg:px-8">
          <a href="#home" onClick={(e) => { e.preventDefault(); window.scrollTo({ top: 0, behavior: 'smooth' }); }}>
            <Logo />
          </a>
          <nav className="hidden items-center gap-1 md:flex">
            {NAV.map((n) => (
              <button key={n.id} onClick={() => scrollTo(n.id)} className="rounded-full px-4 py-2 text-sm font-medium text-ink-600 transition hover:bg-ink-50 hover:text-ink-950">
                {n.label}
              </button>
            ))}
          </nav>
          <div className="hidden items-center gap-2 md:flex">
            <a href="#login" className="rounded-full px-4 py-2 text-sm font-semibold text-ink-700 hover:text-ink-950">
              Team sign in
            </a>
            <Button onClick={() => scrollTo('cta-form')}>
              Book a free estimate <ArrowRight size={16} />
            </Button>
          </div>
          <button className="flex h-10 w-10 items-center justify-center rounded-full border border-ink-200 md:hidden" onClick={() => setMobileNav(!mobileNav)} aria-label="Menu">
            {mobileNav ? <X size={18} /> : <Menu size={18} />}
          </button>
        </div>
        {mobileNav && (
          <div className="border-t border-ink-100 bg-white px-5 py-4 md:hidden">
            {NAV.map((n) => (
              <button key={n.id} onClick={() => { setMobileNav(false); scrollTo(n.id); }} className="block w-full rounded-xl px-3 py-3 text-left text-sm font-medium text-ink-700 hover:bg-ink-50">
                {n.label}
              </button>
            ))}
            <div className="mt-3 flex gap-2">
              <a href="#login" className="flex-1 rounded-full border border-ink-200 py-2.5 text-center text-sm font-semibold">Team sign in</a>
              <Button className="flex-1" onClick={() => { setMobileNav(false); scrollTo('cta-form'); }}>Free estimate</Button>
            </div>
          </div>
        )}
      </header>

      {/* HERO */}
      <section className="relative overflow-hidden">
        <div className="grid-bg absolute inset-0 [mask-image:radial-gradient(ellipse_at_top,black_30%,transparent_75%)]" />
        <div className="relative mx-auto grid max-w-7xl gap-16 px-5 pb-24 pt-16 lg:grid-cols-[1.15fr,0.85fr] lg:items-center lg:px-8 lg:pb-36 lg:pt-24">
          <div className="animate-fade-up">
            <div className="inline-flex items-center gap-2 rounded-full border border-brand-200 bg-brand-50 px-3 py-1.5 text-xs font-semibold text-brand-700">
              <Sparkles size={14} /> Now booking visits across {settings.serviceArea || 'the region'}
            </div>
            <h1 className="mt-6 text-[44px] font-bold leading-[1.02] text-ink-950 sm:text-6xl xl:text-[72px]">
              {site.heroTitle} <span className="text-gradient">{site.heroHighlight}</span>
            </h1>
            <p className="mt-6 max-w-xl text-lg leading-relaxed text-ink-600 sm:text-xl">
              {site.heroSubtitle.replace(/\{company\}/g, settings.companyName)}
            </p>
            <div className="mt-9 flex flex-col gap-3 sm:flex-row">
              <Button size="lg" onClick={() => scrollTo('cta-form')}>
                Book a free estimate <ArrowRight size={18} />
              </Button>
              <Button size="lg" variant="outline" onClick={() => scrollTo('process')}>
                See how it works
              </Button>
            </div>
            <div className="mt-8 flex flex-wrap gap-x-6 gap-y-2 text-sm text-ink-500">
              {['45-minute visit', 'No prep required', 'Itemized, e-sign estimate'].map((t) => (
                <span key={t} className="inline-flex items-center gap-2">
                  <Check size={16} className="text-brand-600" /> {t}
                </span>
              ))}
            </div>
          </div>
          <div className="animate-fade-up [animation-delay:120ms]">
            <HeroMock />
          </div>
        </div>
      </section>

      {/* TRADES STRIP */}
      <section className="border-y border-ink-100 bg-ink-50/60 py-8">
        <div className="mx-auto max-w-7xl px-5 lg:px-8">
          <div className="mb-5 text-center text-xs font-semibold uppercase tracking-[0.2em] text-ink-400">One accountable team across every trade</div>
          <div className="relative overflow-hidden [mask-image:linear-gradient(to_right,transparent,black_12%,black_88%,transparent)]">
            <div className="flex w-max animate-marquee gap-14">
              {[...Array(2)].flatMap((_, k) =>
                ['Kitchens', 'Bathrooms', 'Flooring', 'Quartz & Stone', 'Tile', 'Interior Paint', 'Cabinetry', 'Lighting', 'Trim & Millwork'].map((t) => (
                  <span key={`${k}-${t}`} className="whitespace-nowrap font-display text-xl font-bold text-ink-300">
                    {t}
                  </span>
                )),
              )}
            </div>
          </div>
        </div>
      </section>

      {/* LIVE NUMBERS */}
      <section className="mx-auto max-w-7xl px-5 py-24 lg:px-8">
        <div className="grid gap-12 lg:grid-cols-[0.8fr,1.2fr] lg:items-end">
          <div>
            <div className="eyebrow eyebrow-dot">The remodeling gap</div>
            <h2 className="mt-4 text-4xl font-bold leading-[1.08] text-ink-950 sm:text-5xl">Most quotes are a guess. Ours are a plan.</h2>
          </div>
          <p className="text-lg leading-relaxed text-ink-600">
            Vague bids and missed callbacks are why remodels run late and over. We run every project through the same system — so the estimate you sign is the job we build and the invoice you pay.
          </p>
        </div>
        <div className="mt-14 grid gap-px overflow-hidden rounded-3xl border border-ink-200 bg-ink-200 sm:grid-cols-2 lg:grid-cols-4">
          {[
            { v: `${live.estimators}`, l: 'staff estimators on the calendar', s: `${live.renovation} specialist-qualified` },
            { v: `${live.crews}`, l: 'crews and trade partners', s: 'scheduled job-by-job' },
            { v: live.avg ? moneyShort(live.avg) : '—', l: 'average approved project', s: 'itemized, e-signed' },
            { v: '48h', l: 'target from visit to estimate', s: 'sent straight to your inbox' },
          ].map((x) => (
            <div key={x.l} className="bg-white p-8">
              <div className="font-display text-5xl font-bold tracking-tight text-ink-950">{x.v}</div>
              <div className="mt-3 text-[15px] font-medium text-ink-800">{x.l}</div>
              <div className="mt-1 text-sm text-ink-500">{x.s}</div>
            </div>
          ))}
        </div>
      </section>

      {/* PROCESS / MATURITY LADDER */}
      <section id="process" className="surface-violet relative overflow-hidden py-24 text-white">
        <div className="glow-violet absolute inset-x-0 top-0 h-[500px]" />
        <div className="relative mx-auto max-w-7xl px-5 lg:px-8">
          <div className="max-w-2xl">
            <div className="eyebrow text-brand-200">From first call to final walkthrough</div>
            <h2 className="mt-4 text-4xl font-bold leading-[1.08] sm:text-5xl">Five steps. No black box.</h2>
            <p className="mt-5 text-lg text-brand-100">Every project moves through the same visible stages. You always know what's next and who owns it.</p>
          </div>
          <div className="mt-14 grid gap-4 md:grid-cols-5">
            {STAGES.map((st) => {
              const Icon = st.icon;
              return (
                <div
                  key={st.n}
                  className={`relative rounded-3xl border p-6 transition ${st.highlight ? 'border-white bg-white text-ink-950 shadow-pop' : 'border-white/20 bg-white/10 hover:border-white/40'}`}
                >
                  <div className="flex items-center justify-between">
                    <span className={`font-display text-sm font-bold ${st.highlight ? 'text-brand-600' : 'text-brand-200'}`}>{st.n}</span>
                    <Icon size={20} className={st.highlight ? 'text-brand-600' : 'text-white/70'} />
                  </div>
                  <div className="mt-10 font-display text-xl font-bold">{st.title}</div>
                  <p className={`mt-2 text-sm leading-relaxed ${st.highlight ? 'text-ink-600' : 'text-brand-100'}`}>{st.copy}</p>
                  {st.highlight && <span className="absolute -top-3 left-6 rounded-full bg-amber-300 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-ink-900">Where you decide</span>}
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* SERVICES */}
      <section id="services" className="mx-auto max-w-7xl px-5 py-24 lg:px-8">
        <div className="flex flex-col justify-between gap-6 md:flex-row md:items-end">
          <div className="max-w-2xl">
            <div className="eyebrow eyebrow-dot">Services</div>
            <h2 className="mt-4 text-4xl font-bold leading-[1.08] text-ink-950 sm:text-5xl">Where we move the needle in your home</h2>
          </div>
          <Button variant="outline" onClick={() => scrollTo('cta-form')}>
            Get a number for your project <ArrowRight size={16} />
          </Button>
        </div>
        <div className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {s.services.map((sv) => {
            const Icon = iconFor(sv.label);
            return (
              <div key={sv.key} className="group rounded-3xl border border-ink-200 bg-white p-7 transition hover:-translate-y-1 hover:border-brand-300 hover:shadow-glow">
                <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-brand-50 text-brand-600 transition group-hover:bg-brand-600 group-hover:text-white">
                  <Icon size={22} />
                </div>
                <h3 className="mt-6 text-xl font-bold text-ink-950">{sv.label}</h3>
                <p className="mt-2 text-[15px] leading-relaxed text-ink-600">{sv.description}</p>
              </div>
            );
          })}
          <div className="flex flex-col justify-between rounded-3xl bg-gradient-to-br from-brand-600 to-brand-800 p-7 text-white shadow-glow">
            <div>
              <h3 className="text-xl font-bold">Not sure where to start?</h3>
              <p className="mt-2 text-[15px] leading-relaxed text-brand-100">Book a visit and we'll help you prioritize what adds the most value first.</p>
            </div>
            <Button variant="light" className="mt-6 self-start" onClick={() => scrollTo('cta-form')}>
              Talk to an estimator <ArrowRight size={16} />
            </Button>
          </div>
        </div>
      </section>

      {/* COMPARISON */}
      <section id="why" className="bg-ink-50/70 py-24">
        <div className="mx-auto max-w-7xl px-5 lg:px-8">
          <div className="mx-auto max-w-2xl text-center">
            <div className="eyebrow eyebrow-dot justify-center">Why us</div>
            <h2 className="mt-4 text-4xl font-bold leading-[1.08] text-ink-950 sm:text-5xl">A bid is 5% of the job. The system is the other 95%.</h2>
          </div>
          <div className="mt-14 grid gap-5 lg:grid-cols-[0.8fr,1.2fr]">
            <div className="rounded-3xl border border-ink-200 bg-white p-8">
              <div className="flex items-center justify-between">
                <span className="text-sm font-semibold uppercase tracking-[0.14em] text-ink-400">Typical contractor</span>
                <span className="font-display text-3xl font-bold text-ink-300">5%</span>
              </div>
              <ul className="mt-8 space-y-4">
                {['A single lump-sum number', 'Callbacks when they get to it', 'Scope lives in a text thread', 'Crew shows up… eventually', 'Surprise change orders at the end'].map((t) => (
                  <li key={t} className="flex items-center gap-3 text-[15px] text-ink-500">
                    <span className="flex h-6 w-6 items-center justify-center rounded-full bg-ink-100"><X size={13} /></span>
                    {t}
                  </li>
                ))}
              </ul>
            </div>
            <div className="surface-violet rounded-3xl p-8 text-white shadow-pop">
              <div className="flex items-center justify-between">
                <span className="text-sm font-semibold uppercase tracking-[0.14em] text-brand-200">{settings.companyName}</span>
                <span className="font-display text-3xl font-bold">95%</span>
              </div>
              <div className="mt-8 grid gap-x-8 gap-y-4 sm:grid-cols-2">
                {[
                  ['Itemized estimates', 'Labor and materials, line by line'],
                  ['Specialist matching', 'Kitchens & baths get certified estimators'],
                  ['Secure e-sign', 'Timestamped approval from any device'],
                  ['Automatic reminders', 'Email + SMS before every visit'],
                  ['Job checklists', 'Crews close out each step daily'],
                  ['One clear invoice', 'Mirrors the estimate you signed'],
                  ['Deposit tracking', 'Every payment logged to your balance'],
                  ['Named owner', 'One person accountable end to end'],
                ].map(([t, d]) => (
                  <div key={t} className="flex gap-3">
                    <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-white/20"><Check size={13} /></span>
                    <div>
                      <div className="text-[15px] font-semibold">{t}</div>
                      <div className="text-sm text-brand-200">{d}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* WHAT YOU GET */}
      <section className="mx-auto max-w-7xl px-5 py-24 lg:px-8">
        <div className="grid gap-12 lg:grid-cols-2 lg:items-center">
          <div>
            <div className="eyebrow eyebrow-dot">What you walk away with</div>
            <h2 className="mt-4 text-4xl font-bold leading-[1.08] text-ink-950 sm:text-5xl">Your project, in one decision packet.</h2>
            <p className="mt-5 text-lg leading-relaxed text-ink-600">After the visit you receive everything you need to say yes or no with confidence — no follow-up calls required.</p>
            <Button size="lg" className="mt-8" onClick={() => scrollTo('cta-form')}>
              Book my visit <ArrowRight size={18} />
            </Button>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            {[
              { icon: ClipboardCheck, t: 'Scope of work', d: 'Rooms, measurements and finishes confirmed on-site.' },
              { icon: Receipt, t: 'Itemized estimate', d: 'Every labor and material line with quantities.' },
              { icon: CalendarClock, t: 'Schedule window', d: 'Crew start and finish dates before you sign.' },
              { icon: ShieldCheck, t: 'Clear terms', d: 'Validity date, taxes and payment schedule up front.' },
            ].map((x) => {
              const Icon = x.icon;
              return (
                <div key={x.t} className="rounded-3xl border border-ink-200 bg-white p-6">
                  <Icon size={22} className="text-brand-600" />
                  <div className="mt-5 font-display text-lg font-bold text-ink-950">{x.t}</div>
                  <p className="mt-1.5 text-sm leading-relaxed text-ink-600">{x.d}</p>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section id="faq" className="mx-auto max-w-7xl px-5 pb-24 lg:px-8">
        <div className="grid gap-12 lg:grid-cols-[0.7fr,1.3fr]">
          <div>
            <div className="eyebrow eyebrow-dot">FAQ</div>
            <h2 className="mt-4 text-4xl font-bold leading-[1.08] text-ink-950">Questions, answered.</h2>
            <p className="mt-4 text-ink-600">
              Still curious? Call us at <a className="font-semibold text-brand-700" href={`tel:${settings.supportPhone}`}>{settings.supportPhone}</a>.
            </p>
          </div>
          <Faq faqs={site.faqs} />
        </div>
      </section>

      {/* CTA FORM */}
      <section id="cta-form" className="surface-violet relative scroll-mt-16 overflow-hidden py-24 text-white">
        <div className="glow-violet absolute inset-x-0 top-0 h-[600px]" />
        <div className="grid-bg absolute inset-0 opacity-30 [mask-image:radial-gradient(ellipse_at_center,black_20%,transparent_70%)]" />
        <div className="relative mx-auto grid max-w-7xl gap-14 px-5 lg:grid-cols-[0.9fr,1.1fr] lg:px-8">
          <div className="lg:pt-6">
            <div className="eyebrow text-brand-200">Free on-site estimate</div>
            <h2 className="mt-4 text-4xl font-bold leading-[1.05] sm:text-6xl">{site.ctaTitle}</h2>
            <p className="mt-6 max-w-md text-lg text-brand-100">{site.ctaSubtitle}</p>
            <div className="mt-10 space-y-5">
              {[
                ['45 minutes', 'On-site, at a time that suits you.'],
                ['No prep required', 'Just show us the space and what you want.'],
                ['You leave knowing', 'Whether it fits your budget — before you commit.'],
              ].map(([t, d]) => (
                <div key={t} className="flex gap-4">
                  <span className="mt-1 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-white/20"><Check size={15} /></span>
                  <div>
                    <div className="font-display text-lg font-semibold">{t}</div>
                    <div className="text-brand-200">{d}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
          <BookingForm tone="dark" />
        </div>
      </section>

      {/* FOOTER */}
      <footer className="border-t border-ink-100 bg-white">
        <div className="mx-auto grid max-w-7xl gap-10 px-5 py-14 md:grid-cols-4 lg:px-8">
          <div className="md:col-span-2">
            <Logo />
            <p className="mt-4 max-w-sm text-sm text-ink-500">{settings.companyName} · {settings.address}</p>
            <p className="mt-1 text-sm text-ink-500">{settings.supportEmail} · {settings.supportPhone}</p>
          </div>
          <div>
            <div className="text-xs font-semibold uppercase tracking-[0.16em] text-ink-400">Services</div>
            <ul className="mt-4 space-y-2 text-sm text-ink-600">
              {s.services.map((s2) => <li key={s2.key}>{s2.label}</li>)}
            </ul>
          </div>
          <div>
            <div className="text-xs font-semibold uppercase tracking-[0.16em] text-ink-400">Company</div>
            <ul className="mt-4 space-y-2 text-sm text-ink-600">
              <li><button onClick={() => scrollTo('process')} className="hover:text-ink-950">How it works</button></li>
              <li><button onClick={() => scrollTo('faq')} className="hover:text-ink-950">FAQ</button></li>
              <li><a href="#book" className="hover:text-ink-950">Book online</a></li>
              <li><a href="#login" className="hover:text-ink-950">Team sign in</a></li>
            </ul>
          </div>
        </div>
        <div className="border-t border-ink-100 py-6 text-center text-xs text-ink-400">© {new Date().getFullYear()} {settings.companyName}. Powered by ConstructFlow.</div>
      </footer>
    </div>
  );
};

export default Landing;
