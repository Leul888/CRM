/**
 * Domain engine used by the API server. Pure state transitions over CRMState plus an
 * outbox of messages to deliver. No DOM, no storage, no network — the server persists
 * `state` and delivers `pending` messages after every action.
 */
import type {
  Appointment,
  CRMState,
  Estimate,
  Invoice,
  InventoryItem,
  Lead,
  LeadActivity,
  LeadStatus,
  Notification,
  OutboundMessage,
  PaymentMethod,
  Product,
  Role,
  ServiceType,
  User,
  WorkOrder,
  WorkOrderStatus,
} from '../types';
import { assignEstimatorForService } from '../services/assignmentService';
import { humanize, money } from '../services/format';
import { buildSeedState, isoDaysFromNow, round, token, uid, STATE_VERSION } from './seed';
import { activeServices, isSpecialistService, serviceDefs, serviceLabel } from '../services/catalog';

export class CRMEngine {
  state: CRMState;
  /** Id of the user performing the current action (set per request). */
  actorId: string | null = null;
  /** Public base URL used in client-facing links. */
  appUrl = '';
  /** IANA zone used when formatting times inside messages. */
  timeZone = 'America/New_York';
  /** Messages created during the current action, awaiting delivery. */
  pending: OutboundMessage[] = [];

  constructor(state: CRMState) {
    this.state = state;
  }

  private notify() {
    /* persistence is handled by the server after each action */
  }

  private queue(channel: OutboundMessage['channel'], to: string, subject: string | undefined, body: string) {
    if (!to) return;
    const entry: OutboundMessage = { id: uid('msg'), channel, to, subject, body, sentAt: new Date().toISOString(), status: 'QUEUED' };
    this.state.outbox = [entry, ...(this.state.outbox || [])].slice(0, 500);
    this.pending.push(entry);
  }

  private email(input: { to: string; subject: string; body: string }) {
    this.queue('EMAIL', input.to, input.subject, input.body);
  }

  private push(title: string, body: string, link?: string) {
    if (!this.state.settings.ntfyTopic) return;
    const entry: OutboundMessage = { id: uid('msg'), channel: 'PUSH', to: "Owner's phone", subject: title, body, link, sentAt: new Date().toISOString(), status: 'QUEUED' };
    this.state.outbox = [entry, ...(this.state.outbox || [])].slice(0, 500);
    this.pending.push(entry);
  }

  private sms(input: { to: string; message: string }) {
    this.queue('SMS', input.to, undefined, input.message);
  }

  private calendar(to: string, subject: string, body: string) {
    this.queue('CALENDAR', to, subject, body);
  }

  usersByRole(role: Role) {
    return this.state.users.filter((user) => user.role === role && user.active);
  }

  userName(id?: string | null) {
    return this.state.users.find((u) => u.id === id)?.name || 'Unassigned';
  }

  leadById(id?: string) {
    return this.state.leads.find((l) => l.id === id);
  }

  resetDemo() {
    this.state = buildSeedState();
    return { success: true as const };
  }

  importState(parsed: CRMState) {
    if (!parsed || !Array.isArray(parsed.leads) || !Array.isArray(parsed.users)) return { error: 'File is not a valid backup.' };
    const next = { ...buildSeedState(), ...parsed, version: STATE_VERSION } as CRMState;
    this.state = next;
    return { success: true as const };
  }

  saveSettings(nextSettings: CRMState['settings']) {
    if (!nextSettings.companyName?.trim()) return { error: 'Company name is required.' };
    const before = new Set(serviceDefs(this.state.settings).map((x) => x.key));
    this.state.settings = { ...this.state.settings, ...nextSettings, companyName: nextSettings.companyName.trim() };
    // New services are offered by every active estimator by default (specialist rules still apply).
    const added = serviceDefs(this.state.settings).filter((x) => !before.has(x.key)).map((x) => x.key);
    if (added.length) {
      this.state.users = this.state.users.map((u) =>
        u.role === 'ESTIMATOR' || u.role === 'OWNER' || u.role === 'MANAGER' ? { ...u, serviceCapabilities: [...new Set([...u.serviceCapabilities, ...added])] } : u,
      );
    }
    return { success: true as const };
  }

  // ---------- team ----------
  saveUser(user: Omit<User, 'id'> & { id?: string }) {
    const payload = { ...user, id: user.id || uid('user') } as User;
    const emailTaken = this.state.users.some((u) => u.email.toLowerCase() === payload.email.toLowerCase() && u.id !== payload.id);
    if (emailTaken) return { error: 'Another team member already uses that email.' };
    const existing = this.state.users.some((item) => item.id === payload.id);
    this.state.users = existing ? this.state.users.map((item) => (item.id === payload.id ? payload : item)) : [...this.state.users, payload];
    this.notify();
    return { success: true as const, user: payload };
  }

