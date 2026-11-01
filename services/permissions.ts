import type { CRMState, Lead, Role, User } from '../types';

export type AppPage =
  | 'dashboard'
  | 'leads'
  | 'appointments'
  | 'estimates'
  | 'work-orders'
  | 'invoices'
  | 'inventory'
  | 'products'
  | 'team'
  | 'settings'
  | 'outbox'
  | 'admin'
  | 'account';

export type Action =
  | 'lead:create'
  | 'lead:edit'
  | 'lead:delete'
  | 'lead:assign'
  | 'appointment:manage'
  | 'estimate:create'
  | 'estimate:send'
  | 'invoice:manage'
  | 'workorder:create'
  | 'workorder:update-status'
  | 'inventory:manage'
  | 'product:manage'
  | 'team:manage'
  | 'settings:manage'
  | 'data:reset';

const ADMIN_ROLES: Role[] = ['OWNER', 'MANAGER', 'OFFICE_MANAGER'];

export const isAdminRole = (role: Role) => ADMIN_ROLES.includes(role);

/** Who can run site visits and write estimates. Small companies often have the owner do it. */
export const ESTIMATE_ROLES: Role[] = ['ESTIMATOR', 'OWNER', 'MANAGER', 'OFFICE_MANAGER', 'SALES_REP'];
/** Estimators first, then anyone else who can run a visit. */
export const estimatorPool = (users: User[]) => {
  const act = users.filter((u) => u.active && ESTIMATE_ROLES.includes(u.role));
  return [...act.filter((u) => u.role === 'ESTIMATOR'), ...act.filter((u) => u.role !== 'ESTIMATOR')];
};
/** Crews and subcontractors first, then any other active user (owner-operators do their own jobs). */
export const crewPool = (users: User[]) => {
  const act = users.filter((u) => u.active);
  const crew = (u: User) => u.role === 'WORKER' || u.role === 'SUBCONTRACTOR';
  return [...act.filter(crew), ...act.filter((u) => !crew(u))];
};

const PAGE_ACCESS: Record<AppPage, Role[]> = {
  dashboard: ['OWNER', 'MANAGER', 'OFFICE_MANAGER', 'DISPATCHER', 'SALES_REP', 'ESTIMATOR', 'WORKER', 'SUBCONTRACTOR'],
  leads: ['OWNER', 'MANAGER', 'OFFICE_MANAGER', 'DISPATCHER', 'SALES_REP', 'ESTIMATOR'],
  appointments: ['OWNER', 'MANAGER', 'OFFICE_MANAGER', 'DISPATCHER', 'SALES_REP', 'ESTIMATOR'],
  estimates: ['OWNER', 'MANAGER', 'OFFICE_MANAGER', 'SALES_REP', 'ESTIMATOR'],
  'work-orders': ['OWNER', 'MANAGER', 'OFFICE_MANAGER', 'DISPATCHER', 'WORKER', 'SUBCONTRACTOR'],
  invoices: ['OWNER', 'MANAGER', 'OFFICE_MANAGER'],
  inventory: ['OWNER', 'MANAGER', 'OFFICE_MANAGER'],
  products: ['OWNER', 'MANAGER', 'OFFICE_MANAGER', 'SALES_REP', 'ESTIMATOR'],
  team: ['OWNER', 'MANAGER', 'OFFICE_MANAGER', 'DISPATCHER'],
  settings: ['OWNER', 'MANAGER', 'OFFICE_MANAGER'],
  outbox: ['OWNER', 'MANAGER', 'OFFICE_MANAGER'],
  admin: ['OWNER', 'MANAGER', 'OFFICE_MANAGER'],
  account: ['OWNER', 'MANAGER', 'OFFICE_MANAGER', 'DISPATCHER', 'SALES_REP', 'ESTIMATOR', 'WORKER', 'SUBCONTRACTOR'],
};

