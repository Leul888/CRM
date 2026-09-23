
export const money = (value: number, digits = 2) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: digits, maximumFractionDigits: digits }).format(
    Number.isFinite(value) ? value : 0,
  );

export const moneyShort = (value: number) =>
  value >= 1_000_000 ? `$${(value / 1_000_000).toFixed(1)}M` : value >= 1000 ? `$${(value / 1000).toFixed(1)}k` : money(value, 0);

export const humanize = (value: string) =>
  value
    .toLowerCase()
    .split('_')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');

export const date = (iso?: string) =>
  iso ? new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '—';

export const dateTime = (iso?: string) =>
  iso
    ? new Date(iso).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
    : '—';

export const time = (iso: string) => new Date(iso).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });

export const relative = (iso: string) => {
  const diff = (new Date(iso).getTime() - Date.now()) / 1000;
  const abs = Math.abs(diff);
  const rtf = new Intl.RelativeTimeFormat('en', { numeric: 'auto' });
  if (abs < 60) return 'just now';
  if (abs < 3600) return rtf.format(Math.round(diff / 60), 'minute');
  if (abs < 86400) return rtf.format(Math.round(diff / 3600), 'hour');
  return rtf.format(Math.round(diff / 86400), 'day');
};

export const toLocalInput = (iso?: string) => {
  if (!iso) return '';
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

export const toDateInput = (iso?: string) => toLocalInput(iso).slice(0, 10);

export const fromLocalInput = (value: string) => (value ? new Date(value).toISOString() : '');

/** Keys of the default catalog (used for seed data). */
export const SERVICE_TYPES: string[] = [
  'FLOORING_REPLACEMENT',
  'COUNTERTOP_REPLACEMENT',
  'INTERIOR_PAINT',
  'KITCHEN_RENOVATION',
  'BATHROOM_RENOVATION',
];

export const initials = (name: string) =>
  name
    .split(' ')
    .map((p) => p[0])
    .filter(Boolean)
    .slice(0, 2)
    .join('')
    .toUpperCase();

export const downloadFile = (filename: string, content: string, mime = 'text/plain') => {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
};

export const toCsv = (rows: Array<Record<string, unknown>>) => {
  if (!rows.length) return '';
  const headers = Object.keys(rows[0]);
  const cell = (v: unknown) => {
    const s = v == null ? '' : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return [headers.join(','), ...rows.map((r) => headers.map((h) => cell(r[h])).join(','))].join('\n');
};

export const isEmail = (v: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.trim());