  // ---------- leads ----------
  private logActivity(leadId: string, text: string, kind: LeadActivity['kind'] = 'SYSTEM') {
    const entry: LeadActivity = { id: uid('act'), at: new Date().toISOString(), kind, text, userId: this.actorId || undefined };
    this.state.leads = this.state.leads.map((l) => (l.id === leadId ? { ...l, activity: [entry, ...(l.activity || [])] } : l));
  }

  addLeadActivity(leadId: string, text: string, kind: LeadActivity['kind']) {
    this.logActivity(leadId, text, kind);
    if (kind === 'CALL' || kind === 'EMAIL') {
      const lead = this.leadById(leadId);
      if (lead?.status === 'NEW') this.updateLeadStatus(leadId, 'CONTACTED', false);
    }
    this.notify();
  }

  saveLead(lead: Omit<Lead, 'id' | 'createdAt'> & { id?: string; createdAt?: string }) {
    const existingLead = lead.id ? this.leadById(lead.id) : undefined;
    const payload: Lead = {
      ...lead,
      id: lead.id || uid('lead'),
      createdAt: lead.createdAt || new Date().toISOString(),
      activity: existingLead?.activity || lead.activity || [],
    };

    this.state.leads = existingLead ? this.state.leads.map((item) => (item.id === payload.id ? payload : item)) : [payload, ...this.state.leads];

    if (!existingLead) {
      this.logActivity(payload.id, `Lead created from ${humanize(payload.source)}.`);
      this.notifyInternalAdmins('NEW_LEAD', 'New lead created', `${payload.name} was added to the pipeline (${serviceLabel(payload.serviceType)}).`, payload.id);
    } else if (existingLead.status !== payload.status) {
      this.logActivity(payload.id, `Status changed: ${humanize(existingLead.status)} → ${humanize(payload.status)}.`, 'STATUS');
    }

    this.notify();
    return payload;
  }

  setLeadStatus(leadId: string, status: LeadStatus) {
    const lead = this.leadById(leadId);
    if (!lead || lead.status === status) return;
    this.updateLeadStatus(leadId, status, false);
    this.logActivity(leadId, `Status changed: ${humanize(lead.status)} → ${humanize(status)}.`, 'STATUS');
    this.notify();
  }

  deleteLead(leadId: string) {
    const estimateIds = new Set(this.state.estimates.filter((e) => e.leadId === leadId).map((e) => e.id));
    this.state.leads = this.state.leads.filter((l) => l.id !== leadId);
    this.state.appointments = this.state.appointments.filter((a) => a.leadId !== leadId);
    this.state.estimates = this.state.estimates.filter((e) => e.leadId !== leadId);
    this.state.estimateApprovalSignatures = this.state.estimateApprovalSignatures.filter((s) => !estimateIds.has(s.estimateId));
    this.state.invoices = this.state.invoices.filter((i) => i.leadId !== leadId);
    this.state.workOrders = this.state.workOrders.filter((w) => w.leadId !== leadId);
    this.notify();
  }

  /** Bulk import from a spreadsheet. Skips rows whose email (or name + phone) already exists. */
  importLeads(rows: Array<Partial<Lead>>) {
    const emails = new Set(this.state.leads.map((l) => l.email.toLowerCase()).filter(Boolean));
    const namePhones = new Set(this.state.leads.map((l) => `${l.name.toLowerCase()}|${l.phone.replace(/\D/g, '')}`));
    const services = new Set(serviceDefs(this.state.settings).map((x) => x.key));
    const fallbackService = activeServices(this.state.settings)[0]?.key || 'GENERAL';
    const STATUSES: LeadStatus[] = ['NEW', 'CONTACTED', 'SCHEDULED', 'ESTIMATE_SENT', 'APPROVED', 'JOB_SCHEDULED', 'IN_PROGRESS', 'COMPLETED', 'INVOICED', 'PAID', 'LOST'];
    const SOURCES: Lead['source'][] = ['WEBSITE', 'CALL_CENTER', 'SOCIAL_MEDIA', 'REFERRAL', 'MANUAL'];
    const text = (v: unknown, max: number) => (typeof v === 'string' ? v.trim().slice(0, max) : '');
    let created = 0;
    let skipped = 0;
    const fresh: Lead[] = [];
    for (const r of rows.slice(0, 5000)) {
      const name = text(r.name, 120);
      const email = text(r.email, 160).toLowerCase();
      const phone = text(r.phone, 40);
      if (!name || (!email && !phone)) {
        skipped += 1;
        continue;
      }
      const np = `${name.toLowerCase()}|${phone.replace(/\D/g, '')}`;
      if ((email && emails.has(email)) || namePhones.has(np)) {
        skipped += 1;
        continue;
      }
      emails.add(email);
      namePhones.add(np);
      const created_at = r.createdAt && !isNaN(Date.parse(r.createdAt)) ? new Date(r.createdAt).toISOString() : new Date().toISOString();
      fresh.push({
        id: uid('lead'),
        name,
        email,
        phone,
        address: text(r.address, 240),
        budget: Math.max(0, Number(r.budget) || 0),
        serviceType: services.has(String(r.serviceType)) ? String(r.serviceType) : fallbackService,
        status: STATUSES.includes(r.status as LeadStatus) ? (r.status as LeadStatus) : 'NEW',
        source: SOURCES.includes(r.source as Lead['source']) ? (r.source as Lead['source']) : 'MANUAL',
        notes: text(r.notes, 4000),
        createdAt: created_at,
        assignedSalesRepId: r.assignedSalesRepId && this.state.users.some((u) => u.id === r.assignedSalesRepId) ? r.assignedSalesRepId : undefined,
        assignedEstimatorId: r.assignedEstimatorId && this.state.users.some((u) => u.id === r.assignedEstimatorId) ? r.assignedEstimatorId : undefined,
        activity: [{ id: uid('act'), at: new Date().toISOString(), kind: 'SYSTEM', text: 'Imported from spreadsheet.', userId: this.actorId || undefined }],
      });
      created += 1;
    }
    this.state.leads = [...fresh, ...this.state.leads];
    if (created) this.notifyInternalAdmins('SYSTEM', 'Customers imported', `${created} customer${created === 1 ? '' : 's'} imported from a spreadsheet.`);
    return { created, skipped };
  }

