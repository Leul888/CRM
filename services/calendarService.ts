/**
 * Google Calendar integration boundary. Replace the bodies with calls to the
 * Calendar API (events.insert / events.patch / events.delete) once OAuth is wired.
 */
import type { Appointment } from '../types';
import { logCalendar } from './notificationService';

export const createCalendarEvent = async (appointment: Appointment) => {
  const eventId = appointment.googleCalendarEventId || `gcal_${appointment.id}`;
  await logCalendar(appointment.estimatorId, 'Calendar event created', `${eventId} · ${new Date(appointment.startTime).toLocaleString()}`);
  return { eventId };
};

export const updateCalendarEvent = async (appointment: Appointment) => {
  await logCalendar(appointment.estimatorId, 'Calendar event updated', `${appointment.googleCalendarEventId || appointment.id} → ${appointment.status}`);
  return { success: true };
};

export const cancelCalendarEvent = async (eventId?: string) => {
  if (!eventId) return { success: true };
  await logCalendar('calendar', 'Calendar event cancelled', eventId);
  return { success: true };
};

/** Downloadable .ics for any appointment — works with Google, Outlook and Apple Calendar today. */
export const buildIcs = (input: { uid: string; title: string; description: string; location: string; start: string; end: string }) => {
  const fmt = (iso: string) => new Date(iso).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
  const esc = (s: string) => s.replace(/[,;\\]/g, (m) => `\\${m}`).replace(/\n/g, '\\n');
  return [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//ConstructFlow//CRM//EN',
    'BEGIN:VEVENT',
    `UID:${input.uid}@constructflow`,
    `DTSTAMP:${fmt(new Date().toISOString())}`,
    `DTSTART:${fmt(input.start)}`,
    `DTEND:${fmt(input.end)}`,
    `SUMMARY:${esc(input.title)}`,
    `DESCRIPTION:${esc(input.description)}`,
    `LOCATION:${esc(input.location)}`,
    'END:VEVENT',
    'END:VCALENDAR',
  ].join('\r\n');
};
