import React, { useMemo, useRef, useState } from 'react';
import { Download, FileSpreadsheet, Upload } from 'lucide-react';
import type { Lead } from '../types';
import { Button, Modal, Select, useStore } from './SharedComponents';
import { downloadFile } from '../services/format';

/** RFC 4180-ish CSV parser: quotes, escaped quotes, commas/newlines inside quotes, BOM. */
export const parseCsv = (text: string): string[][] => {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let quoted = false;
  const src = text.replace(/^\uFEFF/, '');
  const firstLine = src.split(/\r?\n/, 1)[0] || '';
  const delim = [',', ';', '\t'].map((d) => [d, firstLine.split(d).length] as const).sort((x, y) => y[1] - x[1])[0][0];
  for (let i = 0; i < src.length; i += 1) {
    const ch = src[i];
    if (quoted) {
      if (ch === '"' && src[i + 1] === '"') {
        cell += '"';
        i += 1;
      } else if (ch === '"') quoted = false;
      else cell += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === delim) {
      row.push(cell);
      cell = '';
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && src[i + 1] === '\n') i += 1;
      row.push(cell);
      if (row.some((c) => c.trim())) rows.push(row);
      row = [];
      cell = '';
    } else cell += ch;
  }
  row.push(cell);
  if (row.some((c) => c.trim())) rows.push(row);
  return rows;
};

type FieldKey = 'name' | 'firstName' | 'lastName' | 'email' | 'phone' | 'address' | 'city' | 'state' | 'zip' | 'serviceType' | 'budget' | 'status' | 'source' | 'notes' | 'createdAt' | '';

const FIELDS: Array<{ key: FieldKey; label: string; match: RegExp }> = [
  { key: 'name', label: 'Full name', match: /^(full ?name|name|customer|client|contact)( name)?$/i },
  { key: 'firstName', label: 'First name', match: /^first ?name$/i },
  { key: 'lastName', label: 'Last name', match: /^(last ?name|surname)$/i },
  { key: 'email', label: 'Email', match: /e-?mail/i },
  { key: 'phone', label: 'Phone', match: /phone|mobile|cell|tel/i },
  { key: 'address', label: 'Street address', match: /address|street/i },
  { key: 'city', label: 'City', match: /^city$/i },
  { key: 'state', label: 'State', match: /^(state|province|region)$/i },
  { key: 'zip', label: 'ZIP', match: /zip|postal/i },
  { key: 'serviceType', label: 'Service', match: /service|project ?type|job ?type|work ?type/i },
  { key: 'budget', label: 'Budget / value', match: /budget|value|amount|price/i },
  { key: 'status', label: 'Status / stage', match: /status|stage/i },
  { key: 'source', label: 'Source', match: /source|channel|referr/i },
  { key: 'notes', label: 'Notes', match: /note|comment|description|detail/i },
  { key: 'createdAt', label: 'Created date', match: /created|date/i },
];

const STATUS_WORDS: Array<[RegExp, Lead['status']]> = [
  [/lost|dead|declin/i, 'LOST'],
  [/paid|closed ?won|won/i, 'PAID'],
  [/invoic/i, 'INVOICED'],
  [/complete|done|finished/i, 'COMPLETED'],
  [/progress|active job/i, 'IN_PROGRESS'],
  [/approv|signed/i, 'APPROVED'],
  [/estimate|quote|proposal/i, 'ESTIMATE_SENT'],
  [/schedul|appointment/i, 'SCHEDULED'],
  [/contact|follow/i, 'CONTACTED'],
];
const SOURCE_WORDS: Array<[RegExp, Lead['source']]> = [
  [/web|online|site|form/i, 'WEBSITE'],
  [/call|phone/i, 'CALL_CENTER'],
  [/social|facebook|instagram|google|yelp|angi|houzz/i, 'SOCIAL_MEDIA'],
  [/referr|friend|neighbou?r/i, 'REFERRAL'],
];

const TEMPLATE = 'Name,Email,Phone,Address,City,State,ZIP,Service,Budget,Status,Source,Notes\nJane Doe,jane@example.com,555-555-0100,12 Oak St,Hartford,CT,06103,Kitchen renovation,25000,New,Referral,Wants an island\n';