  // ---------- appointments ----------
  saveAppointment(appointment: Omit<Appointment, 'id'> & { id?: string }, options?: { syncCalendar?: boolean }) {
    const payload: Appointment = { ...appointment, id: appointment.id || uid('appt') };
    if (!payload.googleCalendarEventId) payload.googleCalendarEventId = `gcal_${payload.id}`;
    const existing = this.state.appointments.find((item) => item.id === payload.id);

    this.state.appointments = existing
      ? this.state.appointments.map((item) => (item.id === payload.id ? payload : item))
      : [payload, ...this.state.appointments];

    const lead = this.leadById(payload.leadId);
    if (lead && ['NEW', 'CONTACTED'].includes(lead.status) && !['CANCELLED', 'NO_SHOW'].includes(payload.status)) {
      this.updateLeadStatus(lead.id, 'SCHEDULED', false);
    }
    if (lead) {
      this.logActivity(
        lead.id,
        existing
          ? `Appointment ${existing.status !== payload.status ? `marked ${humanize(payload.status)}` : 'updated'} (${new Date(payload.startTime).toLocaleString('en-US', { timeZone: this.timeZone })}).`
          : `Estimate appointment booked for ${new Date(payload.startTime).toLocaleString('en-US', { timeZone: this.timeZone })} with ${this.userName(payload.estimatorId)}.`,
      );
    }

    if (options?.syncCalendar !== false && !['CANCELLED', 'NO_SHOW'].includes(payload.status)) {
      this.calendar(payload.estimatorId, existing ? 'Calendar event updated' : 'Calendar event created', `${payload.googleCalendarEventId} · ${humanize(payload.status)} · ${new Date(payload.startTime).toLocaleString('en-US', { timeZone: this.timeZone })}`);
    }

    this.notify();
    return payload;
  }

  setAppointmentStatus(appointmentId: string, status: Appointment['status']) {
    const appointment = this.state.appointments.find((item) => item.id === appointmentId);
    if (!appointment) return;
    if (status === 'CANCELLED' || status === 'NO_SHOW') {
      this.saveAppointment({ ...appointment, status }, { syncCalendar: false });
      this.calendar(appointment.estimatorId, 'Calendar event cancelled', appointment.googleCalendarEventId || appointment.id);
      return;
    }
    this.saveAppointment({ ...appointment, status });
  }

  sendAppointmentReminder(appointmentId: string) {
    const appointment = this.state.appointments.find((item) => item.id === appointmentId);
    if (!appointment) return { error: 'Appointment not found.' };
    const lead = this.leadById(appointment.leadId);
    const estimator = this.state.users.find((item) => item.id === appointment.estimatorId);
    if (!lead || !estimator) return { error: 'Appointment is missing lead or estimator data.' };

    const when = new Date(appointment.startTime).toLocaleString('en-US', { timeZone: this.timeZone });
    this.state.appointments = this.state.appointments.map((item) => (item.id === appointmentId ? { ...item, reminderStatus: 'QUEUED' } : item));
    this.logActivity(lead.id, `Reminder sent to client and ${estimator.name}.`, 'EMAIL');
    this.notify();

    this.email({ to: lead.email, subject: 'Reminder: your upcoming estimate appointment', body: `Hi ${lead.name}, this is a reminder of your ${serviceLabel(appointment.serviceType).toLowerCase()} estimate on ${when}.` });
    this.sms({ to: lead.phone, message: `${this.state.settings.companyName}: your estimate appointment is ${when}. Reply C to confirm.` });
    this.email({ to: estimator.email, subject: 'Reminder: upcoming estimate appointment', body: `Estimate for ${lead.name} (${lead.address}) on ${when}.` });
    this.sms({ to: estimator.phone, message: `Reminder: estimate for ${lead.name} on ${when}.` });
    this.state.appointments = this.state.appointments.map((item) => (item.id === appointmentId ? { ...item, reminderStatus: 'SENT' } : item));

    return { success: true as const };
  }

