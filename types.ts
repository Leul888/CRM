export type Role =
  | 'OWNER'
  | 'MANAGER'
  | 'OFFICE_MANAGER'
  | 'DISPATCHER'
  | 'SALES_REP'
  | 'ESTIMATOR'
  | 'WORKER'
  | 'SUBCONTRACTOR';

/** Key of a service in the company's catalog (see CompanySettings.services). */
export type ServiceType = string;

export interface ServiceDef {
  key: string;
  label: string;
  description: string;
  /** Only specialist-qualified estimators may be assigned (e.g. kitchens, baths, new builds). */
  specialist: boolean;
  active: boolean;
}

export interface SiteContent {
  heroTitle: string;
  heroHighlight: string;
  heroSubtitle: string;
  ctaTitle: string;
  ctaSubtitle: string;
  faqs: Array<{ q: string; a: string }>;
}

export type LeadStatus =
  | 'NEW'
  | 'CONTACTED'
  | 'SCHEDULED'
  | 'ESTIMATE_SENT'
  | 'APPROVED'
  | 'JOB_SCHEDULED'
  | 'IN_PROGRESS'
  | 'COMPLETED'
  | 'INVOICED'
  | 'PAID'
  | 'LOST';

export type LeadSource = 'WEBSITE' | 'CALL_CENTER' | 'SOCIAL_MEDIA' | 'REFERRAL' | 'MANUAL';

export type AppointmentStatus = 'REQUESTED' | 'SCHEDULED' | 'CONFIRMED' | 'COMPLETED' | 'CANCELLED';

export type ReminderStatus = 'PENDING' | 'QUEUED' | 'SENT' | 'FAILED';

export type EstimateStatus = 'DRAFT' | 'SENT' | 'APPROVED' | 'REJECTED' | 'EXPIRED';

export type InvoiceStatus = 'DRAFT' | 'SENT' | 'PARTIALLY_PAID' | 'PAID' | 'OVERDUE' | 'CANCELLED';

export type WorkOrderStatus = 'ASSIGNED' | 'ACCEPTED' | 'IN_PROGRESS' | 'COMPLETED' | 'CANCELLED';

export type PaymentMethod = 'CARD' | 'ACH' | 'CHECK' | 'CASH' | 'OTHER';

export type NotificationType =
  | 'NEW_LEAD'
  | 'FOLLOW_UP_DUE'
  | 'APPOINTMENT_REMINDER'
  | 'ESTIMATE_APPROVED'
  | 'ESTIMATE_DECLINED'
  | 'JOB_COMPLETED'
  | 'UNPAID_INVOICE'
  | 'PAYMENT_RECEIVED'
  | 'SYSTEM';

export interface User {
  id: string;
  name: string;
  email: string;
  phone: string;
  role: Role;
  active: boolean;
  qualifiedForRenovation: boolean;
  serviceCapabilities: ServiceType[];
  calendarColor?: string;
}

export interface LeadActivity {
  id: string;
  at: string;
  userId?: string;
  kind: 'NOTE' | 'CALL' | 'EMAIL' | 'STATUS' | 'SYSTEM';
  text: string;
}

export interface Lead {
  id: string;
  name: string;
  email: string;
  phone: string;
  address: string;
  budget: number;
  serviceType: ServiceType;
  status: LeadStatus;
  assignedSalesRepId?: string;
  assignedEstimatorId?: string;
  source: LeadSource;
  notes: string;
  createdAt: string;
  nextFollowUpDate?: string;
  activity?: LeadActivity[];
}

export interface Appointment {
  id: string;
  leadId: string;
  estimatorId: string;
  startTime: string;
  endTime: string;
  serviceType: ServiceType;
  status: AppointmentStatus;
  googleCalendarEventId?: string;
  reminderStatus: ReminderStatus;
  notes?: string;
}

export interface EstimateLineItem {
  id: string;
  description: string;
  category: string;
  quantity: number;
  unit: string;
  unitPrice: number;
  total: number;
  productId?: string;
}

