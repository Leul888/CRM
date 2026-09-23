/**
 * Outbound delivery. Email goes through SMTP (any provider: Resend, Postmark, SendGrid,
 * Mailgun, Google Workspace…) and SMS through Twilio, when configured via env vars.
 * Without configuration messages are recorded in the Outbox as LOGGED so nothing is lost.
 */
import nodemailer from 'nodemailer';
import type { OutboundMessage } from '../types';

const smtpConfigured = !!process.env.SMTP_HOST;
const twilioConfigured = !!(process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN && process.env.TWILIO_FROM);

export const providers = { email: smtpConfigured, sms: twilioConfigured };

const transporter = smtpConfigured
  ? nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: Number(process.env.SMTP_PORT || 587),
      secure: process.env.SMTP_SECURE === 'true' || Number(process.env.SMTP_PORT) === 465,
      auth: process.env.SMTP_USER ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS } : undefined,
    })
  : null;

const FROM = process.env.SMTP_FROM || process.env.SMTP_USER || 'no-reply@example.com';

export const sendEmailNow = async (to: string, subject: string, text: string, fromName?: string) => {
  if (!transporter) throw new Error('SMTP not configured');
  await transporter.sendMail({ from: fromName ? `"${fromName.replace(/"/g, '')}" <${FROM}>` : FROM, to, subject, text });
};

const toE164 = (phone: string) => {
  const digits = phone.replace(/[^\d+]/g, '');
  if (digits.startsWith('+')) return digits;
  const d = digits.replace(/\D/g, '');
  return d.length === 10 ? `+1${d}` : `+${d}`;
};

const sendSmsNow = async (to: string, body: string) => {
  const sid = process.env.TWILIO_ACCOUNT_SID!;
  const auth = Buffer.from(`${sid}:${process.env.TWILIO_AUTH_TOKEN}`).toString('base64');
  const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`, {
    method: 'POST',
    headers: { Authorization: `Basic ${auth}`, 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ To: toE164(to), From: process.env.TWILIO_FROM!, Body: body.slice(0, 1500) }),
  });
  if (!res.ok) throw new Error(`Twilio ${res.status}: ${(await res.text()).slice(0, 200)}`);
};

/** Resolve a user id (used for internal calendar/staff messages) to an address. */
export type Resolver = (to: string) => { email?: string; phone?: string } | undefined;

/**
 * Deliver one message. Returns the final status; never throws.
 * Synchronous result for messages with no provider so the Outbox is accurate immediately.
 */
export const deliver = async (msg: OutboundMessage, companyName: string, resolve: Resolver): Promise<Pick<OutboundMessage, 'status' | 'error'>> => {
  try {
    if (msg.channel === 'EMAIL') {
      if (!smtpConfigured) return { status: 'LOGGED' };
      const to = msg.to.includes('@') ? msg.to : resolve(msg.to)?.email;
      if (!to) return { status: 'FAILED', error: 'No email address' };
      await sendEmailNow(to, msg.subject || companyName, msg.body, companyName);
      return { status: 'SENT' };
    }
    if (msg.channel === 'SMS') {
      if (!twilioConfigured) return { status: 'LOGGED' };
      const to = /\d{7,}/.test(msg.to.replace(/\D/g, '')) ? msg.to : resolve(msg.to)?.phone;
      if (!to) return { status: 'FAILED', error: 'No phone number' };
      await sendSmsNow(to, msg.body);
      return { status: 'SENT' };
    }
    // Calendar sync: recorded; attendees get .ics from the app. (Google Calendar API can plug in here.)
    return { status: 'LOGGED' };
  } catch (err) {
    return { status: 'FAILED', error: err instanceof Error ? err.message.slice(0, 200) : 'Delivery failed' };
  }
};

export const needsNetwork = (msg: OutboundMessage) => (msg.channel === 'EMAIL' && smtpConfigured) || (msg.channel === 'SMS' && twilioConfigured);