  /** Public booking / website inquiry → lead + smart-assigned appointment. */
  createBookingRequest(input: {
    name: string;
    email: string;
    phone: string;
    address: string;
    budget: number;
    serviceType: ServiceType;
    preferredDateTime: string;
    notes: string;
    source?: Lead['source'];
  }) {
    const duplicate = this.state.leads.find(
      (l) => l.email.toLowerCase() === input.email.trim().toLowerCase() && !['PAID', 'LOST', 'COMPLETED'].includes(l.status),
    );

    const assignment = assignEstimatorForService(this.state.users, this.state.appointments, input.serviceType, input.preferredDateTime, 60, isSpecialistService(this.state.settings, input.serviceType));

    // Round-robin sales rep by current open load.
    const reps = this.usersByRole('SALES_REP');
    const salesRep = reps
      .map((r) => ({ r, load: this.state.leads.filter((l) => l.assignedSalesRepId === r.id && !['PAID', 'LOST'].includes(l.status)).length }))
      .sort((a, b) => a.load - b.load)[0]?.r;

    const lead = duplicate
      ? this.saveLead({ ...duplicate, notes: [duplicate.notes, input.notes].filter(Boolean).join('\n\n'), nextFollowUpDate: isoDaysFromNow(1) })
      : this.saveLead({
          name: input.name.trim(),
          email: input.email.trim(),
          phone: input.phone.trim(),
          address: input.address.trim(),
          budget: input.budget,
          serviceType: input.serviceType,
          status: 'NEW',
          assignedSalesRepId: salesRep?.id,
          assignedEstimatorId: assignment.estimatorId,
          source: input.source || 'WEBSITE',
          notes: input.notes,
          nextFollowUpDate: isoDaysFromNow(1),
        });

    const start = new Date(input.preferredDateTime);
    const end = new Date(start.getTime() + 60 * 60_000);

    const appointment = this.saveAppointment({
      leadId: lead.id,
      estimatorId: assignment.estimatorId,
      startTime: start.toISOString(),
      endTime: end.toISOString(),
      serviceType: input.serviceType,
      status: 'REQUESTED',
      reminderStatus: 'PENDING',
      notes: assignment.reason,
    });

    const estimator = this.state.users.find((user) => user.id === assignment.estimatorId);
    // 1) The customer gets a confirmation email.
    this.email({
      to: lead.email,
      subject: `We received your request — ${this.state.settings.companyName}`,
      body: `Hi ${lead.name}, thanks for reaching out. We'll confirm your estimate visit for ${start.toLocaleString('en-US', { timeZone: this.timeZone })} shortly.`,
    });
    // 2) The owner gets a phone alert (ntfy). Without phone alerts, the company inbox gets an email instead.
    if (this.state.settings.ntfyTopic) {
      this.push('New lead', `${lead.name} · ${serviceLabel(input.serviceType)}`, `${this.appUrl}/#leads/${lead.id}`);
    } else {
      const inbox = (this.state.settings.supportEmail || '').trim();
      if (inbox) {
        this.email({
          to: inbox,
          subject: `New website inquiry: ${lead.name} (${serviceLabel(input.serviceType)})`,
          body: [
            `A new estimate request came in from your website.`,
            ``,
            `Name: ${input.name}`,
            `Email: ${input.email}`,
            `Phone: ${input.phone || '—'}`,
            `Address: ${input.address || '—'}`,
            `Service: ${serviceLabel(input.serviceType)}`,
            `Budget: ${input.budget ? `$${Number(input.budget).toLocaleString('en-US')}` : '—'}`,
            `Preferred visit: ${start.toLocaleString('en-US', { timeZone: this.timeZone })}`,
            `Assigned to: ${estimator?.name || 'Unassigned'}`,
            input.notes ? `\nNotes: ${input.notes}` : '',
            ``,
            `Open the lead: ${this.appUrl}/#leads/${lead.id}`,
          ].join('\n'),
        });
      }
    }

    return { lead, appointment, assignment, estimator, duplicate: !!duplicate };
  }

  // ---------- estimates ----------
  nextEstimateNumber() {
    const nums = this.state.estimates.map((e) => Number((e.number || '').replace(/\D/g, ''))).filter(Boolean);
    return `EST-${(nums.length ? Math.max(...nums) : 2000) + 1}`;
  }

