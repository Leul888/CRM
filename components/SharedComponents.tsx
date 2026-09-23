import React, { useEffect, useSyncExternalStore } from 'react';
import { CheckCircle2, Info, Search, X, XCircle } from 'lucide-react';
import { store } from '../store';
import { humanize, initials } from '../services/format';

// ---------- store hook ----------
let version = 0;
store.subscribe(() => {
  version += 1;
});
/** Re-render on any store change. */
export const useStore = () => {
  useSyncExternalStore(
    (cb) => store.subscribe(cb),
    () => version,
  );
  return store;
};

// ---------- brand ----------
const Wordmark: React.FC<{ dark?: boolean }> = ({ dark }) => {
  const s = useStore();
  const name = (s.me ? s.state.settings.companyName : s.config?.companyName) || s.config?.companyName || 'Company X';
  const parts = name.trim().split(/\s+/);
  const last = parts.length > 1 ? parts.pop() : '';
  return (
    <span className={`max-w-[220px] truncate font-display text-[17px] font-bold tracking-tight ${dark ? 'text-white' : 'text-ink-950'}`}>
      {parts.join(' ')}
      {last ? <span className={dark ? 'text-brand-300' : 'text-brand-600'}> {last}</span> : null}
    </span>
  );
};

export const Logo: React.FC<{ dark?: boolean; compact?: boolean }> = ({ dark, compact }) => {
  const s = useStore();
  const logo = s.logoUrl;
  return (
    <span className="inline-flex items-center gap-2.5">
      {logo ? (
        <img src={logo} alt="" className={`h-9 w-9 shrink-0 rounded-[10px] object-contain ${dark ? 'bg-white p-1' : ''}`} />
      ) : (
        <span className="relative flex h-9 w-9 shrink-0 items-center justify-center rounded-[10px] bg-gradient-to-br from-brand-500 to-brand-700 shadow-glow">
          <svg viewBox="0 0 32 32" className="h-5 w-5" aria-hidden>
            <path d="M7 24V13.5L16 6.5l9 7V24h-5.5v-6.5h-7V24z" fill="#fff" />
          </svg>
        </span>
      )}
      {!compact && <Wordmark dark={dark} />}
    </span>
  );
};

// ---------- buttons ----------
type ButtonVariant = 'primary' | 'secondary' | 'outline' | 'ghost' | 'danger' | 'dark' | 'light';
const variants: Record<ButtonVariant, string> = {
  primary: 'bg-brand-600 text-white hover:bg-brand-700 shadow-[0_8px_24px_-10px_rgb(var(--brand-600)/0.7)]',
  secondary: 'bg-brand-50 text-brand-700 hover:bg-brand-100',
  outline: 'border border-ink-200 bg-white text-ink-800 hover:border-ink-300 hover:bg-ink-50',
  ghost: 'text-ink-600 hover:bg-ink-100 hover:text-ink-900',
  danger: 'bg-rose-600 text-white hover:bg-rose-700',
  dark: 'bg-brand-700 text-white hover:bg-brand-800',
  light: 'bg-white text-ink-950 hover:bg-brand-50',
};
const sizes = {
  sm: 'h-8 px-3 text-xs gap-1.5',
  md: 'h-10 px-4 text-sm gap-2',
  lg: 'h-12 px-6 text-[15px] gap-2',
};

export const Button: React.FC<
  React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: ButtonVariant; size?: keyof typeof sizes; icon?: React.ReactNode }
> = ({ variant = 'primary', size = 'md', icon, className = '', children, type = 'button', ...rest }) => (
  <button
    type={type}
    className={`inline-flex shrink-0 items-center justify-center rounded-full font-semibold transition focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-brand-500/25 disabled:cursor-not-allowed disabled:opacity-50 ${variants[variant]} ${sizes[size]} ${className}`}
    {...rest}
  >
    {icon}
    {children}
  </button>
);

