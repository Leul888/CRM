import React, { useState } from 'react';
import { Minus, Package2, Pencil, Plus, Trash2 } from 'lucide-react';
import type { InventoryItem, User } from '../types';
import { Badge, Button, ConfirmDialog, EmptyState, Field, Input, Modal, PageHeader, SearchInput, StatCard, Table, Tabs, run, useStore } from './SharedComponents';
import { can } from '../services/permissions';
import { money, moneyShort } from '../services/format';

type Draft = Omit<InventoryItem, 'id' | 'status'> & { id?: string };
const blank: Draft = { name: '', sku: '', category: '', quantityOnHand: 0, unitCost: 0, salePrice: 0, supplier: '', reorderThreshold: 5 };

const ItemForm: React.FC<{ item: Draft; onClose: () => void }> = ({ item, onClose }) => {
  const s = useStore();
  const [d, setD] = useState<Draft>(item);
  const [error, setError] = useState('');
  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => setD((x) => ({ ...x, [k]: v }));
  const save = async () => {
    if (!d.name.trim() || !d.sku.trim()) return setError('Name and SKU are required.');
    if (s.state.inventoryItems.some((i) => i.sku.toLowerCase() === d.sku.trim().toLowerCase() && i.id !== d.id)) return setError('SKU already exists.');
    await s.saveInventoryItem({ ...d, name: d.name.trim(), sku: d.sku.trim().toUpperCase() });
    s.toast(d.id ? 'Item updated' : 'Item added');
    onClose();
  };
  return (
    <Modal title={d.id ? 'Edit item' : 'Add inventory item'} onClose={onClose} footer={<><Button variant="outline" onClick={onClose}>Cancel</Button><Button onClick={save}>Save</Button></>}>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Name" className="sm:col-span-2"><Input value={d.name} onChange={(e) => set('name', e.target.value)} /></Field>
        <Field label="SKU"><Input value={d.sku} onChange={(e) => set('sku', e.target.value)} /></Field>
        <Field label="Category"><Input value={d.category} onChange={(e) => set('category', e.target.value)} /></Field>
        <Field label="On hand"><Input type="number" min={0} value={d.quantityOnHand} onChange={(e) => set('quantityOnHand', Number(e.target.value))} /></Field>
        <Field label="Reorder at"><Input type="number" min={0} value={d.reorderThreshold} onChange={(e) => set('reorderThreshold', Number(e.target.value))} /></Field>
        <Field label="Unit cost"><Input type="number" min={0} step="0.01" value={d.unitCost} onChange={(e) => set('unitCost', Number(e.target.value))} /></Field>
        <Field label="Sale price"><Input type="number" min={0} step="0.01" value={d.salePrice} onChange={(e) => set('salePrice', Number(e.target.value))} /></Field>
        <Field label="Supplier" className="sm:col-span-2"><Input value={d.supplier} onChange={(e) => set('supplier', e.target.value)} /></Field>
        {error && <p className="text-sm font-medium text-rose-600 sm:col-span-2">{error}</p>}
      </div>
    </Modal>
  );
};