  saveEstimate(estimate: Omit<Estimate, 'id' | 'createdAt'> & { id?: string; createdAt?: string }) {
    const payload: Estimate = {
      ...estimate,
      number: estimate.number || this.nextEstimateNumber(),
      id: estimate.id || uid('estimate'),
      createdAt: estimate.createdAt || new Date().toISOString(),
    };

    const existing = this.state.estimates.some((item) => item.id === payload.id);
    this.state.estimates = existing ? this.state.estimates.map((item) => (item.id === payload.id ? payload : item)) : [payload, ...this.state.estimates];

    if (!this.state.estimateApprovalSignatures.some((item) => item.estimateId === payload.id)) {
      this.state.estimateApprovalSignatures = [
        { id: uid('sig'), estimateId: payload.id, signatureName: '', approvalToken: token(), approvalStatus: 'PENDING' },
        ...this.state.estimateApprovalSignatures,
      ];
    }
    if (!existing) this.logActivity(payload.leadId, `Estimate ${payload.number} drafted (${money(payload.total)}).`);

    this.notify();
    return payload;
  }

  deleteEstimate(estimateId: string) {
    this.state.estimates = this.state.estimates.filter((e) => e.id !== estimateId);
    this.state.estimateApprovalSignatures = this.state.estimateApprovalSignatures.filter((s) => s.estimateId !== estimateId);
    this.notify();
  }

  approvalLink(estimateId: string) {
    const signature = this.getApprovalSignatureForEstimate(estimateId);
    return signature ? `${this.appUrl}/#approve/${signature.approvalToken}` : '';
  }

  sendEstimate(estimateId: string) {
    const estimate = this.state.estimates.find((item) => item.id === estimateId);
    if (!estimate) return;
    const lead = this.leadById(estimate.leadId);
    if (!lead) return;

    // Re-sending a declined/expired estimate resets the signature request.
    this.state.estimateApprovalSignatures = this.state.estimateApprovalSignatures.map((s) =>
      s.estimateId === estimateId && s.approvalStatus === 'DECLINED' ? { ...s, approvalStatus: 'PENDING', declineReason: undefined } : s,
    );
    this.state.estimates = this.state.estimates.map((item) => (item.id === estimateId ? { ...item, status: 'SENT' } : item));
    if (['NEW', 'CONTACTED', 'SCHEDULED'].includes(lead.status)) this.updateLeadStatus(lead.id, 'ESTIMATE_SENT', false);
    this.logActivity(lead.id, `Estimate ${estimate.number} sent for e-signature.`, 'EMAIL');

    const link = this.approvalLink(estimateId);
    this.email({
      to: lead.email,
      subject: `Your estimate ${estimate.number} from ${this.state.settings.companyName}`,
      body: `Hi ${lead.name}, your ${serviceLabel(estimate.serviceType).toLowerCase()} estimate (${money(estimate.total)}) is ready. Review and e-sign: ${link}`,
    });
    this.notify();
  }

  approveEstimateByToken(approvalToken: string, signatureName: string, clientIp?: string, userAgent?: string) {
    const signature = this.state.estimateApprovalSignatures.find((item) => item.approvalToken === approvalToken);
    if (!signature) return { error: 'Approval link not found.' };
    const estimate = this.state.estimates.find((item) => item.id === signature.estimateId);
    if (!estimate) return { error: 'Estimate not found.' };
    if (signature.approvalStatus === 'APPROVED') return { error: 'This estimate has already been approved.' };
    if (new Date(estimate.expirationDate) < new Date()) return { error: 'This estimate has expired. Please contact us for an updated quote.' };

    this.state.estimateApprovalSignatures = this.state.estimateApprovalSignatures.map((item) =>
      item.id === signature.id
        ? { ...item, signatureName, signedAt: new Date().toISOString(), clientIp, userAgent, approvalStatus: 'APPROVED' }
        : item,
    );
    this.state.estimates = this.state.estimates.map((item) => (item.id === estimate.id ? { ...item, status: 'APPROVED' } : item));
    this.updateLeadStatus(estimate.leadId, 'APPROVED', false);
    this.logActivity(estimate.leadId, `Estimate ${estimate.number} e-signed by ${signatureName}.`);
    this.notifyInternalAdmins('ESTIMATE_APPROVED', 'Estimate approved', `${estimate.number} was approved electronically by ${signatureName} (${money(estimate.total)}).`, estimate.id);

    if (!this.state.invoices.some((invoice) => invoice.estimateId === estimate.id)) {
      this.createInvoiceFromEstimate(estimate.id, false);
    }
    this.notify();
    return { success: true as const };
  }

  declineEstimateByToken(approvalToken: string, reason: string) {
    const signature = this.state.estimateApprovalSignatures.find((item) => item.approvalToken === approvalToken);
    if (!signature) return { error: 'Approval link not found.' };
    const estimate = this.state.estimates.find((item) => item.id === signature.estimateId);
    if (!estimate) return { error: 'Estimate not found.' };
    this.state.estimateApprovalSignatures = this.state.estimateApprovalSignatures.map((s) =>
      s.id === signature.id ? { ...s, approvalStatus: 'DECLINED', declineReason: reason, signedAt: new Date().toISOString() } : s,
    );
    this.state.estimates = this.state.estimates.map((e) => (e.id === estimate.id ? { ...e, status: 'REJECTED' } : e));
    this.logActivity(estimate.leadId, `Estimate ${estimate.number} declined by client${reason ? `: "${reason}"` : ''}.`);
    this.notifyInternalAdmins('ESTIMATE_DECLINED', 'Estimate declined', `${estimate.number} was declined${reason ? `: ${reason}` : ''}.`, estimate.id);
    this.notify();
    return { success: true as const };
  }

