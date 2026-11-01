import Database from 'better-sqlite3';
import fs from 'node:fs';
import path from 'node:path';
import type { CRMState } from '../types';
import { STATE_VERSION } from '../core/seed';

export const DATA_DIR = process.env.DATA_DIR || path.resolve(process.cwd(), 'data');
fs.mkdirSync(DATA_DIR, { recursive: true });
export const DB_PATH = path.join(DATA_DIR, 'crm.sqlite');

export const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');
db.pragma('busy_timeout = 5000');

db.exec(`
  CREATE TABLE IF NOT EXISTS records (
    collection TEXT NOT NULL,
    id TEXT NOT NULL,
    data TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    PRIMARY KEY (collection, id)
  );
  CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);
  CREATE TABLE IF NOT EXISTS credentials (
    user_id TEXT PRIMARY KEY,
    email TEXT NOT NULL UNIQUE COLLATE NOCASE,
    password_hash TEXT NOT NULL,
    must_change INTEGER NOT NULL DEFAULT 0,
    last_login_at TEXT,
    updated_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS sessions (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    created_at TEXT NOT NULL,
    expires_at TEXT NOT NULL,
    ip TEXT,
    user_agent TEXT
  );
  CREATE INDEX IF NOT EXISTS sessions_user ON sessions(user_id);
  CREATE TABLE IF NOT EXISTS password_resets (
    token_hash TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    expires_at TEXT NOT NULL,
    used INTEGER NOT NULL DEFAULT 0
  );
  CREATE TABLE IF NOT EXISTS audit (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    at TEXT NOT NULL,
    user_id TEXT,
    action TEXT NOT NULL,
    detail TEXT,
    ip TEXT
  );
  CREATE INDEX IF NOT EXISTS audit_at ON audit(at);
`);

const COLLECTIONS = [
  'users',
  'leads',
  'appointments',
  'estimates',
  'estimateApprovalSignatures',
  'invoices',
  'workOrders',
  'inventoryItems',
  'products',
  'notifications',
  'outbox',
] as const;
type Collection = (typeof COLLECTIONS)[number];

/** JSON of every persisted row, used to write only what changed. */
const cache = new Map<string, string>();
const key = (c: string, id: string) => `${c}\u0000${id}`;

export const loadState = (): CRMState | null => {
  const rows = db.prepare('SELECT collection, id, data FROM records').all() as Array<{ collection: string; id: string; data: string }>;
  if (!rows.length) return null;
  const state = {
    version: STATE_VERSION,
    currentUserId: '',
    settings: {},
    ...Object.fromEntries(COLLECTIONS.map((c) => [c, []])),
  } as unknown as CRMState;
  const bag = state as unknown as Record<string, unknown[]>;
  for (const r of rows) {
    cache.set(key(r.collection, r.id), r.data);
    if (r.collection === 'settings') state.settings = JSON.parse(r.data);
    else if (bag[r.collection]) bag[r.collection].push(JSON.parse(r.data));
  }
  // Keep newest-first ordering the UI expects for feeds.
  const byDateDesc = (field: string) => (a: Record<string, string>, b: Record<string, string>) => (b[field] || '').localeCompare(a[field] || '');
  (state.notifications as unknown as Record<string, string>[]).sort(byDateDesc('createdAt'));
  (state.outbox as unknown as Record<string, string>[]).sort(byDateDesc('sentAt'));
  return state;
};

const upsert = db.prepare('INSERT INTO records (collection, id, data, updated_at) VALUES (?, ?, ?, ?) ON CONFLICT(collection, id) DO UPDATE SET data = excluded.data, updated_at = excluded.updated_at');
const remove = db.prepare('DELETE FROM records WHERE collection = ? AND id = ?');

export const saveState = db.transaction((state: CRMState) => {
  const now = new Date().toISOString();
  const seen = new Set<string>();
  const write = (c: string, id: string, value: unknown) => {
    const k = key(c, id);
    seen.add(k);
    const json = JSON.stringify(value);
    if (cache.get(k) === json) return;
    upsert.run(c, id, json, now);
    cache.set(k, json);
  };
  write('settings', 'company', state.settings);
  for (const c of COLLECTIONS) {
    for (const item of (state[c as Collection] as Array<{ id: string }>) || []) write(c, item.id, item);
  }
  for (const k of [...cache.keys()]) {
    if (seen.has(k)) continue;
    const [c, id] = k.split('\u0000');
    remove.run(c, id);
    cache.delete(k);
  }
});

export const wipeState = db.transaction(() => {
  db.exec('DELETE FROM records');
  cache.clear();
});

export const getMeta = (k: string) => (db.prepare('SELECT value FROM meta WHERE key = ?').get(k) as { value: string } | undefined)?.value;
export const setMeta = (k: string, v: string) => db.prepare('INSERT INTO meta (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value').run(k, v);

export const audit = (userId: string | null, action: string, detail?: string, ip?: string) => {
  db.prepare('INSERT INTO audit (at, user_id, action, detail, ip) VALUES (?, ?, ?, ?, ?)').run(new Date().toISOString(), userId, action, detail?.slice(0, 500) || null, ip || null);
};

// Keep the audit log bounded (~1 year of typical activity).
export const pruneAudit = () => db.prepare("DELETE FROM audit WHERE at < datetime('now', '-400 days')").run();