export interface Estimate {
  id: string;
  number?: string;
  leadId: string;
  estimatorId: string;
  serviceType: ServiceType;
  lineItems: EstimateLineItem[];
  materialCost: number;
  laborCost: number;
  quantity: number;
  unitPrice: number;
  discount: number;
  taxRate?: number;
  tax: number;
  total: number;
  status: EstimateStatus;
  notes: string;
  expirationDate: string;
  createdAt: string;
}

export interface EstimateApprovalSignature {
  id: string;
  estimateId: string;
  signatureName: string;
  signedAt?: string;
  clientIp?: string;
  userAgent?: string;
  declineReason?: string;
  approvalToken: string;
  approvalStatus: 'PENDING' | 'APPROVED' | 'DECLINED';
}

export interface InvoiceLineItem {
  id: string;
  description: string;
  quantity: number;
  unit: string;
  unitPrice: number;
  total: number;
}

export interface Payment {
  id: string;
  amount: number;
  method: PaymentMethod;
  reference?: string;
  receivedAt: string;
}

export interface Invoice {
  id: string;
  estimateId: string;
  leadId: string;
  invoiceNumber: string;
  customerName: string;
  customerEmail: string;
  customerPhone: string;
  lineItems: InvoiceLineItem[];
  subtotal: number;
  tax: number;
  total: number;
  amountPaid: number;
  balanceDue: number;
  status: InvoiceStatus;
  dueDate: string;
  createdAt: string;
  payments?: Payment[];
}

export interface WorkOrder {
  id: string;
  estimateId: string;
  leadId: string;
  assignedWorkerId: string;
  scopeOfWork: string;
  location: string;
  scheduledStart: string;
  scheduledEnd: string;
  status: WorkOrderStatus;
  notes: string;
  attachments: string[];
  checklist?: Array<{ id: string; label: string; done: boolean }>;
}

export interface InventoryItem {
  id: string;
  name: string;
  sku: string;
  category: string;
  quantityOnHand: number;
  unitCost: number;
  salePrice: number;
  supplier: string;
  reorderThreshold: number;
  status: 'IN_STOCK' | 'LOW_STOCK' | 'OUT_OF_STOCK';
}

export interface Product {
  id: string;
  name: string;
  sku: string;
  category: string;
  description: string;
  price: number;
  unit?: string;
  inventoryItemId?: string;
  active: boolean;
}

export interface Notification {
  id: string;
  userId: string;
  type: NotificationType;
  title: string;
  message: string;
  relatedEntityId?: string;
  createdAt: string;
  readAt?: string;
}

export interface OutboundMessage {
  id: string;
  channel: 'EMAIL' | 'SMS' | 'CALENDAR' | 'INTERNAL' | 'PUSH';
  /** Push only: link opened when the notification is tapped. */
  link?: string;
  to: string;
  subject?: string;
  body: string;
  sentAt: string;
  status: 'QUEUED' | 'SENT' | 'LOGGED' | 'FAILED';
  error?: string;
}

export interface CompanySettings {
  companyName: string;
  ownerName: string;
  supportEmail: string;
  supportPhone: string;
  /** Private ntfy topic: the owner's phone gets a push notification for every website inquiry. Admin-only. */
  ntfyTopic?: string;
  address?: string;
  defaultTaxRate?: number;
  estimateValidityDays?: number;
  invoiceTermsDays?: number;
  serviceArea?: string;
  services?: ServiceDef[];
  site?: Partial<SiteContent>;
  /** Hex brand color, e.g. #4b3ab3. */
  brandColor?: string;
  /** Uploaded logo as a data URL (server-side only; clients load /api/public/logo). */
  logoDataUrl?: string;
  logoVersion?: string;
}

export interface CRMState {
  version: number;
  currentUserId: string;
  users: User[];
  leads: Lead[];
  appointments: Appointment[];
  estimates: Estimate[];
  estimateApprovalSignatures: EstimateApprovalSignature[];
  invoices: Invoice[];
  workOrders: WorkOrder[];
  inventoryItems: InventoryItem[];
  products: Product[];
  notifications: Notification[];
  outbox: OutboundMessage[];
  settings: CompanySettings;
}