  setEstimateStatus(estimateId: string, status: Estimate['status']) {
    const estimate = this.state.estimates.find((e) => e.id === estimateId);
    if (!estimate) return;
    this.state.estimates = this.state.estimates.map((e) => (e.id === estimateId ? { ...e, status } : e));
    if (status === 'APPROVED') {
      this.updateLeadStatus(estimate.leadId, 'APPROVED', false);
      this.logActivity(estimate.leadId, `Estimate ${estimate.number} marked approved by staff.`);
      // Same as an e-signed approval: a draft invoice is ready to send.
      this.createInvoiceFromEstimate(estimate.id, false);
    }
    this.notify();
  }

  // ---------- invoices ----------
  nextInvoiceNumber() {
    const nums = this.state.invoices.map((i) => Number(i.invoiceNumber.replace(/\D/g, ''))).filter(Boolean);
    return `INV-${(nums.length ? Math.max(...nums) : 1000) + 1}`;
  }

  createInvoiceFromEstimate(estimateId: string, notify = true) {
    const estimate = this.state.estimates.find((item) => item.id === estimateId);
    if (!estimate) return null;
    // A voided invoice doesn't count: the job can be billed again.
    const existing = this.state.invoices.find((invoice) => invoice.estimateId === estimateId && invoice.status !== 'CANCELLED');
    if (existing) return existing;
    const lead = this.leadById(estimate.leadId);
    if (!lead) return null;

    const invoice: Invoice = {
      id: uid('invoice'),
      estimateId: estimate.id,
      leadId: lead.id,
      invoiceNumber: this.nextInvoiceNumber(),
      customerName: lead.name,
      customerEmail: lead.email,
      customerPhone: lead.phone,
      lineItems: estimate.lineItems.map((item) => ({ id: uid('ili'), description: item.description, quantity: item.quantity, unit: item.unit, unitPrice: item.unitPrice, total: item.total })),
      subtotal: round(estimate.total - estimate.tax),
      tax: estimate.tax,
      total: estimate.total,
      amountPaid: 0,
      balanceDue: estimate.total,
      status: 'DRAFT',
      dueDate: isoDaysFromNow(this.state.settings.invoiceTermsDays ?? 14),
      createdAt: new Date().toISOString(),
      payments: [],
    };

    this.state.invoices = [invoice, ...this.state.invoices];
    this.logActivity(lead.id, `Invoice ${invoice.invoiceNumber} created (${money(invoice.total)}).`);
    if (notify) this.notify();
    return invoice;
  }

  sendInvoice(invoiceId: string) {
    const invoice = this.state.invoices.find((i) => i.id === invoiceId);
    if (!invoice) return;
    this.state.invoices = this.state.invoices.map((i) => (i.id === invoiceId && i.status === 'DRAFT' ? { ...i, status: 'SENT' } : i));
    const lead = this.leadById(invoice.leadId);
    if (lead && !['PAID'].includes(lead.status)) this.updateLeadStatus(lead.id, 'INVOICED', false);
    this.logActivity(invoice.leadId, `Invoice ${invoice.invoiceNumber} emailed to client.`, 'EMAIL');
    this.email({
      to: invoice.customerEmail,
      subject: `Invoice ${invoice.invoiceNumber} from ${this.state.settings.companyName}`,
      body: `Hi ${invoice.customerName}, your invoice for ${money(invoice.total)} is due ${new Date(invoice.dueDate).toLocaleDateString('en-US', { timeZone: this.timeZone })}. Balance: ${money(invoice.balanceDue)}.`,
    });
    this.notify();
  }

  recordPayment(invoiceId: string, amount: number, method: PaymentMethod, reference?: string) {
    const invoice = this.state.invoices.find((item) => item.id === invoiceId);
    if (!invoice) return { error: 'Invoice not found.' };
    if (!(amount > 0)) return { error: 'Enter a payment amount greater than zero.' };
    if (amount > invoice.balanceDue + 0.001) return { error: `Payment exceeds the balance due (${money(invoice.balanceDue)}).` };

    const amountPaid = round(invoice.amountPaid + amount);
    const balanceDue = round(invoice.total - amountPaid);
    const status: Invoice['status'] = balanceDue <= 0 ? 'PAID' : 'PARTIALLY_PAID';
    const payment = { id: uid('pay'), amount: round(amount), method, reference, receivedAt: new Date().toISOString() };

    this.state.invoices = this.state.invoices.map((item) =>
      item.id === invoiceId ? { ...item, amountPaid, balanceDue, status, payments: [...(item.payments || []), payment] } : item,
    );
    this.logActivity(invoice.leadId, `Payment of ${money(amount)} received via ${humanize(method)}.`);
    this.notifyInternalAdmins('PAYMENT_RECEIVED', 'Payment received', `${money(amount)} received on ${invoice.invoiceNumber}.`, invoice.id);
    if (status === 'PAID') this.updateLeadStatus(invoice.leadId, 'PAID', false);
    this.email({ to: invoice.customerEmail, subject: `Receipt for ${invoice.invoiceNumber}`, body: `Thanks! We received ${money(amount)}. Remaining balance: ${money(Math.max(0, balanceDue))}.` });
    this.notify();
    return { success: true as const };
  }