const ACTIONS: Record<Action, Role[]> = {
  'lead:create': ['OWNER', 'MANAGER', 'OFFICE_MANAGER', 'DISPATCHER', 'SALES_REP'],
  'lead:edit': ['OWNER', 'MANAGER', 'OFFICE_MANAGER', 'DISPATCHER', 'SALES_REP', 'ESTIMATOR'],
  'lead:delete': ['OWNER', 'MANAGER'],
  'lead:assign': ['OWNER', 'MANAGER', 'OFFICE_MANAGER', 'DISPATCHER'],
  'appointment:manage': ['OWNER', 'MANAGER', 'OFFICE_MANAGER', 'DISPATCHER', 'SALES_REP', 'ESTIMATOR'],
  'estimate:create': ['OWNER', 'MANAGER', 'OFFICE_MANAGER', 'ESTIMATOR'],
  'estimate:send': ['OWNER', 'MANAGER', 'OFFICE_MANAGER', 'SALES_REP', 'ESTIMATOR'],
  'invoice:manage': ['OWNER', 'MANAGER', 'OFFICE_MANAGER'],
  'workorder:create': ['OWNER', 'MANAGER', 'OFFICE_MANAGER', 'DISPATCHER'],
  'workorder:update-status': ['OWNER', 'MANAGER', 'OFFICE_MANAGER', 'DISPATCHER', 'WORKER', 'SUBCONTRACTOR'],
  'inventory:manage': ['OWNER', 'MANAGER', 'OFFICE_MANAGER'],
  'product:manage': ['OWNER', 'MANAGER', 'OFFICE_MANAGER'],
  'team:manage': ['OWNER', 'MANAGER'],
  'settings:manage': ['OWNER', 'MANAGER', 'OFFICE_MANAGER'],
  'data:reset': ['OWNER'],
};

export const canAccessPage = (user: User | undefined, page: string): page is AppPage =>
  !!user && page in PAGE_ACCESS && PAGE_ACCESS[page as AppPage].includes(user.role);

export const can = (user: User | undefined, action: Action) => !!user && ACTIONS[action].includes(user.role);

/** Row-level scoping — every list in the UI goes through these. */
export const scopeLeads = (user: User, state: CRMState): Lead[] => {
  if (isAdminRole(user.role) || user.role === 'DISPATCHER') return state.leads;
  if (user.role === 'SALES_REP') return state.leads.filter((l) => l.assignedSalesRepId === user.id);
  if (user.role === 'ESTIMATOR') return state.leads.filter((l) => l.assignedEstimatorId === user.id);
  const leadIds = new Set(state.workOrders.filter((w) => w.assignedWorkerId === user.id).map((w) => w.leadId));
  return state.leads.filter((l) => leadIds.has(l.id));
};

export const scopeAppointments = (user: User, state: CRMState) => {
  if (isAdminRole(user.role) || user.role === 'DISPATCHER') return state.appointments;
  if (user.role === 'ESTIMATOR') return state.appointments.filter((a) => a.estimatorId === user.id);
  const ids = new Set(scopeLeads(user, state).map((l) => l.id));
  return state.appointments.filter((a) => ids.has(a.leadId));
};

export const scopeEstimates = (user: User, state: CRMState) => {
  if (isAdminRole(user.role)) return state.estimates;
  if (user.role === 'ESTIMATOR') return state.estimates.filter((e) => e.estimatorId === user.id);
  const ids = new Set(scopeLeads(user, state).map((l) => l.id));
  return state.estimates.filter((e) => ids.has(e.leadId));
};

export const scopeWorkOrders = (user: User, state: CRMState) => {
  if (isAdminRole(user.role) || user.role === 'DISPATCHER') return state.workOrders;
  return state.workOrders.filter((w) => w.assignedWorkerId === user.id);
};

export const scopeInvoices = (user: User, state: CRMState) => (isAdminRole(user.role) ? state.invoices : []);