const ImportCustomers: React.FC<{ onClose: () => void }> = ({ onClose }) => {
  const s = useStore();
  const fileRef = useRef<HTMLInputElement>(null);
  const [fileName, setFileName] = useState('');
  const [rows, setRows] = useState<string[][]>([]);
  const [map, setMap] = useState<FieldKey[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const header = rows[0] || [];
  const body = rows.slice(1);

  const load = async (f?: File) => {
    if (!f) return;
    setError('');
    if (f.size > 5 * 1024 * 1024) return setError('File is larger than 5 MB. Split it into smaller files.');
    const parsed = parseCsv(await f.text());
    if (parsed.length < 2) return setError('No rows found. Save your spreadsheet as CSV with a header row.');
    setFileName(f.name);
    setRows(parsed);
    const used = new Set<FieldKey>();
    setMap(
      parsed[0].map((h) => {
        const field = FIELDS.find((x) => !used.has(x.key) && x.match.test(h.trim()));
        if (field) used.add(field.key);
        return field?.key || '';
      }),
    );
  };

  const serviceFor = (v: string) => {
    const t = v.trim().toLowerCase();
    if (!t) return undefined;
    return (
      s.services.find((x) => x.label.toLowerCase() === t || x.key.toLowerCase() === t.replace(/\s+/g, '_'))?.key ||
      s.services.find((x) => t.includes(x.label.toLowerCase().split(' ')[0]))?.key
    );
  };

  const mapped = useMemo(
    () =>
      body.map((r) => {
        const get = (k: FieldKey) => {
          const i = map.indexOf(k);
          return i >= 0 ? (r[i] || '').trim() : '';
        };
        const name = get('name') || [get('firstName'), get('lastName')].filter(Boolean).join(' ');
        const address = [get('address'), get('city'), [get('state'), get('zip')].filter(Boolean).join(' ')].filter(Boolean).join(', ');
        const status = STATUS_WORDS.find(([re]) => re.test(get('status')))?.[1] || 'NEW';
        const source = SOURCE_WORDS.find(([re]) => re.test(get('source')))?.[1] || 'MANUAL';
        const created = get('createdAt');
        return {
          name,
          email: get('email'),
          phone: get('phone'),
          address,
          serviceType: serviceFor(get('serviceType')),
          budget: Number(get('budget').replace(/[^0-9.]/g, '')) || 0,
          status,
          source,
          notes: get('notes'),
          createdAt: created && !isNaN(Date.parse(created)) ? new Date(created).toISOString() : undefined,
        } as Partial<Lead>;
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [rows, map, s.services],
  );
  const valid = mapped.filter((m) => m.name && (m.email || m.phone));
  const hasName = map.includes('name') || map.includes('firstName');

  const run = async () => {
    setBusy(true);
    try {
      const r = await s.importLeads(valid);
      s.toast(`${r.created} customer${r.created === 1 ? '' : 's'} imported${r.skipped ? `, ${r.skipped} skipped (duplicates or missing contact info)` : ''}.`);
      onClose();
    } catch {
      /* toast shown by store */
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      title="Import customers"
      description="Bring in existing customers and leads from a spreadsheet (CSV). Duplicates by email or name + phone are skipped."
      size="xl"
      onClose={onClose}
      footer={
        <>
          <Button variant="ghost" icon={<Download size={15} />} onClick={() => downloadFile('customer-import-template.csv', TEMPLATE, 'text/csv')} className="mr-auto">
            Download template
          </Button>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={run} disabled={busy || !valid.length || !hasName}>{busy ? 'Importing…' : `Import ${valid.length} customer${valid.length === 1 ? '' : 's'}`}</Button>
        </>
      }
    >
      {!rows.length ? (
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            e.preventDefault();
            void load(e.dataTransfer.files[0]);
          }}
          className="flex w-full flex-col items-center justify-center rounded-3xl border-2 border-dashed border-brand-200 bg-brand-50/40 px-6 py-16 text-center transition hover:border-brand-400"
        >
          <FileSpreadsheet size={32} className="text-brand-600" />
          <div className="mt-4 font-display text-lg font-semibold text-ink-900">Drop a CSV file here or click to choose</div>
          <p className="mt-1 max-w-md text-sm text-ink-500">From Excel or Google Sheets use File → Download/Save as → CSV. Exports from other CRMs work too.</p>
        </button>
      ) : (
        <div>
          <div className="mb-4 flex flex-wrap items-center justify-between gap-2 text-sm">
            <span className="font-semibold text-ink-900">{fileName} · {body.length} rows</span>
            <Button size="sm" variant="ghost" icon={<Upload size={14} />} onClick={() => fileRef.current?.click()}>Choose another file</Button>
          </div>
          <div className="eyebrow mb-2">Match your columns</div>
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {header.map((h, i) => (
              <label key={`${h}-${i}`} className="flex items-center gap-2 rounded-xl border border-ink-200 px-3 py-2">
                <span className="min-w-0 flex-1 truncate text-sm font-medium text-ink-800" title={h}>{h || `Column ${i + 1}`}</span>
                <Select
                  className="!h-8 !w-40 !py-0 text-xs"
                  value={map[i] || ''}
                  onChange={(e) => setMap((m) => m.map((x, j) => (j === i ? (e.target.value as FieldKey) : x)))}
                  placeholder="Ignore"
                  options={FIELDS.map((f) => ({ value: f.key, label: f.label }))}
                />
              </label>
            ))}
          </div>
          {!hasName && <p className="mt-3 text-sm font-medium text-rose-600">Match at least a name column (full name or first name).</p>}
          <div className="eyebrow mb-2 mt-6">Preview</div>
          <div className="overflow-x-auto rounded-2xl border border-ink-200">
            <table className="min-w-full text-sm">
              <thead className="bg-ink-50">
                <tr>{['Name', 'Email', 'Phone', 'Address', 'Service', 'Budget', 'Status'].map((h) => <th key={h} className="table-head">{h}</th>)}</tr>
              </thead>
              <tbody className="divide-y divide-ink-100">
                {mapped.slice(0, 6).map((m, i) => (
                  <tr key={i} className={m.name && (m.email || m.phone) ? '' : 'bg-rose-50/60'}>
                    <td className="table-cell">{m.name || <span className="text-rose-600">missing</span>}</td>
                    <td className="table-cell">{m.email}</td>
                    <td className="table-cell">{m.phone}</td>
                    <td className="table-cell max-w-[220px] truncate">{m.address}</td>
                    <td className="table-cell">{s.services.find((x) => x.key === m.serviceType)?.label || <span className="text-ink-400">default</span>}</td>
                    <td className="table-cell">{m.budget ? `$${m.budget.toLocaleString()}` : ''}</td>
                    <td className="table-cell">{m.status}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="mt-3 text-xs text-ink-500">
            {valid.length} ready to import · {mapped.length - valid.length} will be skipped (no name, or no email and no phone). Rows without a recognized service use "{s.services[0]?.label}".
          </p>
        </div>
      )}
      {error && <p className="mt-3 text-sm font-medium text-rose-600">{error}</p>}
      <input ref={fileRef} type="file" accept=".csv,text/csv,.txt" className="hidden" onChange={(e) => void load(e.target.files?.[0])} />
    </Modal>
  );
};

export default ImportCustomers;