  updateInvoiceStatus(invoiceId: string, status: Invoice['status']) {
    const invoice = this.state.invoices.find((item) => item.id === invoiceId);
    if (!invoice) return;
    this.state.invoices = this.state.invoices.map((item) => (item.id === invoiceId ? { ...item, status } : item));
    if (status === 'PAID') this.updateLeadStatus(invoice.leadId, 'PAID', false);
    this.notify();
  }

  // ---------- work orders ----------
  saveWorkOrder(workOrder: Omit<WorkOrder, 'id'> & { id?: string }) {
    const payload: WorkOrder = { ...workOrder, id: workOrder.id || uid('wo') };
    const existing = this.state.workOrders.some((item) => item.id === payload.id);
    this.state.workOrders = existing ? this.state.workOrders.map((item) => (item.id === payload.id ? payload : item)) : [payload, ...this.state.workOrders];

    if (!existing) {
      const lead = this.leadById(payload.leadId);
      if (lead && ['APPROVED', 'ESTIMATE_SENT', 'SCHEDULED', 'CONTACTED', 'NEW'].includes(lead.status)) this.updateLeadStatus(payload.leadId, 'JOB_SCHEDULED', false);
      this.logActivity(payload.leadId, `Work order scheduled with ${this.userName(payload.assignedWorkerId)}.`);
      const worker = this.state.users.find((u) => u.id === payload.assignedWorkerId);
      if (worker) {
        this.email({ to: worker.email, subject: 'New work order assigned', body: `${payload.scopeOfWork} @ ${payload.location}, starting ${new Date(payload.scheduledStart).toLocaleString('en-US', { timeZone: this.timeZone })}.` });
        this.sms({ to: worker.phone, message: `New job: ${payload.location} starting ${new Date(payload.scheduledStart).toLocaleDateString('en-US', { timeZone: this.timeZone })}.` });
      }
    }
    this.notify();
    return payload;
  }

  updateWorkOrderStatus(workOrderId: string, status: WorkOrderStatus) {
    const workOrder = this.state.workOrders.find((item) => item.id === workOrderId);
    if (!workOrder) return;
    this.state.workOrders = this.state.workOrders.map((item) => (item.id === workOrderId ? { ...item, status } : item));
    this.logActivity(workOrder.leadId, `Work order ${humanize(status).toLowerCase()} by ${this.userName(this.actorId || undefined)}.`);
    if (status === 'IN_PROGRESS') this.updateLeadStatus(workOrder.leadId, 'IN_PROGRESS', false);
    if (status === 'COMPLETED') {
      const lead = this.leadById(workOrder.leadId);
      if (lead && !['INVOICED', 'PAID'].includes(lead.status)) this.updateLeadStatus(workOrder.leadId, 'COMPLETED', false);
      this.notifyInternalAdmins('JOB_COMPLETED', 'Work order completed', `${lead?.name || 'A job'} at ${workOrder.location} is complete.`, workOrder.id);
    }
    this.notify();
  }

  toggleChecklistItem(workOrderId: string, itemId: string) {
    this.state.workOrders = this.state.workOrders.map((w) =>
      w.id === workOrderId ? { ...w, checklist: (w.checklist || []).map((c) => (c.id === itemId ? { ...c, done: !c.done } : c)) } : w,
    );
    this.notify();
  }

  addWorkOrderAttachments(workOrderId: string, names: string[]) {
    const clean = (names || []).map((n) => String(n).slice(0, 600)).filter(Boolean).slice(0, 20);
    this.state.workOrders = this.state.workOrders.map((w) => (w.id === workOrderId ? { ...w, attachments: [...w.attachments, ...clean].slice(-100) } : w));
    return { success: true as const };
  }

  deleteWorkOrder(id: string) {
    this.state.workOrders = this.state.workOrders.filter((w) => w.id !== id);
    this.notify();
  }

  // ---------- inventory & products ----------
  saveInventoryItem(item: Omit<InventoryItem, 'id' | 'status'> & { id?: string; status?: InventoryItem['status'] }) {
    const payload = { ...item, id: item.id || uid('inv') };
    const status: InventoryItem['status'] =
      payload.quantityOnHand <= 0 ? 'OUT_OF_STOCK' : payload.quantityOnHand <= payload.reorderThreshold ? 'LOW_STOCK' : 'IN_STOCK';
    const finalItem: InventoryItem = { ...payload, status };
    const existing = this.state.inventoryItems.some((entry) => entry.id === finalItem.id);
    this.state.inventoryItems = existing ? this.state.inventoryItems.map((entry) => (entry.id === finalItem.id ? finalItem : entry)) : [finalItem, ...this.state.inventoryItems];
    this.notify();
    return finalItem;
  }

