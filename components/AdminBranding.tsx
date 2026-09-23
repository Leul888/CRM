import React, { useRef, useState } from 'react';
import { ArrowDown, ArrowUp, ExternalLink, ImagePlus, Plus, Trash2 } from 'lucide-react';
import type { ServiceDef, SiteContent, User } from '../types';
import { store } from '../store';
import { Button, Card, Field, Input, Textarea, useStore } from './SharedComponents';
import { can } from '../services/permissions';
import { DEFAULT_BRAND, serviceDefs, serviceKey, siteContent } from '../services/catalog';
import { applyBrand, isHex } from '../services/brand';

const PRESETS = ['#4b3ab3', '#1d4ed8', '#0f766e', '#15803d', '#b45309', '#c2410c', '#b91c1c', '#334155'];

// ------------------------------------------------------------------ branding + website copy
export const BrandingTab: React.FC<{ actor: User }> = ({ actor }) => {
  const s = useStore();
  const manage = can(actor, 'settings:manage');
  const [color, setColor] = useState(s.state.settings.brandColor || DEFAULT_BRAND);
  const [site, setSite] = useState<SiteContent>(siteContent(s.state.settings));
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const set = <K extends keyof SiteContent>(k: K, v: SiteContent[K]) => setSite((x) => ({ ...x, [k]: v }));

  const preview = (c: string) => {
    setColor(c);
    if (isHex(c)) applyBrand(c);
  };

  const save = async () => {
    if (!isHex(color)) return store.toast('Pick a valid color like #4b3ab3', 'error');
    setBusy(true);
    try {
      await s.saveSettings({ ...s.state.settings, brandColor: color.toLowerCase(), site });
      await store.refreshConfig();
      store.toast('Branding and website updated');
    } finally {
      setBusy(false);
    }
  };

  const onLogo = async (f?: File) => {
    if (!f) return;
    if (!/^image\/(png|jpeg|webp)$/.test(f.type)) return store.toast('Use a PNG, JPG or WEBP image.', 'error');
    if (f.size > 300 * 1024) return store.toast('Logo must be under 300 KB.', 'error');
    const dataUrl = await new Promise<string>((resolve, reject) => {
      const r = new FileReader();
      r.onload = () => resolve(String(r.result));
      r.onerror = reject;
      r.readAsDataURL(f);
    });
    try {
      await store.uploadLogo(dataUrl);
      store.toast('Logo updated');
    } catch (e) {
      store.toast(e instanceof Error ? e.message : 'Upload failed', 'error');
    }
  };

  return (
    <div className="grid gap-6 xl:grid-cols-[1fr,1.3fr]">
      <div className="space-y-6">
        <Card>
          <h2 className="text-lg font-bold">Logo</h2>
          <p className="mt-1 text-sm text-ink-500">Shown in the app, on the login page and on the website. Square images look best (PNG, JPG or WEBP, under 300 KB).</p>
          <div className="mt-5 flex items-center gap-4">
            <div className="flex h-20 w-20 items-center justify-center overflow-hidden rounded-2xl border border-ink-200 bg-ink-50">
              {s.logoUrl ? <img src={s.logoUrl} alt="Logo" className="h-full w-full object-contain" /> : <ImagePlus className="text-ink-300" />}
            </div>
            {manage && (
              <div className="flex flex-wrap gap-2">
                <Button variant="outline" size="sm" onClick={() => fileRef.current?.click()}>{s.logoUrl ? 'Replace' : 'Upload logo'}</Button>
                {s.logoUrl && <Button variant="ghost" size="sm" className="text-rose-600" onClick={async () => { await store.removeLogo(); store.toast('Logo removed'); }}>Remove</Button>}
              </div>
            )}
            <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/webp" className="hidden" onChange={(e) => void onLogo(e.target.files?.[0])} />
          </div>
        </Card>
        <Card>
          <h2 className="text-lg font-bold">Brand color</h2>
          <p className="mt-1 text-sm text-ink-500">Buttons, highlights and the website's colored sections use this color. You'll see a live preview.</p>
          <div className="mt-5 flex flex-wrap items-center gap-2">
            {PRESETS.map((c) => (
              <button key={c} type="button" disabled={!manage} onClick={() => preview(c)} className={`h-9 w-9 rounded-full ring-offset-2 transition ${color.toLowerCase() === c ? 'ring-2 ring-ink-900' : 'hover:scale-110'}`} style={{ background: c }} aria-label={`Use ${c}`} />
            ))}
            <label className="ml-2 flex items-center gap-2 rounded-full border border-ink-200 py-1 pl-1 pr-3">
              <input type="color" value={isHex(color) ? color : DEFAULT_BRAND} disabled={!manage} onChange={(e) => preview(e.target.value)} className="h-7 w-7 cursor-pointer rounded-full border-0 bg-transparent p-0" />
              <input value={color} disabled={!manage} onChange={(e) => preview(e.target.value)} className="w-20 bg-transparent text-sm font-mono outline-none" />
            </label>
          </div>
          <div className="mt-5 flex flex-wrap gap-2">
            <Button size="sm">Primary button</Button>
            <Button size="sm" variant="secondary">Secondary</Button>
            <span className="surface-violet rounded-full px-3 py-1.5 text-xs font-semibold text-white">Website section</span>
          </div>
        </Card>
      </div>

      <Card>
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold">Website text</h2>
          <a href="#home" target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-sm font-semibold text-brand-700">View website <ExternalLink size={13} /></a>
        </div>
        <div className="mt-5 grid gap-4 sm:grid-cols-2">
          <Field label="Headline"><Input disabled={!manage} value={site.heroTitle} onChange={(e) => set('heroTitle', e.target.value)} /></Field>
          <Field label="Headline highlight (colored)"><Input disabled={!manage} value={site.heroHighlight} onChange={(e) => set('heroHighlight', e.target.value)} /></Field>
          <Field label="Intro paragraph" hint="{company} is replaced with your company name." className="sm:col-span-2">
            <Textarea disabled={!manage} value={site.heroSubtitle} onChange={(e) => set('heroSubtitle', e.target.value)} />
          </Field>
          <Field label="Booking section title" className="sm:col-span-2"><Input disabled={!manage} value={site.ctaTitle} onChange={(e) => set('ctaTitle', e.target.value)} /></Field>
          <Field label="Booking section text" className="sm:col-span-2"><Textarea disabled={!manage} rows={2} value={site.ctaSubtitle} onChange={(e) => set('ctaSubtitle', e.target.value)} /></Field>
        </div>
        <div className="mt-6 flex items-center justify-between">
          <span className="label !mb-0">FAQ</span>
          {manage && site.faqs.length < 20 && <Button size="sm" variant="ghost" icon={<Plus size={14} />} onClick={() => set('faqs', [...site.faqs, { q: '', a: '' }])}>Add question</Button>}
        </div>
        <div className="mt-2 space-y-3">
          {site.faqs.map((f, i) => (
            <div key={i} className="rounded-2xl border border-ink-200 p-3">
              <div className="flex gap-2">
                <Input disabled={!manage} value={f.q} placeholder="Question" onChange={(e) => set('faqs', site.faqs.map((x, j) => (j === i ? { ...x, q: e.target.value } : x)))} />
                {manage && <button className="rounded-full p-2 text-ink-400 hover:bg-rose-50 hover:text-rose-600" onClick={() => set('faqs', site.faqs.filter((_, j) => j !== i))} aria-label="Remove question"><Trash2 size={15} /></button>}
              </div>
              <Textarea disabled={!manage} rows={2} className="mt-2" value={f.a} placeholder="Answer" onChange={(e) => set('faqs', site.faqs.map((x, j) => (j === i ? { ...x, a: e.target.value } : x)))} />
            </div>
          ))}
        </div>
        {manage && (
          <div className="mt-6 flex justify-end gap-2">
            <Button variant="ghost" onClick={() => { setSite(siteContent({})); }}>Reset text to defaults</Button>
            <Button onClick={save} disabled={busy}>{busy ? 'Saving…' : 'Save branding & website'}</Button>
          </div>
        )}
      </Card>
    </div>
  );
};