const Inventory: React.FC<{ currentUser: User }> = ({ currentUser }) => {
  const s = useStore();
  const [q, setQ] = useState('');
  const [tab, setTab] = useState('all');
  const [editing, setEditing] = useState<Draft | null>(null);
  const [del, setDel] = useState<InventoryItem | null>(null);
  const manage = can(currentUser, 'inventory:manage');
  const items = s.state.inventoryItems;
  const list = items.filter((i) => (tab === 'all' || i.status === tab) && (!q || `${i.name} ${i.sku} ${i.supplier} ${i.category}`.toLowerCase().includes(q.toLowerCase())));

  return (
    <div>
      <PageHeader eyebrow="Operations" title="Inventory" description="Stock status updates automatically against each item's reorder threshold." actions={manage ? <Button icon={<Plus size={16} />} onClick={() => setEditing({ ...blank })}>Add item</Button> : undefined} />
      <div className="mb-6 grid gap-4 sm:grid-cols-3">
        <StatCard label="Stock value (cost)" value={moneyShort(items.reduce((x, i) => x + i.quantityOnHand * i.unitCost, 0))} hint={`${items.length} SKUs`} accent />
        <StatCard label="Low stock" value={String(items.filter((i) => i.status === 'LOW_STOCK').length)} onClick={() => setTab('LOW_STOCK')} />
        <StatCard label="Out of stock" value={String(items.filter((i) => i.status === 'OUT_OF_STOCK').length)} onClick={() => setTab('OUT_OF_STOCK')} />
      </div>
      <div className="mb-5 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <Tabs value={tab} onChange={setTab} items={[{ value: 'all', label: 'All' }, { value: 'IN_STOCK', label: 'In stock' }, { value: 'LOW_STOCK', label: 'Low' }, { value: 'OUT_OF_STOCK', label: 'Out' }]} />
        <SearchInput value={q} onChange={setQ} placeholder="Search name, SKU, supplier" className="md:w-72" />
      </div>
      {list.length === 0 ? (
        <EmptyState icon={<Package2 size={22} />} title="No items" />
      ) : (
        <Table head={<tr><th className="table-head">Item</th><th className="table-head">Supplier</th><th className="table-head">Status</th><th className="table-head text-center">On hand</th><th className="table-head text-right">Cost / Price</th><th className="table-head text-right">Margin</th><th className="table-head" /></tr>}>
          {list.map((i) => (
            <tr key={i.id}>
              <td className="table-cell"><div className="font-semibold text-ink-900">{i.name}</div><div className="text-xs text-ink-400">{i.sku} · {i.category}</div></td>
              <td className="table-cell">{i.supplier}</td>
              <td className="table-cell"><Badge value={i.status} /></td>
              <td className="table-cell">
                <div className="flex items-center justify-center gap-1">
                  {manage && <button className="rounded-full p-1.5 hover:bg-ink-100" onClick={() => s.adjustStock(i.id, -1)} aria-label="Decrease"><Minus size={13} /></button>}
                  <span className="w-12 text-center font-semibold text-ink-900">{i.quantityOnHand}</span>
                  {manage && <button className="rounded-full p-1.5 hover:bg-ink-100" onClick={() => s.adjustStock(i.id, 1)} aria-label="Increase"><Plus size={13} /></button>}
                </div>
                <div className="text-center text-[11px] text-ink-400">reorder at {i.reorderThreshold}</div>
              </td>
              <td className="table-cell text-right">{money(i.unitCost)}<div className="text-xs text-ink-400">{money(i.salePrice)}</div></td>
              <td className="table-cell text-right font-semibold">{i.salePrice ? `${Math.round(((i.salePrice - i.unitCost) / i.salePrice) * 100)}%` : '—'}</td>
              <td className="table-cell text-right whitespace-nowrap">
                {manage && (
                  <>
                    <button className="rounded-full p-2 text-ink-400 hover:bg-ink-100 hover:text-ink-900" onClick={() => setEditing(i)} aria-label="Edit"><Pencil size={15} /></button>
                    <button className="rounded-full p-2 text-ink-400 hover:bg-rose-50 hover:text-rose-600" onClick={() => setDel(i)} aria-label="Delete"><Trash2 size={15} /></button>
                  </>
                )}
              </td>
            </tr>
          ))}
        </Table>
      )}
      {editing && <ItemForm item={editing} onClose={() => setEditing(null)} />}
      {del && <ConfirmDialog title="Delete item?" message={`${del.name} will be removed and unlinked from products.`} onConfirm={() => void run(s.deleteInventoryItem(del.id), 'Item deleted')} onClose={() => setDel(null)} />}
    </div>
  );
};

export default Inventory;
