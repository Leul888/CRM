import type {
  Appointment,
  CRMState,
  Estimate,
  EstimateLineItem,
  Invoice,
  InventoryItem,
  Lead,
  LeadActivity,
  LeadStatus,
  Notification,
  PaymentMethod,
  Product,
  Role,
  ServiceType,
  User,
  WorkOrder,
} from '../types';
import { humanize } from '../services/format';
import { starterProducts } from './starterCatalog';

export const STATE_VERSION = 4;

export const isoDaysFromNow = (days: number, hour = 9, minute = 0) => {
  const value = new Date();
  value.setDate(value.getDate() + days);
  value.setHours(hour, minute, 0, 0);
  return value.toISOString();
};

const randomHex = (bytes: number) => {
  const buf = new Uint8Array(bytes);
  globalThis.crypto.getRandomValues(buf);
  return Array.from(buf, (b) => b.toString(16).padStart(2, '0')).join('');
};
export const uid = (prefix: string) => `${prefix}_${randomHex(6)}`;
/** 192-bit unguessable token (estimate approval links, etc.). */
export const token = () => randomHex(24);
export const round = (n: number) => Math.round(n * 100) / 100;

export const lineItem = (
  description: string,
  category: string,
  quantity: number,
  unit: string,
  unitPrice: number,
  productId?: string,
): EstimateLineItem => ({
  id: uid('eli'),
  description,
  category,
  quantity,
  unit,
  unitPrice,
  total: round(quantity * unitPrice),
  productId,
});

/** Single source of truth for estimate math. */
export const computeEstimateTotals = (lineItems: EstimateLineItem[], discount: number, taxRate: number) => {
  const materialCost = round(lineItems.filter((i) => i.category !== 'Labor').reduce((s, i) => s + i.total, 0));
  const laborCost = round(lineItems.filter((i) => i.category === 'Labor').reduce((s, i) => s + i.total, 0));
  const subtotal = round(materialCost + laborCost);
  const taxable = Math.max(0, subtotal - discount);
  const tax = round(taxable * (taxRate / 100));
  return { materialCost, laborCost, subtotal, tax, total: round(taxable + tax) };
};

const ALL_SERVICES: ServiceType[] = [
  'FLOORING_REPLACEMENT',
  'COUNTERTOP_REPLACEMENT',
  'INTERIOR_PAINT',
  'KITCHEN_RENOVATION',
  'BATHROOM_RENOVATION',
];
const BASIC_SERVICES: ServiceType[] = ['FLOORING_REPLACEMENT', 'COUNTERTOP_REPLACEMENT', 'INTERIOR_PAINT'];

const person = (
  id: string,
  name: string,
  email: string,
  phone: string,
  role: Role,
  services: ServiceType[],
  qualifiedForRenovation: boolean,
  calendarColor: string,
): User => ({ id, name, email, phone, role, active: true, qualifiedForRenovation, serviceCapabilities: services, calendarColor });