// ------------------------------------------------------------------ services catalog
export const ServicesTab: React.FC<{ actor: User }> = ({ actor }) => {
  const s = useStore();
  const manage = can(actor, 'settings:manage');
  const [list, setList] = useState<ServiceDef[]>(serviceDefs(s.state.settings).map((x) => ({ ...x })));
  const [busy, setBusy] = useState(false);
  const inUse = (key: string) => s.state.leads.filter((l) => l.serviceType === key).length;

  const update = (i: number, patch: Partial<ServiceDef>) => setList((xs) => xs.map((x, j) => (j === i ? { ...x, ...patch } : x)));
  const move = (i: number, d: -1 | 1) =>
    setList((xs) => {
      const next = [...xs];
      const [item] = next.splice(i, 1);
      next.splice(i + d, 0, item);
      return next;
    });

  const add = () => setList((xs) => [...xs, { key: '', label: '', description: '', specialist: false, active: true }]);

  const save = async () => {
    const used = new Set<string>();
    const clean: ServiceDef[] = [];
    for (const x of list) {
      if (!x.label.trim()) return store.toast('Every service needs a name.', 'error');
      let key = x.key || serviceKey(x.label);
      while (used.has(key)) key = `${key}_2`;
      used.add(key);
      clean.push({ ...x, key, label: x.label.trim(), description: x.description.trim() });
    }
    if (!clean.some((x) => x.active)) return store.toast('Keep at least one service active.', 'error');
    setBusy(true);
    try {
      await s.saveSettings({ ...s.state.settings, services: clean });
      await store.refreshConfig();
      setList(clean);
      store.toast('Services saved. The website, booking form and pickers now use them.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold">Services you offer</h2>
          <p className="mt-1 max-w-2xl text-sm text-ink-500">
            These appear on the website, in the booking form and in every service picker. Mark a service <strong>specialist</strong> to route it only to specialist-qualified estimators (for example new builds, additions or kitchens). Turning a service off hides it but keeps existing records.
          </p>
        </div>
        {manage && <Button variant="outline" icon={<Plus size={16} />} onClick={add}>Add service</Button>}
      </div>
      <div className="mt-6 space-y-3">
        {list.map((x, i) => (
          <div key={i} className={`grid gap-3 rounded-2xl border p-4 md:grid-cols-[1fr,1.6fr,auto] md:items-start ${x.active ? 'border-ink-200' : 'border-dashed border-ink-200 bg-ink-50/60'}`}>
            <div>
              <Input disabled={!manage} value={x.label} placeholder="e.g. New home build" onChange={(e) => update(i, { label: e.target.value })} />
              <div className="mt-2 flex flex-wrap gap-3 text-xs">
                <label className="flex items-center gap-1.5"><input type="checkbox" disabled={!manage} checked={x.active} onChange={(e) => update(i, { active: e.target.checked })} className="h-4 w-4 accent-brand-600" /> Active</label>
                <label className="flex items-center gap-1.5"><input type="checkbox" disabled={!manage} checked={x.specialist} onChange={(e) => update(i, { specialist: e.target.checked })} className="h-4 w-4 accent-brand-600" /> Specialist only</label>
                {x.key && inUse(x.key) > 0 && <span className="text-ink-400">{inUse(x.key)} leads</span>}
              </div>
            </div>
            <Textarea disabled={!manage} rows={2} value={x.description} placeholder="One sentence for the website" onChange={(e) => update(i, { description: e.target.value })} />
            {manage && (
              <div className="flex gap-1 md:flex-col">
                <button disabled={i === 0} onClick={() => move(i, -1)} className="rounded-full p-2 text-ink-400 hover:bg-ink-100 disabled:opacity-30" aria-label="Move up"><ArrowUp size={15} /></button>
                <button disabled={i === list.length - 1} onClick={() => move(i, 1)} className="rounded-full p-2 text-ink-400 hover:bg-ink-100 disabled:opacity-30" aria-label="Move down"><ArrowDown size={15} /></button>
                <button
                  disabled={!!x.key && inUse(x.key) > 0}
                  title={x.key && inUse(x.key) ? 'In use. Turn it off instead.' : 'Remove'}
                  onClick={() => setList((xs) => xs.filter((_, j) => j !== i))}
                  className="rounded-full p-2 text-ink-400 hover:bg-rose-50 hover:text-rose-600 disabled:opacity-30"
                  aria-label="Remove service"
                >
                  <Trash2 size={15} />
                </button>
              </div>
            )}
          </div>
        ))}
      </div>
      {manage && (
        <div className="mt-6 flex justify-end">
          <Button onClick={save} disabled={busy}>{busy ? 'Saving…' : 'Save services'}</Button>
        </div>
      )}
    </Card>
  );
};
