/**
 * Client store: a scoped snapshot of the workspace fetched from the API, plus typed
 * wrappers for every server action. The server is the source of truth; every action
 * returns the fresh scoped state, and the store polls for changes made by teammates.
 */
import type { CRMState, Estimate, Role, ServiceDef, ServiceType, SiteContent, User } from './types';
import { activeServices, isSpecialistService, setServiceCatalog } from './services/catalog';
import { applyBrand } from './services/brand';
import type { CRMEngine } from './core/engine';
import { STATE_VERSION } from './core/seed';

export { computeEstimateTotals, lineItem, uid } from './core/seed';

export type ToastKind = 'success' | 'error' | 'info';
export interface Toast {
  id: string;
  kind: ToastKind;
  message: string;
}

export interface PublicConfig {
  setupRequired: boolean;
  demo: boolean;
  demoPassword?: string;
  demoAccounts?: Array<{ name: string; email: string; role: Role }>;
  companyName: string;
  supportEmail?: string;
  supportPhone?: string;
  address?: string;
  serviceArea?: string;
  stats?: { estimators: number; renovation: number; crews: number; avgApproved: number };
  nextVisits?: Array<{ serviceType: ServiceType; startTime: string; color?: string }>;
  services?: ServiceDef[];
  site?: Partial<SiteContent>;
  brandColor?: string;
  logoUrl?: string | null;
  billing?: BillingStatus;
}

export interface BillingStatus {
  enforced: boolean;
  status: string;
  locked: boolean;
  trialEndsAt?: string | null;
  currentPeriodEnd?: string | null;
  message?: string;
}

export interface AdminUser extends User {
  hasLogin: boolean;
  mustChangePassword: boolean;
  lastLoginAt: string | null;
  activeSessions: number;
}

export interface AuditEntry {
  id: number;
  at: string;
  user_id: string | null;
  action: string;
  detail: string | null;
  ip: string | null;
}

export interface ApprovalView {
  estimate: Estimate;
  lead: { name: string; address: string };
  signature: { approvalStatus: 'PENDING' | 'APPROVED' | 'DECLINED'; signatureName: string; signedAt?: string; declineReason?: string };
  estimator: { name: string; email: string } | null;
  company: { companyName: string; supportEmail?: string; supportPhone?: string };
}

export interface BookingResult {
  lead: { name: string; email: string; address: string };
  appointment: { id: string; serviceType: ServiceType; startTime: string; endTime: string };
  estimatorName?: string;
}

