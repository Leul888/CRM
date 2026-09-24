import crypto from 'node:crypto';
import type { Request, Response } from 'express';
import { db } from './db';

const SCRYPT = { N: 16384, r: 8, p: 1, keylen: 64 };
export const SESSION_COOKIE = 'cf_session';
const SESSION_DAYS = 7;
const REMEMBER_DAYS = 30;

export const MIN_PASSWORD = 8;

export const passwordProblem = (pw: unknown): string | null => {
  if (typeof pw !== 'string' || pw.length < MIN_PASSWORD) return `Password must be at least ${MIN_PASSWORD} characters.`;
  if (pw.length > 200) return 'Password is too long.';
  if (!/[A-Za-z]/.test(pw) || !/[0-9]/.test(pw)) return 'Use at least one letter and one number.';
  return null;
};

export const hashPassword = (password: string) => {
  const salt = crypto.randomBytes(16);
  const hash = crypto.scryptSync(password, salt, SCRYPT.keylen, { N: SCRYPT.N, r: SCRYPT.r, p: SCRYPT.p });
  return `scrypt$${SCRYPT.N}$${SCRYPT.r}$${SCRYPT.p}$${salt.toString('base64')}$${hash.toString('base64')}`;
};

export const verifyPassword = (password: string, stored: string) => {
  try {
    const [algo, N, r, p, saltB64, hashB64] = stored.split('$');
    if (algo !== 'scrypt') return false;
    const expected = Buffer.from(hashB64, 'base64');
    const actual = crypto.scryptSync(password, Buffer.from(saltB64, 'base64'), expected.length, { N: Number(N), r: Number(r), p: Number(p) });
    return crypto.timingSafeEqual(actual, expected);
  } catch {
    return false;
  }
};

// A fixed hash so unknown-email logins spend the same time as real ones.
const DUMMY_HASH = hashPassword('not-a-real-password-0');
export const burnTime = (password: string) => verifyPassword(password, DUMMY_HASH);

const sha256 = (v: string) => crypto.createHash('sha256').update(v).digest('hex');

export const generateTempPassword = () => {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789';
  const bytes = crypto.randomBytes(12);
  let out = '';
  for (const b of bytes) out += alphabet[b % alphabet.length];
  return `${out.slice(0, 4)}-${out.slice(4, 8)}-${out.slice(8, 12)}7`;
};

export type Credential = { user_id: string; email: string; password_hash: string; must_change: number; last_login_at: string | null };

export const getCredentialByEmail = (email: string) =>
  db.prepare('SELECT * FROM credentials WHERE email = ? COLLATE NOCASE').get(email.trim()) as Credential | undefined;
export const getCredential = (userId: string) => db.prepare('SELECT * FROM credentials WHERE user_id = ?').get(userId) as Credential | undefined;

export const setPassword = (userId: string, email: string, password: string, mustChange = false) => {
  db.prepare(
    `INSERT INTO credentials (user_id, email, password_hash, must_change, updated_at) VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(user_id) DO UPDATE SET email = excluded.email, password_hash = excluded.password_hash, must_change = excluded.must_change, updated_at = excluded.updated_at`,
  ).run(userId, email.trim(), hashPassword(password), mustChange ? 1 : 0, new Date().toISOString());
};

export const setCredentialEmail = (userId: string, email: string) =>
  db.prepare('UPDATE credentials SET email = ?, updated_at = ? WHERE user_id = ?').run(email.trim(), new Date().toISOString(), userId);

export const emailInUse = (email: string, exceptUserId?: string) => {
  const c = getCredentialByEmail(email);
  return !!c && c.user_id !== exceptUserId;
};

const isSecure = (req: Request) => req.secure || process.env.COOKIE_SECURE === 'true';

export const createSession = (req: Request, res: Response, userId: string, remember: boolean) => {
  const raw = crypto.randomBytes(32).toString('base64url');
  const days = remember ? REMEMBER_DAYS : SESSION_DAYS;
  const expires = new Date(Date.now() + days * 86400_000);
  db.prepare('INSERT INTO sessions (id, user_id, created_at, expires_at, ip, user_agent) VALUES (?, ?, ?, ?, ?, ?)').run(
    sha256(raw),
    userId,
    new Date().toISOString(),
    expires.toISOString(),
    req.ip || null,
    (req.get('user-agent') || '').slice(0, 250),
  );
  db.prepare('UPDATE credentials SET last_login_at = ? WHERE user_id = ?').run(new Date().toISOString(), userId);
  res.cookie(SESSION_COOKIE, raw, {
    httpOnly: true,
    sameSite: 'lax',
    secure: isSecure(req),
    path: '/',
    ...(remember ? { expires } : {}),
  });
};