export const IconButton: React.FC<React.ButtonHTMLAttributes<HTMLButtonElement> & { label: string }> = ({ label, className = '', children, ...rest }) => (
  <button
    type="button"
    aria-label={label}
    title={label}
    className={`inline-flex h-9 w-9 items-center justify-center rounded-full text-ink-500 transition hover:bg-ink-100 hover:text-ink-900 ${className}`}
    {...rest}
  >
    {children}
  </button>
);

// ---------- badges ----------
const tone: Record<string, string> = {
  violet: 'bg-brand-50 text-brand-700 ring-brand-200',
  green: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
  amber: 'bg-amber-50 text-amber-800 ring-amber-200',
  red: 'bg-rose-50 text-rose-700 ring-rose-200',
  blue: 'bg-sky-50 text-sky-700 ring-sky-200',
  gray: 'bg-ink-50 text-ink-600 ring-ink-200',
  dark: 'bg-brand-600 text-white ring-brand-600',
};
const statusTone: Record<string, keyof typeof tone> = {
  NEW: 'violet', CONTACTED: 'blue', SCHEDULED: 'blue', ESTIMATE_SENT: 'amber', APPROVED: 'green', JOB_SCHEDULED: 'violet',
  IN_PROGRESS: 'amber', COMPLETED: 'green', INVOICED: 'blue', PAID: 'green', LOST: 'red',
  REQUESTED: 'amber', CONFIRMED: 'green', CANCELLED: 'gray', PENDING: 'gray', QUEUED: 'amber', SENT: 'blue', FAILED: 'red',
  DRAFT: 'gray', REJECTED: 'red', EXPIRED: 'gray', PARTIALLY_PAID: 'amber', OVERDUE: 'red', DECLINED: 'red',
  ASSIGNED: 'violet', ACCEPTED: 'blue', IN_STOCK: 'green', LOW_STOCK: 'amber', OUT_OF_STOCK: 'red',
  OWNER: 'dark', MANAGER: 'violet', OFFICE_MANAGER: 'violet', DISPATCHER: 'blue', SALES_REP: 'blue', ESTIMATOR: 'green', WORKER: 'gray', SUBCONTRACTOR: 'gray',
  RENOVATION_QUALIFIED: 'violet', ACTIVE: 'green', INACTIVE: 'gray', LOGGED: 'gray',
};