export class ApiError extends Error {
  status: number;
  code?: string;
  constructor(message: string, status: number, code?: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

const EMPTY_STATE: CRMState = {
  version: STATE_VERSION,
  currentUserId: '',
  users: [],
  leads: [],
  appointments: [],
  estimates: [],
  estimateApprovalSignatures: [],
  invoices: [],
  workOrders: [],
  inventoryItems: [],
  products: [],
  notifications: [],
  outbox: [],
  settings: { companyName: 'Company X', ownerName: '', supportEmail: '', supportPhone: '' },
};

const EMPTY_USER: User = { id: '', name: '', email: '', phone: '', role: 'WORKER', active: false, qualifiedForRenovation: false, serviceCapabilities: [] };

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Remote<K extends keyof CRMEngine> = CRMEngine[K] extends (...args: any[]) => any ? (...args: Parameters<CRMEngine[K]>) => Promise<ReturnType<CRMEngine[K]>> : never;

let toastSeq = 0;

class Store {
  state: CRMState = EMPTY_STATE;
  me: User | null = null;
  mustChangePassword = false;
  config: PublicConfig | null = null;
  phase: 'booting' | 'anonymous' | 'ready' = 'booting';
  toasts: Toast[] = [];
  private listeners: Array<() => void> = [];

  // ---------------- plumbing ----------------
  subscribe(listener: () => void) {
    this.listeners.push(listener);
    return () => {
      this.listeners = this.listeners.filter((l) => l !== listener);
    };
  }

  private emit() {
    const settings = this.me ? this.state.settings : undefined;
    setServiceCatalog(settings?.services?.length ? settings.services : this.config?.services);
    applyBrand(settings?.brandColor || this.config?.brandColor);
    this.listeners.forEach((l) => l());
  }

  /** Active services for pickers (workspace settings when signed in, public config otherwise). */
  get services(): ServiceDef[] {
    return activeServices(this.me && this.state.settings.services?.length ? this.state.settings : { services: this.config?.services });
  }

  isSpecialist(key: string) {
    return isSpecialistService(this.me ? this.state.settings : { services: this.config?.services }, key);
  }

  get logoUrl() {
    return this.config?.logoUrl || null;
  }

  get billing() {
    return this.config?.billing;
  }

  async api<T>(path: string, init: { method?: string; body?: unknown } = {}): Promise<T> {
    let res: Response;
    try {
      res = await fetch(`/api${path}`, {
        method: init.method || (init.body !== undefined ? 'POST' : 'GET'),
        credentials: 'same-origin',
        headers: init.body !== undefined ? { 'Content-Type': 'application/json' } : undefined,
        body: init.body !== undefined ? JSON.stringify(init.body) : undefined,
      });
    } catch {
      throw new ApiError('Could not reach the server. Check your connection.', 0);
    }
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      if (res.status === 401 && this.phase === 'ready' && !path.startsWith('/auth/change-password')) {
        this.me = null;
        this.phase = 'anonymous';
        this.emit();
      }
      if (data?.code === 'BILLING_LOCKED') void this.refreshConfig().catch(() => undefined);
      if (data?.code === 'PASSWORD_CHANGE_REQUIRED') {
        this.mustChangePassword = true;
        this.emit();
      }
      throw new ApiError(data?.error || `Request failed (${res.status})`, res.status, data?.code);
    }
    return data as T;
  }

  toast(message: string, kind: ToastKind = 'success') {
    const t = { id: `t${++toastSeq}`, kind, message };
    this.toasts = [...this.toasts, t];
    this.emit();
    setTimeout(() => this.dismissToast(t.id), 4200);
  }

  dismissToast(id: string) {
    this.toasts = this.toasts.filter((t) => t.id !== id);
    this.emit();
  }

  // ---------------- session ----------------
  async bootstrap() {
    try {
      this.config = await this.api<PublicConfig>('/public/config');
    } catch {
      this.config = { setupRequired: false, demo: false, companyName: 'Company X' };
    }
    try {
      const me = await this.api<{ user: User; mustChangePassword: boolean }>('/auth/me');
      this.me = me.user;
      this.mustChangePassword = me.mustChangePassword;
      if (!me.mustChangePassword) await this.refresh();
      this.phase = 'ready';
    } catch {
      this.phase = 'anonymous';
    }
    this.emit();
  }

  async refreshConfig() {
    this.config = await this.api<PublicConfig>('/public/config');
    this.emit();
  }

  get isAuthenticated() {
    return this.phase === 'ready' && !!this.me;
  }

  get currentUser(): User {
    const fresh = this.me ? this.state.users.find((u) => u.id === this.me!.id) : undefined;
    return fresh || this.me || EMPTY_USER;
  }

  async login(email: string, password: string, remember: boolean) {
    const r = await this.api<{ user: User; mustChangePassword: boolean }>('/auth/login', { body: { email, password, remember } });
    this.me = r.user;
    this.mustChangePassword = r.mustChangePassword;
    if (!r.mustChangePassword) await this.refresh();
    this.phase = 'ready';
    this.emit();
    return r;
  }

  async setup(input: { companyName: string; name: string; email: string; password: string }) {
    await this.api('/setup', { body: input });
    await this.bootstrap();
  }

  async logout() {
    try {
      await this.api('/auth/logout', { body: {} });
    } finally {
      this.me = null;
      this.state = EMPTY_STATE;
      this.phase = 'anonymous';
      this.mustChangePassword = false;
      this.emit();
    }
  }

  async changePassword(current: string, next: string) {
    await this.api('/auth/change-password', { body: { current, next } });
    this.mustChangePassword = false;
    await this.refresh();
    this.emit();
  }

  logoutEverywhere() {
    return this.api('/auth/logout-all', { body: {} });
  }

  forgotPassword(email: string) {
    return this.api<{ ok: true; emailEnabled: boolean }>('/auth/forgot', { body: { email } });
  }

  resetPassword(token: string, password: string) {
    return this.api('/auth/reset', { body: { token, password } });
  }

  async updateProfile(name: string, phone: string) {
    const r = await this.api<{ user: User }>('/account/profile', { method: 'PATCH', body: { name, phone } });
    this.me = r.user;
    await this.refresh();
  }

  // ---------------- workspace data ----------------
  async refresh() {
    const r = await this.api<{ state: CRMState }>('/state');
    this.state = r.state;
    this.emit();
  }

  private inflight = new Map<string, Promise<unknown>>();

  /** Identical calls already in flight (e.g. a double-clicked Save) share one request. */
  private action(name: string, args: unknown[]) {
    const key = `${name}:${JSON.stringify(args)}`;
    const existing = this.inflight.get(key);
    if (existing) return existing;
    const p = this.doAction(name, args).finally(() => this.inflight.delete(key));
    this.inflight.set(key, p);
    return p;
  }

  private async doAction(name: string, args: unknown[]) {
    try {
      const r = await this.api<{ result: unknown; state: CRMState }>(`/actions/${name}`, { body: { args } });
      this.state = r.state;
      this.emit();
      return r.result;
    } catch (e) {
      this.toast(e instanceof Error ? e.message : 'Something went wrong', 'error');
      throw e;
    }
  }

  private remote<K extends keyof CRMEngine>(name: K): Remote<K> {
    return ((...args: unknown[]) => this.action(String(name), args)) as unknown as Remote<K>;
  }

  saveLead = this.remote('saveLead');
  addLeadActivity = this.remote('addLeadActivity');
  setLeadStatus = this.remote('setLeadStatus');
  deleteLead = this.remote('deleteLead');
  saveAppointment = this.remote('saveAppointment');
  setAppointmentStatus = this.remote('setAppointmentStatus');
  sendAppointmentReminder = this.remote('sendAppointmentReminder');
  saveEstimate = this.remote('saveEstimate');
  deleteEstimate = this.remote('deleteEstimate');
  sendEstimate = this.remote('sendEstimate');
  setEstimateStatus = this.remote('setEstimateStatus');
  createInvoiceFromEstimate = this.remote('createInvoiceFromEstimate');
  sendInvoice = this.remote('sendInvoice');
  recordPayment = this.remote('recordPayment');
  updateInvoiceStatus = this.remote('updateInvoiceStatus');
  saveWorkOrder = this.remote('saveWorkOrder');
  updateWorkOrderStatus = this.remote('updateWorkOrderStatus');
  toggleChecklistItem = this.remote('toggleChecklistItem');
  deleteWorkOrder = this.remote('deleteWorkOrder');
  saveInventoryItem = this.remote('saveInventoryItem');
  adjustStock = this.remote('adjustStock');
  deleteInventoryItem = this.remote('deleteInventoryItem');
  saveProduct = this.remote('saveProduct');
  deleteProduct = this.remote('deleteProduct');
  markNotificationRead = this.remote('markNotificationRead');
  markAllNotificationsRead = this.remote('markAllNotificationsRead');
  saveSettings = this.remote('saveSettings');
  importLeads = this.remote('importLeads');

  async uploadAttachment(workOrderId: string, file: File) {
    const res = await fetch(`/api/work-orders/${encodeURIComponent(workOrderId)}/attachments?name=${encodeURIComponent(file.name)}`, {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'Content-Type': file.type || 'application/octet-stream', 'X-CF-Upload': '1' },
      body: file,
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      const msg = res.status === 413 ? `${file.name} is larger than 15 MB.` : data?.error || 'Upload failed.';
      this.toast(msg, 'error');
      throw new ApiError(msg, res.status);
    }
    this.state = data.state;
    this.emit();
  }

  attachmentUrl(workOrderId: string, fileId: string) {
    return `/api/work-orders/${encodeURIComponent(workOrderId)}/attachments/${encodeURIComponent(fileId)}`;
  }

  // ---------------- read helpers ----------------
  usersByRole(role: Role) {
    return this.state.users.filter((user) => user.role === role && user.active);
  }

  userName(id?: string | null) {
    return this.state.users.find((u) => u.id === id)?.name || 'Unassigned';
  }

  leadById(id?: string) {
    return this.state.leads.find((l) => l.id === id);
  }

  getApprovalSignatureForEstimate(estimateId: string) {
    return this.state.estimateApprovalSignatures.find((item) => item.estimateId === estimateId);
  }

  approvalLink(estimateId: string) {
    const signature = this.getApprovalSignatureForEstimate(estimateId);
    return signature ? `${window.location.origin}/#approve/${signature.approvalToken}` : '';
  }

  // ---------------- admin ----------------
  adminUsers() {
    return this.api<{ users: AdminUser[] }>('/admin/users').then((r) => r.users);
  }

  async createUser(input: Partial<User> & { password?: string; sendInvite?: boolean }) {
    const r = await this.api<{ user: AdminUser; tempPassword?: string }>('/admin/users', { body: input });
    await this.refresh();
    return r;
  }

  async updateUser(id: string, input: Partial<User>) {
    const r = await this.api<{ user: AdminUser }>(`/admin/users/${encodeURIComponent(id)}`, { method: 'PATCH', body: input });
    await this.refresh();
    return r.user;
  }

  adminResetPassword(id: string) {
    return this.api<{ tempPassword: string }>(`/admin/users/${encodeURIComponent(id)}/reset-password`, { body: {} });
  }

  revokeSessions(id: string) {
    return this.api(`/admin/users/${encodeURIComponent(id)}/revoke-sessions`, { body: {} });
  }

  auditLog(limit = 200) {
    return this.api<{ entries: AuditEntry[] }>(`/admin/audit?limit=${limit}`).then((r) => r.entries);
  }

  system() {
    return this.api<{ version: string; demo: boolean; providers: { email: boolean; sms: boolean }; dbSizeBytes: number; appUrl: string | null; timeZone: string; users: number }>(
      '/admin/system',
    );
  }

  exportBackup() {
    return this.api<CRMState>('/admin/export');
  }

  async importBackup(state: unknown) {
    await this.api('/admin/import', { body: state });
    await this.refresh();
  }

  async resetDemo() {
    await this.api('/admin/reset-demo', { body: {} });
    await this.refresh();
  }

  // ---------------- branding ----------------
  async uploadLogo(dataUrl: string) {
    await this.api('/admin/logo', { body: { dataUrl } });
    await this.refreshConfig();
  }

  async removeLogo() {
    await this.api('/admin/logo', { method: 'DELETE', body: {} });
    await this.refreshConfig();
  }

  // ---------------- subscription billing ----------------
  billingInfo() {
    return this.api<BillingStatus & { configured: boolean }>('/admin/billing');
  }

  async startCheckout() {
    const r = await this.api<{ url: string }>('/admin/billing/checkout', { body: {} });
    window.location.href = r.url;
  }

  async openBillingPortal() {
    const r = await this.api<{ url: string }>('/admin/billing/portal', { body: {} });
    window.location.href = r.url;
  }

  async syncBilling() {
    const r = await this.api<BillingStatus>('/admin/billing/sync', { body: {} });
    await this.refreshConfig();
    return r;
  }

  async confirmCheckout(sessionId: string) {
    const r = await this.api<BillingStatus>('/admin/billing/confirm', { body: { sessionId } });
    await this.refreshConfig();
    return r;
  }

  // ---------------- public ----------------
  book(input: { name: string; email: string; phone: string; address: string; budget: number; serviceType: ServiceType; preferredDateTime: string; notes: string; website?: string }) {
    return this.api<BookingResult>('/public/booking', { body: input });
  }

  getApproval(token: string) {
    return this.api<ApprovalView>(`/public/approvals/${encodeURIComponent(token)}`);
  }

  approveEstimate(token: string, name: string) {
    return this.api<ApprovalView>(`/public/approvals/${encodeURIComponent(token)}/approve`, { body: { name, agree: true } });
  }

  declineEstimate(token: string, reason: string) {
    return this.api<ApprovalView>(`/public/approvals/${encodeURIComponent(token)}/decline`, { body: { reason } });
  }
}

export const store = new Store();

if (typeof window !== 'undefined') {
  // Rejected actions already raised a toast; don't log them as unhandled.
  window.addEventListener('unhandledrejection', (e) => {
    if (e.reason instanceof ApiError) e.preventDefault();
  });
  const poll = () => {
    if (document.visibilityState !== 'visible') return;
    void store.refreshConfig().catch(() => undefined);
    if (store.isAuthenticated && !store.mustChangePassword) void store.refresh().catch(() => undefined);
  };
  window.setInterval(poll, 30_000);
  window.addEventListener('focus', poll);
}