export const buildSeedState = (): CRMState => {
  const users: User[] = [
    person('user_owner', 'Maya Thompson', 'owner@companyx.com', '555-100-0001', 'OWNER', ALL_SERVICES, true, '#4B3AB3'),
    person('user_manager', 'Andre Lewis', 'manager@companyx.com', '555-100-0002', 'MANAGER', ALL_SERVICES, true, '#6552C6'),
    person('user_office', 'Tanya Brooks', 'office@companyx.com', '555-100-0003', 'OFFICE_MANAGER', ALL_SERVICES, true, '#0f766e'),
    person('user_dispatcher', 'Carlos Reed', 'dispatcher@companyx.com', '555-100-0004', 'DISPATCHER', BASIC_SERVICES, false, '#d97706'),
    person('user_sales_1', 'Nina Patel', 'sales1@companyx.com', '555-100-0101', 'SALES_REP', BASIC_SERVICES, false, '#7c3aed'),
    person('user_sales_2', 'Ethan Cole', 'sales2@companyx.com', '555-100-0102', 'SALES_REP', BASIC_SERVICES, false, '#9333ea'),
    person('estimator_1', 'Sofia Bennett', 'sofia@companyx.com', '555-200-0001', 'ESTIMATOR', ALL_SERVICES, true, '#059669'),
    person('estimator_2', 'Jordan Cruz', 'jordan@companyx.com', '555-200-0002', 'ESTIMATOR', ALL_SERVICES, true, '#16a34a'),
    person('estimator_3', 'Avery Kim', 'avery@companyx.com', '555-200-0003', 'ESTIMATOR', BASIC_SERVICES, false, '#0ea5e9'),
    person('estimator_4', 'Marcus Diaz', 'marcus@companyx.com', '555-200-0004', 'ESTIMATOR', BASIC_SERVICES, false, '#0284c7'),
    person('estimator_5', 'Lila Chen', 'lila@companyx.com', '555-200-0005', 'ESTIMATOR', BASIC_SERVICES, false, '#0891b2'),
    person('worker_1', 'Diego Ramos', 'diego@companyx.com', '555-300-0001', 'WORKER', ['FLOORING_REPLACEMENT'], false, '#475569'),
    person('worker_2', 'Kelsey Ward', 'kelsey@companyx.com', '555-300-0002', 'WORKER', ['INTERIOR_PAINT'], false, '#64748b'),
    person('worker_3', 'Noah Price', 'noah@companyx.com', '555-300-0003', 'WORKER', ['COUNTERTOP_REPLACEMENT'], false, '#334155'),
    person('sub_1', 'Prime Tile Co.', 'tile@subcontractors.com', '555-300-0004', 'SUBCONTRACTOR', ['BATHROOM_RENOVATION', 'FLOORING_REPLACEMENT'], false, '#52525b'),
    person('sub_2', 'Quartz Craft LLC', 'quartz@subcontractors.com', '555-300-0005', 'SUBCONTRACTOR', ['COUNTERTOP_REPLACEMENT', 'KITCHEN_RENOVATION'], false, '#71717a'),
    person('sub_3', 'Blue Harbor Finishes', 'paint@subcontractors.com', '555-300-0006', 'SUBCONTRACTOR', ['INTERIOR_PAINT'], false, '#3f3f46'),
  ];

  const act = (daysAgo: number, text: string, kind: LeadActivity['kind'] = 'SYSTEM', userId?: string): LeadActivity => ({
    id: uid('act'),
    at: isoDaysFromNow(-daysAgo, 10),
    kind,
    text,
    userId,
  });

  const lead = (
    id: string,
    name: string,
    email: string,
    phone: string,
    address: string,
    budget: number,
    serviceType: ServiceType,
    status: LeadStatus,
    source: Lead['source'],
    salesRep: string,
    estimator: string,
    notes: string,
    createdDaysAgo: number,
    followUpIn?: number,
  ): Lead => ({
    id,
    name,
    email,
    phone,
    address,
    budget,
    serviceType,
    status,
    source,
    assignedSalesRepId: salesRep,
    assignedEstimatorId: estimator,
    notes,
    createdAt: isoDaysFromNow(-createdDaysAgo),
    nextFollowUpDate: followUpIn === undefined ? undefined : isoDaysFromNow(followUpIn),
    activity: [act(createdDaysAgo, `Lead created from ${humanize(source)}.`)],
  });

  const leads: Lead[] = [
    lead('lead_1', 'Alice Johnson', 'alice@example.com', '555-0101', '123 Maple St, Hartford, CT', 24000, 'KITCHEN_RENOVATION', 'ESTIMATE_SENT', 'WEBSITE', 'user_sales_1', 'estimator_1', 'Wants quartz counters and new cabinet fronts.', 12, 1),
    lead('lead_2', 'Bob Smith', 'bob@example.com', '555-0102', '456 Oak Ave, New Haven, CT', 8500, 'FLOORING_REPLACEMENT', 'SCHEDULED', 'CALL_CENTER', 'user_sales_2', 'estimator_3', 'Whole first floor LVP replacement.', 4, 2),
    lead('lead_3', 'Carla Reyes', 'carla@example.com', '555-0103', '77 River Rd, Milford, CT', 6200, 'INTERIOR_PAINT', 'JOB_SCHEDULED', 'REFERRAL', 'user_sales_1', 'estimator_4', 'Living room, hall, and stairwell.', 18, 3),
    lead('lead_4', 'Darnell Young', 'darnell@example.com', '555-0104', '19 Birch Ln, Stamford, CT', 18000, 'BATHROOM_RENOVATION', 'NEW', 'SOCIAL_MEDIA', 'user_sales_2', 'estimator_2', 'Primary bath with walk-in shower conversion.', 1, 0),
    lead('lead_5', 'Emily Carter', 'emily@example.com', '555-0105', '8 Harbor View, Norwalk, CT', 4800, 'COUNTERTOP_REPLACEMENT', 'CONTACTED', 'WEBSITE', 'user_sales_1', 'estimator_5', 'Laundry room + island quartz remnant.', 3, -1),
    lead('lead_6', 'Frank Osei', 'frank@example.com', '555-0106', '221 Elm St, West Hartford, CT', 31000, 'KITCHEN_RENOVATION', 'PAID', 'REFERRAL', 'user_sales_2', 'estimator_2', 'Full gut remodel, completed on schedule.', 175),
    lead('lead_7', 'Grace Liu', 'grace@example.com', '555-0107', '14 Chestnut Ct, Glastonbury, CT', 9200, 'FLOORING_REPLACEMENT', 'PAID', 'WEBSITE', 'user_sales_1', 'estimator_3', 'Engineered hardwood, 900 sq ft.', 140),
    lead('lead_8', 'Hector Alvarez', 'hector@example.com', '555-0108', '63 Park Pl, Bridgeport, CT', 5400, 'INTERIOR_PAINT', 'INVOICED', 'CALL_CENTER', 'user_sales_2', 'estimator_4', 'Two bedrooms + ceilings.', 70),
    lead('lead_9', 'Isabel Moreno', 'isabel@example.com', '555-0109', '5 Lakeside Dr, Danbury, CT', 22000, 'BATHROOM_RENOVATION', 'IN_PROGRESS', 'SOCIAL_MEDIA', 'user_sales_1', 'estimator_1', 'Hall bath + powder room.', 33),
    lead('lead_10', 'James Whitaker', 'james@example.com', '555-0110', '90 Summit Ave, Fairfield, CT', 7000, 'FLOORING_REPLACEMENT', 'LOST', 'MANUAL', 'user_sales_2', 'estimator_5', 'Went with a lower bid.', 21),
    lead('lead_11', 'Kira Novak', 'kira@example.com', '555-0111', '312 Pine St, Middletown, CT', 12500, 'COUNTERTOP_REPLACEMENT', 'APPROVED', 'WEBSITE', 'user_sales_1', 'estimator_4', 'Kitchen counters + backsplash.', 9, 2),
    lead('lead_12', 'Luis Ortega', 'luis@example.com', '555-0112', '47 Walnut Way, Meriden, CT', 3600, 'INTERIOR_PAINT', 'NEW', 'WEBSITE', 'user_sales_2', 'estimator_3', 'Exterior trim question — confirm scope.', 0, 1),
  ];

  const appt = (id: string, leadId: string, estimatorId: string, day: number, hour: number, serviceType: ServiceType, status: Appointment['status'], notes: string): Appointment => ({
    id,
    leadId,
    estimatorId,
    startTime: isoDaysFromNow(day, hour),
    endTime: isoDaysFromNow(day, hour + 1),
    serviceType,
    status,
    googleCalendarEventId: `gcal_${id}`,
    reminderStatus: status === 'CONFIRMED' ? 'SENT' : 'PENDING',
    notes,
  });

  const appointments: Appointment[] = [
    appt('appt_1', 'lead_1', 'estimator_1', 2, 10, 'KITCHEN_RENOVATION', 'CONFIRMED', 'Bring cabinet door samples.'),
    appt('appt_2', 'lead_2', 'estimator_3', 1, 13, 'FLOORING_REPLACEMENT', 'SCHEDULED', 'Measure main level.'),
    appt('appt_3', 'lead_4', 'estimator_2', 3, 15, 'BATHROOM_RENOVATION', 'REQUESTED', 'Awaiting confirmation call.'),
    appt('appt_4', 'lead_5', 'estimator_5', 0, 11, 'COUNTERTOP_REPLACEMENT', 'CONFIRMED', 'Check island overhang.'),
    appt('appt_5', 'lead_12', 'estimator_3', 4, 9, 'INTERIOR_PAINT', 'REQUESTED', 'Clarify interior vs exterior.'),
    appt('appt_6', 'lead_11', 'estimator_4', -6, 14, 'COUNTERTOP_REPLACEMENT', 'COMPLETED', 'Measured; slab selected.'),
  ];

  const e1 = [
    lineItem('Demolition and prep', 'Labor', 1, 'lot', 1200),
    lineItem('Quartz countertop package', 'Materials', 1, 'package', 6200, 'prod_2'),
    lineItem('Cabinet refinishing', 'Labor', 1, 'lot', 2600),
  ];
  const e2 = [lineItem('Whole-home paint labor', 'Labor', 1, 'lot', 2900), lineItem('Low-VOC paint upgrade', 'Materials', 18, 'gallon', 58, 'prod_3')];
  const e3 = [lineItem('Full kitchen remodel labor', 'Labor', 1, 'lot', 14800), lineItem('Cabinets, counters, fixtures', 'Materials', 1, 'lot', 13200)];
  const e4 = [lineItem('Signature flooring package', 'Materials', 900, 'sq ft', 6.75, 'prod_1'), lineItem('Install labor', 'Labor', 900, 'sq ft', 3.1)];
  const e5 = [lineItem('Bedroom + ceiling paint labor', 'Labor', 1, 'lot', 3900), lineItem('Low-VOC paint upgrade', 'Materials', 14, 'gallon', 58, 'prod_3')];
  const e6 = [lineItem('Bath demo + rough-in', 'Labor', 1, 'lot', 7400), lineItem('Tile, vanity, fixtures', 'Materials', 1, 'lot', 11800)];
  const e7 = [lineItem('Quartz countertop package', 'Materials', 1, 'package', 6200, 'prod_2'), lineItem('Backsplash tile + install', 'Labor', 1, 'lot', 2400)];

  const est = (
    id: string,
    number: string,
    leadId: string,
    estimatorId: string,
    serviceType: ServiceType,
    items: EstimateLineItem[],
    discount: number,
    status: Estimate['status'],
    createdDaysAgo: number,
    notes: string,
  ): Estimate => {
    const t = computeEstimateTotals(items, discount, 6.35);
    return {
      id,
      number,
      leadId,
      estimatorId,
      serviceType,
      lineItems: items,
      materialCost: t.materialCost,
      laborCost: t.laborCost,
      quantity: 1,
      unitPrice: t.subtotal,
      discount,
      taxRate: 6.35,
      tax: t.tax,
      total: t.total,
      status,
      notes,
      expirationDate: isoDaysFromNow(30 - createdDaysAgo),
      createdAt: isoDaysFromNow(-createdDaysAgo),
    };
  };

  const estimates: Estimate[] = [
    est('estimate_1', 'EST-2001', 'lead_1', 'estimator_1', 'KITCHEN_RENOVATION', e1, 250, 'SENT', 2, 'Includes template, fabrication, and install.'),
    est('estimate_2', 'EST-2002', 'lead_3', 'estimator_4', 'INTERIOR_PAINT', e2, 100, 'APPROVED', 8, 'Client requested low-VOC paint.'),
    est('estimate_3', 'EST-1994', 'lead_6', 'estimator_2', 'KITCHEN_RENOVATION', e3, 500, 'APPROVED', 168, 'Full gut remodel.'),
    est('estimate_4', 'EST-1996', 'lead_7', 'estimator_3', 'FLOORING_REPLACEMENT', e4, 0, 'APPROVED', 130, 'Engineered hardwood.'),
    est('estimate_5', 'EST-1998', 'lead_8', 'estimator_4', 'INTERIOR_PAINT', e5, 0, 'APPROVED', 64, ''),
    est('estimate_6', 'EST-1997', 'lead_9', 'estimator_1', 'BATHROOM_RENOVATION', e6, 400, 'APPROVED', 29, 'Hall bath + powder room.'),
    est('estimate_7', 'EST-2000', 'lead_11', 'estimator_4', 'COUNTERTOP_REPLACEMENT', e7, 0, 'APPROVED', 5, 'Calacatta slab reserved.'),
    est('estimate_8', 'EST-1999', 'lead_10', 'estimator_5', 'FLOORING_REPLACEMENT', [lineItem('LVP supply', 'Materials', 1000, 'sq ft', 3.4), lineItem('Install labor', 'Labor', 1000, 'sq ft', 2.9)], 0, 'REJECTED', 18, ''),
  ];

  const sig = (estimateId: string, approvalToken: string, name?: string, daysAgo?: number) => ({
    id: uid('sig'),
    estimateId,
    signatureName: name || '',
    signedAt: daysAgo === undefined ? undefined : isoDaysFromNow(-daysAgo),
    approvalToken,
    approvalStatus: (name ? 'APPROVED' : 'PENDING') as 'APPROVED' | 'PENDING',
  });

  const estimateApprovalSignatures = [
    sig('estimate_1', 'approve-kitchen-demo-token'),
    sig('estimate_2', 'approve-paint-demo-token', 'Carla Reyes', 4),
    sig('estimate_3', token(), 'Frank Osei', 166),
    sig('estimate_4', token(), 'Grace Liu', 128),
    sig('estimate_5', token(), 'Hector Alvarez', 62),
    sig('estimate_6', token(), 'Isabel Moreno', 27),
    sig('estimate_7', token(), 'Kira Novak', 3),
    { ...sig('estimate_8', token()), approvalStatus: 'DECLINED' as const, declineReason: 'Went with a lower bid', signedAt: isoDaysFromNow(-12) },
  ];

  const inv = (
    id: string,
    number: string,
    estimate: Estimate,
    l: Lead,
    payments: Array<[number, number, PaymentMethod]>,
    status: Invoice['status'],
    createdDaysAgo: number,
    dueIn: number,
  ): Invoice => {
    const paid = round(payments.reduce((s, p) => s + p[0], 0));
    return {
      id,
      estimateId: estimate.id,
      leadId: l.id,
      invoiceNumber: number,
      customerName: l.name,
      customerEmail: l.email,
      customerPhone: l.phone,
      lineItems: estimate.lineItems.map((i) => ({ id: uid('ili'), description: i.description, quantity: i.quantity, unit: i.unit, unitPrice: i.unitPrice, total: i.total })),
      subtotal: round(estimate.total - estimate.tax),
      tax: estimate.tax,
      total: estimate.total,
      amountPaid: paid,
      balanceDue: round(estimate.total - paid),
      status,
      dueDate: isoDaysFromNow(dueIn),
      createdAt: isoDaysFromNow(-createdDaysAgo),
      payments: payments.map(([amount, daysAgo, method]) => ({ id: uid('pay'), amount, method, receivedAt: isoDaysFromNow(-daysAgo, 12) })),
    };
  };

  const byId = (arr: Lead[], id: string) => arr.find((x) => x.id === id)!;
  const estById = (id: string) => estimates.find((x) => x.id === id)!;
  const invoices: Invoice[] = [
    inv('invoice_1', 'INV-1005', estById('estimate_2'), byId(leads, 'lead_3'), [[1000, 3, 'CARD']], 'PARTIALLY_PAID', 4, 7),
    inv('invoice_2', 'INV-1001', estById('estimate_3'), byId(leads, 'lead_6'), [[10000, 160, 'ACH'], [estById('estimate_3').total - 10000, 105, 'ACH']], 'PAID', 165, -150),
    inv('invoice_3', 'INV-1002', estById('estimate_4'), byId(leads, 'lead_7'), [[3000, 125, 'CARD'], [estById('estimate_4').total - 3000, 78, 'CARD']], 'PAID', 126, -110),
    inv('invoice_4', 'INV-1003', estById('estimate_5'), byId(leads, 'lead_8'), [[1500, 55, 'CHECK']], 'OVERDUE', 60, -20),
    inv('invoice_5', 'INV-1004', estById('estimate_6'), byId(leads, 'lead_9'), [[8000, 12, 'CHECK']], 'PARTIALLY_PAID', 14, 16),
  ];

  const workOrders: WorkOrder[] = [
    {
      id: 'wo_1',
      estimateId: 'estimate_2',
      leadId: 'lead_3',
      assignedWorkerId: 'worker_2',
      scopeOfWork: 'Prep walls, patch minor dents, prime, and paint agreed rooms.',
      location: '77 River Rd, Milford, CT',
      scheduledStart: isoDaysFromNow(4, 8),
      scheduledEnd: isoDaysFromNow(6, 17),
      status: 'ASSIGNED',
      notes: 'Client works from home; call before arrival.',
      attachments: [],
      checklist: [
        { id: uid('chk'), label: 'Protect floors & furniture', done: false },
        { id: uid('chk'), label: 'Patch and sand', done: false },
        { id: uid('chk'), label: 'Prime + two coats', done: false },
        { id: uid('chk'), label: 'Final walkthrough with client', done: false },
      ],
    },
    {
      id: 'wo_2',
      estimateId: 'estimate_6',
      leadId: 'lead_9',
      assignedWorkerId: 'sub_1',
      scopeOfWork: 'Hall bath demo, waterproofing, tile, vanity and fixture install.',
      location: '5 Lakeside Dr, Danbury, CT',
      scheduledStart: isoDaysFromNow(-5, 8),
      scheduledEnd: isoDaysFromNow(5, 17),
      status: 'IN_PROGRESS',
      notes: 'Tile delivery confirmed.',
      attachments: [],
      checklist: [
        { id: uid('chk'), label: 'Demo & haul-away', done: true },
        { id: uid('chk'), label: 'Waterproofing inspection', done: true },
        { id: uid('chk'), label: 'Tile install', done: false },
        { id: uid('chk'), label: 'Fixtures & vanity', done: false },
      ],
    },
    {
      id: 'wo_3',
      estimateId: 'estimate_4',
      leadId: 'lead_7',
      assignedWorkerId: 'worker_1',
      scopeOfWork: 'Install 900 sq ft engineered hardwood with transitions.',
      location: '14 Chestnut Ct, Glastonbury, CT',
      scheduledStart: isoDaysFromNow(-100, 8),
      scheduledEnd: isoDaysFromNow(-97, 17),
      status: 'COMPLETED',
      notes: '',
      attachments: [],
      checklist: [],
    },
  ];

  const inventoryItems: InventoryItem[] = [
    { id: 'inv_1', name: 'Luxury Vinyl Plank - Oak', sku: 'FLR-LVP-OAK', category: 'Flooring', quantityOnHand: 240, unitCost: 3.85, salePrice: 6.75, supplier: 'National Flooring Supply', reorderThreshold: 80, status: 'IN_STOCK' },
    { id: 'inv_2', name: 'Calacatta Quartz Slab', sku: 'CTR-QTZ-CAL', category: 'Countertops', quantityOnHand: 3, unitCost: 740, salePrice: 1150, supplier: 'QuartzCraft', reorderThreshold: 3, status: 'LOW_STOCK' },
    { id: 'inv_3', name: 'Premium Interior Paint', sku: 'PNT-PREM-WHT', category: 'Paint', quantityOnHand: 0, unitCost: 38, salePrice: 58, supplier: 'Benjamin Moore', reorderThreshold: 10, status: 'OUT_OF_STOCK' },
    { id: 'inv_4', name: 'Porcelain Tile 12x24 - Ash', sku: 'TIL-POR-ASH', category: 'Tile', quantityOnHand: 520, unitCost: 2.4, salePrice: 4.95, supplier: 'Prime Tile Co.', reorderThreshold: 150, status: 'IN_STOCK' },
    { id: 'inv_5', name: 'Floating Vanity 36"', sku: 'BTH-VAN-36', category: 'Bath', quantityOnHand: 4, unitCost: 410, salePrice: 689, supplier: 'Coastal Bath Supply', reorderThreshold: 2, status: 'IN_STOCK' },
  ];

  const products: Product[] = [
    { id: 'prod_1', name: 'Signature Flooring Package', sku: 'PKG-FLOOR-01', category: 'Packages', description: 'Material and installation bundle for LVP flooring.', price: 6.75, unit: 'sq ft', inventoryItemId: 'inv_1', active: true },
    { id: 'prod_2', name: 'Quartz Countertop Package', sku: 'PKG-QUARTZ-01', category: 'Packages', description: 'Template, fabrication, install, and sink cutout.', price: 6200, unit: 'package', inventoryItemId: 'inv_2', active: true },
    { id: 'prod_3', name: 'Low-VOC Paint Upgrade', sku: 'UPG-PAINT-01', category: 'Upsells', description: 'Premium low-VOC interior paint per gallon.', price: 58, unit: 'gallon', inventoryItemId: 'inv_3', active: true },
    { id: 'prod_4', name: 'Porcelain Tile Supply', sku: 'MAT-TILE-01', category: 'Materials', description: 'Porcelain 12x24 tile, ash finish.', price: 4.95, unit: 'sq ft', inventoryItemId: 'inv_4', active: true },
    { id: 'prod_5', name: 'Floating Vanity Install', sku: 'PKG-VAN-36', category: 'Packages', description: '36" floating vanity, plumbing hookup included.', price: 1290, unit: 'each', inventoryItemId: 'inv_5', active: true },
  ];

  const notifications: Notification[] = [
    { id: 'note_1', userId: 'user_owner', type: 'NEW_LEAD', title: 'New bathroom renovation lead', message: 'Darnell Young came in from social media and needs a follow-up.', relatedEntityId: 'lead_4', createdAt: isoDaysFromNow(-1) },
    { id: 'note_2', userId: 'user_office', type: 'UNPAID_INVOICE', title: 'Invoice overdue', message: 'INV-1003 for Hector Alvarez is past due.', relatedEntityId: 'invoice_4', createdAt: isoDaysFromNow(-1) },
    { id: 'note_3', userId: 'user_owner', type: 'ESTIMATE_APPROVED', title: 'Estimate approved', message: 'Kira Novak e-signed EST-2000.', relatedEntityId: 'estimate_7', createdAt: isoDaysFromNow(-3) },
  ];

  return {
    version: STATE_VERSION,
    currentUserId: 'user_owner',
    users,
    leads,
    appointments,
    estimates,
    estimateApprovalSignatures,
    invoices,
    workOrders,
    inventoryItems,
    products,
    notifications,
    outbox: [],
    settings: {
      companyName: 'Company X',
      ownerName: 'Maya Thompson',
      supportEmail: 'hello@companyx.com',
      supportPhone: '555-000-9000',
      address: '400 Main St, Hartford, CT',
      defaultTaxRate: 6.35,
      estimateValidityDays: 30,
      invoiceTermsDays: 14,
      serviceArea: 'Greater Hartford & coastal Connecticut',
    },
  };
};

export const DEFAULT_SETTINGS = (companyName = 'Company X'): CRMState['settings'] => ({
  companyName,
  ownerName: '',
  supportEmail: '',
  supportPhone: '',
  address: '',
  defaultTaxRate: 0,
  estimateValidityDays: 30,
  invoiceTermsDays: 14,
  serviceArea: '',
});

/** A clean production workspace: one admin, no demo records. */
export const buildEmptyState = (admin: User, companyName: string): CRMState => ({
  version: STATE_VERSION,
  currentUserId: admin.id,
  users: [admin],
  leads: [],
  appointments: [],
  estimates: [],
  estimateApprovalSignatures: [],
  invoices: [],
  workOrders: [],
  inventoryItems: [],
  products: starterProducts(),
  notifications: [],
  outbox: [],
  settings: { ...DEFAULT_SETTINGS(companyName), ownerName: admin.name, supportEmail: admin.email },
});