export const Badge: React.FC<{ value: string; tone?: keyof typeof tone; label?: string; dot?: boolean }> = ({ value, tone: t, label, dot = true }) => {
  const cls = tone[t || statusTone[value] || 'gray'];
  return (
    <span className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-0.5 text-[11px] font-semibold ring-1 ring-inset ${cls}`}>
      {dot && <span className="h-1.5 w-1.5 rounded-full bg-current opacity-70" />}
      {label || humanize(value)}
    </span>
  );
};

export const Avatar: React.FC<{ name: string; color?: string; size?: 'sm' | 'md' | 'lg' }> = ({ name, color, size = 'md' }) => {
  const s = size === 'sm' ? 'h-7 w-7 text-[10px]' : size === 'lg' ? 'h-12 w-12 text-sm' : 'h-9 w-9 text-xs';
  return (
    <span
      className={`inline-flex shrink-0 items-center justify-center rounded-full font-semibold text-white ${s}`}
      style={{ background: color || 'linear-gradient(135deg, rgb(var(--brand-500)), rgb(var(--brand-700)))' }}
    >
      {initials(name)}
    </span>
  );
};

// ---------- layout ----------
export const Card: React.FC<React.HTMLAttributes<HTMLDivElement> & { padded?: boolean }> = ({ padded = true, className = '', children, ...rest }) => (
  <div className={`card ${padded ? 'p-5 sm:p-6' : ''} ${className}`} {...rest}>
    {children}
  </div>
);

export const PageHeader: React.FC<{ eyebrow?: string; title: string; description?: string; actions?: React.ReactNode }> = ({ eyebrow, title, description, actions }) => (
  <div className="mb-8 flex flex-col gap-5 md:flex-row md:items-end md:justify-between">
    <div className="max-w-2xl">
      {eyebrow && <div className="eyebrow eyebrow-dot mb-3">{eyebrow}</div>}
      <h1 className="text-3xl font-bold text-ink-950 sm:text-[34px] sm:leading-[1.1]">{title}</h1>
      {description && <p className="mt-2 text-[15px] leading-relaxed text-ink-500">{description}</p>}
    </div>
    {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
  </div>
);

export const StatCard: React.FC<{ label: string; value: string; hint?: string; icon?: React.ReactNode; accent?: boolean; onClick?: () => void }> = ({
  label,
  value,
  hint,
  icon,
  accent,
  onClick,
}) => (
  <button
    type="button"
    onClick={onClick}
    disabled={!onClick}
    className={`group relative overflow-hidden rounded-2xl border p-5 text-left transition disabled:cursor-default ${
      accent
        ? 'border-brand-700 bg-gradient-to-br from-brand-600 to-brand-800 text-white shadow-glow'
        : 'border-ink-200/80 bg-white shadow-card enabled:hover:-translate-y-0.5 enabled:hover:border-brand-200'
    }`}
  >
    <div className="flex items-center justify-between">
      <span className={`text-xs font-semibold uppercase tracking-[0.14em] ${accent ? 'text-brand-100' : 'text-ink-500'}`}>{label}</span>
      {icon && <span className={`flex h-8 w-8 items-center justify-center rounded-full ${accent ? 'bg-white/15 text-white' : 'bg-brand-50 text-brand-600'}`}>{icon}</span>}
    </div>
    <div className={`mt-4 font-display text-[32px] font-bold leading-none tracking-tight ${accent ? 'text-white' : 'text-ink-950'}`}>{value}</div>
    {hint && <div className={`mt-2 text-xs font-medium ${accent ? 'text-brand-100' : 'text-ink-500'}`}>{hint}</div>}
  </button>
);

export const EmptyState: React.FC<{ icon?: React.ReactNode; title: string; description?: string; action?: React.ReactNode }> = ({ icon, title, description, action }) => (
  <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-ink-200 bg-ink-50/50 px-6 py-14 text-center">
    {icon && <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-brand-50 text-brand-600">{icon}</div>}
    <div className="font-display text-lg font-semibold text-ink-900">{title}</div>
    {description && <p className="mt-1 max-w-sm text-sm text-ink-500">{description}</p>}
    {action && <div className="mt-5">{action}</div>}
  </div>
);

export const Tabs: React.FC<{ value: string; onChange: (v: string) => void; items: Array<{ value: string; label: string; count?: number }> }> = ({ value, onChange, items }) => (
  <div className="inline-flex flex-wrap gap-1 rounded-full bg-ink-100 p-1">
    {items.map((i) => (
      <button
        key={i.value}
        type="button"
        onClick={() => onChange(i.value)}
        className={`inline-flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-xs font-semibold transition ${
          value === i.value ? 'bg-white text-ink-950 shadow-sm' : 'text-ink-500 hover:text-ink-900'
        }`}
      >
        {i.label}
        {i.count !== undefined && <span className={`rounded-full px-1.5 text-[10px] ${value === i.value ? 'bg-brand-100 text-brand-700' : 'bg-ink-200 text-ink-600'}`}>{i.count}</span>}
      </button>
    ))}
  </div>
);

export const SearchInput: React.FC<{ value: string; onChange: (v: string) => void; placeholder?: string; className?: string }> = ({ value, onChange, placeholder, className = '' }) => (
  <label className={`relative block ${className}`}>
    <Search size={16} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-ink-400" />
    <input className="field !rounded-full pl-10" value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder || 'Search…'} />
  </label>
);

// ---------- form fields ----------
export const Field: React.FC<{ label: string; hint?: string; error?: string; children: React.ReactNode; className?: string }> = ({ label, hint, error, children, className = '' }) => (
  <label className={`block ${className}`}>
    <span className="label">{label}</span>
    {children}
    {error ? <span className="mt-1 block text-xs font-medium text-rose-600">{error}</span> : hint ? <span className="mt-1 block text-xs text-ink-400">{hint}</span> : null}
  </label>
);

export const Input = (props: React.InputHTMLAttributes<HTMLInputElement>) => <input {...props} className={`field ${props.className || ''}`} />;
export const Textarea = (props: React.TextareaHTMLAttributes<HTMLTextAreaElement>) => <textarea rows={3} {...props} className={`field ${props.className || ''}`} />;
export const Select: React.FC<React.SelectHTMLAttributes<HTMLSelectElement> & { options: Array<{ value: string; label: string }>; placeholder?: string }> = ({
  options,
  placeholder,
  className = '',
  ...rest
}) => (
  <select {...rest} className={`field appearance-none bg-[url('data:image/svg+xml;utf8,<svg xmlns=%22http://www.w3.org/2000/svg%22 width=%2212%22 height=%2212%22 viewBox=%220 0 24 24%22 fill=%22none%22 stroke=%22%236f6f8a%22 stroke-width=%222.5%22><path d=%22m6 9 6 6 6-6%22/></svg>')] bg-[length:12px] bg-[right_14px_center] bg-no-repeat pr-9 ${className}`}>
    {placeholder !== undefined && <option value="">{placeholder}</option>}
    {options.map((o) => (
      <option key={o.value} value={o.value}>
        {o.label}
      </option>
    ))}
  </select>
);

// ---------- overlays ----------
const useEscape = (onClose: () => void) => {
  useEffect(() => {
    const h = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', h);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', h);
      document.body.style.overflow = prev;
    };
  }, [onClose]);
};

export const Modal: React.FC<{ title: string; description?: string; onClose: () => void; children: React.ReactNode; footer?: React.ReactNode; size?: 'md' | 'lg' | 'xl' }> = ({
  title,
  description,
  onClose,
  children,
  footer,
  size = 'md',
}) => {
  useEscape(onClose);
  const w = size === 'xl' ? 'max-w-5xl' : size === 'lg' ? 'max-w-3xl' : 'max-w-xl';
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center p-0 sm:items-center sm:p-6" role="dialog" aria-modal aria-label={title}>
      <div className="absolute inset-0 bg-ink-950/50 backdrop-blur-sm" onClick={onClose} />
      <div className={`relative flex max-h-[92vh] w-full ${w} animate-fade-up flex-col overflow-hidden rounded-t-3xl bg-white shadow-pop sm:rounded-3xl`}>
        <div className="flex items-start justify-between gap-4 border-b border-ink-100 px-6 py-5">
          <div>
            <h2 className="text-xl font-bold text-ink-950">{title}</h2>
            {description && <p className="mt-1 text-sm text-ink-500">{description}</p>}
          </div>
          <IconButton label="Close" onClick={onClose}>
            <X size={18} />
          </IconButton>
        </div>
        <div className="flex-1 overflow-y-auto px-6 py-5">{children}</div>
        {footer && <div className="flex flex-wrap justify-end gap-2 border-t border-ink-100 bg-ink-50/60 px-6 py-4">{footer}</div>}
      </div>
    </div>
  );
};

export const Drawer: React.FC<{ title: React.ReactNode; subtitle?: React.ReactNode; onClose: () => void; children: React.ReactNode; footer?: React.ReactNode }> = ({
  title,
  subtitle,
  onClose,
  children,
  footer,
}) => {
  useEscape(onClose);
  return (
    <div className="fixed inset-0 z-50" role="dialog" aria-modal>
      <div className="absolute inset-0 bg-ink-950/40 backdrop-blur-[2px]" onClick={onClose} />
      <aside className="absolute inset-y-0 right-0 flex w-full max-w-xl animate-slide-in flex-col bg-white shadow-pop">
        <div className="flex items-start justify-between gap-4 border-b border-ink-100 px-6 py-5">
          <div className="min-w-0">
            <div className="truncate font-display text-xl font-bold text-ink-950">{title}</div>
            {subtitle && <div className="mt-1 text-sm text-ink-500">{subtitle}</div>}
          </div>
          <IconButton label="Close" onClick={onClose}>
            <X size={18} />
          </IconButton>
        </div>
        <div className="flex-1 overflow-y-auto px-6 py-5">{children}</div>
        {footer && <div className="flex flex-wrap gap-2 border-t border-ink-100 px-6 py-4">{footer}</div>}
      </aside>
    </div>
  );
};

export const ConfirmDialog: React.FC<{ title: string; message: string; confirmLabel?: string; onConfirm: () => void; onClose: () => void }> = ({
  title,
  message,
  confirmLabel = 'Delete',
  onConfirm,
  onClose,
}) => (
  <Modal
    title={title}
    onClose={onClose}
    footer={
      <>
        <Button variant="outline" onClick={onClose}>
          Cancel
        </Button>
        <Button
          variant="danger"
          onClick={() => {
            onConfirm();
            onClose();
          }}
        >
          {confirmLabel}
        </Button>
      </>
    }
  >
    <p className="text-sm text-ink-600">{message}</p>
  </Modal>
);

export const Toaster: React.FC = () => {
  const s = useStore();
  return (
    <div className="pointer-events-none fixed bottom-4 right-4 z-[60] flex w-[calc(100%-2rem)] max-w-sm flex-col gap-2 no-print">
      {s.toasts.map((t) => (
        <div key={t.id} className="pointer-events-auto flex animate-fade-up items-start gap-3 rounded-2xl border border-ink-200 bg-white px-4 py-3 text-sm font-medium text-ink-900 shadow-pop">
          {t.kind === 'success' ? <CheckCircle2 size={18} className="mt-0.5 shrink-0 text-emerald-500" /> : t.kind === 'error' ? <XCircle size={18} className="mt-0.5 shrink-0 text-rose-400" /> : <Info size={18} className="mt-0.5 shrink-0 text-brand-500" />}
          <span className="flex-1">{t.message}</span>
          <button onClick={() => s.dismissToast(t.id)} className="text-ink-400 hover:text-ink-900" aria-label="Dismiss">
            <X size={14} />
          </button>
        </div>
      ))}
    </div>
  );
};

/** Await a server action, then toast on success. Errors already toast inside the store. */
export const run = async <T,>(p: Promise<T>, success?: string): Promise<T> => {
  const r = await p;
  if (success) store.toast(success);
  return r;
};

export const copyToClipboard = async (text: string, label = 'Link copied to clipboard') => {
  try {
    await navigator.clipboard.writeText(text);
    store.toast(label);
  } catch {
    window.prompt('Copy this:', text);
  }
};

export const Table: React.FC<{ head: React.ReactNode; children: React.ReactNode; className?: string }> = ({ head, children, className = '' }) => (
  <div className={`card overflow-hidden ${className}`}>
    <div className="overflow-x-auto">
      <table className="min-w-full divide-y divide-ink-100">
        <thead className="bg-ink-50/70">{head}</thead>
        <tbody className="divide-y divide-ink-100">{children}</tbody>
      </table>
    </div>
  </div>
);

export const DetailRow: React.FC<{ label: string; children: React.ReactNode }> = ({ label, children }) => (
  <div className="flex items-start justify-between gap-4 py-2.5 text-sm">
    <span className="shrink-0 text-ink-500">{label}</span>
    <span className="text-right font-medium text-ink-900">{children}</span>
  </div>
);

export const ProgressBar: React.FC<{ value: number; className?: string }> = ({ value, className = '' }) => (
  <div className={`h-1.5 w-full overflow-hidden rounded-full bg-ink-100 ${className}`}>
    <div className="h-full rounded-full bg-gradient-to-r from-brand-500 to-brand-700 transition-all" style={{ width: `${Math.max(0, Math.min(100, value))}%` }} />
  </div>
);
