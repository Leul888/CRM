/**
 * Server-side authorization for every mutating action the UI can call.
 * Each guard checks the role permission AND that the target record is inside the
 * caller's row-level scope, and sanitizes fields a role must not set.
 * Returning a string rejects the call with 403 and that message.
 */
import type { CRMState, Estimate, Lead, User, WorkOrder } from '../types';
import type { CRMEngine } from '../core/engine';
import { can, isAdminRole, scopeAppointments, scopeEstimates, scopeInvoices, scopeLeads, scopeWorkOrders, type Action } from '../services/permissions';

type Ctx = { user: User; state: CRMState };
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Args = any[];
type Guard = (ctx: Ctx, args: Args) => string | null;

const LEAD_STATUSES = ['NEW', 'CONTACTED', 'SCHEDULED', 'ESTIMATE_SENT', 'APPROVED', 'JOB_SCHEDULED', 'IN_PROGRESS', 'COMPLETED', 'INVOICED', 'PAID', 'LOST'];
const DENIED = "You don't have permission to do that.";
const NOT_FOUND = 'That record no longer exists or is outside your access.';

const perm = (action: Action): Guard => ({ user }) => (can(user, action) ? null : DENIED);
const all = (...guards: Guard[]): Guard => (ctx, args) => {
  for (const g of guards) {
    const r = g(ctx, args);
    if (r) return r;
  }
  return null;
};
const str = (v: unknown) => typeof v === 'string' && v.length > 0 && v.length < 200;
const obj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);

const leadIn = (ctx: Ctx, id: unknown) => str(id) && scopeLeads(ctx.user, ctx.state).some((l) => l.id === id);
const apptIn = (ctx: Ctx, id: unknown) => str(id) && scopeAppointments(ctx.user, ctx.state).some((a) => a.id === id);
const estIn = (ctx: Ctx, id: unknown) => str(id) && scopeEstimates(ctx.user, ctx.state).some((e) => e.id === id);
const woIn = (ctx: Ctx, id: unknown) => str(id) && scopeWorkOrders(ctx.user, ctx.state).some((w) => w.id === id);
const invIn = (ctx: Ctx, id: unknown) => str(id) && scopeInvoices(ctx.user, ctx.state).some((i) => i.id === id);

const argIn = (i: number, check: (ctx: Ctx, id: unknown) => boolean): Guard => (ctx, args) => (check(ctx, args[i]) ? null : NOT_FOUND);
const argObj = (i: number): Guard => (_ctx, args) => (obj(args[i]) ? null : 'Invalid request.');