const parseCookies = (header?: string) =>
  Object.fromEntries(
    (header || '')
      .split(';')
      .map((p) => p.trim())
      .filter(Boolean)
      .map((p) => {
        const i = p.indexOf('=');
        return [p.slice(0, i), decodeURIComponent(p.slice(i + 1))];
      }),
  );

export const sessionUserId = (req: Request): string | null => {
  const raw = parseCookies(req.headers.cookie)[SESSION_COOKIE];
  if (!raw) return null;
  const row = db.prepare('SELECT user_id, expires_at FROM sessions WHERE id = ?').get(sha256(raw)) as { user_id: string; expires_at: string } | undefined;
  if (!row) return null;
  if (new Date(row.expires_at) < new Date()) {
    db.prepare('DELETE FROM sessions WHERE id = ?').run(sha256(raw));
    return null;
  }
  return row.user_id;
};

export const destroySession = (req: Request, res: Response) => {
  const raw = parseCookies(req.headers.cookie)[SESSION_COOKIE];
  if (raw) db.prepare('DELETE FROM sessions WHERE id = ?').run(sha256(raw));
  res.clearCookie(SESSION_COOKIE, { path: '/' });
};

export const revokeUserSessions = (userId: string, exceptReq?: Request) => {
  const raw = exceptReq ? parseCookies(exceptReq.headers.cookie)[SESSION_COOKIE] : undefined;
  if (raw) db.prepare('DELETE FROM sessions WHERE user_id = ? AND id != ?').run(userId, sha256(raw));
  else db.prepare('DELETE FROM sessions WHERE user_id = ?').run(userId);
};

export const activeSessionCount = (userId: string) =>
  (db.prepare('SELECT COUNT(*) n FROM sessions WHERE user_id = ? AND expires_at > ?').get(userId, new Date().toISOString()) as { n: number }).n;

export const pruneSessions = () => db.prepare('DELETE FROM sessions WHERE expires_at < ?').run(new Date().toISOString());

// ---------- password reset ----------
/** One-time link token. Issuing a new one cancels any earlier unused link for the same user. */
export const createResetToken = (userId: string, ttlMs = 3600_000) => {
  const raw = crypto.randomBytes(32).toString('base64url');
  db.prepare('DELETE FROM password_resets WHERE user_id = ?').run(userId);
  db.prepare('INSERT INTO password_resets (token_hash, user_id, expires_at) VALUES (?, ?, ?)').run(sha256(raw), userId, new Date(Date.now() + ttlMs).toISOString());
  return raw;
};

export const INVITE_TTL_MS = 7 * 86400_000;

/** Looks up a token without using it up (the invite page shows who it's for). */
export const peekResetToken = (raw: string) => {
  const row = db.prepare('SELECT * FROM password_resets WHERE token_hash = ?').get(sha256(raw)) as
    | { user_id: string; expires_at: string; used: number }
    | undefined;
  if (!row || row.used || new Date(row.expires_at) < new Date()) return null;
  return row.user_id;
};

export const clearAllCredentials = () => {
  db.exec('DELETE FROM sessions; DELETE FROM password_resets; DELETE FROM credentials;');
};

export const consumeResetToken = (raw: string) => {
  const row = db.prepare('SELECT * FROM password_resets WHERE token_hash = ?').get(sha256(raw)) as
    | { user_id: string; expires_at: string; used: number }
    | undefined;
  if (!row || row.used || new Date(row.expires_at) < new Date()) return null;
  db.prepare('UPDATE password_resets SET used = 1 WHERE token_hash = ?').run(sha256(raw));
  return row.user_id;
};

// ---------- rate limiting (per process) ----------
const buckets = new Map<string, { count: number; reset: number }>();
export const rateLimited = (key: string, max: number, windowMs: number) => {
  const now = Date.now();
  const b = buckets.get(key);
  if (!b || b.reset < now) {
    buckets.set(key, { count: 1, reset: now + windowMs });
    return false;
  }
  b.count += 1;
  return b.count > max;
};
setInterval(() => {
  const now = Date.now();
  for (const [k, b] of buckets) if (b.reset < now) buckets.delete(k);
}, 10 * 60_000).unref();
