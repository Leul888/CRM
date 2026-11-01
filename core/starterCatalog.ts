/**
 * Starter content for a new workspace: a product catalog and common estimate line items.
 * Prices are typical US starting points. Every company edits or clears them from the Products page.
 */
import type { Product } from '../types';

type Starter = Omit<Product, 'id' | 'active'>;

const ITEMS: Starter[] = [
  // Packages (material + install)
  { sku: 'PKG-LVP', name: 'LVP flooring, installed', category: 'Packages', unit: 'sq ft', price: 7.5, description: 'Luxury vinyl plank with underlayment, transitions and installation.' },
  { sku: 'PKG-HARDWOOD', name: 'Engineered hardwood, installed', category: 'Packages', unit: 'sq ft', price: 11, description: 'Engineered hardwood flooring with underlayment and installation.' },
  { sku: 'PKG-TILE-FLOOR', name: 'Tile flooring, installed', category: 'Packages', unit: 'sq ft', price: 14, description: 'Porcelain or ceramic floor tile, thinset, grout and installation.' },
  { sku: 'PKG-QUARTZ', name: 'Quartz countertop, installed', category: 'Packages', unit: 'sq ft', price: 85, description: 'Template, fabrication, installation and one sink cutout.' },
  { sku: 'PKG-PAINT-ROOM', name: 'Interior painting, standard room', category: 'Packages', unit: 'room', price: 450, description: 'Walls, two coats, minor patching. Ceilings and trim extra.' },
  { sku: 'PKG-SHOWER', name: 'Walk-in shower conversion', category: 'Packages', unit: 'each', price: 9500, description: 'Remove tub, waterproofing, tile surround, glass door and fixtures.' },
  { sku: 'PKG-VANITY', name: 'Vanity replacement, 36"', category: 'Packages', unit: 'each', price: 1290, description: 'Vanity, top, faucet and plumbing hookup.' },
  // Materials
  { sku: 'MAT-LVP', name: 'LVP plank', category: 'Materials', unit: 'sq ft', price: 3.25, description: 'Waterproof luxury vinyl plank, 20 mil wear layer.' },
  { sku: 'MAT-TILE', name: 'Porcelain tile', category: 'Materials', unit: 'sq ft', price: 4.95, description: '12x24 porcelain tile.' },
  { sku: 'MAT-UNDERLAY', name: 'Flooring underlayment', category: 'Materials', unit: 'sq ft', price: 0.65, description: 'Foam or cork underlayment with vapor barrier.' },
  { sku: 'MAT-THINSET', name: 'Thinset mortar, 50 lb', category: 'Materials', unit: 'each', price: 28, description: 'Polymer-modified thinset.' },
  { sku: 'MAT-DRYWALL', name: 'Drywall sheet, 1/2" 4x8', category: 'Materials', unit: 'sheet', price: 18, description: 'Standard gypsum board.' },
  { sku: 'MAT-PAINT', name: 'Interior paint, premium', category: 'Materials', unit: 'gallon', price: 58, description: 'Low-VOC interior paint.' },
  { sku: 'MAT-BASEBOARD', name: 'Baseboard trim', category: 'Materials', unit: 'linear ft', price: 2.75, description: 'Primed MDF baseboard, 3-1/4".' },
  // Services
  { sku: 'SVC-DEMO', name: 'Demolition and haul-away', category: 'Services', unit: 'sq ft', price: 3.5, description: 'Remove existing finishes and dispose of debris.' },
  { sku: 'SVC-DUMPSTER', name: 'Dumpster rental', category: 'Services', unit: 'load', price: 550, description: '20-yard dumpster, delivery and pickup.' },
  { sku: 'SVC-DRYWALL-REPAIR', name: 'Drywall patch and repair', category: 'Services', unit: 'each', price: 225, description: 'Patch, tape, mud and sand, ready for paint.' },
  { sku: 'SVC-PERMIT', name: 'Permit handling', category: 'Services', unit: 'each', price: 350, description: 'Pull permits and schedule inspections. City fees billed at cost.' },
  { sku: 'SVC-PROTECT', name: 'Furniture moving and floor protection', category: 'Services', unit: 'room', price: 75, description: 'Move furniture and protect floors during work.' },
  // Upsells
  { sku: 'UPG-HEATED-FLOOR', name: 'Heated floor system', category: 'Upsells', unit: 'sq ft', price: 18, description: 'Electric radiant mat with thermostat.' },
  { sku: 'UPG-LED', name: 'Under-cabinet LED lighting', category: 'Upsells', unit: 'linear ft', price: 45, description: 'LED strip lighting with dimmer.' },
  { sku: 'UPG-GROUT-SEAL', name: 'Premium grout sealing', category: 'Upsells', unit: 'sq ft', price: 1.25, description: 'Penetrating sealer for stain resistance.' },
];

export const starterProducts = (): Product[] => ITEMS.map((p) => ({ ...p, id: `prod_${p.sku.toLowerCase().replace(/[^a-z0-9]+/g, '_')}`, active: true }));

/** Common estimate lines: pick one and the category and unit fill in. */
export const LINE_PRESETS: Array<{ description: string; category: string; unit: string }> = [
  { description: 'Labor', category: 'Labor', unit: 'lot' },
  { description: 'General labor', category: 'Labor', unit: 'hour' },
  { description: 'Demolition and haul-away', category: 'Labor', unit: 'job' },
  { description: 'Site prep and protection', category: 'Labor', unit: 'job' },
  { description: 'Framing and carpentry', category: 'Labor', unit: 'hour' },
  { description: 'Drywall install and finish', category: 'Labor', unit: 'sq ft' },
  { description: 'Flooring installation', category: 'Labor', unit: 'sq ft' },
  { description: 'Tile installation', category: 'Labor', unit: 'sq ft' },
  { description: 'Painting labor', category: 'Labor', unit: 'sq ft' },
  { description: 'Trim and finish carpentry', category: 'Labor', unit: 'linear ft' },
  { description: 'Cabinet installation', category: 'Labor', unit: 'linear ft' },
  { description: 'Plumbing work', category: 'Labor', unit: 'fixture' },
  { description: 'Electrical work', category: 'Labor', unit: 'fixture' },
  { description: 'Cleanup and final walkthrough', category: 'Labor', unit: 'job' },
  { description: 'Project management', category: 'Labor', unit: 'lot' },
  { description: 'Materials', category: 'Materials', unit: 'lot' },
  { description: 'Lumber', category: 'Materials', unit: 'lot' },
  { description: 'Drywall sheets', category: 'Materials', unit: 'sheet' },
  { description: 'Flooring material', category: 'Materials', unit: 'sq ft' },
  { description: 'Tile', category: 'Materials', unit: 'sq ft' },
  { description: 'Paint and primer', category: 'Materials', unit: 'gallon' },
  { description: 'Trim and baseboard', category: 'Materials', unit: 'linear ft' },
  { description: 'Fasteners and adhesives', category: 'Materials', unit: 'lot' },
  { description: 'Fixture allowance', category: 'Materials', unit: 'allowance' },
  { description: 'Dumpster rental', category: 'Equipment', unit: 'load' },
  { description: 'Equipment rental', category: 'Equipment', unit: 'day' },
  { description: 'Building permit', category: 'Permits', unit: 'each' },
  { description: 'Inspection fee', category: 'Permits', unit: 'each' },
  { description: 'Delivery fee', category: 'Other', unit: 'each' },
  { description: 'Contingency', category: 'Other', unit: 'allowance' },
];