export const ACTION_GUARDS: Record<string, Guard> = {
  // ----- leads -----
  saveLead: all(argObj(0), (ctx, args) => {
    const lead = args[0] as Partial<Lead>;
    const existing = lead.id ? ctx.state.leads.find((l) => l.id === lead.id) : undefined;
    if (lead.id && !existing) return NOT_FOUND;
    if (existing) {
      if (!can(ctx.user, 'lead:edit') || !leadIn(ctx, existing.id)) return DENIED;
    } else if (!can(ctx.user, 'lead:create')) return DENIED;
    if (typeof lead.name !== 'string' || !lead.name.trim() || lead.name.length > 200) return 'Name is required.';
    if (!can(ctx.user, 'lead:assign')) {
      lead.assignedSalesRepId = existing ? existing.assignedSalesRepId : ctx.user.role === 'SALES_REP' ? ctx.user.id : undefined;
      lead.assignedEstimatorId = existing ? existing.assignedEstimatorId : ctx.user.role === 'ESTIMATOR' ? ctx.user.id : undefined;
    }
    lead.activity = existing?.activity || [];
    lead.createdAt = existing?.createdAt;
    lead.budget = Math.max(0, Number(lead.budget) || 0);
    return null;
  }),
  addLeadActivity: all(perm('lead:edit'), argIn(0, leadIn), (_c, a) => (typeof a[1] === 'string' && a[1].trim() && a[1].length < 4000 && ['NOTE', 'CALL', 'EMAIL'].includes(a[2]) ? null : 'Note is empty.')),
  setLeadStatus: all(perm('lead:edit'), argIn(0, leadIn), (_c, a) => (LEAD_STATUSES.includes(a[1]) ? null : 'Invalid status.')),
  deleteLead: all(perm('lead:delete'), argIn(0, leadIn)),

  // ----- appointments -----
  saveAppointment: all(perm('appointment:manage'), argObj(0), (ctx, args) => {
    const a = args[0];
    if (a.id && !apptIn(ctx, a.id)) return NOT_FOUND;
    if (!leadIn(ctx, a.leadId)) return NOT_FOUND;
    if (!ctx.state.users.some((u) => u.id === a.estimatorId && u.role === 'ESTIMATOR')) return 'Choose a valid estimator.';
    if (isNaN(Date.parse(a.startTime)) || isNaN(Date.parse(a.endTime))) return 'Invalid time.';
    args[1] = undefined;
    return null;
  }),
  setAppointmentStatus: all(perm('appointment:manage'), argIn(0, apptIn), (_c, a) => (['REQUESTED', 'SCHEDULED', 'CONFIRMED', 'COMPLETED', 'CANCELLED'].includes(a[1]) ? null : 'Invalid status.')),
  sendAppointmentReminder: all(perm('appointment:manage'), argIn(0, apptIn)),

  // ----- estimates -----
  saveEstimate: all(perm('estimate:create'), argObj(0), (ctx, args) => {
    const e = args[0] as Partial<Estimate>;
    const existing = e.id ? ctx.state.estimates.find((x) => x.id === e.id) : undefined;
    if (e.id && (!existing || !estIn(ctx, e.id))) return NOT_FOUND;
    if (existing?.status === 'APPROVED') return 'Approved estimates are locked.';
    if (!leadIn(ctx, e.leadId)) return NOT_FOUND;
    if (!Array.isArray(e.lineItems) || e.lineItems.length === 0 || e.lineItems.length > 200) return 'Add at least one line item.';
    // Status is controlled by the workflow, never by the editor payload.
    e.status = existing && existing.status !== 'REJECTED' && existing.status !== 'EXPIRED' ? existing.status : 'DRAFT';
    e.number = existing?.number;
    e.createdAt = existing?.createdAt;
    return null;
  }),
  deleteEstimate: all(perm('lead:delete'), argIn(0, estIn)),
  sendEstimate: all(perm('estimate:send'), argIn(0, estIn)),
  setEstimateStatus: all(perm('invoice:manage'), argIn(0, estIn), (_c, a) => (['APPROVED', 'DRAFT', 'EXPIRED', 'REJECTED'].includes(a[1]) ? null : 'Invalid status.')),

  // ----- invoices -----
  createInvoiceFromEstimate: all(perm('invoice:manage'), argIn(0, estIn), (_c, a) => {
    a[1] = true;
    return null;
  }),
  sendInvoice: all(perm('invoice:manage'), argIn(0, invIn)),
  recordPayment: all(perm('invoice:manage'), argIn(0, invIn), (_c, a) => (Number.isFinite(Number(a[1])) ? ((a[1] = Number(a[1])), null) : 'Invalid amount.')),
  updateInvoiceStatus: all(perm('invoice:manage'), argIn(0, invIn), (_c, a) => (['CANCELLED', 'SENT', 'DRAFT'].includes(a[1]) ? null : 'Use Record payment to mark invoices paid.')),

  // ----- work orders -----
  saveWorkOrder: all(perm('workorder:create'), argObj(0), (ctx, args) => {
    const w = args[0] as Partial<WorkOrder>;
    const existing = w.id ? ctx.state.workOrders.find((x) => x.id === w.id) : undefined;
    if (w.id && !existing) return NOT_FOUND;
    const est = ctx.state.estimates.find((e) => e.id === w.estimateId);
    if (!est || est.status !== 'APPROVED') return 'Work orders need an approved estimate.';
    w.leadId = est.leadId;
    w.status = existing?.status || 'ASSIGNED';
    w.attachments = existing?.attachments || [];
    if (!ctx.state.users.some((u) => u.id === w.assignedWorkerId && ['WORKER', 'SUBCONTRACTOR'].includes(u.role))) return 'Assign a crew member.';
    return null;
  }),
  updateWorkOrderStatus: all(perm('workorder:update-status'), argIn(0, woIn), (ctx, a) => {
    const crew = ctx.user.role === 'WORKER' || ctx.user.role === 'SUBCONTRACTOR';
    if (crew && !['ACCEPTED', 'IN_PROGRESS', 'COMPLETED'].includes(a[1])) return DENIED;
    return ['ASSIGNED', 'ACCEPTED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED'].includes(a[1]) ? null : 'Invalid status.';
  }),
  toggleChecklistItem: all(perm('workorder:update-status'), argIn(0, woIn)),
  deleteWorkOrder: all(perm('lead:delete'), argIn(0, woIn)),

  // ----- inventory & products -----
  saveInventoryItem: all(perm('inventory:manage'), argObj(0)),
  adjustStock: all(perm('inventory:manage'), (_c, a) => (Number.isFinite(Number(a[1])) ? null : 'Invalid amount.')),
  deleteInventoryItem: perm('inventory:manage'),
  saveProduct: all(perm('product:manage'), argObj(0)),
  deleteProduct: perm('product:manage'),

  // ----- notifications (always own) -----
  markNotificationRead: (ctx, a) => (ctx.state.notifications.some((n) => n.id === a[0] && n.userId === ctx.user.id) ? null : NOT_FOUND),
  markAllNotificationsRead: (ctx, a) => {
    a[0] = ctx.user.id;
    return null;
  },

  importLeads: all(perm('settings:manage'), (_c, a) => (Array.isArray(a[0]) && a[0].length > 0 && a[0].length <= 5000 ? null : 'Import between 1 and 5,000 rows.')),

  // ----- company -----
  saveSettings: all(perm('settings:manage'), argObj(0), (ctx, a) => {
    const next = a[0] as Record<string, unknown>;
    // Logo is managed by its own endpoint; never through settings.
    delete next.logoDataUrl;
    delete next.logoVersion;
    if (next.brandColor !== undefined && !/^#[0-9a-f]{6}$/i.test(String(next.brandColor))) return 'Brand color must look like #4b3ab3.';
    // Phone alerts are managed by their own admin endpoint.
    delete next.ntfyTopic;
    if (next.services !== undefined) {
      const list = next.services as Array<Record<string, unknown>>;
      if (!Array.isArray(list) || list.length === 0 || list.length > 60) return 'Keep between 1 and 60 services.';
      const keys = new Set<string>();
      for (const sv of list) {
        if (typeof sv?.key !== 'string' || !/^[A-Z0-9_]{1,48}$/.test(sv.key) || keys.has(sv.key)) return 'Each service needs a unique name.';
        if (typeof sv.label !== 'string' || !sv.label.trim() || sv.label.length > 80) return 'Each service needs a name (80 characters max).';
        keys.add(sv.key);
        sv.description = typeof sv.description === 'string' ? sv.description.slice(0, 300) : '';
        sv.specialist = !!sv.specialist;
        sv.active = sv.active !== false;
      }
      if (!list.some((x) => x.active)) return 'Keep at least one service active.';
    }
    if (next.site !== undefined) {
      const site = next.site as Record<string, unknown>;
      if (!obj(site)) return 'Invalid website content.';
      for (const k of ['heroTitle', 'heroHighlight', 'heroSubtitle', 'ctaTitle', 'ctaSubtitle']) {
        if (site[k] !== undefined && (typeof site[k] !== 'string' || (site[k] as string).length > 400)) return 'Website text is too long.';
      }
      if (site.faqs !== undefined) {
        const faqs = site.faqs as Array<Record<string, unknown>>;
        if (!Array.isArray(faqs) || faqs.length > 20) return 'Up to 20 FAQs.';
        site.faqs = faqs
          .filter((f) => typeof f?.q === 'string' && typeof f?.a === 'string' && f.q.trim())
          .map((f) => ({ q: String(f.q).slice(0, 200), a: String(f.a).slice(0, 1500) }));
      }
    }
    void ctx;
    return null;
  }),
};

export const runAction = (engine: CRMEngine, name: string, args: Args) =>
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (engine as any)[name](...args);

/** Row-level scoped snapshot for one user. Never includes credentials. */
export const scopeState = (user: User, state: CRMState): CRMState => {
  const admin = isAdminRole(user.role);
  const leads = scopeLeads(user, state);
  const estimates = scopeEstimates(user, state);
  const estIds = new Set(estimates.map((e) => e.id));
  const seesCatalog = admin || ['SALES_REP', 'ESTIMATOR', 'DISPATCHER'].includes(user.role);
  return {
    ...state,
    currentUserId: user.id,
    leads,
    appointments: scopeAppointments(user, state),
    estimates,
    estimateApprovalSignatures: state.estimateApprovalSignatures.filter((s) => estIds.has(s.estimateId)),
    invoices: scopeInvoices(user, state),
    workOrders: scopeWorkOrders(user, state),
    inventoryItems: admin ? state.inventoryItems : seesCatalog ? state.inventoryItems.map((i) => ({ ...i, unitCost: 0, supplier: '' })) : [],
    products: seesCatalog ? state.products : [],
    notifications: state.notifications.filter((n) => n.userId === user.id).slice(0, 100),
    outbox: admin ? state.outbox.slice(0, 300) : [],
    users: state.users,
    settings: (({ logoDataUrl: _logo, ntfyTopic, ...rest }) => (admin ? { ...rest, ntfyTopic } : rest))(state.settings),
  };
};
