import React, { useState } from 'react';
import { Pencil, Plus, RotateCcw, Trash2, Wrench } from 'lucide-react';
import type { Product, User } from '../types';
import { Badge, Button, Card, ConfirmDialog, EmptyState, Field, Input, Modal, PageHeader, SearchInput, Select, Textarea, run, useStore } from './SharedComponents';
import { can } from '../services/permissions';
import { money } from '../services/format';

type Draft = Omit<Product, 'id'> & { id?: string };
const blank: Draft = { name: '', sku: '', category: 'Packages', description: '', price: 0, unit: 'each', active: true };

const ProductForm: React.FC<{ product: Draft; onClose: () => void }> = ({ product, onClose }) => {
  const s = useStore();
  const [d, setD] = useState<Draft>(product);
  const [error, setError] = useState('');
  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => setD((x) => ({ ...x, [k]: v }));
  const save = async () => {
    if (!d.name.trim() || !d.sku.trim()) return setError('Name and SKU are required.');
    if (d.price < 0) return setError('Price cannot be negative.');
    await s.saveProduct({ ...d, name: d.name.trim(), sku: d.sku.trim().toUpperCase() });
    s.toast(d.id ? 'Product updated' : 'Product added');
    onClose();
  };
  return (
    <Modal title={d.id ? 'Edit product' : 'New product'} onClose={onClose} footer={<><Button variant="outline" onClick={onClose}>Cancel</Button><Button onClick={save}>Save</Button></>}>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Name" className="sm:col-span-2"><Input value={d.name} onChange={(e) => set('name', e.target.value)} /></Field>
        <Field label="SKU"><Input value={d.sku} onChange={(e) => set('sku', e.target.value)} /></Field>
        <Field label="Category"><Select value={d.category} onChange={(e) => set('category', e.target.value)} options={['Packages', 'Materials', 'Upsells', 'Services'].map((c) => ({ value: c, label: c }))} /></Field>
        <Field label="Price"><Input type="number" min={0} step="0.01" value={d.price} onChange={(e) => set('price', Number(e.target.value))} /></Field>
        <Field label="Unit"><Input value={d.unit || ''} onChange={(e) => set('unit', e.target.value)} placeholder="each, sq ft, gallon…" /></Field>
        <Field label="Linked inventory item" className="sm:col-span-2">
          <Select value={d.inventoryItemId || ''} onChange={(e) => set('inventoryItemId', e.target.value || undefined)} placeholder="None" options={s.state.inventoryItems.map((i) => ({ value: i.id, label: `${i.name} (${i.sku})` }))} />
        </Field>
        <Field label="Description" className="sm:col-span-2"><Textarea value={d.description} onChange={(e) => set('description', e.target.value)} /></Field>
        <label className="flex items-center gap-2 text-sm sm:col-span-2"><input type="checkbox" checked={d.active} onChange={(e) => set('active', e.target.checked)} className="h-4 w-4 accent-brand-600" /> Available in estimate product picker</label>
        {error && <p className="text-sm font-medium text-rose-600 sm:col-span-2">{error}</p>}
      </div>
    </Modal>
  );
};

const Products: React.FC<{ currentUser: User }> = ({ currentUser }) => {
  const s = useStore();
  const [q, setQ] = useState('');
  const [editing, setEditing] = useState<Draft | null>(null);
  const [del, setDel] = useState<Product | null>(null);
  const [clearing, setClearing] = useState(false);
  const manage = can(currentUser, 'product:manage');
  const list = s.state.products.filter((p) => !q || `${p.name} ${p.sku} ${p.category}`.toLowerCase().includes(q.toLowerCase()));

  return (
    <div>
      <PageHeader eyebrow="Catalog" title="Products" description="Packages and materials estimators can drop straight into an estimate." actions={
          manage ? (
            <>
              {s.state.products.length > 0 && <Button variant="ghost" icon={<Trash2 size={15} />} onClick={() => setClearing(true)}>Clear all</Button>}
              <Button variant="outline" icon={<RotateCcw size={15} />} onClick={() => void s.loadStarterCatalog().then((n) => s.toast(n ? `Added ${n} starter product${n === 1 ? '' : 's'}` : 'All starter products are already in your catalog.'))}>Add starter products</Button>
              <Button icon={<Plus size={16} />} onClick={() => setEditing({ ...blank })}>New product</Button>
            </>
          ) : undefined
        } />
      {manage && s.state.products.length > 0 && <p className="-mt-6 mb-6 text-sm text-ink-500">Prices are starting points. Click the pencil on any product to set your own price, or delete what you don't offer.</p>}
      <SearchInput value={q} onChange={setQ} placeholder="Search catalog" className="mb-5 md:w-80" />
      {list.length === 0 ? (
        <EmptyState
          icon={<Wrench size={22} />}
          title={q ? 'No products match' : 'No products yet'}
          description={q ? undefined : 'Add your own, or start from a ready-made list of common flooring, tile, paint and remodeling items.'}
          action={!q && manage ? <Button variant="outline" icon={<RotateCcw size={15} />} onClick={() => void run(s.loadStarterCatalog(), 'Starter products added')}>Add starter products</Button> : undefined}
        />
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {list.map((p) => {
            const inv = s.state.inventoryItems.find((i) => i.id === p.inventoryItemId);
            return (
              <Card key={p.id} className={p.active ? '' : 'opacity-60'}>
                <div className="flex items-start justify-between gap-3">
                  <span className="rounded-full bg-brand-50 px-2.5 py-0.5 text-[11px] font-semibold text-brand-700">{p.category}</span>
                  {manage && (
                    <div className="-mr-2 -mt-2 flex">
                      <button className="rounded-full p-2 text-ink-400 hover:bg-ink-100 hover:text-ink-900" onClick={() => setEditing(p)} aria-label="Edit"><Pencil size={15} /></button>
                      <button className="rounded-full p-2 text-ink-400 hover:bg-rose-50 hover:text-rose-600" onClick={() => setDel(p)} aria-label="Delete"><Trash2 size={15} /></button>
                    </div>
                  )}
                </div>
                <div className="mt-3 font-display text-lg font-bold text-ink-950">{p.name}</div>
                <div className="text-xs text-ink-400">{p.sku}</div>
                <p className="mt-2 text-sm text-ink-600">{p.description}</p>
                <div className="mt-5 flex items-end justify-between">
                  <div><span className="font-display text-2xl font-bold">{money(p.price)}</span><span className="text-sm text-ink-500"> / {p.unit || 'each'}</span></div>
                  {inv ? <Badge value={inv.status} /> : !p.active ? <Badge value="INACTIVE" /> : null}
                </div>
              </Card>
            );
          })}
        </div>
      )}
      {editing && <ProductForm product={editing} onClose={() => setEditing(null)} />}
      {clearing && <ConfirmDialog title="Clear the whole catalog?" message={`All ${s.state.products.length} products will be removed. Existing estimates keep their line items. You can add the starter products back any time.`} onConfirm={() => void run(s.clearProducts(), 'Catalog cleared')} onClose={() => setClearing(false)} />}
      {del && <ConfirmDialog title="Delete product?" message={`${del.name} will be removed from the catalog. Existing estimates keep their line items.`} onConfirm={() => void run(s.deleteProduct(del.id), 'Product deleted')} onClose={() => setDel(null)} />}
    </div>
  );
};

export default Products;
