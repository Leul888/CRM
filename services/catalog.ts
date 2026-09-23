import type { CompanySettings, ServiceDef, SiteContent } from '../types';
import { humanize } from './format';

export const DEFAULT_SERVICES: ServiceDef[] = [
  { key: 'KITCHEN_RENOVATION', label: 'Kitchen renovation', description: 'Layouts, cabinetry, counters and lighting, scoped by a specialist estimator.', specialist: true, active: true },
  { key: 'BATHROOM_RENOVATION', label: 'Bathroom renovation', description: 'Walk-in showers, tile, vanities and waterproofing done to inspection standard.', specialist: true, active: true },
  { key: 'FLOORING_REPLACEMENT', label: 'Flooring replacement', description: 'LVP, engineered hardwood and tile with clean transitions and haul-away.', specialist: false, active: true },
  { key: 'COUNTERTOP_REPLACEMENT', label: 'Countertops', description: 'Template, fabrication and install for quartz and stone, sink cutouts included.', specialist: false, active: true },
  { key: 'INTERIOR_PAINT', label: 'Interior paint', description: 'Low-VOC finishes, patched and primed walls, furniture protected every day.', specialist: false, active: true },
];

export const DEFAULT_SITE: SiteContent = {
  heroTitle: 'The building team',
  heroHighlight: 'that ships.',
  heroSubtitle: '{company} scopes the project, proves the number line by line, and builds it on schedule, with every step visible to you.',
  ctaTitle: 'Find out what your project really costs.',
  ctaSubtitle: "Pick a time. We'll match you with the right estimator and send an itemized number you can sign from your phone.",
  faqs: [
    { q: 'Is the estimate really free?', a: 'Yes. The on-site visit and the itemized estimate are free with no obligation. You only commit when you e-sign.' },
    { q: 'How fast will I get my estimate?', a: 'Most estimates are sent within 48 hours of the visit. Larger projects with custom selections can take a few days longer.' },
    { q: 'Who comes out to my home?', a: 'A staff estimator matched to your project. Specialist projects are only assigned to qualified estimators.' },
    { q: 'How does e-signing work?', a: 'You get a secure link to review every line item. Type your name to approve, or decline with a note. Your approval is timestamped and an invoice is created automatically.' },
    { q: 'How do payments work?', a: 'You receive one invoice per project that mirrors your signed estimate. Pay by card, ACH or check; deposits are tracked against your balance.' },
  ],
};

export const DEFAULT_BRAND = '#4b3ab3';

export const serviceDefs = (settings?: Partial<CompanySettings>): ServiceDef[] =>
  settings?.services && settings.services.length ? settings.services : DEFAULT_SERVICES;

export const activeServices = (settings?: Partial<CompanySettings>) => serviceDefs(settings).filter((s) => s.active);

export const isSpecialistService = (settings: Partial<CompanySettings> | undefined, key: string) =>
  !!serviceDefs(settings).find((s) => s.key === key)?.specialist;

export const siteContent = (settings?: Partial<CompanySettings>): SiteContent => ({ ...DEFAULT_SITE, ...(settings?.site || {}), faqs: settings?.site?.faqs?.length ? settings.site.faqs : DEFAULT_SITE.faqs });

export const serviceKey = (label: string) =>
  label
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 48) || 'SERVICE';

// Label lookup shared by UI and engine. The active catalog is registered whenever settings load.
let catalog: ServiceDef[] = DEFAULT_SERVICES;
export const setServiceCatalog = (defs?: ServiceDef[]) => {
  catalog = defs && defs.length ? defs : DEFAULT_SERVICES;
};
export const serviceLabel = (key?: string) => (key ? catalog.find((s) => s.key === key)?.label || humanize(key) : '');
