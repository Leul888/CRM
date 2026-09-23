import React, { useMemo, useState } from 'react';
import { ArrowRight, CalendarCheck2, CheckCircle2, Download } from 'lucide-react';
import type { ServiceType } from '../types';
import { store, type BookingResult } from '../store';
import { Button, Field, Input, Select, Textarea } from './SharedComponents';
import { dateTime, downloadFile, isEmail, toLocalInput } from '../services/format';
import { buildIcs } from '../services/calendarService';
import { serviceLabel } from '../services/catalog';

const defaultSlot = () => {
  const d = new Date();
  d.setDate(d.getDate() + 2);
  d.setHours(10, 0, 0, 0);
  return toLocalInput(d.toISOString());
};


export const BookingForm: React.FC<{ tone?: 'light' | 'dark' }> = ({ tone = 'light' }) => {
  const [form, setForm] = useState({
    firstName: '',
    lastName: '',
    email: '',
    phone: '',
    address: '',
    serviceType: (store.services[0]?.key || '') as ServiceType,
    budget: '15000',
    preferredDateTime: defaultSlot(),
    notes: '',
    consent: true,
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<BookingResult | null>(null);
  const [serverError, setServerError] = useState('');
  const [hp, setHp] = useState('');

  const minSlot = useMemo(() => toLocalInput(new Date(Date.now() + 2 * 3600_000).toISOString()), []);
  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.type === 'checkbox' ? (e.target as HTMLInputElement).checked : e.target.value }));

  const validate = () => {
    const e: Record<string, string> = {};
    if (!form.firstName.trim()) e.firstName = 'Required';
    if (!form.lastName.trim()) e.lastName = 'Required';
    if (!isEmail(form.email)) e.email = 'Enter a valid email';
    if (form.phone.replace(/\D/g, '').length < 7) e.phone = 'Enter a valid phone';
    if (form.address.trim().length < 5) e.address = 'Where is the project?';
    if (!form.preferredDateTime) e.preferredDateTime = 'Pick a time';
    else if (new Date(form.preferredDateTime) < new Date()) e.preferredDateTime = 'Choose a future time';
    const hour = new Date(form.preferredDateTime).getHours();
    if (form.preferredDateTime && (hour < 8 || hour > 17)) e.preferredDateTime = 'Visits run 8am – 6pm';
    if (!form.consent) e.consent = 'Please agree to be contacted';
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const submit = async (ev: React.FormEvent) => {
    ev.preventDefault();
    if (!validate()) return;
    setSubmitting(true);
    setServerError('');
    try {
      const res = await store.book({
        name: `${form.firstName.trim()} ${form.lastName.trim()}`,
        email: form.email,
        phone: form.phone,
        address: form.address,
        budget: Number(form.budget) || 0,
        serviceType: form.serviceType,
        preferredDateTime: new Date(form.preferredDateTime).toISOString(),
        notes: form.notes,
        website: hp,
      });
      setResult(res);
    } catch (err) {
      setServerError(err instanceof Error ? err.message : 'Something went wrong. Please call us.');
    } finally {
      setSubmitting(false);
    }
  };

  const dark = tone === 'dark';

  if (result) {
    const ics = () =>
      downloadFile(
        'estimate-visit.ics',
        buildIcs({
          uid: result.appointment.id,
          title: `${store.config?.companyName || 'Company X'} — ${serviceLabel(result.appointment.serviceType)} estimate`,
          description: `On-site estimate with ${result.estimatorName || 'our estimator'}.`,
          location: result.lead.address,
          start: result.appointment.startTime,
          end: result.appointment.endTime,
        }),
        'text/calendar',
      );
    return (
      <div className="animate-fade-up rounded-3xl bg-white p-8 text-ink-900 shadow-pop">
        <div className="flex h-12 w-12 items-center justify-center rounded-full bg-emerald-50 text-emerald-600">
          <CheckCircle2 size={26} />
        </div>
        <h3 className="mt-5 text-2xl font-bold text-ink-950">You're on the calendar.</h3>
        <p className="mt-2 text-[15px] leading-relaxed text-ink-600">
          Thanks, {result.lead.name.split(' ')[0]}. We've requested <strong>{dateTime(result.appointment.startTime)}</strong> for your{' '}
          {serviceLabel(result.appointment.serviceType).toLowerCase()} estimate
          {result.estimatorName ? (
            <>
              {' '}
              with <strong>{result.estimatorName}</strong>
            </>
          ) : null}
          . A confirmation is on its way to {result.lead.email}.
        </p>
        <ul className="mt-6 space-y-2.5 text-sm text-ink-600">
          {['We confirm the visit by phone within one business day', 'Your estimator measures and scopes on-site (about 45 minutes)', 'You get an itemized estimate to e-sign — no pressure'].map((t) => (
            <li key={t} className="flex gap-2.5">
              <CalendarCheck2 size={16} className="mt-0.5 shrink-0 text-brand-600" />
              {t}
            </li>
          ))}
        </ul>
        <div className="mt-7 flex flex-wrap gap-2">
          <Button variant="outline" icon={<Download size={16} />} onClick={ics}>
            Add to calendar
          </Button>
          <Button variant="ghost" onClick={() => setResult(null)}>
            Submit another request
          </Button>
        </div>
      </div>
    );
  }

  return (
    <form
      onSubmit={submit}
      noValidate
      className={`rounded-3xl p-6 sm:p-8 ${dark ? 'bg-white text-ink-900 shadow-pop' : 'border border-ink-200 bg-white shadow-card'}`}
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="First name" error={errors.firstName}>
          <Input value={form.firstName} onChange={set('firstName')} autoComplete="given-name" placeholder="Jane" />
        </Field>
        <Field label="Last name" error={errors.lastName}>
          <Input value={form.lastName} onChange={set('lastName')} autoComplete="family-name" placeholder="Doe" />
        </Field>
        <Field label="Email" error={errors.email}>
          <Input type="email" value={form.email} onChange={set('email')} autoComplete="email" placeholder="jane@email.com" />
        </Field>
        <Field label="Phone" error={errors.phone}>
          <Input type="tel" value={form.phone} onChange={set('phone')} autoComplete="tel" placeholder="(555) 555-0123" />
        </Field>
        <Field label="Project address" error={errors.address} className="sm:col-span-2">
          <Input value={form.address} onChange={set('address')} autoComplete="street-address" placeholder="123 Maple St, Hartford, CT" />
        </Field>
        <Field label="What are you planning?">
          <Select value={form.serviceType} onChange={set('serviceType')} options={store.services.map((x) => ({ value: x.key, label: x.label }))} />
        </Field>
        <Field label="Budget range">
          <Select
            value={form.budget}
            onChange={set('budget')}
            options={[
              { value: '3000', label: 'Under $5k' },
              { value: '8000', label: '$5k – $10k' },
              { value: '15000', label: '$10k – $25k' },
              { value: '35000', label: '$25k – $50k' },
              { value: '60000', label: '$50k+' },
            ]}
          />
        </Field>
        <Field label="Preferred visit time" error={errors.preferredDateTime} className="sm:col-span-2" hint="Mon–Sat, 8am – 6pm. We'll confirm or suggest the closest slot.">
          <Input type="datetime-local" min={minSlot} value={form.preferredDateTime} onChange={set('preferredDateTime')} />
        </Field>
        <Field label="Anything we should know? (optional)" className="sm:col-span-2">
          <Textarea value={form.notes} onChange={set('notes')} placeholder="Rooms, square footage, materials you love, timing…" />
        </Field>
      </div>
      <label className="mt-4 flex items-start gap-2.5 text-xs text-ink-500">
        <input type="checkbox" checked={form.consent} onChange={set('consent')} className="mt-0.5 h-4 w-4 rounded border-ink-300 accent-brand-600" />
        <span>
          I agree to be contacted by email, phone or SMS about my project. {errors.consent && <span className="font-semibold text-rose-600">{errors.consent}</span>}
        </span>
      </label>
      <input type="text" name="website" value={hp} onChange={(e) => setHp(e.target.value)} tabIndex={-1} autoComplete="off" aria-hidden className="absolute left-[-9999px] h-0 w-0 opacity-0" />
      {serverError && <p className="mt-4 rounded-xl bg-rose-50 px-4 py-3 text-sm font-medium text-rose-700">{serverError}</p>}
      <Button type="submit" size="lg" className="mt-6 w-full" disabled={submitting} icon={!submitting ? undefined : undefined}>
        {submitting ? 'Booking your visit…' : 'Book my free estimate'}
        {!submitting && <ArrowRight size={18} />}
      </Button>
      <p className="mt-3 text-center text-xs text-ink-400">Free · No obligation · You leave with a clear, itemized number</p>
    </form>
  );
};

export default BookingForm;
