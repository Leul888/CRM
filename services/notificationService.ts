/**
 * Provider abstraction for outbound messages.
 * In this build every message is recorded to the in-app Outbox so the flow is fully
 * observable. Swap `deliver` for Resend/SendGrid/Postmark (email) or Twilio (SMS)
 * — the call sites in store.ts do not change.
 */
import type { OutboundMessage } from '../types';

type Sink = (message: Omit<OutboundMessage, 'id' | 'sentAt' | 'status'> & { status?: OutboundMessage['status'] }) => void;

let sink: Sink = () => undefined;
export const setOutboxSink = (fn: Sink) => {
  sink = fn;
};

const deliver = async (message: Parameters<Sink>[0]) => {
  await new Promise((resolve) => setTimeout(resolve, 250));
  sink({ ...message, status: 'SENT' });
  return { success: true as const };
};

export const sendEmail = (input: { to: string; subject: string; body: string }) =>
  deliver({ channel: 'EMAIL', to: input.to, subject: input.subject, body: input.body });

export const sendSMS = (input: { to: string; message: string }) =>
  deliver({ channel: 'SMS', to: input.to, body: input.message });

export const sendInternalNotification = (input: { userId: string; title: string; message: string }) =>
  Promise.resolve({ success: true as const, ...input });

export const logCalendar = (to: string, subject: string, body: string) =>
  deliver({ channel: 'CALENDAR', to, subject, body });