  adjustStock(itemId: string, delta: number) {
    const item = this.state.inventoryItems.find((i) => i.id === itemId);
    if (!item) return;
    this.saveInventoryItem({ ...item, quantityOnHand: Math.max(0, item.quantityOnHand + delta) });
  }

  deleteInventoryItem(itemId: string) {
    this.state.inventoryItems = this.state.inventoryItems.filter((i) => i.id !== itemId);
    this.state.products = this.state.products.map((p) => (p.inventoryItemId === itemId ? { ...p, inventoryItemId: undefined } : p));
    this.notify();
  }

  saveProduct(product: Omit<Product, 'id'> & { id?: string }) {
    const payload: Product = { ...product, id: product.id || uid('prod') };
    const existing = this.state.products.some((item) => item.id === payload.id);
    this.state.products = existing ? this.state.products.map((item) => (item.id === payload.id ? payload : item)) : [payload, ...this.state.products];
    this.notify();
    return payload;
  }

  deleteProduct(productId: string) {
    this.state.products = this.state.products.filter((p) => p.id !== productId);
    this.notify();
  }

  // ---------- notifications ----------
  markNotificationRead(notificationId: string) {
    this.state.notifications = this.state.notifications.map((item) =>
      item.id === notificationId ? { ...item, readAt: item.readAt || new Date().toISOString() } : item,
    );
    this.notify();
  }

  markAllNotificationsRead(userId: string) {
    const nowIso = new Date().toISOString();
    this.state.notifications = this.state.notifications.map((n) => (n.userId === userId && !n.readAt ? { ...n, readAt: nowIso } : n));
    this.notify();
  }

  getApprovalSignatureForEstimate(estimateId: string) {
    return this.state.estimateApprovalSignatures.find((item) => item.estimateId === estimateId);
  }

  getEstimateByApprovalToken(approvalToken: string) {
    const signature = this.state.estimateApprovalSignatures.find((item) => item.approvalToken === approvalToken);
    if (!signature) return null;
    const estimate = this.state.estimates.find((item) => item.id === signature.estimateId);
    if (!estimate) return null;
    const lead = this.leadById(estimate.leadId);
    return lead ? { estimate, lead, signature } : null;
  }

  /** Follow-ups due, overdue invoices, expired estimates. Runs on boot and every minute. */
  runHousekeeping() {
    let changed = false;
    const nowDate = new Date();

    for (const lead of this.state.leads) {
      if (!lead.nextFollowUpDate || new Date(lead.nextFollowUpDate) > nowDate || ['COMPLETED', 'PAID', 'LOST'].includes(lead.status)) continue;
      const alreadyNotified = this.state.notifications.some((n) => n.type === 'FOLLOW_UP_DUE' && n.relatedEntityId === lead.id && !n.readAt);
      if (alreadyNotified) continue;
      this.notifyInternalAdmins('FOLLOW_UP_DUE', 'Follow-up due', `${lead.name} (${serviceLabel(lead.serviceType).toLowerCase()}) has a follow-up due.`, lead.id);
      changed = true;
    }

    this.state.invoices = this.state.invoices.map((inv) => {
      if (['SENT', 'PARTIALLY_PAID'].includes(inv.status) && inv.balanceDue > 0 && new Date(inv.dueDate) < nowDate) {
        changed = true;
        this.notifyInternalAdmins('UNPAID_INVOICE', 'Invoice overdue', `${inv.invoiceNumber} for ${inv.customerName} is past due (${money(inv.balanceDue)}).`, inv.id);
        return { ...inv, status: 'OVERDUE' };
      }
      return inv;
    });

    this.state.estimates = this.state.estimates.map((e) => {
      if (e.status === 'SENT' && new Date(e.expirationDate) < nowDate) {
        changed = true;
        return { ...e, status: 'EXPIRED' };
      }
      return e;
    });

    if (changed) this.notify();
  }

  private notifyInternalAdmins(type: Notification['type'], title: string, message: string, relatedEntityId?: string) {
    const adminRoles: Role[] = ['OWNER', 'OFFICE_MANAGER'];
    for (const user of this.state.users.filter((item) => adminRoles.includes(item.role))) {
      this.state.notifications = [
        { id: uid('note'), userId: user.id, type, title, message, relatedEntityId, createdAt: new Date().toISOString() },
        ...this.state.notifications,
      ].slice(0, 300);
    }
  }

  private updateLeadStatus(leadId: string, status: LeadStatus, notify = true) {
    this.state.leads = this.state.leads.map((lead) => (lead.id === leadId ? { ...lead, status } : lead));
    if (notify) this.notify();
  }
}
